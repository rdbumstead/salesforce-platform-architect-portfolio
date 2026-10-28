/**
 * @description       : Runs a content read from a Query_Definition__mdt record, with the
 *                      calling class's own query as the fallback. The caller passes a
 *                      QueryDefault: its object, fields, filter, order, limit and access mode,
 *                      plus the allowlist of fields the read may ever return. A record is used
 *                      only when it is active, reads the same object, asks only for allowed
 *                      fields and keeps every field the caller reads, names only binds the
 *                      caller supplies, runs in an access mode no weaker than the default's,
 *                      holds a limit from 1 to 50000 and parses. Otherwise the default runs.
 *                      The record's filter is always combined with the default's filter by AND
 *                      and the smaller limit applies, so a record can narrow a read and never
 *                      widen it. No text from a request is ever added to a query: request
 *                      values travel only as bind values.
 *
 *                      The records are read once per transaction with getAll(), which runs no
 *                      SOQL. getAll() returns only the first 255 characters of a long text
 *                      field, so a record whose field list or filter reaches 255 characters is
 *                      read again in full with one SOQL query for all such records.
 *
 *                      Optional request filters are written so a record never needs editing at
 *                      run time: (IsDeleted = :hasCategory OR Category__c = :category). The
 *                      caller binds hasCategory to false when the filter is blank, which
 *                      matches every row a query can return, and to true when it is set, which
 *                      leaves only the real condition.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/24/2026
 * @Test Class        : [QueryDefinitionsTest]
 **/
public inherited sharing class QueryDefinitions {
  /** @description The two access modes a read can run in. USER_MODE is the stronger. */
  public enum Mode {
    USER_MODE,
    SYSTEM_MODE
  }

  /**
   * @description A class that owns content reads implements this so validateAll() can check
   *              every record against the code default of the same name.
   */
  public interface Provider {
    /**
     * @description Every code default this class owns, keyed by record DeveloperName.
     * @return Map<String, QueryDefinitions.QueryDefault> The defaults.
     */
    Map<String, QueryDefinitions.QueryDefault> queryDefaults();
  }

  public static final Integer MAX_ROW_LIMIT = 50000;
  private static final Integer TEXT_READ_LENGTH = 255;
  private static final String ROW_LIMIT_BIND = 'qdRowLimit';
  private static final String OFFSET_BIND = 'qdRowOffset';
  private static final Pattern BIND_PATTERN = Pattern.compile(
    ':\\s*([A-Za-z_][A-Za-z0-9_]*)'
  );

  // Tests put a record here to stand in for a deployed one. A key mapped to null reads as
  // a missing record.
  @TestVisible
  private static Map<String, Query_Definition__mdt> overrides = new Map<String, Query_Definition__mdt>();

  // When true, deployed records are ignored and only the overrides exist. Tests of
  // validateAll() set it so the deployed records do not join their expected list.
  @TestVisible
  private static Boolean ignoreDeployedRecords = false;

  // When set, validateAll() reads these providers instead of finding every implementation.
  @TestVisible
  private static List<Provider> providerOverride;

  // How many times the records were loaded in this transaction. Tests read it.
  @TestVisible
  private static Integer loadCount = 0;

  // Which definition served each read last, record or default. Tests read it.
  @TestVisible
  private static Map<String, String> sourceByName = new Map<String, String>();

  private static Map<String, Query_Definition__mdt> recordsByName;
  private static Set<String> failedToParse = new Set<String>();

  /**
   * @description The code's own definition of a read, and the limits a record must stay
   *              inside. Built in the calling class so the class still says what it reads.
   * @example
   * QueryDefinitions.QueryDefault d = new QueryDefinitions.QueryDefault('Skill__c', 'Id, Name')
   *   .filter('(IsDeleted = :hasCategory OR Category__c = :category)')
   *   .orderBy('Name ASC')
   *   .mode(QueryDefinitions.Mode.SYSTEM_MODE)
   *   .binds(new Map<String, Object>{ 'hasCategory' => false, 'category' => null });
   */
  public class QueryDefault {
    public final String objectName;
    public final String fieldList;
    public String filterText { get; private set; }
    public String orderByText { get; private set; }
    public Integer rowLimitValue { get; private set; }
    public Mode accessMode { get; private set; }
    private final Set<String> allowed;
    private Set<String> required;
    private Map<String, Object> sampleBinds = new Map<String, Object>();

    /**
     * @description A default that reads these fields. They are allowed and required, the
     *              mode is USER_MODE and the limit is 50000 until the setters say otherwise.
     * @param objectName The object's API name.
     * @param fieldList Comma separated fields, relationship paths allowed.
     */
    public QueryDefault(String objectName, String fieldList) {
      this.objectName = objectName;
      this.fieldList = fieldList;
      this.allowed = fieldSet(fieldList);
      this.required = fieldSet(fieldList);
      this.rowLimitValue = MAX_ROW_LIMIT;
      this.accessMode = Mode.USER_MODE;
    }

    /**
     * @description Sets the WHERE body. Binds are written as :name.
     * @param filterText The WHERE body without the word WHERE.
     * @return QueryDefault This default.
     */
    public QueryDefault filter(String filterText) {
      this.filterText = filterText;
      return this;
    }

    /**
     * @description Sets the ORDER BY body.
     * @param orderByText The ORDER BY body without the words ORDER BY.
     * @return QueryDefault This default.
     */
    public QueryDefault orderBy(String orderByText) {
      this.orderByText = orderByText;
      return this;
    }

    /**
     * @description Sets the most rows the read returns.
     * @param rowLimitValue 1 to 50000.
     * @return QueryDefault This default.
     */
    public QueryDefault rowLimit(Integer rowLimitValue) {
      this.rowLimitValue = rowLimitValue;
      return this;
    }

    /**
     * @description Sets the access mode.
     * @param accessMode USER_MODE or SYSTEM_MODE.
     * @return QueryDefault This default.
     */
    public QueryDefault mode(Mode accessMode) {
      this.accessMode = accessMode;
      return this;
    }

    /**
     * @description Adds fields a record may ask for beyond the default's own.
     * @param fieldList Comma separated fields.
     * @return QueryDefault This default.
     */
    public QueryDefault allow(String fieldList) {
      this.allowed.addAll(fieldSet(fieldList));
      return this;
    }

    /**
     * @description Replaces the fields every record must keep, because the caller reads them.
     *              By default that is every field of the default.
     * @param fieldList Comma separated fields.
     * @return QueryDefault This default.
     */
    public QueryDefault requires(String fieldList) {
      this.required = fieldSet(fieldList);
      return this;
    }

    /**
     * @description Names the binds the caller supplies, each with a value validateAll() uses
     *              to check that a record parses.
     * @param sampleBinds Bind name to a sample value.
     * @return QueryDefault This default.
     */
    public QueryDefault binds(Map<String, Object> sampleBinds) {
      this.sampleBinds = sampleBinds == null
        ? new Map<String, Object>()
        : sampleBinds;
      return this;
    }
  }

  /**
   * @description Runs the read named by the record, or the default when the record is
   *              missing or fails a check.
   * @param name The record's DeveloperName, Class_Purpose.
   * @param binds Bind values the filter may use.
   * @param fallback The code default.
   * @return List<SObject> The rows.
   */
  public static List<SObject> run(
    String name,
    Map<String, Object> binds,
    QueryDefault fallback
  ) {
    return runPage(name, binds, fallback, null, null);
  }

  /**
   * @description Runs one page of the read. The page size is capped by the row limit.
   * @param name The record's DeveloperName.
   * @param binds Bind values the filter may use.
   * @param fallback The code default.
   * @param pageSize Rows wanted, or null for the row limit.
   * @param pageOffset Rows to skip, or null for none.
   * @return List<SObject> The rows.
   */
  public static List<SObject> runPage(
    String name,
    Map<String, Object> binds,
    QueryDefault fallback,
    Integer pageSize,
    Integer pageOffset
  ) {
    if (fallback == null) {
      throw new IllegalArgumentException('A code default is required.');
    }
    Map<String, Object> safeBinds = binds == null
      ? new Map<String, Object>()
      : binds;
    Query_Definition__mdt record = usableRecord(
      name,
      fallback,
      safeBinds.keySet()
    );
    if (record != null) {
      try {
        List<SObject> rows = Database.queryWithBinds(
          selectText(record, fallback, pageSize, pageOffset),
          pageBinds(safeBinds, record, fallback, pageSize, pageOffset),
          accessLevelOf(modeOf(record.Access_Mode__c))
        );
        sourceByName.put(name, 'record');
        return rows;
      } catch (QueryException e) {
        failedToParse.add(name);
      }
    }
    sourceByName.put(name, 'default');
    return Database.queryWithBinds(
      selectText(null, fallback, pageSize, pageOffset),
      pageBinds(safeBinds, null, fallback, pageSize, pageOffset),
      accessLevelOf(fallback.accessMode)
    );
  }

  /**
   * @description Counts the rows the read's filter matches, ignoring the row limit.
   * @param name The record's DeveloperName.
   * @param binds Bind values the filter may use.
   * @param fallback The code default.
   * @return Integer The count.
   */
  public static Integer count(
    String name,
    Map<String, Object> binds,
    QueryDefault fallback
  ) {
    if (fallback == null) {
      throw new IllegalArgumentException('A code default is required.');
    }
    Map<String, Object> safeBinds = binds == null
      ? new Map<String, Object>()
      : binds;
    Query_Definition__mdt record = usableRecord(
      name,
      fallback,
      safeBinds.keySet()
    );
    if (record != null) {
      try {
        return Database.countQueryWithBinds(
          'SELECT COUNT() FROM ' +
            fallback.objectName +
            whereText(record, fallback),
          safeBinds,
          accessLevelOf(modeOf(record.Access_Mode__c))
        );
      } catch (QueryException e) {
        failedToParse.add(name);
      }
    }
    return Database.countQueryWithBinds(
      'SELECT COUNT() FROM ' + fallback.objectName + whereText(null, fallback),
      safeBinds,
      accessLevelOf(fallback.accessMode)
    );
  }

  /**
   * @description Checks every record against the code default of the same name, including
   *              a test run of each record's query. An inactive record is checked the same
   *              way so it is safe to turn on, but being inactive is not a fault.
   * @return List<String> One line per failing record, "Name: reasons", sorted by name.
   *         Empty when every record passes.
   */
  public static List<String> validateAll() {
    Map<String, QueryDefault> defaults = allDefaults();
    Set<String> names = new Set<String>(records().keySet());
    names.addAll(overrides.keySet());
    List<String> sortedNames = new List<String>(names);
    sortedNames.sort();

    List<String> failures = new List<String>();
    for (String name : sortedNames) {
      Query_Definition__mdt record = recordOf(name);
      if (record == null) {
        continue;
      }
      QueryDefault fallback = defaults.get(name);
      if (fallback == null) {
        failures.add(name + ': no code default has this name');
        continue;
      }
      List<String> problems = problemsOf(
        record,
        fallback,
        fallback.sampleBinds.keySet(),
        false
      );
      if (problems.isEmpty()) {
        String parseProblem = parseProblemOf(record, fallback);
        if (parseProblem != null) {
          problems.add(parseProblem);
        }
      }
      if (!problems.isEmpty()) {
        failures.add(name + ': ' + String.join(problems, ', '));
      }
    }
    return failures;
  }

  // The record when it passes every check, otherwise null.
  private static Query_Definition__mdt usableRecord(
    String name,
    QueryDefault fallback,
    Set<String> bindNames
  ) {
    if (String.isBlank(name) || failedToParse.contains(name)) {
      return null;
    }
    Query_Definition__mdt record = recordOf(name);
    if (record == null) {
      return null;
    }
    return problemsOf(record, fallback, bindNames, true).isEmpty()
      ? record
      : null;
  }

  // Every reason the record cannot stand in for the default. Parsing is checked by running.
  @TestVisible
  private static List<String> problemsOf(
    Query_Definition__mdt record,
    QueryDefault fallback,
    Set<String> bindNames,
    Boolean requireActive
  ) {
    List<String> problems = new List<String>();
    if (requireActive && record.Active__c != true) {
      problems.add('inactive');
    }
    if (
      String.isBlank(record.Object__c) ||
      !record.Object__c.trim().equalsIgnoreCase(fallback.objectName)
    ) {
      problems.add('object is not ' + fallback.objectName);
    }
    problems.addAll(fieldProblemsOf(record.Fields__c, fallback));
    problems.addAll(filterProblemsOf(record.Filter__c, bindNames));
    if (
      String.isNotBlank(record.Order_By__c) &&
      (record.Order_By__c.contains('(') ||
      record.Order_By__c.contains(')') ||
      record.Order_By__c.contains(':') ||
      record.Order_By__c.contains('\''))
    ) {
      problems.add('order by holds a bracket, a bind or a quote');
    }
    Mode recordMode = modeOf(record.Access_Mode__c);
    if (recordMode == null) {
      problems.add('access mode is not USER_MODE or SYSTEM_MODE');
    } else if (
      recordMode == Mode.SYSTEM_MODE &&
      fallback.accessMode == Mode.USER_MODE
    ) {
      problems.add('access mode is weaker than USER_MODE');
    }
    Decimal rowLimit = record.Row_Limit__c;
    if (rowLimit == null || rowLimit < 1 || rowLimit > MAX_ROW_LIMIT) {
      problems.add('row limit is not from 1 to 50000');
    }
    return problems;
  }

  private static List<String> fieldProblemsOf(
    String fieldText,
    QueryDefault fallback
  ) {
    List<String> problems = new List<String>();
    Set<String> asked = fieldSet(fieldText);
    if (asked.isEmpty()) {
      problems.add('no fields');
      return problems;
    }
    for (String field : asked) {
      if (!fallback.allowed.contains(field)) {
        problems.add('field ' + field + ' is outside the allowlist');
      }
    }
    for (String field : fallback.required) {
      if (!asked.contains(field)) {
        problems.add('field ' + field + ' is required');
      }
    }
    return problems;
  }

  private static List<String> filterProblemsOf(
    String filterText,
    Set<String> bindNames
  ) {
    List<String> problems = new List<String>();
    if (String.isBlank(filterText)) {
      return problems;
    }
    String outsideQuotes = withoutLiterals(filterText);
    if (outsideQuotes == null) {
      problems.add('filter has an unclosed quote');
      return problems;
    }
    if (!bracketsBalance(outsideQuotes)) {
      problems.add('filter brackets do not balance');
    }
    Set<String> lowerBindNames = new Set<String>();
    for (String bindName : bindNames) {
      lowerBindNames.add(bindName.toLowerCase());
    }
    Matcher m = BIND_PATTERN.matcher(outsideQuotes);
    while (m.find()) {
      String bindName = m.group(1);
      if (!lowerBindNames.contains(bindName.toLowerCase())) {
        problems.add('bind ' + bindName + ' is not supplied');
      }
    }
    return problems;
  }

  // Runs the record's query once with sample binds and one row. Null when it parses.
  private static String parseProblemOf(
    Query_Definition__mdt record,
    QueryDefault fallback
  ) {
    try {
      Database.queryWithBinds(
        selectText(record, fallback, 1, null),
        pageBinds(fallback.sampleBinds, record, fallback, 1, null),
        AccessLevel.SYSTEM_MODE
      );
      return null;
    } catch (QueryException e) {
      return 'does not parse: ' + e.getMessage();
    }
  }

  private static String selectText(
    Query_Definition__mdt record,
    QueryDefault fallback,
    Integer pageSize,
    Integer pageOffset
  ) {
    String fields = record == null
      ? fallback.fieldList
      : record.Fields__c.normalizeSpace();
    String orderBy = record == null ? fallback.orderByText : record.Order_By__c;
    String text =
      'SELECT ' +
      fields +
      ' FROM ' +
      fallback.objectName +
      whereText(record, fallback);
    if (String.isNotBlank(orderBy)) {
      text += ' ORDER BY ' + orderBy.normalizeSpace();
    }
    text += ' LIMIT :' + ROW_LIMIT_BIND;
    if (pageOffset != null) {
      text += ' OFFSET :' + OFFSET_BIND;
    }
    return text;
  }

  // The default's filter, AND the record's filter when it differs.
  private static String whereText(
    Query_Definition__mdt record,
    QueryDefault fallback
  ) {
    List<String> parts = new List<String>();
    if (String.isNotBlank(fallback.filterText)) {
      parts.add('(' + fallback.filterText.normalizeSpace() + ')');
    }
    if (record != null && String.isNotBlank(record.Filter__c)) {
      String recordFilter = record.Filter__c.normalizeSpace();
      if (
        fallback.filterText == null ||
        !recordFilter.equals(fallback.filterText.normalizeSpace())
      ) {
        parts.add('(' + recordFilter + ')');
      }
    }
    return parts.isEmpty() ? '' : ' WHERE ' + String.join(parts, ' AND ');
  }

  private static Map<String, Object> pageBinds(
    Map<String, Object> binds,
    Query_Definition__mdt record,
    QueryDefault fallback,
    Integer pageSize,
    Integer pageOffset
  ) {
    Integer rowLimit = fallback.rowLimitValue;
    if (record != null) {
      rowLimit = Math.min(rowLimit, record.Row_Limit__c.intValue());
    }
    if (pageSize != null) {
      rowLimit = Math.min(rowLimit, pageSize);
    }
    Map<String, Object> all = new Map<String, Object>(binds);
    all.put(ROW_LIMIT_BIND, rowLimit);
    if (pageOffset != null) {
      all.put(OFFSET_BIND, pageOffset);
    }
    return all;
  }

  // The text with every quoted literal removed, or null when a quote is never closed.
  private static String withoutLiterals(String text) {
    String result = '';
    Boolean inQuote = false;
    Integer i = 0;
    while (i < text.length()) {
      String ch = text.substring(i, i + 1);
      if (inQuote) {
        if (ch == '\\') {
          i += 2;
          continue;
        }
        if (ch == '\'') {
          inQuote = false;
        }
      } else if (ch == '\'') {
        inQuote = true;
        result += ' ';
      } else {
        result += ch;
      }
      i++;
    }
    return inQuote ? null : result;
  }

  private static Boolean bracketsBalance(String text) {
    Integer depth = 0;
    for (Integer i = 0; i < text.length(); i++) {
      String ch = text.substring(i, i + 1);
      if (ch == '(') {
        depth++;
      } else if (ch == ')') {
        depth--;
        if (depth < 0) {
          return false;
        }
      }
    }
    return depth == 0;
  }

  private static Set<String> fieldSet(String fieldText) {
    Set<String> result = new Set<String>();
    if (String.isBlank(fieldText)) {
      return result;
    }
    for (String part : fieldText.split(',')) {
      String field = part.trim().toLowerCase();
      if (String.isNotBlank(field)) {
        result.add(field);
      }
    }
    return result;
  }

  private static Mode modeOf(String text) {
    if (String.isBlank(text)) {
      return null;
    }
    String value = text.trim().toUpperCase();
    for (Mode candidate : Mode.values()) {
      if (candidate.name() == value) {
        return candidate;
      }
    }
    return null;
  }

  private static AccessLevel accessLevelOf(Mode accessMode) {
    return accessMode == Mode.SYSTEM_MODE
      ? AccessLevel.SYSTEM_MODE
      : AccessLevel.USER_MODE;
  }

  private static Map<String, QueryDefault> allDefaults() {
    Map<String, QueryDefault> defaults = new Map<String, QueryDefault>();
    for (Provider source : providers()) {
      Map<String, QueryDefault> owned = source.queryDefaults();
      if (owned != null) {
        defaults.putAll(owned);
      }
    }
    return defaults;
  }

  private static List<Provider> providers() {
    if (providerOverride != null) {
      return providerOverride;
    }
    List<Provider> result = new List<Provider>();
    for (ApexTypeImplementor implementor : [
      SELECT ClassName, ClassNamespacePrefix
      FROM ApexTypeImplementor
      WHERE InterfaceName = 'QueryDefinitions.Provider' AND IsConcrete = TRUE
      WITH SYSTEM_MODE
    ]) {
      Type providerType = Type.forName(
        implementor.ClassNamespacePrefix,
        implementor.ClassName
      );
      if (providerType != null) {
        result.add((Provider) providerType.newInstance());
      }
    }
    return result;
  }

  private static Query_Definition__mdt recordOf(String name) {
    if (overrides.containsKey(name)) {
      return overrides.get(name);
    }
    return records().get(name);
  }

  private static Map<String, Query_Definition__mdt> records() {
    if (recordsByName == null) {
      loadCount++;
      recordsByName = ignoreDeployedRecords
        ? new Map<String, Query_Definition__mdt>()
        : withFullText(Query_Definition__mdt.getAll());
    }
    return recordsByName;
  }

  // getAll() cuts long text to 255 characters. Records that reach that length are read
  // again in full, all in one query.
  @TestVisible
  private static Map<String, Query_Definition__mdt> withFullText(
    Map<String, Query_Definition__mdt> loaded
  ) {
    Map<String, Query_Definition__mdt> result = new Map<String, Query_Definition__mdt>(
      loaded
    );
    Set<String> cut = new Set<String>();
    for (String name : loaded.keySet()) {
      Query_Definition__mdt record = loaded.get(name);
      if (
        (record.Fields__c != null &&
        record.Fields__c.length() >= TEXT_READ_LENGTH) ||
        (record.Filter__c != null &&
        record.Filter__c.length() >= TEXT_READ_LENGTH)
      ) {
        cut.add(name);
      }
    }
    if (cut.isEmpty()) {
      return result;
    }
    for (Query_Definition__mdt full : [
      SELECT
        DeveloperName,
        Object__c,
        Fields__c,
        Filter__c,
        Order_By__c,
        Row_Limit__c,
        Access_Mode__c,
        Active__c
      FROM Query_Definition__mdt
      WHERE DeveloperName IN :cut
      WITH SYSTEM_MODE
    ]) {
      result.put(full.DeveloperName, full);
    }
    return result;
  }
}

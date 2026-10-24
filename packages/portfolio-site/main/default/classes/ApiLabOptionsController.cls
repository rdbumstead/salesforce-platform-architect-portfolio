/**
 * @description       : Serves the API Lab's filter options, so a visitor picks a value that
 *                      exists instead of guessing what to type. getOptions returns one option
 *                      list per query parameter name: the distinct names a name filter can match,
 *                      each record's name with its Id for an Id filter, and the active picklist
 *                      values for persona and category. Every read uses a fixed field list made
 *                      only of Ids, record names and lookups to them, so no email, phone or free
 *                      text field is ever queried. It shows only names the API already returns.
 *                      Each list is sorted by label and capped at MAX_OPTIONS. Each read runs
 *                      through QueryDefinitions, with its fixed field list as the allowlist, so
 *                      a Query_Definition record can narrow it and never widen it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 * @Test Class        : [ApiLabOptionsControllerTest]
 **/
public with sharing class ApiLabOptionsController implements QueryDefinitions.Provider {
  /** Each read's Query_Definition record is this prefix and the read's name. */
  private static final String QUERY_PREFIX = 'ApiLabOptionsController_';

  /** The most options any one parameter gets. */
  public static final Integer MAX_OPTIONS = 200;

  /** How many rows each read may return before names are made distinct. */
  @TestVisible
  private static final Integer MAX_ROWS = 2000;

  @TestVisible
  private static Boolean throwOnRead = false;

  public static final String CONTACT_NAME = 'contactName';
  public static final String EMPLOYER_NAME = 'employerName';
  public static final String EXPERIENCE_ID = 'experienceId';
  public static final String PERSONA = 'persona';
  public static final String PROJECT_NAME = 'projectName';
  public static final String PROJECT_ID = 'projectId';
  public static final String ACCOUNT_NAME = 'accountName';
  public static final String CATEGORY = 'category';
  public static final String ISSUER_NAME = 'issuerName';
  public static final String CERTIFICATION_NAME = 'certificationName';
  public static final String CERTIFICATION_ID = 'certificationId';

  /** Every parameter getOptions answers for, each always present in the result. */
  public static final List<String> PARAMETERS = new List<String>{
    CONTACT_NAME,
    EMPLOYER_NAME,
    EXPERIENCE_ID,
    PERSONA,
    PROJECT_NAME,
    PROJECT_ID,
    ACCOUNT_NAME,
    CATEGORY,
    ISSUER_NAME,
    CERTIFICATION_NAME,
    CERTIFICATION_ID
  };

  /**
   * The statuses the /sapi/v1/projects list returns, the same set its query filters on, so a
   * project name offered there is one that list can return.
   */
  @TestVisible
  private static final Set<String> LISTED_PROJECT_STATUSES = new Set<String>{
    'Live – In Production',
    'Live – Demo / Reference',
    'Active Development'
  };

  private static final String READ_OWNERS = 'owners';
  private static final String READ_EXPERIENCES = 'experiences';
  private static final String READ_PROJECTS = 'projects';
  private static final String READ_ACCOUNTS = 'accounts';
  private static final String READ_CERTIFICATIONS = 'certifications';
  private static final String READ_EDUCATION = 'education';

  /**
   * The reads, by name. Each is an object, a fixed field list, an optional fixed filter and an
   * order. Nothing from a request ever reaches them. The test checks every field here is an
   * Id, a record name, a lookup or a lookup's name.
   */
  @TestVisible
  private static final Map<String, OptionRead> READS = new Map<String, OptionRead>{
    READ_OWNERS => new OptionRead(
      'Contact',
      new List<String>{ 'Id', 'Name' },
      'Is_Portfolio_Owner__c = TRUE'
    ),
    READ_EXPERIENCES => new OptionRead(
      'Experience__c',
      new List<String>{ 'Id', 'Name', 'Employer__c', 'Employer__r.Name' },
      null
    ),
    READ_PROJECTS => new OptionRead(
      'Project__c',
      new List<String>{ 'Id', 'Name', 'Status__c' },
      null
    ),
    READ_ACCOUNTS => new OptionRead(
      'Account',
      new List<String>{ 'Id', 'Name' },
      null
    ),
    READ_CERTIFICATIONS => new OptionRead(
      'Certification__c',
      new List<String>{
        'Id',
        'Name',
        'Contact__c',
        'Contact__r.Name',
        'Issuer__c',
        'Issuer__r.Name'
      },
      null
    ),
    READ_EDUCATION => new OptionRead(
      'Education__c',
      new List<String>{
        'Id',
        'Contact__c',
        'Contact__r.Name',
        'Issuer__c',
        'Issuer__r.Name'
      },
      null
    )
  };

  /**
   * @description One choice in a filter picklist: the text a visitor reads and the value
   *              the API Lab sends.
   */
  public class Option implements Comparable {
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String value;

    /**
     * @description Builds an option.
     * @param label The text shown.
     * @param value The value sent.
     */
    public Option(String label, String value) {
      this.label = label;
      this.value = value;
    }

    /**
     * @description Orders by label, ignoring case, then by value.
     * @param other Another Option.
     * @return Integer Negative, zero or positive.
     */
    public Integer compareTo(Object other) {
      Option that = (Option) other;
      Integer byLabel = this.label.toLowerCase()
        .compareTo(that.label.toLowerCase());
      return byLabel != 0 ? byLabel : this.value.compareTo(that.value);
    }
  }

  /**
   * @description The option lists of every API Lab filter, keyed by query parameter name.
   *              A name filter that several paths share (contactName, issuerName) gets every
   *              name it can match on any of them.
   * @return Map<String, List<Option>> Every name in PARAMETERS, each list sorted by label and
   *         at most MAX_OPTIONS long, empty when nothing exists.
   * @throws AuraHandledException When the records cannot be read.
   * @example
   * List<ApiLabOptionsController.Option> projects = ApiLabOptionsController.getOptions().get('projectId');
   */
  @AuraEnabled(cacheable=true)
  public static Map<String, List<Option>> getOptions() {
    Map<String, List<SObject>> rowsByRead;
    try {
      if (Test.isRunningTest() && throwOnRead) {
        throw new QueryException('Forced failure for the error path test.');
      }
      rowsByRead = new OptionReader().readAll();
    } catch (QueryException e) {
      throw auraError('The API Lab filter options could not be read.');
    }
    return buildOptions(rowsByRead);
  }

  @TestVisible
  private static Map<String, List<Option>> buildOptions(
    Map<String, List<SObject>> rowsByRead
  ) {
    List<SObject> owners = rowsByRead.get(READ_OWNERS);
    List<SObject> experiences = rowsByRead.get(READ_EXPERIENCES);
    List<SObject> projects = rowsByRead.get(READ_PROJECTS);
    List<SObject> certifications = rowsByRead.get(READ_CERTIFICATIONS);
    List<SObject> education = rowsByRead.get(READ_EDUCATION);

    NameSet contactNames = new NameSet();
    contactNames.addField(owners, 'Name');
    contactNames.addPath(certifications, 'Contact__r', 'Name');
    contactNames.addPath(education, 'Contact__r', 'Name');

    NameSet issuerNames = new NameSet();
    issuerNames.addPath(certifications, 'Issuer__r', 'Name');
    issuerNames.addPath(education, 'Issuer__r', 'Name');

    NameSet employerNames = new NameSet();
    employerNames.addPath(experiences, 'Employer__r', 'Name');

    NameSet certificationNames = new NameSet();
    certificationNames.addField(certifications, 'Name');

    NameSet accountNames = new NameSet();
    accountNames.addField(rowsByRead.get(READ_ACCOUNTS), 'Name');

    NameSet projectNames = new NameSet();
    for (SObject project : projects) {
      if (LISTED_PROJECT_STATUSES.contains((String) project.get('Status__c'))) {
        projectNames.add((String) project.get('Name'));
      }
    }

    Map<String, List<Option>> options = new Map<String, List<Option>>();
    options.put(CONTACT_NAME, contactNames.toOptions());
    options.put(EMPLOYER_NAME, employerNames.toOptions());
    options.put(EXPERIENCE_ID, recordOptions(experiences));
    options.put(
      PERSONA,
      picklistOptions(Experience_Highlight__c.Persona_Tag__c.getDescribe())
    );
    options.put(PROJECT_NAME, projectNames.toOptions());
    options.put(PROJECT_ID, recordOptions(projects));
    options.put(ACCOUNT_NAME, accountNames.toOptions());
    options.put(CATEGORY, picklistOptions(Skill__c.Category__c.getDescribe()));
    options.put(ISSUER_NAME, issuerNames.toOptions());
    options.put(CERTIFICATION_NAME, certificationNames.toOptions());
    options.put(CERTIFICATION_ID, recordOptions(certifications));
    return options;
  }

  /** The record's name as the label and its Id as the value. */
  private static List<Option> recordOptions(List<SObject> records) {
    List<Option> options = new List<Option>();
    for (SObject record : records) {
      String name = (String) record.get('Name');
      if (String.isNotBlank(name)) {
        options.add(new Option(name, record.Id));
      }
    }
    return sortAndCap(options);
  }

  /** The field's active picklist values, each label with its API value. */
  @TestVisible
  private static List<Option> picklistOptions(
    Schema.DescribeFieldResult field
  ) {
    List<Option> options = new List<Option>();
    for (Schema.PicklistEntry entry : field.getPicklistValues()) {
      if (entry.isActive()) {
        options.add(new Option(entry.getLabel(), entry.getValue()));
      }
    }
    return sortAndCap(options);
  }

  @TestVisible
  private static List<Option> sortAndCap(List<Option> options) {
    options.sort();
    List<Option> capped = new List<Option>();
    for (Option option : options) {
      if (capped.size() == MAX_OPTIONS) {
        break;
      }
      capped.add(option);
    }
    return capped;
  }

  private static AuraHandledException auraError(String message) {
    AuraHandledException error = new AuraHandledException(message);
    error.setMessage(message);
    return error;
  }

  /** Distinct, non blank names, ready to become options whose label is their value. */
  private class NameSet {
    private final Set<String> names = new Set<String>();

    private void add(String name) {
      if (String.isNotBlank(name)) {
        names.add(name);
      }
    }

    private void addField(List<SObject> records, String field) {
      for (SObject record : records) {
        add((String) record.get(field));
      }
    }

    private void addPath(
      List<SObject> records,
      String relationship,
      String field
    ) {
      for (SObject record : records) {
        SObject parent = record.getSObject(relationship);
        if (parent != null) {
          add((String) parent.get(field));
        }
      }
    }

    private List<Option> toOptions() {
      List<Option> options = new List<Option>();
      for (String name : names) {
        options.add(new Option(name, name));
      }
      return sortAndCap(options);
    }
  }

  /** One fixed read: an object, its field list, an optional fixed filter. */
  @TestVisible
  private class OptionRead {
    @TestVisible
    private final String objectName;
    @TestVisible
    private final List<String> fields;
    private final String filter;

    private OptionRead(String objectName, List<String> fields, String filter) {
      this.objectName = objectName;
      this.fields = fields;
      this.filter = filter;
    }

    /**
     * @description The read as code: the fixed fields, the fixed filter, by name, at most
     *              MAX_ROWS rows, in system mode. Its Query_Definition record ships equal to it.
     * @return QueryDefinitions.QueryDefault The default.
     */
    @TestVisible
    private QueryDefinitions.QueryDefault queryDefault() {
      return new QueryDefinitions.QueryDefault(
          objectName,
          String.join(fields, ', ')
        )
        .filter(filter)
        .orderBy('Name ASC')
        .rowLimit(MAX_ROWS)
        .mode(QueryDefinitions.Mode.SYSTEM_MODE);
    }
  }

  /**
   * @description The Query_Definition record name of a read: ApiLabOptionsController_ and
   *              the read's name with a capital first letter.
   * @param readName A key of READS.
   * @return String The record's DeveloperName.
   */
  @TestVisible
  private static String queryName(String readName) {
    return QUERY_PREFIX + readName.capitalize();
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    Map<String, QueryDefinitions.QueryDefault> defaults = new Map<String, QueryDefinitions.QueryDefault>();
    for (String readName : READS.keySet()) {
      defaults.put(queryName(readName), READS.get(readName).queryDefault());
    }
    return defaults;
  }

  /**
   * Reads in system mode and without sharing, because the site guest has no sharing access
   * to these records and the API already returns every name here. The field lists are fixed
   * in READS, and no value from a request is part of any query.
   */
  @TestVisible
  private without sharing class OptionReader {
    @TestVisible
    private Map<String, List<SObject>> readAll() {
      return new Map<String, List<SObject>>{
        READ_OWNERS => run(READ_OWNERS),
        READ_EXPERIENCES => run(READ_EXPERIENCES),
        READ_PROJECTS => run(READ_PROJECTS),
        READ_ACCOUNTS => run(READ_ACCOUNTS),
        READ_CERTIFICATIONS => run(READ_CERTIFICATIONS),
        READ_EDUCATION => run(READ_EDUCATION)
      };
    }

    private List<SObject> run(String readName) {
      return QueryDefinitions.run(
        queryName(readName),
        new Map<String, Object>(),
        READS.get(readName).queryDefault()
      );
    }
  }
}

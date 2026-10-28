/**
 * @description       : Serves the live data marker. getSources(names) takes Query_Definition__mdt
 *                      developer names and returns, for each active one, the plural label of
 *                      the object it reads, the definition's Description__c and a live count of
 *                      the rows its filter matches, counted in the definition's own access mode.
 *                      Unknown, inactive or unreadable names are skipped. At most MAX_NAMES
 *                      names are read per call. A definition whose filter takes bind values, or
 *                      whose filter the metadata read cut short, is returned with no count
 *                      rather than a wrong one. Field lists, filters and the object API name are
 *                      never returned. The text of a definition is metadata and never request
 *                      input, and a request supplies names only, which are matched against the
 *                      records and never added to a query. getObjectSources(objectNames) does
 *                      the same for sections that read through GraphQL and have no definition.
 *                      It serves only an object that an active definition reads, and counts it
 *                      in user mode, which is what the GraphQL read itself sees.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/28/2026
 * @Test Class        : [DataSourceControllerTest]
 **/
public with sharing class DataSourceController {
  /** The most names one call reads. Names past this are ignored. */
  public static final Integer MAX_NAMES = 12;
  private static final Integer TEXT_READ_LENGTH = 255;

  @TestVisible
  private static Map<String, Query_Definition__mdt> overrides = new Map<String, Query_Definition__mdt>();

  /** One source of a section: what it is, in plain words, and how many rows are live. */
  public class DataSource {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public Boolean hasCount;
    @AuraEnabled
    public Integer count;
  }

  /**
   * @description The plain facts about each named definition, in the order asked.
   * @param names Query_Definition__mdt DeveloperNames.
   * @return List<DataSource> One entry per usable name. Empty when none is usable.
   */
  @AuraEnabled(cacheable=true)
  public static List<DataSource> getSources(List<String> names) {
    List<DataSource> result = new List<DataSource>();
    if (names == null) {
      return result;
    }
    Set<String> seen = new Set<String>();
    Integer read = 0;
    for (String raw : names) {
      if (String.isBlank(raw)) {
        continue;
      }
      String name = raw.trim();
      if (!seen.add(name)) {
        continue;
      }
      read++;
      if (read > MAX_NAMES) {
        break;
      }
      DataSource source = sourceOf(name);
      if (source != null) {
        result.add(source);
      }
    }
    return result;
  }

  /**
   * @description Plain facts about objects a section reads without a definition. Only an
   *              object that an active definition reads is served, so a request can never
   *              reach another object. The count runs in user mode.
   * @param objectNames Object API names.
   * @return List<DataSource> One entry per served object, with name set to the API name
   *         the caller asked for.
   */
  @AuraEnabled(cacheable=true)
  public static List<DataSource> getObjectSources(List<String> objectNames) {
    List<DataSource> result = new List<DataSource>();
    if (objectNames == null) {
      return result;
    }
    Set<String> served = servedObjects();
    Set<String> seen = new Set<String>();
    Integer read = 0;
    for (String raw : objectNames) {
      if (String.isBlank(raw)) {
        continue;
      }
      String name = raw.trim();
      if (!seen.add(name.toLowerCase())) {
        continue;
      }
      read++;
      if (read > MAX_NAMES) {
        break;
      }
      if (!served.contains(name.toLowerCase())) {
        continue;
      }
      String label = pluralLabelOf(name);
      if (label == null) {
        continue;
      }
      DataSource source = new DataSource();
      source.name = name;
      source.label = label;
      source.hasCount = false;
      try {
        source.count = Database.countQueryWithBinds(
          'SELECT COUNT() FROM ' + name,
          new Map<String, Object>(),
          AccessLevel.USER_MODE
        );
        source.hasCount = true;
      } catch (Exception e) {
        source.count = null;
      }
      result.add(source);
    }
    return result;
  }

  /** The lower case API names of every object an active definition reads. */
  private static Set<String> servedObjects() {
    Map<String, Query_Definition__mdt> all = new Map<String, Query_Definition__mdt>(
      Query_Definition__mdt.getAll()
    );
    all.putAll(overrides);
    Set<String> names = new Set<String>();
    for (Query_Definition__mdt record : all.values()) {
      if (record.Active__c == true && String.isNotBlank(record.Object__c)) {
        names.add(record.Object__c.trim().toLowerCase());
      }
    }
    return names;
  }

  private static DataSource sourceOf(String name) {
    Query_Definition__mdt record = recordOf(name);
    if (record == null || record.Active__c != true) {
      return null;
    }
    String label = pluralLabelOf(record.Object__c);
    if (label == null) {
      return null;
    }
    DataSource source = new DataSource();
    source.name = name;
    source.label = label;
    source.description = record.Description__c;
    source.hasCount = false;
    if (isCountable(record)) {
      try {
        String countQuery =
          'SELECT COUNT() FROM ' +
          record.Object__c +
          whereOf(record);
        AccessLevel level = accessLevelOf(record.Access_Mode__c);
        source.count = level == AccessLevel.SYSTEM_MODE
          ? new CountSelector().countOf(countQuery)
          : Database.countQueryWithBinds(
              countQuery,
              new Map<String, Object>(),
              level
            );
        source.hasCount = true;
      } catch (Exception e) {
        source.count = null;
      }
    }
    return source;
  }

  /** A filter with a bind, or one cut at 255 characters, cannot be counted truthfully. */
  private static Boolean isCountable(Query_Definition__mdt record) {
    if (String.isBlank(record.Filter__c)) {
      return true;
    }
    return !record.Filter__c.contains(':') &&
      record.Filter__c.length() < TEXT_READ_LENGTH;
  }

  private static String whereOf(Query_Definition__mdt record) {
    return String.isBlank(record.Filter__c) ? '' : ' WHERE ' + record.Filter__c;
  }

  private static AccessLevel accessLevelOf(String mode) {
    return String.isNotBlank(mode) && mode.trim().toUpperCase() == 'SYSTEM_MODE'
      ? AccessLevel.SYSTEM_MODE
      : AccessLevel.USER_MODE;
  }

  private static String pluralLabelOf(String objectName) {
    if (String.isBlank(objectName)) {
      return null;
    }
    try {
      return Schema.describeSObjects(new List<String>{ objectName })[0]
        .getLabelPlural();
    } catch (Exception e) {
      return null;
    }
  }

  private static Query_Definition__mdt recordOf(String name) {
    if (overrides.containsKey(name)) {
      return overrides.get(name);
    }
    return Query_Definition__mdt.getAll().get(name);
  }

  /**
   * @description Counts a system mode definition without sharing, because system mode skips
   *              object and field permission checks but record sharing still follows the
   *              class's sharing keyword, and the site guest can see none of these rows.
   *              The query text comes from an active Query_Definition__mdt record, never from
   *              the request, and only the number leaves this class.
   */
  private without sharing class CountSelector {
    private Integer countOf(String countQuery) {
      return Database.countQueryWithBinds(
        countQuery,
        new Map<String, Object>(),
        AccessLevel.SYSTEM_MODE
      );
    }
  }
}

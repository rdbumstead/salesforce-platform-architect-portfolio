/**
 * @description       : Serves the Delivery page from the integration caches.
 *                      getRecentCommits() reads the newest
 *                      Github_Cache__c row and getRoadmap() the newest Jira_Cache__c row. Each
 *                      payload is {"schemaVersion":1,"items":[...]} built from the DTOs below,
 *                      which the refresh jobs serialize. A missing or unreadable row
 *                      returns EMPTY, never an exception. No callout happens here.
 *                      simulate=true returns the cached data as SIMULATED (the
 *                      Resilience Simulation toggle, ADR-022), and while a source's circuit
 *                      breaker is open its feed reports DEGRADED. EMPTY wins over both,
 *                      because there is nothing to show.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/21/2026
 * @Test Class        : [DeliveryControllerTest]
 **/
public with sharing class DeliveryController implements QueryDefinitions.Provider {
  private static final String GITHUB_QUERY = 'DeliveryController_GithubCache';
  private static final String JIRA_QUERY = 'DeliveryController_JiraCache';
  public static final Integer SCHEMA_VERSION = 1;
  public static final Integer FRESH_MINUTES = 30;
  // Code default for the roadmap's cards per column. The Roadmap_Column_Limit setting
  // gives the value in force, and roadmapViewer keeps the same default of its own.
  public static final Integer ROADMAP_COLUMN_LIMIT = 8;
  public static final String STATUS_FRESH = 'FRESH';
  public static final String STATUS_STALE = 'STALE';
  public static final String STATUS_EMPTY = 'EMPTY';
  public static final String STATUS_SIMULATED = 'SIMULATED';
  public static final String STATUS_DEGRADED = 'DEGRADED';

  // Groups: 1 to 6 date and time, 7 the zone, 8 the offset sign, 9 and 10 its hours and
  // minutes.
  private static final Pattern ISO_TIMESTAMP = Pattern.compile(
    '^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d+)?(Z|([+-])(\\d{2}):?(\\d{2}))?$'
  );

  @TestVisible
  private static Datetime nowOverride;

  /**
   * @description The latest commits from the newest GitHub cache row.
   * @param simulate True for the resilience toggle: the cached data comes back as SIMULATED.
   *                 Null or false is the normal read.
   * @return CommitFeed The items, the row time, its age in minutes, the status and the
   *                     breaker's failure threshold and open minutes as the breaker reads them.
   */
  @AuraEnabled(cacheable=true)
  public static CommitFeed getRecentCommits(Boolean simulate) {
    CommitFeed feed = new CommitFeed();
    feed.items = new List<CommitItem>();
    feed.failureThreshold = CircuitBreaker.failureThreshold();
    feed.openMinutes = CircuitBreaker.openMinutes();
    Snapshot row = new CacheSelector().newestGithubRow();
    CommitPayload payload = row == null
      ? null
      : (CommitPayload) parse(row.payload, CommitPayload.class);
    if (payload == null || payload.items == null) {
      feed.status = STATUS_EMPTY;
      return feed;
    }
    feed.items = payload.items;
    feed.fetchedAt = row.createdDate;
    feed.ageMinutes = ageInMinutes(row.createdDate);
    feed.status = statusFor(
      feed.ageMinutes,
      simulate,
      CircuitBreaker.KEY_GITHUB
    );
    return feed;
  }

  /**
   * @description The roadmap from the newest Jira cache row.
   * @param simulate True for the resilience toggle: the cached data comes back as SIMULATED.
   *                 Null or false is the normal read.
   * @return RoadmapFeed The items, the row time, its age in minutes, the status and the
   *                     number of cards each column shows before its Show all button, and the
   *                     breaker's failure threshold and open minutes as the breaker reads them.
   */
  @AuraEnabled(cacheable=true)
  public static RoadmapFeed getRoadmap(Boolean simulate) {
    RoadmapFeed feed = new RoadmapFeed();
    feed.items = new List<RoadmapItem>();
    feed.failureThreshold = CircuitBreaker.failureThreshold();
    feed.openMinutes = CircuitBreaker.openMinutes();
    feed.columnLimit = PortfolioSettings.getInteger(
      'Roadmap_Column_Limit',
      ROADMAP_COLUMN_LIMIT
    );
    Snapshot row = new CacheSelector().newestJiraRow();
    RoadmapPayload payload = row == null
      ? null
      : (RoadmapPayload) parse(row.payload, RoadmapPayload.class);
    if (payload == null || payload.items == null) {
      feed.status = STATUS_EMPTY;
      return feed;
    }
    feed.items = payload.items;
    feed.fetchedAt = row.createdDate;
    feed.ageMinutes = ageInMinutes(row.createdDate);
    feed.status = statusFor(feed.ageMinutes, simulate, CircuitBreaker.KEY_JIRA);
    return feed;
  }

  /**
   * @description Parses an ISO 8601 timestamp as GitHub and Jira send it. Accepts Z, an
   *              offset with a colon (+02:00) and Jira's offset without one (+0000), with
   *              or without milliseconds. The refresh services use it to fill the DTOs.
   * @param value The timestamp text.
   * @return Datetime The instant, or null when the text is blank or not a timestamp.
   */
  public static Datetime parseTimestamp(String value) {
    if (String.isBlank(value)) {
      return null;
    }
    Matcher parts = ISO_TIMESTAMP.matcher(value.trim());
    if (!parts.matches()) {
      return null;
    }
    Datetime instant = Datetime.newInstanceGmt(
      Integer.valueOf(parts.group(1)),
      Integer.valueOf(parts.group(2)),
      Integer.valueOf(parts.group(3)),
      Integer.valueOf(parts.group(4)),
      Integer.valueOf(parts.group(5)),
      Integer.valueOf(parts.group(6))
    );
    String sign = parts.group(8);
    if (sign == null) {
      return instant;
    }
    Integer offsetMinutes =
      Integer.valueOf(parts.group(9)) * 60 + Integer.valueOf(parts.group(10));
    return instant.addMinutes(sign == '+' ? -offsetMinutes : offsetMinutes);
  }

  // Returns null for a blank payload, invalid JSON, a wrong shape or another schema version.
  private static Versioned parse(String payload, System.Type payloadType) {
    if (String.isBlank(payload)) {
      return null;
    }
    try {
      Versioned parsed = (Versioned) JSON.deserialize(payload, payloadType);
      return parsed?.schemaVersion == SCHEMA_VERSION ? parsed : null;
    } catch (JSONException e) {
      return null;
    }
  }

  private static Integer ageInMinutes(Datetime createdDate) {
    Datetime now = nowOverride != null ? nowOverride : Datetime.now();
    Long millis = now.getTime() - createdDate.getTime();
    return Math.max(0L, millis / 60000).intValue();
  }

  // Called only when cached data exists. The toggle beats the breaker, and both beat age.
  private static String statusFor(
    Integer ageMinutes,
    Boolean simulate,
    String breakerKey
  ) {
    if (simulate == true) {
      return STATUS_SIMULATED;
    }
    if (CircuitBreaker.isOpen(breakerKey)) {
      return STATUS_DEGRADED;
    }
    return ageMinutes < FRESH_MINUTES ? STATUS_FRESH : STATUS_STALE;
  }

  /**
   * @description The newest GitHub cache row as code, in system mode.
   *              Query_Definition.DeliveryController_GithubCache ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault githubDefault() {
    return newestRowDefault('Github_Cache__c');
  }

  /**
   * @description The newest Jira cache row as code, in system mode.
   *              Query_Definition.DeliveryController_JiraCache ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault jiraDefault() {
    return newestRowDefault('Jira_Cache__c');
  }

  private static QueryDefinitions.QueryDefault newestRowDefault(
    String objectName
  ) {
    return new QueryDefinitions.QueryDefault(
        objectName,
        'CreatedDate, JSON_Payload__c'
      )
      .orderBy('CreatedDate DESC, Id DESC')
      .rowLimit(1)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      GITHUB_QUERY => githubDefault(),
      JIRA_QUERY => jiraDefault()
    };
  }

  /**
   * @description Reads the two cache objects in system mode and without sharing. The site
   *              guest has no grant on either cache object on purpose,
   *              and the rows hold only public commit and roadmap data, which the outer class
   *              returns in the fixed DTO shape.
   */
  private without sharing class CacheSelector {
    private Snapshot newestGithubRow() {
      List<Github_Cache__c> rows = (List<Github_Cache__c>) QueryDefinitions.run(
        GITHUB_QUERY,
        new Map<String, Object>(),
        githubDefault()
      );
      return rows.isEmpty()
        ? null
        : new Snapshot(rows[0].CreatedDate, rows[0].JSON_Payload__c);
    }

    private Snapshot newestJiraRow() {
      List<Jira_Cache__c> rows = (List<Jira_Cache__c>) QueryDefinitions.run(
        JIRA_QUERY,
        new Map<String, Object>(),
        jiraDefault()
      );
      return rows.isEmpty()
        ? null
        : new Snapshot(rows[0].CreatedDate, rows[0].JSON_Payload__c);
    }
  }

  private class Snapshot {
    private Datetime createdDate;
    private String payload;

    private Snapshot(Datetime createdDate, String payload) {
      this.createdDate = createdDate;
      this.payload = payload;
    }
  }

  /**
   * @description Common part of both cache payloads.
   */
  public virtual class Versioned {
    public Integer schemaVersion;
  }

  /**
   * @description The Github_Cache__c payload: {"schemaVersion":1,"items":[CommitItem...]}.
   */
  public class CommitPayload extends Versioned {
    public List<CommitItem> items;
  }

  /**
   * @description The Jira_Cache__c payload: {"schemaVersion":1,"items":[RoadmapItem...]}.
   */
  public class RoadmapPayload extends Versioned {
    public List<RoadmapItem> items;
  }

  /**
   * @description One commit. message is the first line, cut to 100 characters.
   */
  public class CommitItem {
    @AuraEnabled
    public String sha;
    @AuraEnabled
    public String message;
    @AuraEnabled
    public String authorName;
    @AuraEnabled
    public String authorAvatarUrl;
    @AuraEnabled
    public String url;
    @AuraEnabled
    public Datetime committedAt;
  }

  /**
   * @description One Jira issue. statusCategory is new, indeterminate or done. epicKey and
   *              epicName come from the parent issue. Both are null when there is no parent,
   *              and epicName is null on rows cached before the epic fields existed.
   */
  public class RoadmapItem {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String summary;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String statusCategory;
    @AuraEnabled
    public String type;
    @AuraEnabled
    public String epicKey;
    @AuraEnabled
    public String epicName;
    @AuraEnabled
    public Datetime updatedAt;
  }

  /**
   * @description What getRecentCommits returns.
   */
  public class CommitFeed {
    @AuraEnabled
    public List<CommitItem> items;
    @AuraEnabled
    public Datetime fetchedAt;
    @AuraEnabled
    public Integer ageMinutes;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public Integer failureThreshold;
    @AuraEnabled
    public Integer openMinutes;
  }

  /**
   * @description What getRoadmap returns.
   */
  public class RoadmapFeed {
    @AuraEnabled
    public List<RoadmapItem> items;
    @AuraEnabled
    public Datetime fetchedAt;
    @AuraEnabled
    public Integer ageMinutes;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public Integer columnLimit;
    @AuraEnabled
    public Integer failureThreshold;
    @AuraEnabled
    public Integer openMinutes;
  }
}

/**
 * @description       : Serves the Delivery page from the integration caches (Round 3 plan K3,
 *                      pillar-e-design section 4.2). getRecentCommits() reads the newest
 *                      Github_Cache__c row and getRoadmap() the newest Jira_Cache__c row. Each
 *                      payload is {"schemaVersion":1,"items":[...]} built from the DTOs below,
 *                      which the Round 4 refresh jobs serialize. A missing or unreadable row
 *                      returns EMPTY, never an exception. No callout happens here.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [DeliveryControllerTest]
 **/
public with sharing class DeliveryController {
  public static final Integer SCHEMA_VERSION = 1;
  public static final Integer FRESH_MINUTES = 30;
  public static final String STATUS_FRESH = 'FRESH';
  public static final String STATUS_STALE = 'STALE';
  public static final String STATUS_EMPTY = 'EMPTY';
  // SIMULATED and DEGRADED are reserved for Round 4 and never emitted here.
  public static final String STATUS_SIMULATED = 'SIMULATED';
  public static final String STATUS_DEGRADED = 'DEGRADED';

  @TestVisible
  private static Datetime nowOverride;

  /**
   * @description The latest commits from the newest GitHub cache row.
   * @return CommitFeed The items, the row time, its age in minutes and the status.
   */
  @AuraEnabled(cacheable=true)
  public static CommitFeed getRecentCommits() {
    CommitFeed feed = new CommitFeed();
    feed.items = new List<CommitItem>();
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
    feed.status = statusFor(feed.ageMinutes);
    return feed;
  }

  /**
   * @description The roadmap from the newest Jira cache row.
   * @return RoadmapFeed The items, the row time, its age in minutes and the status.
   */
  @AuraEnabled(cacheable=true)
  public static RoadmapFeed getRoadmap() {
    RoadmapFeed feed = new RoadmapFeed();
    feed.items = new List<RoadmapItem>();
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
    feed.status = statusFor(feed.ageMinutes);
    return feed;
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

  private static String statusFor(Integer ageMinutes) {
    return ageMinutes < FRESH_MINUTES ? STATUS_FRESH : STATUS_STALE;
  }

  /**
   * @description Reads the two cache objects in system mode and without sharing. The site
   *              guest has no grant on either cache object on purpose (pillar-e-design T5),
   *              and the rows hold only public commit and roadmap data, which the outer class
   *              returns in the fixed DTO shape.
   */
  private without sharing class CacheSelector {
    private Snapshot newestGithubRow() {
      List<Github_Cache__c> rows = [
        SELECT CreatedDate, JSON_Payload__c
        FROM Github_Cache__c
        WITH SYSTEM_MODE
        ORDER BY CreatedDate DESC, Id DESC
        LIMIT 1
      ];
      return rows.isEmpty()
        ? null
        : new Snapshot(rows[0].CreatedDate, rows[0].JSON_Payload__c);
    }

    private Snapshot newestJiraRow() {
      List<Jira_Cache__c> rows = [
        SELECT CreatedDate, JSON_Payload__c
        FROM Jira_Cache__c
        WITH SYSTEM_MODE
        ORDER BY CreatedDate DESC, Id DESC
        LIMIT 1
      ];
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
   * @description One Jira issue. statusCategory is new, indeterminate or done.
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
  }
}

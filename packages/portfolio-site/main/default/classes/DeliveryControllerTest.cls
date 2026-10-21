/**
 * @description       : Tests for DeliveryController (Round 3 plan K3). Guest tests run as the
 *                      real Portfolio1 site guest user.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@isTest
private class DeliveryControllerTest {
  private static final Datetime NOW = Datetime.newInstanceGmt(
    2026,
    10,
    21,
    12,
    0,
    0
  );

  private static String commitPayload(String message) {
    DeliveryController.CommitItem item = new DeliveryController.CommitItem();
    item.sha = 'abc1234';
    item.message = message;
    item.authorName = 'Seed Author';
    item.authorAvatarUrl = 'https://example.com/avatar.png';
    item.url = 'https://github.com/example/repo/commit/abc1234';
    item.committedAt = NOW.addHours(-1);
    DeliveryController.CommitPayload payload = new DeliveryController.CommitPayload();
    payload.schemaVersion = DeliveryController.SCHEMA_VERSION;
    payload.items = new List<DeliveryController.CommitItem>{ item };
    return JSON.serialize(payload);
  }

  private static String roadmapPayload(String key) {
    DeliveryController.RoadmapItem item = new DeliveryController.RoadmapItem();
    item.key = key;
    item.summary = 'Seed story';
    item.status = 'In Progress';
    item.statusCategory = 'indeterminate';
    item.type = 'Story';
    item.epicKey = 'SPAP-900';
    item.updatedAt = NOW.addHours(-2);
    DeliveryController.RoadmapPayload payload = new DeliveryController.RoadmapPayload();
    payload.schemaVersion = DeliveryController.SCHEMA_VERSION;
    payload.items = new List<DeliveryController.RoadmapItem>{ item };
    return JSON.serialize(payload);
  }

  private static Id insertGithubRow(String payload, Integer minutesOld) {
    Github_Cache__c row = new Github_Cache__c(JSON_Payload__c = payload);
    insert row;
    Test.setCreatedDate(row.Id, NOW.addMinutes(-minutesOld));
    return row.Id;
  }

  private static Id insertJiraRow(String payload, Integer minutesOld) {
    Jira_Cache__c row = new Jira_Cache__c(JSON_Payload__c = payload);
    insert row;
    Test.setCreatedDate(row.Id, NOW.addMinutes(-minutesOld));
    return row.Id;
  }

  @isTest
  static void recentCommitsFreshRowIsFresh() {
    insertGithubRow(commitPayload('seed: delivery walk'), 10);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_FRESH, feed.status, 'Status');
    Assert.areEqual(10, feed.ageMinutes, 'Age in minutes');
    Assert.areEqual(NOW.addMinutes(-10), feed.fetchedAt, 'Row time');
    Assert.areEqual(1, feed.items.size(), 'One commit');
    Assert.areEqual('seed: delivery walk', feed.items[0].message, 'Message');
    Assert.areEqual('abc1234', feed.items[0].sha, 'Sha');
    Assert.areEqual(NOW.addHours(-1), feed.items[0].committedAt, 'Commit time');
  }

  @isTest
  static void recentCommitsOldRowIsStale() {
    insertGithubRow(commitPayload('old'), DeliveryController.FRESH_MINUTES);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_STALE, feed.status, 'Status');
    Assert.areEqual(30, feed.ageMinutes, 'Age in minutes');
    Assert.areEqual(1, feed.items.size(), 'Items still returned');
  }

  @isTest
  static void recentCommitsNoRowIsEmpty() {
    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
    Assert.areEqual(0, feed.items.size(), 'Empty list, not null');
    Assert.isNull(feed.fetchedAt, 'No row time');
    Assert.isNull(feed.ageMinutes, 'No age');
  }

  @isTest
  static void recentCommitsMalformedJsonIsEmpty() {
    insertGithubRow('{"schemaVersion":1,"items":[', 5);

    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
    Assert.areEqual(0, feed.items.size(), 'Empty list');
  }

  @isTest
  static void recentCommitsOtherSchemaVersionIsEmpty() {
    insertGithubRow('{"schemaVersion":2,"items":[]}', 5);

    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
  }

  @isTest
  static void recentCommitsBlankPayloadIsEmpty() {
    insertGithubRow(null, 5);

    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
  }

  @isTest
  static void recentCommitsReadsTheNewestRow() {
    insertGithubRow(commitPayload('older row'), 50);
    insertGithubRow(commitPayload('newer row'), 5);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits();
    Test.stopTest();

    Assert.areEqual('newer row', feed.items[0].message, 'Newest row wins');
    Assert.areEqual(DeliveryController.STATUS_FRESH, feed.status, 'Status');
  }

  @isTest
  static void roadmapFreshRowIsFresh() {
    insertJiraRow(roadmapPayload('SPAP-902'), 29);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_FRESH, feed.status, 'Status');
    Assert.areEqual(29, feed.ageMinutes, 'Age in minutes');
    Assert.areEqual('SPAP-902', feed.items[0].key, 'Key');
    Assert.areEqual('indeterminate', feed.items[0].statusCategory, 'Category');
    Assert.areEqual('Story', feed.items[0].type, 'Type');
    Assert.areEqual('SPAP-900', feed.items[0].epicKey, 'Epic');
  }

  @isTest
  static void roadmapOldRowIsStale() {
    insertJiraRow(roadmapPayload('SPAP-901'), 90);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_STALE, feed.status, 'Status');
    Assert.areEqual(90, feed.ageMinutes, 'Age in minutes');
  }

  @isTest
  static void roadmapNoRowIsEmpty() {
    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
    Assert.areEqual(0, feed.items.size(), 'Empty list, not null');
  }

  @isTest
  static void roadmapMalformedJsonIsEmpty() {
    insertJiraRow('not json at all', 5);

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
  }

  @isTest
  static void roadmapReadsTheNewestRow() {
    insertJiraRow(roadmapPayload('SPAP-OLD'), 120);
    insertJiraRow(roadmapPayload('SPAP-NEW'), 1);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap();
    Test.stopTest();

    Assert.areEqual('SPAP-NEW', feed.items[0].key, 'Newest row wins');
  }

  @isTest
  static void guestReadsBothFeeds() {
    insertGithubRow(commitPayload('seed: delivery walk'), 3);
    insertJiraRow(roadmapPayload('SPAP-903'), 3);
    DeliveryController.nowOverride = NOW;
    User guest = SiteGuestTestSupport.preparedGuest();
    DeliveryController.CommitFeed commits;
    DeliveryController.RoadmapFeed roadmap;

    Test.startTest();
    System.runAs(guest) {
      commits = DeliveryController.getRecentCommits();
      roadmap = DeliveryController.getRoadmap();
    }
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_FRESH, commits.status, 'Commits');
    Assert.areEqual('seed: delivery walk', commits.items[0].message, 'Message');
    Assert.areEqual(DeliveryController.STATUS_FRESH, roadmap.status, 'Roadmap');
    Assert.areEqual('SPAP-903', roadmap.items[0].key, 'Key');
  }
}

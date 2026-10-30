/**
 * @description       : Tests for DeliveryController. Guest tests run as the
 *                      real Portfolio1 site guest user.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
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
    item.epicName = 'Launch readiness';
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
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      null
    );
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
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      null
    );
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_STALE, feed.status, 'Status');
    Assert.areEqual(30, feed.ageMinutes, 'Age in minutes');
    Assert.areEqual(1, feed.items.size(), 'Items still returned');
  }

  @isTest
  static void recentCommitsNoRowIsEmpty() {
    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      null
    );
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
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      null
    );
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
    Assert.areEqual(0, feed.items.size(), 'Empty list');
  }

  @isTest
  static void recentCommitsOtherSchemaVersionIsEmpty() {
    insertGithubRow('{"schemaVersion":2,"items":[]}', 5);

    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      null
    );
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
  }

  @isTest
  static void recentCommitsBlankPayloadIsEmpty() {
    insertGithubRow(null, 5);

    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      null
    );
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
  }

  @isTest
  static void recentCommitsReadsTheNewestRow() {
    insertGithubRow(commitPayload('older row'), 50);
    insertGithubRow(commitPayload('newer row'), 5);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      null
    );
    Test.stopTest();

    Assert.areEqual('newer row', feed.items[0].message, 'Newest row wins');
    Assert.areEqual(DeliveryController.STATUS_FRESH, feed.status, 'Status');
  }

  @isTest
  static void roadmapFreshRowIsFresh() {
    insertJiraRow(roadmapPayload('SPAP-902'), 29);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(null);
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_FRESH, feed.status, 'Status');
    Assert.areEqual(29, feed.ageMinutes, 'Age in minutes');
    Assert.areEqual('SPAP-902', feed.items[0].key, 'Key');
    Assert.areEqual('indeterminate', feed.items[0].statusCategory, 'Category');
    Assert.areEqual('Story', feed.items[0].type, 'Type');
    Assert.areEqual('SPAP-900', feed.items[0].epicKey, 'Epic');
    Assert.areEqual('Launch readiness', feed.items[0].epicName, 'Epic name');
  }

  @isTest
  static void roadmapRowCachedBeforeEpicNameHasNullName() {
    insertJiraRow(
      '{"schemaVersion":1,"items":[{"key":"SPAP-903","statusCategory":"new",' +
      '"type":"Story","epicKey":"SPAP-900"}]}',
      5
    );
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(null);
    Test.stopTest();

    Assert.areEqual('SPAP-900', feed.items[0].epicKey, 'Epic key kept');
    Assert.isNull(feed.items[0].epicName, 'Old rows have no epic name');
  }

  @isTest
  static void roadmapOldRowIsStale() {
    insertJiraRow(roadmapPayload('SPAP-901'), 90);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(null);
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_STALE, feed.status, 'Status');
    Assert.areEqual(90, feed.ageMinutes, 'Age in minutes');
  }

  @isTest
  static void roadmapNoRowIsEmpty() {
    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(null);
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
    Assert.areEqual(0, feed.items.size(), 'Empty list, not null');
  }

  @isTest
  static void roadmapMalformedJsonIsEmpty() {
    insertJiraRow('not json at all', 5);

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(null);
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
  }

  @isTest
  static void roadmapReadsTheNewestRow() {
    insertJiraRow(roadmapPayload('SPAP-OLD'), 120);
    insertJiraRow(roadmapPayload('SPAP-NEW'), 1);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(null);
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
      commits = DeliveryController.getRecentCommits(null);
      roadmap = DeliveryController.getRoadmap(null);
    }
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_FRESH, commits.status, 'Commits');
    Assert.areEqual('seed: delivery walk', commits.items[0].message, 'Message');
    Assert.areEqual(DeliveryController.STATUS_FRESH, roadmap.status, 'Roadmap');
    Assert.areEqual('SPAP-903', roadmap.items[0].key, 'Key');
  }

  // --- The simulation toggle and the breaker ---

  private static void openBreaker(String key) {
    for (Integer i = 0; i < CircuitBreaker.FAILURE_THRESHOLD; i++) {
      CircuitBreaker.recordFailure(key);
    }
  }

  @isTest
  static void simulatedCommitsReturnTheCacheWithNoCallout() {
    insertGithubRow(commitPayload('seed: delivery walk'), 3);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      true
    );
    Integer callouts = Limits.getCallouts();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_SIMULATED, feed.status, 'Status');
    Assert.areEqual(
      'seed: delivery walk',
      feed.items[0].message,
      'Cached item'
    );
    Assert.areEqual(3, feed.ageMinutes, 'Age still reported');
    Assert.areEqual(0, callouts, 'The toggle never calls out');
  }

  @isTest
  static void simulatedRoadmapReturnsTheCacheWithNoCallout() {
    insertJiraRow(roadmapPayload('SPAP-901'), 45);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(true);
    Integer callouts = Limits.getCallouts();
    Test.stopTest();

    Assert.areEqual(DeliveryController.STATUS_SIMULATED, feed.status, 'Status');
    Assert.areEqual('SPAP-901', feed.items[0].key, 'Cached item');
    Assert.areEqual(0, callouts, 'The toggle never calls out');
  }

  @isTest
  static void simulateFalseIsTheNormalRead() {
    insertGithubRow(commitPayload('normal'), 3);
    DeliveryController.nowOverride = NOW;

    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      false
    );

    Assert.areEqual(DeliveryController.STATUS_FRESH, feed.status, 'Status');
  }

  @isTest
  static void simulatedWithNoRowIsEmpty() {
    DeliveryController.CommitFeed commits = DeliveryController.getRecentCommits(
      true
    );
    DeliveryController.RoadmapFeed roadmap = DeliveryController.getRoadmap(
      true
    );

    Assert.areEqual(DeliveryController.STATUS_EMPTY, commits.status, 'Commits');
    Assert.areEqual(DeliveryController.STATUS_EMPTY, roadmap.status, 'Roadmap');
  }

  @isTest
  static void openGithubBreakerDegradesOnlyTheCommits() {
    insertGithubRow(commitPayload('cached'), 3);
    insertJiraRow(roadmapPayload('SPAP-901'), 3);
    DeliveryController.nowOverride = NOW;
    openBreaker(CircuitBreaker.KEY_GITHUB);

    DeliveryController.CommitFeed commits = DeliveryController.getRecentCommits(
      null
    );
    DeliveryController.RoadmapFeed roadmap = DeliveryController.getRoadmap(
      null
    );

    Assert.areEqual(
      DeliveryController.STATUS_DEGRADED,
      commits.status,
      'Commits'
    );
    Assert.areEqual('cached', commits.items[0].message, 'Last good data shown');
    Assert.areEqual(DeliveryController.STATUS_FRESH, roadmap.status, 'Roadmap');
  }

  @isTest
  static void openJiraBreakerDegradesTheRoadmap() {
    insertJiraRow(roadmapPayload('SPAP-901'), 90);
    DeliveryController.nowOverride = NOW;
    openBreaker(CircuitBreaker.KEY_JIRA);

    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(null);

    Assert.areEqual(DeliveryController.STATUS_DEGRADED, feed.status, 'Status');
    Assert.areEqual(90, feed.ageMinutes, 'Age still reported');
  }

  @isTest
  static void simulateBeatsDegraded() {
    insertJiraRow(roadmapPayload('SPAP-901'), 3);
    DeliveryController.nowOverride = NOW;
    openBreaker(CircuitBreaker.KEY_JIRA);

    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(true);

    Assert.areEqual(DeliveryController.STATUS_SIMULATED, feed.status, 'Status');
  }

  @isTest
  static void openBreakerWithNoRowIsEmpty() {
    openBreaker(CircuitBreaker.KEY_GITHUB);

    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      null
    );

    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
  }

  @isTest
  static void guestSeesSimulatedAndDegraded() {
    insertGithubRow(commitPayload('seed: delivery walk'), 3);
    insertJiraRow(roadmapPayload('SPAP-903'), 3);
    DeliveryController.nowOverride = NOW;
    openBreaker(CircuitBreaker.KEY_JIRA);
    User guest = SiteGuestTestSupport.preparedGuest();
    DeliveryController.CommitFeed commits;
    DeliveryController.RoadmapFeed roadmap;

    Test.startTest();
    System.runAs(guest) {
      commits = DeliveryController.getRecentCommits(true);
      roadmap = DeliveryController.getRoadmap(null);
    }
    Test.stopTest();

    Assert.areEqual(
      DeliveryController.STATUS_SIMULATED,
      commits.status,
      'Toggle'
    );
    Assert.areEqual(
      DeliveryController.STATUS_DEGRADED,
      roadmap.status,
      'Breaker'
    );
  }

  // --- parseTimestamp ---

  @isTest
  static void parseTimestampReadsZulu() {
    Assert.areEqual(
      Datetime.newInstanceGmt(2026, 10, 21, 8, 0, 0),
      DeliveryController.parseTimestamp('2026-10-21T08:00:00Z'),
      'GitHub form'
    );
  }

  @isTest
  static void parseTimestampReadsJiraOffsetWithoutColon() {
    Assert.areEqual(
      Datetime.newInstanceGmt(2026, 10, 21, 6, 30, 0),
      DeliveryController.parseTimestamp('2026-10-21T08:30:00.000+0200'),
      'Jira form, two hours ahead of GMT'
    );
  }

  @isTest
  static void parseTimestampReadsNegativeOffsetWithColon() {
    Assert.areEqual(
      Datetime.newInstanceGmt(2026, 10, 21, 13, 0, 0),
      DeliveryController.parseTimestamp('2026-10-21T08:00:00-05:00'),
      'Offset with a colon'
    );
  }

  @isTest
  static void parseTimestampReturnsNullForBlank() {
    Assert.isNull(DeliveryController.parseTimestamp(' '), 'Blank');
  }

  @isTest
  static void parseTimestampReturnsNullForText() {
    Assert.isNull(DeliveryController.parseTimestamp('yesterday'), 'Not a time');
  }

  @isTest
  static void roadmapServesTheShippedColumnLimit() {
    insertJiraRow(roadmapPayload('SPAP-902'), 5);
    DeliveryController.nowOverride = NOW;

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(null);
    Test.stopTest();

    Assert.areEqual(
      DeliveryController.ROADMAP_COLUMN_LIMIT,
      feed.columnLimit,
      'The shipped record matches the code default'
    );
  }

  @isTest
  static void roadmapServesTheColumnLimitSetting() {
    PortfolioSettings.overrideNumber('Roadmap_Column_Limit', 4);

    Test.startTest();
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(null);
    Test.stopTest();

    Assert.areEqual(4, feed.columnLimit, 'Served even with an empty feed');
    Assert.areEqual(DeliveryController.STATUS_EMPTY, feed.status, 'Status');
  }

  @isTest
  static void feedsCarryTheBreakerDefaults() {
    Test.startTest();
    DeliveryController.RoadmapFeed roadmap = DeliveryController.getRoadmap(
      null
    );
    DeliveryController.CommitFeed commits = DeliveryController.getRecentCommits(
      null
    );
    Test.stopTest();

    Assert.areEqual(
      CircuitBreaker.failureThreshold(),
      roadmap.failureThreshold,
      'Roadmap threshold is the breaker value'
    );
    Assert.areEqual(
      CircuitBreaker.openMinutes(),
      roadmap.openMinutes,
      'Roadmap open minutes is the breaker value'
    );
    Assert.areEqual(
      CircuitBreaker.failureThreshold(),
      commits.failureThreshold,
      'Commits threshold is the breaker value'
    );
    Assert.areEqual(
      CircuitBreaker.openMinutes(),
      commits.openMinutes,
      'Commits open minutes is the breaker value'
    );
  }

  @isTest
  static void feedsServeTheBreakerSettings() {
    PortfolioSettings.overrideNumber('Circuit_Failure_Threshold', 5);
    PortfolioSettings.overrideNumber('Circuit_Open_Minutes', 45);

    Test.startTest();
    DeliveryController.RoadmapFeed roadmap = DeliveryController.getRoadmap(
      null
    );
    DeliveryController.CommitFeed commits = DeliveryController.getRecentCommits(
      null
    );
    Test.stopTest();

    Assert.areEqual(5, roadmap.failureThreshold, 'Roadmap threshold override');
    Assert.areEqual(45, roadmap.openMinutes, 'Roadmap open minutes override');
    Assert.areEqual(5, commits.failureThreshold, 'Commits threshold override');
    Assert.areEqual(45, commits.openMinutes, 'Commits open minutes override');
  }
}

/**
 * @description       : Tests for GitHubCacheRefreshJob:
 *                      a good refresh inserts one payload that deserializes into
 *                      DeliveryController's DTOs, a failed refresh inserts nothing and the
 *                      newest good row keeps serving, an open circuit skips the call, no config
 *                      means log and exit, and every write follows the callout (C2). The good
 *                      row comes from @TestSetup, a separate transaction, so no test writes
 *                      before its callout.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@IsTest
private class GitHubCacheRefreshJobTest {
  private static final String GOOD_SHA = '5eed901a1b2c3d4e5f60718293a4b5c6d7e8f901';
  private static final String COMMITS_JSON =
    '[{"sha":"aaaa1111","html_url":"https://github.com/o/r/commit/aaaa1111",' +
    '"commit":{"message":"feat(api): first line\\n\\nbody text","author":{"name":"Git Name","date":"2026-10-21T08:00:00Z"}},' +
    '"author":{"login":"rdbumstead","avatar_url":"https://avatars.example.com/u/1"}},' +
    '{"sha":"bbbb2222","html_url":"https://github.com/o/r/commit/bbbb2222",' +
    '"commit":{"message":"fix: no linked user","author":{"name":"Plain Git","date":"2026-10-20T23:59:00Z"}},' +
    '"author":null}]';

  /** Answers every request the same way and counts the calls. Null status throws. */
  private class CountingMock implements HttpCalloutMock {
    private final Integer status;
    private final String body;
    public Integer calls = 0;
    public HttpRequest lastRequest;

    CountingMock(Integer status, String body) {
      this.status = status;
      this.body = body;
    }

    public HttpResponse respond(HttpRequest request) {
      calls++;
      lastRequest = request;
      if (status == null) {
        throw new CalloutException('Read timed out');
      }
      HttpResponse response = new HttpResponse();
      response.setStatusCode(status);
      response.setBody(body);
      return response;
    }
  }

  @TestSetup
  static void insertGoodRow() {
    DeliveryController.CommitItem item = new DeliveryController.CommitItem();
    item.sha = GOOD_SHA;
    item.message = 'seed: last good commit';
    DeliveryController.CommitPayload payload = new DeliveryController.CommitPayload();
    payload.schemaVersion = DeliveryController.SCHEMA_VERSION;
    payload.items = new List<DeliveryController.CommitItem>{ item };
    Github_Cache__c row = new Github_Cache__c(
      JSON_Payload__c = JSON.serialize(payload)
    );
    insert row;
    Test.setCreatedDate(row.Id, Datetime.now().addMinutes(-20));
  }

  private static void useRepo(String repoPath) {
    GitHubCacheRefreshJob.configOverridden = true;
    GitHubCacheRefreshJob.configOverride = new Portfolio_Config__mdt(
      GitHub_Repo_Path__c = repoPath
    );
  }

  private static Github_Cache__c newestRow() {
    return [
      SELECT JSON_Payload__c
      FROM Github_Cache__c
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1
    ];
  }

  @IsTest
  static void shouldInsertDtoPayloadWhenGitHubAnswers() {
    useRepo('rdbumstead/salesforce-platform-architect-portfolio');
    CountingMock mock = new CountingMock(200, COMMITS_JSON);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = GitHubCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(
      GitHubCacheRefreshJob.OUTCOME_REFRESHED,
      outcome,
      'Outcome'
    );
    Assert.areEqual(2, [SELECT COUNT() FROM Github_Cache__c], 'One row added');
    Assert.areEqual(
      'callout:GitHub_API/repos/rdbumstead/salesforce-platform-architect-portfolio/commits?sha=main&per_page=10',
      mock.lastRequest.getEndpoint(),
      'Commits on main, ten of them'
    );
    Assert.areEqual(
      'application/vnd.github+json',
      mock.lastRequest.getHeader('Accept'),
      'GitHub media type'
    );

    DeliveryController.CommitPayload payload = (DeliveryController.CommitPayload) JSON.deserialize(
      newestRow().JSON_Payload__c,
      DeliveryController.CommitPayload.class
    );
    Assert.areEqual(1, payload.schemaVersion, 'schemaVersion 1');
    Assert.areEqual(2, payload.items.size(), 'Both commits');
    DeliveryController.CommitItem first = payload.items[0];
    Assert.areEqual('aaaa1111', first.sha, 'sha');
    Assert.areEqual('feat(api): first line', first.message, 'First line only');
    Assert.areEqual('rdbumstead', first.authorName, 'GitHub login');
    Assert.areEqual(
      'https://avatars.example.com/u/1',
      first.authorAvatarUrl,
      'Avatar'
    );
    Assert.areEqual('https://github.com/o/r/commit/aaaa1111', first.url, 'url');
    Assert.areEqual(
      Datetime.newInstanceGmt(2026, 10, 21, 8, 0, 0),
      first.committedAt,
      'committedAt'
    );
    Assert.areEqual(
      'Plain Git',
      payload.items[1].authorName,
      'Git name fallback'
    );
    Assert.isNull(payload.items[1].authorAvatarUrl, 'No avatar without a user');
  }

  @IsTest
  static void shouldServeTheNewRowWhenControllerReads() {
    useRepo('o/r');
    Test.setMock(HttpCalloutMock.class, new CountingMock(200, COMMITS_JSON));

    Test.startTest();
    GitHubCacheRefreshJob.refresh();
    Test.stopTest();

    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      null
    );
    Assert.areEqual(DeliveryController.STATUS_FRESH, feed.status, 'Fresh');
    Assert.areEqual('aaaa1111', feed.items[0].sha, 'The refreshed commits');
  }

  @IsTest
  static void shouldInsertNothingWhenGitHubFails() {
    useRepo('o/r');
    CountingMock mock = new CountingMock(503, '{"message":"down"}');
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = GitHubCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(GitHubCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
    Assert.areEqual(1, mock.calls, 'The call was made');
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Github_Cache__c],
      'Nothing inserted'
    );
    Assert.isTrue(
      newestRow().JSON_Payload__c.contains(GOOD_SHA),
      'The newest good row is untouched'
    );
    Assert.areEqual(
      GOOD_SHA,
      DeliveryController.getRecentCommits(null).items[0].sha,
      'The page keeps serving the last good commits'
    );
    Assert.areEqual(
      1,
      CircuitBreaker.snapshot()[1].failures,
      'The github breaker counted the failure'
    );
  }

  @IsTest
  static void shouldKeepGoodRowThroughCleanupWhenRefreshFailed() {
    useRepo('o/r');
    Test.setMock(HttpCalloutMock.class, new CountingMock(503, 'down'));
    String outcome = GitHubCacheRefreshJob.refresh();
    // Age the only good row past the two hour limit, after the callout.
    Github_Cache__c good = [SELECT Id FROM Github_Cache__c];
    Test.setCreatedDate(good.Id, Datetime.now().addHours(-6));
    CacheCleanupSettings.testOverrideEnabled = true;

    Test.startTest();
    Database.executeBatch(new GithubCacheCleanupBatch(), 200);
    Test.stopTest();

    Assert.areEqual(
      GitHubCacheRefreshJob.OUTCOME_FAILED,
      outcome,
      'Refresh failed'
    );
    Assert.areEqual(1, [SELECT COUNT() FROM Github_Cache__c], 'Row survived');
    DeliveryController.CommitFeed feed = DeliveryController.getRecentCommits(
      null
    );
    Assert.areEqual(GOOD_SHA, feed.items[0].sha, 'Last good commits served');
    Assert.areEqual(
      DeliveryController.STATUS_STALE,
      feed.status,
      'Shown as stale'
    );
  }

  @IsTest
  static void shouldInsertNothingWhenCalloutThrows() {
    useRepo('o/r');
    Test.setMock(HttpCalloutMock.class, new CountingMock(null, null));

    Test.startTest();
    String outcome = GitHubCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(GitHubCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Github_Cache__c],
      'Nothing inserted'
    );
  }

  @IsTest
  static void shouldInsertNothingWhenBodyIsNotACommitList() {
    useRepo('o/r');
    Test.setMock(
      HttpCalloutMock.class,
      new CountingMock(200, '{"message":"Not Found"}')
    );

    Test.startTest();
    String outcome = GitHubCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(GitHubCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Github_Cache__c],
      'Nothing inserted'
    );
  }

  @IsTest
  static void shouldNotCallOutWhenRepoPathInvalid() {
    useRepo('o/r?x=1');
    CountingMock mock = new CountingMock(200, COMMITS_JSON);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = GitHubCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(GitHubCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
    Assert.areEqual(0, mock.calls, 'An unsafe path is never sent');
  }

  @IsTest
  static void shouldLogAndExitWhenNoConfigRecord() {
    GitHubCacheRefreshJob.configOverridden = true;
    GitHubCacheRefreshJob.configOverride = null;
    CountingMock mock = new CountingMock(200, COMMITS_JSON);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = GitHubCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(
      GitHubCacheRefreshJob.OUTCOME_NO_CONFIG,
      outcome,
      'Outcome'
    );
    Assert.areEqual(0, mock.calls, 'No callout');
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Github_Cache__c],
      'Nothing inserted'
    );
  }

  @IsTest
  static void shouldLogAndExitWhenRepoPathBlank() {
    useRepo(' ');

    Test.startTest();
    String outcome = GitHubCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(
      GitHubCacheRefreshJob.OUTCOME_NO_CONFIG,
      outcome,
      'Outcome'
    );
  }

  @IsTest
  static void shouldSkipCallWhenCircuitOpen() {
    useRepo('o/r');
    CountingMock mock = new CountingMock(200, COMMITS_JSON);
    Test.setMock(HttpCalloutMock.class, mock);
    for (Integer i = 0; i < CircuitBreaker.FAILURE_THRESHOLD; i++) {
      CircuitBreaker.recordFailure(CircuitBreaker.KEY_GITHUB);
    }

    String outcome = GitHubCacheRefreshJob.refresh();

    Assert.areEqual(
      GitHubCacheRefreshJob.OUTCOME_OPEN_CIRCUIT,
      outcome,
      'Outcome'
    );
    Assert.areEqual(0, mock.calls, 'No callout while open');
    Assert.areEqual(0, Limits.getCallouts(), 'No callout counted');
  }

  @IsTest
  static void shouldCallOutAfterBreakerCheckWhenNothingWrittenBefore() {
    // C2: the breaker check reads only, so the callout that follows in the same
    // transaction succeeds. The control test below shows DML first would fail it.
    useRepo('o/r');
    CountingMock mock = new CountingMock(200, COMMITS_JSON);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    Integer dmlBefore = Limits.getDmlStatements();
    Boolean open = CircuitBreaker.isOpen(CircuitBreaker.KEY_GITHUB);
    Integer dmlAfterCheck = Limits.getDmlStatements();
    String outcome = GitHubCacheRefreshJob.refresh();
    Integer callouts = Limits.getCallouts();
    Test.stopTest();

    Assert.isFalse(open, 'Closed');
    Assert.areEqual(dmlBefore, dmlAfterCheck, 'The check wrote nothing');
    Assert.areEqual(
      GitHubCacheRefreshJob.OUTCOME_REFRESHED,
      outcome,
      'Outcome'
    );
    Assert.areEqual(1, mock.calls, 'The callout ran after the check');
    Assert.areEqual(1, callouts, 'One callout');
  }

  @IsTest
  static void shouldFailCalloutWhenDmlRunsFirst() {
    // Control for the test above: the harness refuses a callout after uncommitted DML,
    // so a breaker write before the callout could not go unnoticed.
    useRepo('o/r');
    CountingMock mock = new CountingMock(200, COMMITS_JSON);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    CircuitBreaker.recordFailure(CircuitBreaker.KEY_JIRA);
    String outcome = GitHubCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(GitHubCacheRefreshJob.OUTCOME_FAILED, outcome, 'Refused');
    Assert.areEqual(0, mock.calls, 'The callout never reached the mock');
  }

  @IsTest
  static void shouldRefreshWhenRunAsQueueable() {
    useRepo('o/r');
    Test.setMock(HttpCalloutMock.class, new CountingMock(200, COMMITS_JSON));

    Test.startTest();
    System.enqueueJob(new GitHubCacheRefreshJob());
    Test.stopTest();

    Assert.areEqual(2, [SELECT COUNT() FROM Github_Cache__c], 'Row added');
  }

  @IsTest
  static void shouldCutMessageWhenLongerThanLimit() {
    String longLine = 'x'.repeat(150);

    String cut = GitHubService.firstLine(longLine + '\nsecond line');

    Assert.areEqual(
      GitHubService.MESSAGE_MAX_LENGTH,
      cut.length(),
      'Cut to 100 characters'
    );
  }
}

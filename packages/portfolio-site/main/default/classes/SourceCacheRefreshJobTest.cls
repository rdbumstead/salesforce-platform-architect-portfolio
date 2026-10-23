/**
 * @description       : Tests for SourceCacheRefreshJob (Round 7 contract P2, reading R17). GitHub
 *                      is an HttpCalloutMock. A good read upserts content, link and times, a
 *                      failed read keeps the newest good content and records the check, a path
 *                      checked within a day is not read again, an open circuit or no config
 *                      skips the calls, and rows for paths no longer configured are deleted.
 *                      Seed rows come from @TestSetup, a separate transaction, so no test
 *                      writes before its callouts (contract C2).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
@IsTest
private class SourceCacheRefreshJobTest {
  private static final String FRESH_PATH = 'lwc/a/fresh.js';
  private static final String STALE_PATH = 'lwc/a/stale.js';
  private static final String NEW_PATH = 'classes/New.cls';
  private static final String ORPHAN_PATH = 'lwc/old/gone.js';
  private static final String OLD_CONTENT = 'old good content';

  /** Answers each request by path and counts the calls. A null status throws. */
  private class ContentsMock implements HttpCalloutMock {
    private final Integer status;
    public Integer calls = 0;
    public List<String> endpoints = new List<String>();

    ContentsMock(Integer status) {
      this.status = status;
    }

    public HttpResponse respond(HttpRequest request) {
      calls++;
      endpoints.add(request.getEndpoint());
      if (status == null) {
        throw new CalloutException('Read timed out');
      }
      String path = request.getEndpoint()
        .substringAfter('/contents/')
        .substringBefore('?');
      HttpResponse response = new HttpResponse();
      response.setStatusCode(status);
      response.setBody(
        status == 200 ? fileBody(path, 'text of ' + path) : '{}'
      );
      return response;
    }
  }

  private static String fileBody(String path, String text) {
    return JSON.serialize(
      new Map<String, Object>{
        'type' => 'file',
        'encoding' => 'base64',
        'path' => path,
        'size' => text.length(),
        'html_url' => 'https://github.com/o/r/blob/main/' + path,
        'content' => EncodingUtil.base64Encode(Blob.valueOf(text))
      }
    );
  }

  @TestSetup
  static void seedCache() {
    Datetime now = System.now();
    insert new List<Source_Cache__c>{
      new Source_Cache__c(
        Path__c = FRESH_PATH,
        Content__c = OLD_CONTENT,
        Fetched_At__c = now.addHours(-2),
        Checked_At__c = now.addHours(-2),
        Last_Status__c = '200'
      ),
      new Source_Cache__c(
        Path__c = STALE_PATH,
        Content__c = OLD_CONTENT,
        Html_Url__c = 'https://github.com/o/r/blob/main/' + STALE_PATH,
        Fetched_At__c = now.addHours(-30),
        Checked_At__c = now.addHours(-30),
        Last_Status__c = '200'
      ),
      new Source_Cache__c(
        Path__c = ORPHAN_PATH,
        Content__c = OLD_CONTENT,
        Fetched_At__c = now.addHours(-2),
        Checked_At__c = now.addHours(-2),
        Last_Status__c = '200'
      )
    };
  }

  private static void configure(List<String> paths) {
    List<Source_File__mdt> files = new List<Source_File__mdt>();
    Integer order = 1;
    for (String path : paths) {
      files.add(
        new Source_File__mdt(
          Source_Key__c = 'apiTester',
          Path__c = path,
          Label__c = path.substringAfterLast('/'),
          Sort_Order__c = order++
        )
      );
    }
    SourceController.filesOverride = files;
    SourceCacheRefreshJob.configOverridden = true;
    SourceCacheRefreshJob.configOverride = new Portfolio_Config__mdt(
      GitHub_Repo_Path__c = 'o/r'
    );
  }

  private static Map<String, Source_Cache__c> rowsByPath() {
    Map<String, Source_Cache__c> rows = new Map<String, Source_Cache__c>();
    for (Source_Cache__c row : [
      SELECT
        Path__c,
        Content__c,
        Html_Url__c,
        Fetched_At__c,
        Checked_At__c,
        Last_Status__c,
        Truncated__c
      FROM Source_Cache__c
    ]) {
      rows.put(row.Path__c, row);
    }
    return rows;
  }

  @IsTest
  static void shouldReadOnlyDuePathsWhenRefreshing() {
    configure(new List<String>{ FRESH_PATH, STALE_PATH, NEW_PATH });
    ContentsMock mock = new ContentsMock(200);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(
      SourceCacheRefreshJob.OUTCOME_REFRESHED,
      outcome,
      'Outcome'
    );
    Assert.areEqual(2, mock.calls, 'The stale and the new path only');
    Assert.areEqual(
      'callout:GitHub_API/repos/o/r/contents/' + NEW_PATH + '?ref=main',
      mock.endpoints[0],
      'Contents API on main through the Named Credential'
    );
    Map<String, Source_Cache__c> rows = rowsByPath();
    Assert.areEqual(OLD_CONTENT, rows.get(FRESH_PATH).Content__c, 'Fresh kept');
    Assert.areEqual(
      'text of ' + STALE_PATH,
      rows.get(STALE_PATH).Content__c,
      'Stale replaced'
    );
    Assert.areEqual(
      'text of ' + NEW_PATH,
      rows.get(NEW_PATH).Content__c,
      'New'
    );
    Assert.areEqual(
      'https://github.com/o/r/blob/main/' + NEW_PATH,
      rows.get(NEW_PATH).Html_Url__c,
      'GitHub link from html_url'
    );
    Assert.areEqual('200', rows.get(NEW_PATH).Last_Status__c, 'Status');
    Assert.isNotNull(rows.get(NEW_PATH).Fetched_At__c, 'Fetch time');
    Assert.isFalse(rows.get(NEW_PATH).Truncated__c, 'Whole file');
  }

  @IsTest
  static void shouldDeleteRowsWhenPathIsNoLongerConfigured() {
    configure(new List<String>{ FRESH_PATH, STALE_PATH });
    Test.setMock(HttpCalloutMock.class, new ContentsMock(200));

    Test.startTest();
    SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.isFalse(rowsByPath().containsKey(ORPHAN_PATH), 'Orphan deleted');
  }

  @IsTest
  static void shouldKeepGoodContentWhenGitHubFails() {
    configure(new List<String>{ FRESH_PATH, STALE_PATH });
    ContentsMock mock = new ContentsMock(404);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(SourceCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
    Source_Cache__c stale = rowsByPath().get(STALE_PATH);
    Assert.areEqual(OLD_CONTENT, stale.Content__c, 'Newest good content kept');
    Assert.areEqual('HTTP 404', stale.Last_Status__c, 'Failure recorded');
    Assert.isTrue(
      stale.Checked_At__c > stale.Fetched_At__c,
      'Checked now, fetched earlier'
    );
    Assert.isFalse(
      SourceCacheRefreshJob.isDue(),
      'A failed path waits a day before the next try'
    );
  }

  @IsTest
  static void shouldRecordStatusWhenCalloutThrows() {
    configure(new List<String>{ NEW_PATH });
    Test.setMock(HttpCalloutMock.class, new ContentsMock(null));

    Test.startTest();
    String outcome = SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(SourceCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
    Source_Cache__c row = rowsByPath().get(NEW_PATH);
    Assert.areEqual(
      'Callout failed: System.CalloutException',
      row.Last_Status__c,
      'Callout failure recorded'
    );
    Assert.isNull(row.Content__c, 'Nothing to show yet');
    Assert.isNull(row.Fetched_At__c, 'Never fetched');
  }

  @IsTest
  static void shouldTruncateWhenFileIsLongerThanTheField() {
    configure(new List<String>{ NEW_PATH });
    Test.setMock(HttpCalloutMock.class, new LongFileMock());

    Test.startTest();
    SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Source_Cache__c row = rowsByPath().get(NEW_PATH);
    Assert.isTrue(row.Truncated__c, 'Flagged');
    Assert.areEqual(
      SourceCacheRefreshJob.CONTENT_MAX_LENGTH,
      row.Content__c.length(),
      'Cut to the field length'
    );
  }

  private class LongFileMock implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest request) {
      HttpResponse response = new HttpResponse();
      response.setStatusCode(200);
      response.setBody(
        fileBody(
          NEW_PATH,
          'x'.repeat(SourceCacheRefreshJob.CONTENT_MAX_LENGTH + 5)
        )
      );
      return response;
    }
  }

  @IsTest
  static void shouldSkipWhenNothingIsDue() {
    configure(new List<String>{ FRESH_PATH });
    ContentsMock mock = new ContentsMock(200);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    Boolean due = SourceCacheRefreshJob.isDue();
    String outcome = SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.isFalse(due, 'Checked two hours ago');
    Assert.areEqual(SourceCacheRefreshJob.OUTCOME_NOT_DUE, outcome, 'Outcome');
    Assert.areEqual(0, mock.calls, 'No callout');
  }

  @IsTest
  static void shouldSkipWhenNoConfig() {
    configure(new List<String>{ NEW_PATH });
    SourceCacheRefreshJob.configOverride = null;
    ContentsMock mock = new ContentsMock(200);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(
      SourceCacheRefreshJob.OUTCOME_NO_CONFIG,
      outcome,
      'Outcome'
    );
    Assert.areEqual(0, mock.calls, 'No callout');
  }

  @IsTest
  static void shouldSkipWhenCircuitIsOpen() {
    configure(new List<String>{ NEW_PATH });
    ContentsMock mock = new ContentsMock(200);
    Test.setMock(HttpCalloutMock.class, mock);
    for (Integer i = 0; i < CircuitBreaker.FAILURE_THRESHOLD; i++) {
      CircuitBreaker.recordFailure(CircuitBreaker.KEY_GITHUB);
    }

    String outcome = SourceCacheRefreshJob.refresh();

    Assert.areEqual(
      SourceCacheRefreshJob.OUTCOME_OPEN_CIRCUIT,
      outcome,
      'Outcome'
    );
    Assert.areEqual(0, mock.calls, 'No callout while open');
  }

  @IsTest
  static void shouldRunAsQueueableWhenEnqueued() {
    configure(new List<String>{ NEW_PATH });
    Test.setMock(HttpCalloutMock.class, new ContentsMock(200));

    Test.startTest();
    System.enqueueJob(new SourceCacheRefreshJob());
    Test.stopTest();

    Assert.areEqual(
      'text of ' + NEW_PATH,
      rowsByPath().get(NEW_PATH).Content__c,
      'Filled by the queued job'
    );
  }
}

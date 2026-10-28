/**
 * @description       : Tests for SourceCacheRefreshJob. GitHub
 *                      is an HttpCalloutMock. A good read upserts content, link and times, a
 *                      failed read keeps the newest good content and records the check, a path
 *                      checked within a day is not read again, an open circuit or no config
 *                      skips the calls, and rows for paths no longer configured are deleted.
 *                      A file longer than one row is split into parts inside a top level
 *                      heading or between visible characters, the parts join back to the file, parts
 *                      a shorter file no longer needs are deleted, and a file longer than
 *                      every part together is cut and flagged. A forced run reads the paths
 *                      it is given, or every path of one key, even when they are fresh, and
 *                      keeps the same parts, stale row delete, breaker and file cap. A path
 *                      no record configures is never read, and the scheduled run is unchanged.
 *                      Seed rows come from @TestSetup, a separate transaction, so no test
 *                      writes before its callouts.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/23/2026
 **/
@IsTest
private class SourceCacheRefreshJobTest {
  private static final String FRESH_PATH = 'lwc/a/fresh.js';
  private static final String STALE_PATH = 'lwc/a/stale.js';
  private static final String NEW_PATH = 'classes/New.cls';
  private static final String ORPHAN_PATH = 'lwc/old/gone.js';
  private static final String STALE_PART_PATH = STALE_PATH + '#part-2';
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
      // A part the stale file needed once. Its next read is one part long.
      new Source_Cache__c(
        Path__c = STALE_PART_PATH,
        Content__c = OLD_CONTENT,
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
      rowsByPath().containsKey(STALE_PART_PATH),
      'A failed read keeps every part'
    );
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
  static void shouldSplitAtTheFieldLengthWhenFileIsLonger() {
    configure(new List<String>{ NEW_PATH });
    Test.setMock(HttpCalloutMock.class, new LongFileMock());

    Test.startTest();
    SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Map<String, Source_Cache__c> rows = rowsByPath();
    Source_Cache__c first = rows.get(NEW_PATH);
    Source_Cache__c second = rows.get(NEW_PATH + '#part-2');
    Assert.isFalse(first.Truncated__c, 'Kept whole across two rows');
    Assert.areEqual(
      SourceCacheRefreshJob.CONTENT_MAX_LENGTH - 1,
      first.Content__c.length(),
      'One short of the field, so the cut sits between two characters'
    );
    Assert.areEqual(6, second.Content__c.length(), 'The rest in part 2');
    Assert.areEqual('200', second.Last_Status__c, 'Part status');
    Assert.isNotNull(second.Fetched_At__c, 'Part fetch time');
  }

  @IsTest
  static void shouldSplitInsideATopLevelHeadingWhenOneFits() {
    PortfolioSettings.overrideNumber('Source_Content_Max_Length', 2048);
    // The field drops whitespace at the end of a value, so the text ends on a letter.
    String text =
      '# Title\n## One\n' +
      'a'.repeat(1500) +
      '\n\n## Two\n' +
      'b'.repeat(1500);
    configure(new List<String>{ NEW_PATH });
    Test.setMock(HttpCalloutMock.class, new TextMock(text));

    Test.startTest();
    SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Map<String, Source_Cache__c> rows = rowsByPath();
    String first = rows.get(NEW_PATH).Content__c;
    String second = rows.get(NEW_PATH + '#part-2').Content__c;
    Assert.isTrue(
      first.endsWith('a\n\n#'),
      'Part 1 ends on the first # of the heading, so no line break is lost'
    );
    Assert.isTrue(second.startsWith('# Two'), 'Part 2 holds the rest of it');
    Assert.areEqual(text, first + second, 'The parts join back to the file');
    Assert.isFalse(rows.containsKey(NEW_PATH + '#part-3'), 'Two parts only');
  }

  @IsTest
  static void shouldDeletePartsWhenTheFileGetsShorter() {
    configure(new List<String>{ FRESH_PATH, STALE_PATH });
    Test.setMock(HttpCalloutMock.class, new ContentsMock(200));

    Test.startTest();
    SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Map<String, Source_Cache__c> rows = rowsByPath();
    Assert.isFalse(rows.containsKey(STALE_PART_PATH), 'Old part deleted');
    Assert.areEqual(
      'text of ' + STALE_PATH,
      rows.get(STALE_PATH).Content__c,
      'The file in one row'
    );
  }

  @IsTest
  static void shouldCutBetweenVisibleCharactersWhenNoHeadingFits() {
    Test.startTest();
    List<String> parts = SourceCacheRefreshJob.splitContent('abc def', 5);
    List<String> noBreak = SourceCacheRefreshJob.splitContent('abcdefgh', 3);
    List<String> empty = SourceCacheRefreshJob.splitContent(null, 3);
    Test.stopTest();

    Assert.areEqual(
      new List<String>{ 'ab', 'c def' },
      parts,
      'Never next to the space, which the field would drop'
    );
    Assert.areEqual(
      new List<String>{ 'ab', 'cd', 'ef', 'gh' },
      noBreak,
      'Between the last two characters of each window'
    );
    Assert.areEqual(new List<String>{ '' }, empty, 'Null is one empty piece');
  }

  @IsTest
  static void shouldNotCutASurrogatePairWhenCuttingAtTheLimit() {
    // An emoji is a surrogate pair: two UTF-16 units.
    String pair = String.fromCharArray(new List<Integer>{ 55357, 56832 });
    String text = 'ab' + pair + 'cd';

    Test.startTest();
    List<String> parts = SourceCacheRefreshJob.splitContent(text, 3);
    Test.stopTest();

    Assert.areEqual('ab', parts[0], 'Cut before the pair');
    Assert.areEqual(text, String.join(parts, ''), 'Nothing lost');
  }

  private class TextMock implements HttpCalloutMock {
    private final String text;

    TextMock(String text) {
      this.text = text;
    }

    public HttpResponse respond(HttpRequest request) {
      HttpResponse response = new HttpResponse();
      response.setStatusCode(200);
      response.setBody(fileBody(NEW_PATH, text));
      return response;
    }
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

  @IsTest
  static void shouldTreatARowAsDueAtTheRefreshHoursSetting() {
    PortfolioSettings.overrideNumber('Source_Refresh_Hours', 1);
    configure(new List<String>{ FRESH_PATH });
    ContentsMock mock = new ContentsMock(200);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(
      SourceCacheRefreshJob.OUTCOME_REFRESHED,
      outcome,
      'Refreshed'
    );
    Assert.areEqual(
      1,
      mock.calls,
      'A two hour old row is due under a one hour setting'
    );
  }

  @IsTest
  static void shouldReadNoMoreFilesThanTheMaxFilesSetting() {
    PortfolioSettings.overrideNumber('Source_Max_Files_Per_Run', 1);
    configure(new List<String>{ STALE_PATH, NEW_PATH, 'classes/Other.cls' });
    ContentsMock mock = new ContentsMock(200);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(1, mock.calls, 'One file per run under a setting of one');
  }

  @IsTest
  static void shouldReadAFreshPathWhenForced() {
    configure(new List<String>{ FRESH_PATH, STALE_PATH, NEW_PATH });
    ContentsMock mock = new ContentsMock(200);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = SourceCacheRefreshJob.refreshPaths(
      new Set<String>{ FRESH_PATH }
    );
    Test.stopTest();

    Assert.areEqual(
      SourceCacheRefreshJob.OUTCOME_REFRESHED,
      outcome,
      'Outcome'
    );
    Assert.areEqual(1, mock.calls, 'Only the forced path');
    Map<String, Source_Cache__c> rows = rowsByPath();
    Assert.areEqual(
      'text of ' + FRESH_PATH,
      rows.get(FRESH_PATH).Content__c,
      'Read although it was checked two hours ago'
    );
    Assert.areEqual(
      OLD_CONTENT,
      rows.get(STALE_PATH).Content__c,
      'A due path that was not asked for is left to the scheduled run'
    );
  }

  @IsTest
  static void shouldEnqueueEveryPathOfTheKeyWhenForcedByKey() {
    configure(new List<String>{ FRESH_PATH, STALE_PATH, NEW_PATH });
    Test.setMock(HttpCalloutMock.class, new ContentsMock(200));

    Test.startTest();
    Id jobId = SourceCacheRefreshJob.forceRefresh('apiTester');
    Test.stopTest();

    Assert.isNotNull(jobId, 'A job was queued');
    Map<String, Source_Cache__c> rows = rowsByPath();
    for (String path : new List<String>{ FRESH_PATH, STALE_PATH, NEW_PATH }) {
      Assert.areEqual(
        'text of ' + path,
        rows.get(path).Content__c,
        'Every path of the key read: ' + path
      );
    }
  }

  @IsTest
  static void shouldEnqueueNothingWhenTheKeyHasNoPath() {
    configure(new List<String>{ FRESH_PATH });

    Test.startTest();
    Id byKey = SourceCacheRefreshJob.forceRefresh(SourceController.DOCS_KEY);
    Id byNoPaths = SourceCacheRefreshJob.forceRefresh(new Set<String>{ ' ' });
    Id byNull = SourceCacheRefreshJob.forceRefresh((Set<String>) null);
    Test.stopTest();

    Assert.isNull(byKey, 'No docs path configured');
    Assert.isNull(byNoPaths, 'A blank path is no path');
    Assert.isNull(byNull, 'Null is no path');
  }

  @IsTest
  static void shouldNotReadAPathThatIsNotConfiguredWhenForced() {
    configure(new List<String>{ FRESH_PATH });
    ContentsMock mock = new ContentsMock(200);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = SourceCacheRefreshJob.refreshPaths(
      new Set<String>{ 'docs/guides/unlisted.md' }
    );
    Test.stopTest();

    Assert.areEqual(SourceCacheRefreshJob.OUTCOME_NOT_DUE, outcome, 'Outcome');
    Assert.areEqual(0, mock.calls, 'Never read');
    Assert.isFalse(
      rowsByPath().containsKey(ORPHAN_PATH),
      'Rows no longer configured are still deleted'
    );
  }

  @IsTest
  static void shouldSplitAForcedFreshFileIntoParts() {
    configure(new List<String>{ FRESH_PATH });
    Test.setMock(HttpCalloutMock.class, new LongFileMock());

    Test.startTest();
    SourceCacheRefreshJob.refreshPaths(new Set<String>{ ' ' + FRESH_PATH });
    Test.stopTest();

    Map<String, Source_Cache__c> rows = rowsByPath();
    Assert.areEqual(
      SourceCacheRefreshJob.CONTENT_MAX_LENGTH - 1,
      rows.get(FRESH_PATH).Content__c.length(),
      'Part 1 at the field length, from a trimmed path'
    );
    Assert.areEqual(
      6,
      rows.get(FRESH_PATH + '#part-2').Content__c.length(),
      'The rest in part 2'
    );
  }

  @IsTest
  static void shouldNeedNoPermissionSetWhenForcedByAnAdmin() {
    User plain = new User(
      Alias = 'plain',
      Email = 'plain@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'Plain',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = [
        SELECT Id
        FROM Profile
        WHERE Name = 'System Administrator'
        LIMIT 1
      ]
      .Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      Username = 'plain.' + Crypto.getRandomInteger() + '@example.com.src'
    );
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert plain;
    }
    configure(new List<String>{ FRESH_PATH });
    Test.setMock(HttpCalloutMock.class, new ContentsMock(200));

    Test.startTest();
    System.runAs(plain) {
      SourceCacheRefreshJob.forceRefresh(new Set<String>{ FRESH_PATH });
    }
    Test.stopTest();

    Assert.areEqual(
      'text of ' + FRESH_PATH,
      rowsByPath().get(FRESH_PATH).Content__c,
      'An admin with no permission set assigned runs it'
    );
  }

  @IsTest
  static void shouldDeleteAPartTheForcedFileNoLongerNeeds() {
    configure(new List<String>{ FRESH_PATH, STALE_PATH });
    Test.setMock(HttpCalloutMock.class, new ContentsMock(200));

    Test.startTest();
    SourceCacheRefreshJob.refreshPaths(new Set<String>{ STALE_PATH });
    Test.stopTest();

    Map<String, Source_Cache__c> rows = rowsByPath();
    Assert.isFalse(rows.containsKey(STALE_PART_PATH), 'Old part deleted');
    Assert.areEqual(
      OLD_CONTENT,
      rows.get(FRESH_PATH).Content__c,
      'A path not asked for keeps its content'
    );
  }

  @IsTest
  static void shouldSkipAForcedRunWhenCircuitIsOpen() {
    configure(new List<String>{ FRESH_PATH });
    ContentsMock mock = new ContentsMock(200);
    Test.setMock(HttpCalloutMock.class, mock);
    for (Integer i = 0; i < CircuitBreaker.FAILURE_THRESHOLD; i++) {
      CircuitBreaker.recordFailure(CircuitBreaker.KEY_GITHUB);
    }

    String outcome = SourceCacheRefreshJob.refreshPaths(
      new Set<String>{ FRESH_PATH }
    );

    Assert.areEqual(
      SourceCacheRefreshJob.OUTCOME_OPEN_CIRCUIT,
      outcome,
      'Outcome'
    );
    Assert.areEqual(0, mock.calls, 'No callout while open');
  }

  @IsTest
  static void shouldCapAForcedRunAtTheMaxFilesSetting() {
    PortfolioSettings.overrideNumber('Source_Max_Files_Per_Run', 1);
    configure(new List<String>{ FRESH_PATH, STALE_PATH });
    ContentsMock mock = new ContentsMock(200);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    SourceCacheRefreshJob.refreshPaths(
      new Set<String>{ FRESH_PATH, STALE_PATH }
    );
    Test.stopTest();

    Assert.areEqual(1, mock.calls, 'One file per run under a setting of one');
  }

  @IsTest
  static void shouldReadOnlyDuePathsWhenTheScheduledJobRuns() {
    configure(new List<String>{ FRESH_PATH, NEW_PATH });
    Test.setMock(HttpCalloutMock.class, new ContentsMock(200));

    Test.startTest();
    System.enqueueJob(new SourceCacheRefreshJob());
    Test.stopTest();

    Map<String, Source_Cache__c> rows = rowsByPath();
    Assert.areEqual(
      OLD_CONTENT,
      rows.get(FRESH_PATH).Content__c,
      'A fresh path is not forced by the scheduled job'
    );
    Assert.areEqual(
      'text of ' + NEW_PATH,
      rows.get(NEW_PATH).Content__c,
      'The due path read'
    );
  }

  @IsTest
  static void shouldTruncateAtTheContentLengthSetting() {
    PortfolioSettings.overrideNumber('Source_Content_Max_Length', 2048);
    configure(new List<String>{ NEW_PATH });
    Test.setMock(HttpCalloutMock.class, new LongFileMock());

    Test.startTest();
    SourceCacheRefreshJob.refresh();
    Test.stopTest();

    Source_Cache__c row = rowsByPath().get(NEW_PATH);
    Assert.isTrue(row.Truncated__c, 'Flagged');
    Assert.areEqual(2047, row.Content__c.length(), 'Cut within the set length');
    Map<String, Source_Cache__c> rows = rowsByPath();
    Assert.isTrue(
      rows.containsKey(NEW_PATH + '#part-' + SourceCacheRefreshJob.MAX_PARTS),
      'Every part filled'
    );
    Assert.isFalse(
      rows.containsKey(
        NEW_PATH + '#part-' + (SourceCacheRefreshJob.MAX_PARTS + 1)
      ),
      'No part past the last'
    );
  }
}

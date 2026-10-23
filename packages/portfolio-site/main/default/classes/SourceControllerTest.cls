/**
 * @description       : Tests for SourceController (Round 7 contract P2). The guest test runs as
 *                      the Portfolio1 site's real guest user and proves the guest gets cached
 *                      rows with no callout and without any access to Source_Cache__c.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
@IsTest
private class SourceControllerTest {
  private static final String KEY = 'apiTester';
  private static final String JS_PATH = 'lwc/apiTester/apiTester.js';
  private static final String HTML_PATH = 'lwc/apiTester/apiTester.html';
  private static final String APEX_PATH = 'classes/ApiLabController.cls';
  private static final String OTHER_PATH = 'lwc/decisionMatrix/decisionMatrix.js';

  /** Fails any callout, so a test that reaches GitHub fails loudly. */
  private class NoCalloutMock implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest request) {
      Assert.fail('getSourceFiles must not call out: ' + request.getEndpoint());
      return null;
    }
  }

  private static Source_File__mdt file(
    String key,
    String path,
    String label,
    Integer sortOrder
  ) {
    return new Source_File__mdt(
      Source_Key__c = key,
      Path__c = path,
      Label__c = label,
      Sort_Order__c = sortOrder
    );
  }

  private static void configure() {
    // Listed out of order on purpose: the controller sorts by Sort_Order__c.
    SourceController.filesOverride = new List<Source_File__mdt>{
      file(KEY, APEX_PATH, 'ApiLabController.cls', 3),
      file(KEY, JS_PATH, 'apiTester.js', 1),
      file(KEY, HTML_PATH, 'apiTester.html', 2),
      file('decisionMatrix', OTHER_PATH, 'decisionMatrix.js', 1)
    };
  }

  @TestSetup
  static void createCache() {
    Datetime fetched = Datetime.newInstanceGmt(2026, 10, 23, 6, 0, 0);
    insert new List<Source_Cache__c>{
      new Source_Cache__c(
        Path__c = JS_PATH,
        Content__c = 'export default class ApiTester {}',
        Html_Url__c = 'https://github.com/o/r/blob/main/' + JS_PATH,
        Fetched_At__c = fetched,
        Checked_At__c = fetched,
        Last_Status__c = '200'
      ),
      new Source_Cache__c(
        Path__c = APEX_PATH,
        Content__c = 'public class ApiLabController {}',
        Html_Url__c = 'https://github.com/o/r/blob/main/' + APEX_PATH,
        Fetched_At__c = fetched,
        Checked_At__c = fetched,
        Last_Status__c = '200',
        Truncated__c = true
      ),
      // Checked but never fetched: left out of the dialog.
      new Source_Cache__c(
        Path__c = HTML_PATH,
        Checked_At__c = fetched,
        Last_Status__c = 'HTTP 404'
      ),
      new Source_Cache__c(
        Path__c = OTHER_PATH,
        Content__c = 'other',
        Fetched_At__c = fetched,
        Checked_At__c = fetched,
        Last_Status__c = '200'
      )
    };
  }

  @IsTest
  static void shouldReturnCachedRowsWithNoCalloutWhenGuestAsks() {
    configure();
    User guest = SiteGuestTestSupport.preparedGuest();
    Test.setMock(HttpCalloutMock.class, new NoCalloutMock());

    List<SourceController.SourceFile> files;
    Integer callouts;
    Test.startTest();
    System.runAs(guest) {
      files = SourceController.getSourceFiles(KEY);
      callouts = Limits.getCallouts();
    }
    Test.stopTest();

    Assert.areEqual(0, callouts, 'No callout from the guest read');
    Assert.areEqual(2, files.size(), 'The two fetched files of apiTester');
    Assert.areEqual(JS_PATH, files[0].path, 'Sort order 1 first');
    Assert.areEqual('apiTester.js', files[0].label, 'Label from metadata');
    Assert.areEqual('javascript', files[0].language, 'Language from path');
    Assert.areEqual(
      'export default class ApiTester {}',
      files[0].content,
      'Cached content'
    );
    Assert.areEqual(
      'https://github.com/o/r/blob/main/' + JS_PATH,
      files[0].htmlUrl,
      'GitHub link'
    );
    Assert.areEqual(
      Datetime.newInstanceGmt(2026, 10, 23, 6, 0, 0),
      files[0].fetchedAt,
      'Fetch time'
    );
    Assert.isFalse(files[0].truncated, 'Whole file');
    Assert.areEqual(APEX_PATH, files[1].path, 'Sort order 3 second');
    Assert.areEqual('apex', files[1].language, 'Apex grammar');
    Assert.isTrue(files[1].truncated, 'Cut file flagged');
  }

  @IsTest
  static void shouldNotLetTheGuestReadTheCacheDirectly() {
    User guest = SiteGuestTestSupport.preparedGuest();

    Boolean readable;
    Test.startTest();
    System.runAs(guest) {
      readable = Schema.SObjectType.Source_Cache__c.isAccessible();
    }
    Test.stopTest();

    Assert.isFalse(readable, 'Source_Cache__c stays admin only');
  }

  @IsTest
  static void shouldReturnEmptyListWhenKeyIsUnknown() {
    configure();

    Test.startTest();
    List<SourceController.SourceFile> files = SourceController.getSourceFiles(
      'notAKey'
    );
    Test.stopTest();

    Assert.isNotNull(files, 'Never null');
    Assert.areEqual(0, files.size(), 'Unknown key, no files');
  }

  @IsTest
  static void shouldReturnEmptyListWhenKeyIsBlank() {
    configure();

    Test.startTest();
    List<SourceController.SourceFile> files = SourceController.getSourceFiles(
      ' '
    );
    Test.stopTest();

    Assert.areEqual(0, files.size(), 'Blank key, no files');
  }

  @IsTest
  static void shouldReturnEmptyListWhenCacheIsEmpty() {
    configure();
    delete [SELECT Id FROM Source_Cache__c];

    Test.startTest();
    List<SourceController.SourceFile> files = SourceController.getSourceFiles(
      KEY
    );
    Test.stopTest();

    Assert.areEqual(0, files.size(), 'Empty cache, no files');
  }

  @IsTest
  static void shouldUseFileNameWhenLabelIsBlank() {
    SourceController.filesOverride = new List<Source_File__mdt>{
      file('decisionMatrix', OTHER_PATH, null, 1)
    };

    Test.startTest();
    List<SourceController.SourceFile> files = SourceController.getSourceFiles(
      'decisionMatrix'
    );
    Test.stopTest();

    Assert.areEqual('decisionMatrix.js', files[0].label, 'File name');
  }

  @IsTest
  static void shouldSortByLabelWhenOrdersTie() {
    SourceController.filesOverride = new List<Source_File__mdt>{
      file(KEY, JS_PATH, 'b', 1),
      file(KEY, APEX_PATH, 'a', 1)
    };

    Test.startTest();
    List<SourceController.SourceFile> files = SourceController.getSourceFiles(
      KEY
    );
    Test.stopTest();

    Assert.areEqual(APEX_PATH, files[0].path, 'Label a first');
    Assert.areEqual(JS_PATH, files[1].path, 'Label b second');
  }

  @IsTest
  static void shouldSkipRecordsWithoutPathWhenListingConfiguredFiles() {
    SourceController.filesOverride = new List<Source_File__mdt>{
      file(KEY, JS_PATH, 'a', 1),
      file(KEY, null, 'b', 2),
      file(null, HTML_PATH, 'c', 3)
    };

    Test.startTest();
    List<Source_File__mdt> files = SourceController.configuredFiles();
    Test.stopTest();

    Assert.areEqual(1, files.size(), 'Only the complete record');
  }

  @IsTest
  static void shouldMapEveryExtensionWhenPickingLanguage() {
    Map<String, String> expected = new Map<String, String>{
      'a/B.cls' => 'apex',
      'a/B.trigger' => 'apex',
      'a/b.js' => 'javascript',
      'a/b.html' => 'markup',
      'a/b.xml' => 'markup',
      'a/b.css' => 'css',
      'a/b.yaml' => 'yaml',
      'a/b.YML' => 'yaml',
      'a/b.json' => 'json',
      'a/b.md' => 'none',
      'Makefile' => 'none',
      '' => 'none'
    };

    Test.startTest();
    Map<String, String> actual = new Map<String, String>();
    for (String path : expected.keySet()) {
      actual.put(path, SourceController.languageForPath(path));
    }
    Test.stopTest();

    Assert.areEqual(expected, actual, 'Same mapping as c/prismHighlighter');
  }
}

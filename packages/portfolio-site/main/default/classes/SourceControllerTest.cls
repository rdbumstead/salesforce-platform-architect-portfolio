/**
 * @description       : Tests for SourceController. The guest test runs as
 *                      the Portfolio1 site's real guest user and proves the guest gets cached
 *                      rows with no callout and without any access to Source_Cache__c, for the
 *                      View source dialog and for the docs page. A file stored in parts comes
 *                      back joined in order.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/23/2026
 **/
@IsTest
private class SourceControllerTest {
  private static final String KEY = 'apiTester';
  private static final String JS_PATH = 'lwc/apiTester/apiTester.js';
  private static final String HTML_PATH = 'lwc/apiTester/apiTester.html';
  private static final String APEX_PATH = 'classes/ApiLabController.cls';
  private static final String OTHER_PATH = 'lwc/decisionMatrix/decisionMatrix.js';
  private static final String SAS_PATH = 'docs/guides/03-SAS.md';
  private static final String ADR_PATH = 'docs/adr/027-auth.md';
  private static final String UNFETCHED_DOC_PATH = 'docs/adr/028-tokens.md';
  // Cut the way the refresh job cuts: inside the heading's ##, no whitespace at either end.
  private static final String SAS_FIRST = '# SAS\n## One\nfirst part\n#';
  private static final String SAS_SECOND = '# Two\nsecond part';

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

  /** DeveloperName cannot be set on a new record, so docs records are built from JSON. */
  private static Source_File__mdt docFile(
    String developerName,
    String path,
    String label,
    Integer sortOrder
  ) {
    return (Source_File__mdt) JSON.deserialize(
      JSON.serialize(
        new Map<String, Object>{
          'DeveloperName' => developerName,
          'Source_Key__c' => SourceController.DOCS_KEY,
          'Path__c' => path,
          'Label__c' => label,
          'Sort_Order__c' => sortOrder
        }
      ),
      Source_File__mdt.class
    );
  }

  private static void configureDocs() {
    // Listed out of order on purpose: the controller sorts by Sort_Order__c.
    SourceController.filesOverride = new List<Source_File__mdt>{
      docFile('docs_adr_027', ADR_PATH, 'Platform auth', 27),
      docFile('docs_adr_028', UNFETCHED_DOC_PATH, 'Token vending', 28),
      docFile('docs_sas', SAS_PATH, 'Systems Architecture Specification', 0),
      file(KEY, JS_PATH, 'apiTester.js', 1)
    };
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
        Path__c = SAS_PATH,
        Content__c = SAS_FIRST,
        Html_Url__c = 'https://github.com/o/r/blob/main/' + SAS_PATH,
        Fetched_At__c = fetched,
        Checked_At__c = fetched,
        Last_Status__c = '200'
      ),
      new Source_Cache__c(
        Path__c = SAS_PATH + '#part-2',
        Content__c = SAS_SECOND,
        Html_Url__c = 'https://github.com/o/r/blob/main/' + SAS_PATH,
        Fetched_At__c = fetched,
        Checked_At__c = fetched,
        Last_Status__c = '200'
      ),
      // Part 4 with no part 3 is never joined.
      new Source_Cache__c(
        Path__c = SAS_PATH + '#part-4',
        Content__c = 'orphan part',
        Fetched_At__c = fetched,
        Checked_At__c = fetched,
        Last_Status__c = '200'
      ),
      new Source_Cache__c(
        Path__c = ADR_PATH,
        Content__c = '# ADR-027: Platform auth\n',
        Html_Url__c = 'https://github.com/o/r/blob/main/' + ADR_PATH,
        Fetched_At__c = fetched,
        Checked_At__c = fetched,
        Last_Status__c = '200'
      ),
      new Source_Cache__c(
        Path__c = UNFETCHED_DOC_PATH,
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

  @IsTest
  static void shouldListFetchedDocsInOrderWhenGuestAsks() {
    configureDocs();
    User guest = SiteGuestTestSupport.preparedGuest();
    Test.setMock(HttpCalloutMock.class, new NoCalloutMock());

    List<SourceController.DocSummary> docs;
    Test.startTest();
    System.runAs(guest) {
      docs = SourceController.getDocs();
    }
    Test.stopTest();

    Assert.areEqual(
      2,
      docs.size(),
      'The two fetched docs, not the unfetched one'
    );
    Assert.areEqual(
      'sas',
      docs[0].key,
      'Sort order 0 first, key from the name'
    );
    Assert.areEqual(
      'Systems Architecture Specification',
      docs[0].title,
      'Title from the label'
    );
    Assert.areEqual(SAS_PATH, docs[0].path, 'Path');
    Assert.areEqual('adr-027', docs[1].key, 'Underscore becomes a hyphen');
  }

  @IsTest
  static void shouldJoinTheDocsPartsWhenGuestOpensOne() {
    configureDocs();
    User guest = SiteGuestTestSupport.preparedGuest();
    Test.setMock(HttpCalloutMock.class, new NoCalloutMock());

    SourceController.DocContent doc;
    Integer callouts;
    Test.startTest();
    System.runAs(guest) {
      doc = SourceController.getDoc(' SAS ');
      callouts = Limits.getCallouts();
    }
    Test.stopTest();

    Assert.areEqual(0, callouts, 'No callout from the guest read');
    Assert.areEqual('sas', doc.key, 'Key');
    Assert.areEqual(
      SAS_FIRST + SAS_SECOND,
      doc.content,
      'Parts 1 and 2 in order, nothing after the gap'
    );
    Assert.areEqual(
      'https://github.com/o/r/blob/main/' + SAS_PATH,
      doc.htmlUrl,
      'GitHub link of the first part'
    );
    Assert.areEqual(
      Datetime.newInstanceGmt(2026, 10, 23, 6, 0, 0),
      doc.fetchedAt,
      'Fetch time'
    );
    Assert.isFalse(doc.truncated, 'Whole document');
    Assert.areEqual('Systems Architecture Specification', doc.title, 'Title');
  }

  @IsTest
  static void shouldReturnNullWhenDocIsUnknownBlankOrNotFetched() {
    configureDocs();

    Test.startTest();
    SourceController.DocContent unknown = SourceController.getDoc('adr-999');
    SourceController.DocContent blank = SourceController.getDoc(' ');
    SourceController.DocContent unfetched = SourceController.getDoc('adr-028');
    SourceController.DocContent notADoc = SourceController.getDoc('apitester');
    Test.stopTest();

    Assert.isNull(unknown, 'Unknown key');
    Assert.isNull(blank, 'Blank key');
    Assert.isNull(unfetched, 'Never fetched');
    Assert.isNull(notADoc, 'A component file is not a doc');
  }

  @IsTest
  static void shouldReturnNoDocsWhenNoneAreConfigured() {
    configure();

    Test.startTest();
    List<SourceController.DocSummary> docs = SourceController.getDocs();
    Test.stopTest();

    Assert.areEqual(0, docs.size(), 'No docs records, no docs');
  }

  @IsTest
  static void shouldJoinPartsWhenASourceFileIsStoredInParts() {
    SourceController.filesOverride = new List<Source_File__mdt>{
      file('docsAsSource', SAS_PATH, 'SAS', 1)
    };

    Test.startTest();
    List<SourceController.SourceFile> files = SourceController.getSourceFiles(
      'docsAsSource'
    );
    Test.stopTest();

    Assert.areEqual(SAS_FIRST + SAS_SECOND, files[0].content, 'Joined');
    Assert.areEqual('none', files[0].language, 'Markdown has no grammar');
  }

  @IsTest
  static void shouldBuildTheDocKeyFromTheRecordName() {
    Test.startTest();
    String adr = SourceController.docKeyFor(
      docFile('docs_ADR_031', ADR_PATH, 'x', 1)
    );
    String none = SourceController.docKeyFor(null);
    Test.stopTest();

    Assert.areEqual('adr-031', adr, 'Prefix gone, lower case, hyphen');
    Assert.areEqual('', none, 'No record, no key');
  }
}

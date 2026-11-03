/**
 * @description       : Tests for SiteExportResource and SiteExportCalls. The parity tests run
 *                      every allowlisted call as the real site guest and through the export as a
 *                      build user set up the way production's is, and assert the two serialized
 *                      results are the same text. A difference means the static site would show
 *                      something the guest cannot see today. The calls that read testimonials
 *                      and the marker counts that read in user mode are checked in
 *                      SiteExportTestimonialParityTest.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 * @Test Class        : [SiteExportResourceTest]
 **/
@isTest
private class SiteExportResourceTest {
  @TestSetup
  static void setup() {
    SiteGuestTestSupport.createResumeGraph();
    TestFactory.createGithubCache(1);
    TestFactory.createJiraCache(1);
    insert docsCacheRow();
    SiteExportTestSupport.createBuildUser();
  }

  /** One fetched docs row, so the docs list has a document to name. */
  private static Source_Cache__c docsCacheRow() {
    for (Source_File__mdt file : Source_File__mdt.getAll().values()) {
      if (file.Source_Key__c == 'docs') {
        return new Source_Cache__c(
          Path__c = file.Path__c,
          Content__c = '# A document\n\nBody text.',
          Html_Url__c = 'https://github.com/o/r/blob/main/' + file.Path__c,
          Fetched_At__c = Datetime.now(),
          Checked_At__c = Datetime.now(),
          Last_Status__c = '200'
        );
      }
    }
    Assert.fail('A docs source file record is deployed');
    return null;
  }

  private static User buildUser() {
    return [
      SELECT Id
      FROM User
      WHERE
        Username LIKE :SiteExportTestSupport.BUILD_USERNAME_PREFIX + '%'
        AND Alias = 'sitebld'
      LIMIT 1
    ];
  }

  private static void assertSameAsGuest(
    String call,
    Map<String, Object> params
  ) {
    SiteExportTestSupport.assertSameAsGuest(buildUser(), call, params);
  }

  private static Map<String, Object> none() {
    return new Map<String, Object>();
  }

  private static Map<String, Object> one(String name, Object value) {
    return new Map<String, Object>{ name => value };
  }

  @isTest
  static void resumeReadsMatchTheGuest() {
    Test.startTest();
    assertSameAsGuest('ResumeController.getHeader', none());
    assertSameAsGuest('ResumeController.getTimeline', none());
    assertSameAsGuest(
      'ResumeController.getResume',
      one('persona', 'Architect')
    );
    assertSameAsGuest(
      'ResumeController.getResume',
      one('persona', 'Developer')
    );
    assertSameAsGuest('ResumeController.getResume', one('persona', 'Admin'));
    Test.stopTest();
  }

  @isTest
  static void projectReadsMatchTheGuest() {
    Test.startTest();
    assertSameAsGuest('ProjectCardController.getHomeCaseStudies', none());
    assertSameAsGuest('ProjectCardController.getBuildCounts', none());
    assertSameAsGuest('ProjectCardController.getPillarCards', none());
    assertSameAsGuest('TestimonialController.getFragments', none());
    Test.stopTest();
  }

  @isTest
  static void deliveryReadsMatchTheGuest() {
    Test.startTest();
    assertSameAsGuest(
      'DeliveryController.getRecentCommits',
      one('simulate', false)
    );
    assertSameAsGuest(
      'DeliveryController.getRecentCommits',
      one('simulate', true)
    );
    assertSameAsGuest('DeliveryController.getRoadmap', one('simulate', false));
    assertSameAsGuest('DeliveryController.getRoadmap', one('simulate', true));
    assertSameAsGuest('GovernanceController.getPipelineStatus', none());
    Test.stopTest();
  }

  @isTest
  static void sourceReadsMatchTheGuest() {
    List<String> keys = new List<String>(SiteExportCalls.docKeys());
    Assert.areEqual(
      1,
      keys.size(),
      'The docs list names the one fetched document'
    );
    Test.startTest();
    assertSameAsGuest('SourceController.getDocs', none());
    assertSameAsGuest('SourceController.getDoc', one('docKey', keys[0]));
    assertSameAsGuest(
      'SourceController.getSourceFiles',
      one('sourceKey', 'apiTester')
    );
    Test.stopTest();
  }

  @isTest
  static void schemaAndSourceMarkersMatchTheGuest() {
    Test.startTest();
    assertSameAsGuest(
      'SchemaService.getSchemaGraph',
      one('scope', 'portfolio')
    );
    assertSameAsGuest(
      'SchemaService.getSchemaGraph',
      one('scope', 'employerHub')
    );
    assertSameAsGuest(
      'DataSourceController.getSources',
      one(
        'names',
        new List<Object>{ 'ResumeController_Roles', 'ResumeController_Skills' }
      )
    );
    Test.stopTest();
  }

  @isTest
  static void siteSettingsReadsMatchTheGuest() {
    Test.startTest();
    assertSameAsGuest('DecisionMatrixController.getMatrix', none());
    assertSameAsGuest('SkillGraphController.getCertificationLinks', none());
    assertSameAsGuest('FooterController.getLinks', none());
    assertSameAsGuest('ApiLabController.getCatalog', none());
    assertSameAsGuest('ApiLabController.getPostmanRunUrl', none());
    assertSameAsGuest('ApiLabController.getVersionlessUrls', none());
    assertSameAsGuest('ApiLabOptionsController.getOptions', none());
    Test.stopTest();
  }

  @isTest
  static void parityTestsCoverEveryAllowlistedCall() {
    // The parity methods here and in SiteExportTestimonialParityTest name these calls. The list
    // must equal the allowlist, so a call added without a parity check fails here.
    Set<String> tested = new Set<String>{
      'ResumeController.getHeader',
      'ResumeController.getTimeline',
      'ResumeController.getResume',
      'ProjectCardController.getHomeCaseStudies',
      'ProjectCardController.getBuildCounts',
      'ProjectCardController.getPillarCards',
      'TestimonialController.getHomeTestimonials',
      'TestimonialController.getApprovedTestimonials',
      'TestimonialController.getFragments',
      'DeliveryController.getRecentCommits',
      'DeliveryController.getRoadmap',
      'GovernanceController.getPipelineStatus',
      'PortfolioStatsController.getStats',
      'SourceController.getDocs',
      'SourceController.getDoc',
      'SourceController.getSourceFiles',
      'SchemaService.getSchemaGraph',
      'DataSourceController.getSources',
      'DataSourceController.getObjectSources',
      'DecisionMatrixController.getMatrix',
      'SkillGraphController.getCertificationLinks',
      'FooterController.getLinks',
      'ApiLabController.getCatalog',
      'ApiLabController.getPostmanRunUrl',
      'ApiLabController.getVersionlessUrls',
      'ApiLabOptionsController.getOptions'
    };
    Assert.areEqual(
      tested,
      SiteExportCalls.describe().keySet(),
      'Every allowlisted call has a parity check'
    );
  }

  @isTest
  static void maskingTouchesOnlyTheCallMeasurements() {
    String text = '{"cpuMs":12,"generatedAt":"2026-11-02T10:00:00.000Z","count":12}';
    Assert.areEqual(
      '{"masked":0,"masked":0,"count":12}',
      SiteExportTestSupport.masked(text),
      'Only the timing keys are masked'
    );
  }

  @isTest
  static void shouldRefuseTheSiteGuest() {
    User guest = SiteGuestTestSupport.preparedGuest();
    RestResponse res;
    Test.startTest();
    System.runAs(guest) {
      res = SiteExportTestSupport.get('ResumeController.getHeader', null);
    }
    Test.stopTest();
    Assert.areEqual(403, res.statusCode, 'The guest never reads the export');
    Assert.isFalse(
      res.responseBody.toString().contains('"result"'),
      'A refusal carries no data'
    );
  }

  @isTest
  static void shouldRefuseAUserWithoutThePermission() {
    // A user made here, so the result does not depend on who runs the tests.
    User withoutPermission = SiteExportTestSupport.createUserWithoutBuildPermission();
    RestResponse res;
    Test.startTest();
    System.runAs(withoutPermission) {
      res = SiteExportTestSupport.get('ResumeController.getHeader', null);
    }
    Test.stopTest();
    Assert.areEqual(
      403,
      res.statusCode,
      'Only Site_Build_Export opens the export'
    );
  }

  @isTest
  static void shouldListTheAllowlistWhenNoCallIsNamed() {
    RestResponse res;
    Test.startTest();
    System.runAs(buildUser()) {
      res = SiteExportTestSupport.get(null, null);
    }
    Test.stopTest();
    Assert.areEqual(200, res.statusCode, 'The list answers 200');
    Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
      res.responseBody.toString()
    );
    Map<String, Object> calls = (Map<String, Object>) body.get('calls');
    Assert.areEqual(
      SiteExportCalls.describe().size(),
      calls.size(),
      'Every call is listed'
    );
    Assert.areEqual(
      'no-store',
      res.headers.get('Cache-Control'),
      'The export is never cached'
    );
  }

  private static Integer statusAsBuildUser(String call, String params) {
    Integer status;
    System.runAs(buildUser()) {
      status = SiteExportTestSupport.get(call, params).statusCode;
    }
    return status;
  }

  @isTest
  static void shouldRefuseAnUnknownCall() {
    Test.startTest();
    Integer status = statusAsBuildUser(
      'ContactFormController.submitContact',
      null
    );
    Test.stopTest();
    Assert.areEqual(400, status, 'A call off the allowlist runs nothing');
  }

  @isTest
  static void shouldRefuseAnUnknownParameter() {
    Test.startTest();
    Integer status = statusAsBuildUser(
      'ResumeController.getHeader',
      '{"persona":"Admin"}'
    );
    Test.stopTest();
    Assert.areEqual(
      400,
      status,
      'A parameter the call does not take is refused'
    );
  }

  @isTest
  static void shouldRefuseAMissingParameter() {
    Test.startTest();
    Integer status = statusAsBuildUser('ResumeController.getResume', '{}');
    Test.stopTest();
    Assert.areEqual(400, status, 'A call that takes a parameter needs it');
  }

  @isTest
  static void shouldRefuseAPersonaOffTheList() {
    Test.startTest();
    Integer status = statusAsBuildUser(
      'ResumeController.getResume',
      '{"persona":"Hacker"}'
    );
    Test.stopTest();
    Assert.areEqual(400, status, 'Personas come from the fixed list only');
  }

  @isTest
  static void shouldRefuseADocKeyTheOrgDoesNotList() {
    Test.startTest();
    Integer status = statusAsBuildUser(
      'SourceController.getDoc',
      '{"docKey":"../../secrets"}'
    );
    Test.stopTest();
    Assert.areEqual(400, status, 'Doc keys come from the org only');
  }

  @isTest
  static void shouldRefuseANameOffTheList() {
    Test.startTest();
    Integer status = statusAsBuildUser(
      'DataSourceController.getObjectSources',
      '{"objectNames":["User"]}'
    );
    Test.stopTest();
    Assert.areEqual(
      400,
      status,
      'Object names come from the query definitions only'
    );
  }

  @isTest
  static void shouldRefuseANameListOverTheCap() {
    List<String> names = new List<String>();
    for (Integer i = 0; i <= SiteExportCalls.MAX_LIST; i++) {
      names.add('ResumeController_Roles');
    }
    Test.startTest();
    Integer status = statusAsBuildUser(
      'DataSourceController.getSources',
      JSON.serialize(one('names', names))
    );
    Test.stopTest();
    Assert.areEqual(400, status, 'At most twelve names a call');
  }

  @isTest
  static void shouldRefuseAnEmptyNameList() {
    Test.startTest();
    Integer status = statusAsBuildUser(
      'DataSourceController.getSources',
      '{"names":[]}'
    );
    Test.stopTest();
    Assert.areEqual(400, status, 'An empty list is refused');
  }

  @isTest
  static void shouldRefuseAFlagThatIsNotBoolean() {
    Test.startTest();
    Integer status = statusAsBuildUser(
      'DeliveryController.getRoadmap',
      '{"simulate":"true"}'
    );
    Test.stopTest();
    Assert.areEqual(400, status, 'simulate must be a real Boolean');
  }

  @isTest
  static void shouldRefuseParamsThatAreAnArray() {
    Test.startTest();
    Integer status = statusAsBuildUser('ResumeController.getHeader', '["x"]');
    Test.stopTest();
    Assert.areEqual(400, status, 'A JSON array is refused');
  }

  @isTest
  static void shouldRefuseParamsThatAreNotJson() {
    Test.startTest();
    Integer status = statusAsBuildUser(
      'ResumeController.getHeader',
      'not json'
    );
    Test.stopTest();
    Assert.areEqual(400, status, 'Text that is not JSON is refused');
  }

  @isTest
  static void shouldAnswer500WhenTheCallFails() {
    SiteExportResource.throwException = true;
    Test.startTest();
    Integer status = statusAsBuildUser('ResumeController.getHeader', null);
    Test.stopTest();
    Assert.areEqual(500, status, 'A failure answers 500 with no data');
  }
}

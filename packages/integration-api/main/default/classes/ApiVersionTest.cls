/**
 * @description       : Tests API versioning: v1 and v2 negotiation, the v2 shape on every SAPI
 *                      and PAPI path (no id, keys only), keys only parameters in v2, the
 *                      Deprecation, Sunset and Link headers on v1, and the 410 after the
 *                      sunset date.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/29/2026
 **/
@IsTest
private class ApiVersionTest {
  private static final String SAPI = '/services/apexrest/sapi/v1/';
  private static final String PAPI = '/services/apexrest/papi/v1/';
  // 2026-11-01 00:00 UTC, a Sunday.
  private static final String DEPRECATION_VALUE = '@1793491200';
  private static final String SUNSET_VALUE = 'Sun, 01 Nov 2026 00:00:00 GMT';
  private static final String SUCCESSOR = '<https://ryanbumstead.com/api-reference?version=v2>; rel="successor-version"';

  @TestSetup
  static void setup() {
    SapiTestData.createGraph();
    List<Project__c> projects = [SELECT Id FROM Project__c];
    for (Project__c project : projects) {
      project.Status__c = 'Active Development';
    }
    update projects;
    insert new Testimonial__c(
      Author_Name__c = 'Version Author',
      Approved__c = true,
      Relationship_Type__c = 'Manager',
      Vibe_Mode__c = 'Professional',
      Sort_Order__c = 1
    );
  }

  private static void send(
    String uri,
    String version,
    Map<String, String> params
  ) {
    Map<String, String> headers = new Map<String, String>{
      'X-Request-Id' => UUID.randomUUID().toString()
    };
    if (version != null) {
      headers.put('X-API-Version', version);
    }
    RestTestUtil.initGetRaw(uri, headers, params);
  }

  private static void setting(String name, String text) {
    PortfolioSettings.overrides.put(
      name,
      new Portfolio_Setting__mdt(DeveloperName = name, Text_Value__c = text)
    );
  }

  private static String header(String name) {
    return RestContext.response.headers.get(name);
  }

  private static String keyOf(SObjectType objectType, String name) {
    List<SObject> rows = Database.queryWithBinds(
      'SELECT Public_Key__c FROM ' +
        objectType.getDescribe().getName() +
        ' WHERE Name = :name LIMIT 1',
      new Map<String, Object>{ 'name' => name },
      AccessLevel.SYSTEM_MODE
    );
    return (String) rows[0].get('Public_Key__c');
  }

  private static void callSapi(String resource) {
    if (resource == 'accounts') {
      SAPIAccount.getAccounts();
    } else if (resource == 'contacts') {
      SAPIContact.getContacts();
    } else if (resource == 'skills') {
      SAPISkill.getSkills();
    } else if (resource == 'experience') {
      SAPIExperience.getExperiences();
    } else if (resource == 'experience-highlights') {
      SAPIExperienceHighlight.getExperienceHighlights();
    } else if (resource == 'experience-skills') {
      SAPIExperienceSkill.getExperienceSkills();
    } else if (resource == 'projects') {
      SAPIProject.getProjects();
    } else if (resource == 'project-assets') {
      SAPIProjectAsset.getProjectAssets();
    } else if (resource == 'project-skills') {
      SAPIProjectSkill.getProjectSkills();
    } else if (resource == 'certifications') {
      SAPICertification.getCertifications();
    } else if (resource == 'certification-skills') {
      SAPICertificationSkill.getCertificationSkills();
    } else if (resource == 'education') {
      SAPIEducation.getEducation();
    } else if (resource == 'testimonials') {
      SAPITestimonial.getTestimonials();
    }
  }

  // No map anywhere in the value has an id, or an xId entry that has an xKey entry.
  private static void assertKeysOnly(Object value, String location) {
    if (value instanceof Map<String, Object>) {
      Map<String, Object> item = (Map<String, Object>) value;
      Assert.isFalse(item.containsKey('id'), location + ' has no id');
      for (String name : item.keySet()) {
        Assert.isFalse(
          name.endsWith('Id') && name.length() > 2,
          location + ' has no reference Id: ' + name
        );
        assertKeysOnly(item.get(name), location + '.' + name);
      }
    } else if (value instanceof List<Object>) {
      for (Object entry : (List<Object>) value) {
        assertKeysOnly(entry, location);
      }
    }
  }

  private static Object body() {
    return JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
  }

  @IsTest
  static void shouldShapeEverySapiPathAsKeysOnlyInV2() {
    List<String> resources = new List<String>{
      'accounts',
      'contacts',
      'skills',
      'experience',
      'experience-highlights',
      'experience-skills',
      'projects',
      'project-assets',
      'project-skills',
      'certifications',
      'certification-skills',
      'education',
      'testimonials'
    };
    Test.startTest();
    for (String resource : resources) {
      send(SAPI + resource + '/', 'v2', null);
      callSapi(resource);
      Assert.areEqual(
        200,
        RestContext.response.statusCode,
        resource + ' status: ' + RestContext.response.responseBody.toString()
      );
      Assert.areEqual('v2', header('X-API-Version'), resource + ' echoes v2');
      Assert.isNull(header('Deprecation'), resource + ' v2 is not deprecated');
      List<Object> rows = (List<Object>) body();
      Assert.isFalse(rows.isEmpty(), resource + ' returns rows');
      for (Object row : rows) {
        Assert.isNotNull(
          ((Map<String, Object>) row).get('key'),
          resource + ' keeps key'
        );
      }
      assertKeysOnly(rows, resource);
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldKeepReferenceKeysAndNamesInV2() {
    send(SAPI + 'experience-skills/', 'v2', null);

    Test.startTest();
    SAPIExperienceSkill.getExperienceSkills();
    Test.stopTest();

    Map<String, Object> row = (Map<String, Object>) ((List<Object>) body())[0];
    Assert.isTrue(row.containsKey('experienceKey'), 'experienceKey');
    Assert.isTrue(row.containsKey('skillKey'), 'skillKey');
    Assert.isTrue(row.containsKey('skillName'), 'skillName stays');
    Assert.isFalse(row.containsKey('experienceId'), 'experienceId is gone');
    Assert.isFalse(row.containsKey('skillId'), 'skillId is gone');
  }

  @IsTest
  static void shouldKeepIdsInV1AndWhenVersionMissing() {
    for (String version : new List<String>{ 'v1', null }) {
      send(SAPI + 'projects/', version, null);
      SAPIProject.getProjects();
      Map<String, Object> row = (Map<String, Object>) ((List<Object>) body())[0];
      Assert.isTrue(row.containsKey('id'), 'v1 keeps id');
      Assert.isTrue(row.containsKey('contactId'), 'v1 keeps contactId');
      Assert.isTrue(row.containsKey('contactKey'), 'v1 keeps contactKey');
      Assert.areEqual('v1', header('X-API-Version'), 'Missing means v1');
    }
  }

  @IsTest
  static void shouldAcceptKeysAndRefuseIdsOnV2Parameters() {
    String projectKey = keyOf(Project__c.SObjectType, SapiTestData.PROJECT_ONE);
    Id projectId = [
      SELECT Id
      FROM Project__c
      WHERE Name = :SapiTestData.PROJECT_ONE
    ]
    .Id;
    String experienceKey = keyOf(
      Experience__c.SObjectType,
      SapiTestData.EXPERIENCE_ONE
    );
    Id experienceId = [
      SELECT Id
      FROM Experience__c
      WHERE Name = :SapiTestData.EXPERIENCE_ONE
    ]
    .Id;

    Test.startTest();
    send(
      SAPI + 'project-assets/',
      'v2',
      new Map<String, String>{ 'projectId' => projectKey }
    );
    SAPIProjectAsset.getProjectAssets();
    Assert.areEqual(200, RestContext.response.statusCode, 'A key works');
    Assert.areEqual(2, ((List<Object>) body()).size(), 'The key narrows');

    send(
      SAPI + 'project-assets/',
      'v2',
      new Map<String, String>{ 'projectId' => String.valueOf(projectId) }
    );
    SAPIProjectAsset.getProjectAssets();
    Assert.areEqual(400, RestContext.response.statusCode, 'An Id is refused');
    Assert.areEqual(
      'projectId must be a public key.',
      ((Map<String, Object>) body()).get('message'),
      'v2 message'
    );

    send(
      SAPI + 'project-skills/',
      'v2',
      new Map<String, String>{ 'projectId' => String.valueOf(projectId) }
    );
    SAPIProjectSkill.getProjectSkills();
    Assert.areEqual(400, RestContext.response.statusCode, 'project-skills');

    send(
      SAPI + 'experience-skills/',
      'v2',
      new Map<String, String>{ 'experienceId' => String.valueOf(experienceId) }
    );
    SAPIExperienceSkill.getExperienceSkills();
    Assert.areEqual(400, RestContext.response.statusCode, 'experience-skills');

    send(
      SAPI + 'experience-highlights/',
      'v2',
      new Map<String, String>{ 'experienceId' => experienceKey }
    );
    SAPIExperienceHighlight.getExperienceHighlights();
    Assert.areEqual(200, RestContext.response.statusCode, 'highlights key');
    send(
      SAPI + 'experience-highlights/',
      'v2',
      new Map<String, String>{ 'experienceId' => String.valueOf(experienceId) }
    );
    SAPIExperienceHighlight.getExperienceHighlights();
    Assert.areEqual(400, RestContext.response.statusCode, 'highlights Id');

    send(
      SAPI + 'certification-skills/',
      'v2',
      new Map<String, String>{ 'certificationId' => String.valueOf(projectId) }
    );
    SAPICertificationSkill.getCertificationSkills();
    Assert.areEqual(400, RestContext.response.statusCode, 'cert skills Id');

    // The same Id still works in v1.
    send(
      SAPI + 'project-assets/',
      'v1',
      new Map<String, String>{ 'projectId' => String.valueOf(projectId) }
    );
    SAPIProjectAsset.getProjectAssets();
    Test.stopTest();
    Assert.areEqual(200, RestContext.response.statusCode, 'v1 accepts an Id');
    Assert.areEqual(2, ((List<Object>) body()).size(), 'v1 Id narrows');
  }

  @IsTest
  static void shouldTreatAnIdAsAnUnknownKeyOnTheProjectPath() {
    String projectKey = keyOf(Project__c.SObjectType, SapiTestData.PROJECT_ONE);
    Id projectId = [
      SELECT Id
      FROM Project__c
      WHERE Name = :SapiTestData.PROJECT_ONE
    ]
    .Id;

    Test.startTest();
    send(SAPI + 'projects/' + projectKey, 'v2', null);
    SAPIProject.getProjects();
    Assert.areEqual(200, RestContext.response.statusCode, 'Key by path');
    Assert.isFalse(
      ((Map<String, Object>) ((List<Object>) body())[0]).containsKey('id'),
      'No id in the detail'
    );

    send(SAPI + 'projects/' + projectId, 'v2', null);
    SAPIProject.getProjects();
    Assert.areEqual(404, RestContext.response.statusCode, 'Id by path in v2');

    send(SAPI + 'projects/' + projectId, 'v1', null);
    SAPIProject.getProjects();
    Test.stopTest();
    Assert.areEqual(200, RestContext.response.statusCode, 'Id by path in v1');
  }

  @IsTest
  static void shouldShapePapiPathsAsKeysOnlyInV2() {
    Test.startTest();
    send(PAPI + 'profile/full', 'v2', null);
    PAPIProfile.getProfile();
    Assert.areEqual(200, RestContext.response.statusCode, 'profile');
    Object profile = body();
    assertKeysOnly(profile, 'profile');
    Assert.isNotNull(
      ((Map<String, Object>) ((Map<String, Object>) profile).get('contactInfo'))
        .get('key'),
      'contactInfo key'
    );

    send(PAPI + 'projects/featured', 'v2', null);
    PAPIProjects.getProjects();
    Assert.areEqual(200, RestContext.response.statusCode, 'projects');
    assertKeysOnly(body(), 'projects');

    send(PAPI + 'testimonials/feed', 'v2', null);
    PAPITestimonialFeed.getFeed();
    Assert.areEqual(200, RestContext.response.statusCode, 'feed');
    assertKeysOnly(body(), 'feed');

    send(PAPI + 'resume/generate', 'v2', null);
    PAPIResume.getResume();
    Test.stopTest();
    Assert.areEqual(200, RestContext.response.statusCode, 'resume');
    assertKeysOnly(body(), 'resume');
    Assert.areEqual('v2', header('X-API-Version'), 'PAPI echoes v2');
  }

  @IsTest
  static void shouldKeepPapiIdsInV1() {
    send(PAPI + 'profile/full', 'v1', null);

    Test.startTest();
    PAPIProfile.getProfile();
    Test.stopTest();

    Map<String, Object> contact = (Map<String, Object>) ((Map<String, Object>) body())
      .get('contactInfo');
    Assert.isTrue(contact.containsKey('id'), 'v1 keeps id');
    Assert.isTrue(contact.containsKey('key'), 'and key');
  }

  @IsTest
  static void shouldRefuseAnUnsupportedVersion() {
    send(SAPI + 'skills/', 'v3', null);

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.isTrue(ctx.isRejected(), 'v3 is refused');
    Assert.areEqual(400, RestContext.response.statusCode, 'Status');
    Assert.areEqual('v1', ctx.version(), 'Nothing newer was served');
    Assert.isNull(header('Deprecation'), 'No deprecation on a refusal');
  }

  @IsTest
  static void shouldReadTheVersionFromTheContext() {
    send(SAPI + 'skills/', 'v2', null);
    ApiRequestContext v2 = ApiRequestContext.begin();
    send(SAPI + 'skills/', null, null);
    ApiRequestContext none = ApiRequestContext.begin();

    Assert.areEqual('v2', v2.version(), 'v2');
    Assert.isTrue(v2.isV2(), 'isV2');
    Assert.areEqual('v1', none.version(), 'Missing is v1');
    Assert.isFalse(none.isV2(), 'Not v2');
    Assert.areEqual(
      'X-API-Version',
      header('Vary'),
      'Caches key on the header'
    );
  }

  @IsTest
  static void shouldSendOnlyTheSuccessorLinkWhileBothDatesAreBlank() {
    send(SAPI + 'skills/', 'v1', null);

    Test.startTest();
    ApiRequestContext.begin();
    Test.stopTest();

    Assert.isNull(header('Deprecation'), 'No Deprecation');
    Assert.isNull(header('Sunset'), 'No Sunset');
    Assert.areEqual(SUCCESSOR, header('Link'), 'Only the successor link');
  }

  @IsTest
  static void shouldSendDeprecationAndSunsetWhenDatesAreSet() {
    setting('Api_V1_Deprecation_Date', '2026-11-01');
    setting('Api_V1_Sunset_Date', '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2026, 10, 30);
    send(SAPI + 'skills/', 'v1', null);

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.isFalse(ctx.isRejected(), 'Before the sunset v1 is served');
    Assert.areEqual(DEPRECATION_VALUE, header('Deprecation'), 'RFC 9745 date');
    Assert.areEqual(SUNSET_VALUE, header('Sunset'), 'RFC 8594 date');
    Assert.areEqual(
      SUCCESSOR +
        ', <https://ryanbumstead.com/api-reference?version=v2>; rel="deprecation"' +
        ', <https://ryanbumstead.com/api-reference?version=v2>; rel="sunset"',
      header('Link'),
      'All three relations'
    );
  }

  @IsTest
  static void shouldSendOnlyDeprecationWhenOnlyThatDateIsSet() {
    setting('Api_V1_Deprecation_Date', '2026-11-01');
    send(SAPI + 'skills/', 'v1', null);

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.isFalse(ctx.isRejected(), 'Served');
    Assert.areEqual(DEPRECATION_VALUE, header('Deprecation'), 'Deprecation');
    Assert.isNull(header('Sunset'), 'No Sunset header');
    Assert.isFalse(ApiRequestContext.isV1Gone(), 'No sunset date, no 410');
  }

  @IsTest
  static void shouldIgnoreADateThatDoesNotParse() {
    setting('Api_V1_Deprecation_Date', 'next week');
    setting('Api_V1_Sunset_Date', 'soon');
    send(SAPI + 'skills/', 'v1', null);

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.isFalse(ctx.isRejected(), 'Served');
    Assert.isNull(header('Deprecation'), 'No Deprecation');
    Assert.isNull(header('Sunset'), 'No Sunset');
  }

  @IsTest
  static void shouldAnswer410ForV1AfterTheSunsetDate() {
    setting('Api_V1_Sunset_Date', '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(
      2026,
      11,
      1,
      0,
      0,
      0
    );
    send(SAPI + 'skills/', 'v1', null);

    Test.startTest();
    SAPISkill.getSkills();
    Test.stopTest();

    Assert.areEqual(410, RestContext.response.statusCode, 'Gone');
    Map<String, Object> error = (Map<String, Object>) body();
    Assert.areEqual(
      new Set<String>{
        'httpStatus',
        'errorCode',
        'message',
        'correlationId',
        'retryable'
      },
      error.keySet(),
      'The existing error envelope'
    );
    Assert.areEqual('GONE', error.get('errorCode'), 'Code');
    Assert.areEqual(false, error.get('retryable'), 'Not retryable');
    Assert.isTrue(
      ((String) error.get('message')).contains('v2') &&
      ((String) error.get('message'))
        .contains('https://ryanbumstead.com/api-reference?version=v2'),
      'The message names v2 and the link'
    );
    Assert.areEqual(SUNSET_VALUE, header('Sunset'), 'Sunset on the 410');
  }

  @IsTest
  static void shouldAnswer410ForMissingVersionAndStillServeV2AfterSunset() {
    setting('Api_V1_Sunset_Date', '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2027, 1, 1);

    Test.startTest();
    send(PAPI + 'profile/full', null, null);
    PAPIProfile.getProfile();
    Assert.areEqual(410, RestContext.response.statusCode, 'Missing is v1');

    send(PAPI + 'profile/full', 'v2', null);
    PAPIProfile.getProfile();
    Test.stopTest();
    Assert.areEqual(200, RestContext.response.statusCode, 'v2 is served');
  }

  @IsTest
  static void shouldServeV1TheSecondBeforeTheSunset() {
    setting('Api_V1_Sunset_Date', '2026-11-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(
      2026,
      10,
      31,
      23,
      59,
      59
    );
    send(SAPI + 'skills/', 'v1', null);

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.isFalse(ctx.isRejected(), 'Still served');
    Assert.isFalse(ApiRequestContext.isV1Gone(), 'Not gone');
  }

  @IsTest
  static void shouldShapeTransformerOutputAsKeysOnly() {
    Map<String, Object> shaped = (Map<String, Object>) SAPITransformer.toV2(
      new Map<String, Object>{
        'id' => 'x',
        'key' => 'k',
        'projectId' => 'a',
        'projectKey' => 'pk',
        'lonelyId' => 'stays',
        'items' => new List<Object>{
          new Map<String, Object>{ 'id' => 'y', 'name' => 'n' }
        },
        'text' => 'plain'
      }
    );
    Assert.areEqual(
      new Set<String>{ 'key', 'projectKey', 'lonelyId', 'items', 'text' },
      shaped.keySet(),
      'id and projectId are gone, lonelyId has no key beside it'
    );
    Map<String, Object> item = (Map<String, Object>) ((List<Object>) shaped.get(
      'items'
    ))[0];
    Assert.areEqual(new Set<String>{ 'name' }, item.keySet(), 'Nested id gone');
    Assert.areEqual(
      'n',
      ((Map<String, Object>) PAPITransformer.toV2(item)).get('name'),
      'PAPITransformer delegates'
    );
    Assert.areEqual(7, SAPITransformer.toV2(7), 'A scalar passes through');
  }
}

/**
 * @description       : Unit tests for SAPIProject REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class SAPIProjectTest {
  @TestSetup
  static void setup() {
    Project__c proj = new Project__c(
      Name = 'Portfolio',
      Status__c = 'Live – In Production',
      Pillar__c = 'A',
      Sort_Order__c = 1
    );
    insert proj;
  }

  @IsTest
  static void testGetProjectsSuccess() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/projects/projects');
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    String responseBody = res.responseBody != null
      ? res.responseBody.toString()
      : '';
    System.assertEquals(
      200,
      res.statusCode,
      'Status should be 200. Error: ' + responseBody
    );
    System.assertNotEquals(
      null,
      res.responseBody,
      'Response body should not be null'
    );

    // Verify response contains expected data
    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('Portfolio'),
      'Response should contain project name'
    );
    System.assertEquals(
      'max-age=300, public',
      res.headers.get('Cache-Control'),
      'Projects are public data'
    );
  }

  @IsTest
  static void testGetProjectByIdSuccess() {
    Project__c proj = [SELECT Id FROM Project__c LIMIT 1];

    RestTestUtil.initGet('/services/apexrest/sapi/v1/projects/' + proj.Id);
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    System.assertEquals(200, res.statusCode, 'Should return 200 OK');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains(proj.Id),
      'Response should contain project ID'
    );
  }

  @IsTest
  static void testGetProjectByIdNotFound() {
    // Use a clearly invalid ID
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/projects/a015e00000INVALID'
    );
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    System.assertEquals(404, res.statusCode, 'Should return 404 Not Found');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('NOT_FOUND'),
      'Response should contain NOT_FOUND error code'
    );
  }

  @IsTest
  static void testGetProjectsInvalidLimit() {
    Map<String, String> params = new Map<String, String>{ 'limit' => '500' };
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/projects/projects',
      params
    );
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('BAD_REQUEST'),
      'Response should contain BAD_REQUEST error code'
    );
  }

  @IsTest
  static void testGetProjectsNegativeOffset() {
    Map<String, String> params = new Map<String, String>{ 'offset' => '-1' };
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/projects/projects',
      params
    );
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('Offset cannot be negative'),
      'Response should contain offset error message'
    );
  }
  @IsTest
  static void testGetProjectsInternalError() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/projects/');
    RestResponse res = RestTestUtil.getResponse();

    SAPIProject.throwException = true;

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    System.assertEquals(
      500,
      res.statusCode,
      'Should return 500 on internal error'
    );
  }

  @IsTest
  static void testGetProjectsWithFiltersAndDetailFields() {
    Project__c proj = [SELECT Id FROM Project__c LIMIT 1];
    proj.Is_Featured__c = true;
    proj.Challenge__c = 'Challenge';
    proj.Solution__c = 'Solution';
    proj.Business_Value__c = 'Value';
    proj.Live_URL__c = 'https://example.com';
    proj.Repository_URL__c = 'https://github.com/example';
    proj.Date_Completed__c = Date.today();
    update proj;
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/projects/',
      new Map<String, String>{
        'status' => 'Live – In Production',
        'isFeatured' => 'true'
      }
    );

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('repositoryUrl'),
      'Detail fields should be included'
    );
    System.assertEquals('1', res.headers.get('X-Total-Count'), 'Total count');
  }

  // Property names of the Project schema in salesforce-sapi.yaml (decision D4).
  private static final Set<String> SPEC_PROJECT_KEYS = new Set<String>{
    'id',
    'name',
    'challenge',
    'solution',
    'businessValue',
    'status',
    'dateCompleted',
    'heroImageUrl',
    'liveUrl',
    'repositoryUrl',
    'pillar',
    'pillarLabel',
    'isFeatured',
    'contactName',
    'contactId',
    'sortOrder'
  };

  @IsTest
  static void listResponseKeysEqualTheSpecSchema() {
    Contact owner = new Contact(LastName = 'Owner');
    insert owner;
    Project__c proj = [SELECT Id FROM Project__c LIMIT 1];
    proj.Contact__c = owner.Id;
    update proj;
    RestTestUtil.initGet('/services/apexrest/sapi/v1/projects/');

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    List<Object> items = (List<Object>) JSON.deserializeUntyped(
      RestTestUtil.getResponse().responseBody.toString()
    );
    Map<String, Object> item = (Map<String, Object>) items[0];
    Assert.areEqual(SPEC_PROJECT_KEYS, item.keySet(), 'Keys equal the spec');
    Assert.areEqual(owner.Id, item.get('contactId'), 'contactId from Contact__c');
    Project__c read = [SELECT Pillar_Label__c FROM Project__c WHERE Id = :proj.Id];
    Assert.areEqual(
      read.Pillar_Label__c,
      item.get('pillarLabel'),
      'pillarLabel from Pillar_Label__c'
    );
    Assert.isNull(item.get('challenge'), 'Empty fields are sent as null');
  }

  @IsTest
  static void singleResponseKeysEqualTheSpecSchema() {
    Project__c proj = [SELECT Id FROM Project__c LIMIT 1];
    RestTestUtil.initGet('/services/apexrest/sapi/v1/projects/' + proj.Id);

    Test.startTest();
    SAPIProject.getProjects();
    Test.stopTest();

    List<Object> items = (List<Object>) JSON.deserializeUntyped(
      RestTestUtil.getResponse().responseBody.toString()
    );
    Assert.areEqual(
      SPEC_PROJECT_KEYS,
      ((Map<String, Object>) items[0]).keySet(),
      'Single record keys equal the spec'
    );
  }
}

/**
 * @description       : Unit tests for SAPI_Project REST resource.
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
    SAPI_Project.getProjects();
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
  }

  @IsTest
  static void testGetProjectByIdSuccess() {
    Project__c proj = [SELECT Id FROM Project__c LIMIT 1];

    RestTestUtil.initGet('/services/apexrest/sapi/v1/projects/' + proj.Id);
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    SAPI_Project.getProjects();
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
    SAPI_Project.getProjects();
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
    SAPI_Project.getProjects();
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
    SAPI_Project.getProjects();
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
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.requestURI = null;
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    SAPI_Project.throwException = true;

    Test.startTest();
    SAPI_Project.getProjects();
    Test.stopTest();

    System.assertEquals(
      500,
      res.statusCode,
      'Should return 500 on internal error'
    );
  }
}

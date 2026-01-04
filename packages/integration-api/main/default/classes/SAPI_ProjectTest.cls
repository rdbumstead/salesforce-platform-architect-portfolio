/**
 * @description       : Unit tests for SAPI_Project REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class SAPI_ProjectTest {
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
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.params = new Map<String, String>();

    req.requestURI = '/services/apexrest/sapi/v1/projects/projects';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    Test.startTest();
    SAPI_Project.getProjects();
    Test.stopTest();

    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
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

    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.params = new Map<String, String>();

    req.requestURI = '/services/apexrest/sapi/v1/projects/' + proj.Id;
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

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
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.params = new Map<String, String>();

    // Use a clearly invalid ID
    req.requestURI = '/services/apexrest/sapi/v1/projects/a015e00000INVALID';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

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
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params.put('limit', '500');

    req.requestURI = '/services/apexrest/sapi/v1/projects/projects';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

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
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params.put('offset', '-1');

    req.requestURI = '/services/apexrest/sapi/v1/projects/projects';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

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
}

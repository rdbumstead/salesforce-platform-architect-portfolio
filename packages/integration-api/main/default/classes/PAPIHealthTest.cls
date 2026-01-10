/**
 * @description       : Unit tests for PAPIHealth REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class PAPIHealthTest {
  @IsTest
  static void testGetHealthReturnsUp() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();

    req.requestURI = '/services/apexrest/papi/v1/health';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    Test.startTest();
    PAPIHealth.getHealth();
    Test.stopTest();

    System.assertEquals(200, res.statusCode, 'Should return 200 OK');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('"status":"UP"'),
      'Response should contain UP status'
    );
    System.assert(
      responseJson.contains('timestamp'),
      'Response should contain timestamp'
    );
  }
}

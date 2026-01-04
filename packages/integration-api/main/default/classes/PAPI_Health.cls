/**
 * @description       : Health check endpoint for PAPI.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [PAPI_HealthTest]
 **/
@RestResource(urlMapping='/papi/v1/health')
global with sharing class PAPI_Health {
  /**
   * @description GET method to check PAPI health status.
   */
  @HttpGet
  global static void getHealth() {
    RestResponse res = RestContext.response;

    addCommonHeaders(res);
    res.addHeader('Cache-Control', 'no-store, no-cache');
    res.statusCode = 200;

    Map<String, Object> healthStatus = new Map<String, Object>{
      'status' => 'UP',
      'timestamp' => Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
      'dependencies' => new Map<String, Object>{ 'sapi' => 'not_checked' }
    };

    res.responseBody = Blob.valueOf(JSON.serialize(healthStatus));
  }

  private static void addCommonHeaders(RestResponse res) {
    res.addHeader('Content-Type', 'application/json');
    res.addHeader('X-Request-Id', RequestUtil.getRequestId());
    res.addHeader('X-API-Version', 'v1');
  }
}

/**
 * @description       : Health check endpoint for PAPI.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/05/2025
 * @Test Class        : [PAPIHealthTest]
 **/
@RestResource(urlMapping='/papi/v1/health')
global with sharing class PAPIHealth {
  /**
   * @description GET method to check PAPI health status.
   */
  @HttpGet
  global static void getHealth() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }

    Map<String, Object> healthStatus = new Map<String, Object>{
      'status' => 'UP',
      'timestamp' => Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
      'dependencies' => new Map<String, Object>{ 'sapi' => 'not_checked' }
    };

    ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);
    ctx.ok(healthStatus);
  }
}

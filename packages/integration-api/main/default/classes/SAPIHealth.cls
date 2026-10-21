/**
 * @description       : SAPI health check (/sapi/v1/health). Reports runtime availability, the
 *                      current transaction's governor-limit snapshot and the org time. The
 *                      payload builder is public so PAPIHealth can read SAPI health in-process
 *                      without calling this handler (contract C3).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [SAPIHealthTest]
 **/
@RestResource(urlMapping='/sapi/v1/health')
global with sharing class SAPIHealth {
  public static final String STATUS_UP = 'UP';
  public static final String CHECK_SHALLOW = 'SHALLOW';

  /**
   * @description GET handler. Applies the SAPI request rules, then returns the payload from
   *              buildPayload() with no-store, no-cache.
   */
  @HttpGet
  global static void getHealth() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }
    ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);
    ctx.ok(buildPayload());
  }

  /**
   * @description Builds the SAPI HealthStatus payload. Runs no SOQL, DML or callouts.
   * @return Map<String, Object> status, checkType, timestamp, dependencies and limits.
   */
  public static Map<String, Object> buildPayload() {
    return new Map<String, Object>{
      'status' => STATUS_UP,
      'checkType' => CHECK_SHALLOW,
      'timestamp' => Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
      'orgTimeZone' => UserInfo.getTimeZone().getID(),
      'dependencies' => new Map<String, Object>{ 'salesforce' => STATUS_UP },
      'limits' => limitsSnapshot()
    };
  }

  private static Map<String, Object> limitsSnapshot() {
    return new Map<String, Object>{
      'queries' => usage(Limits.getQueries(), Limits.getLimitQueries()),
      'dmlStatements' => usage(
        Limits.getDmlStatements(),
        Limits.getLimitDmlStatements()
      ),
      'callouts' => usage(Limits.getCallouts(), Limits.getLimitCallouts()),
      'cpuTimeMs' => usage(Limits.getCpuTime(), Limits.getLimitCpuTime()),
      'heapBytes' => usage(Limits.getHeapSize(), Limits.getLimitHeapSize())
    };
  }

  private static Map<String, Object> usage(Integer used, Integer max) {
    return new Map<String, Object>{ 'used' => used, 'limit' => max };
  }
}

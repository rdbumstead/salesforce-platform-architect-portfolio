/**
 * @description       : Unit tests for SAPIHealth REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class SAPIHealthTest {
  private static final String URI = '/services/apexrest/sapi/v1/health';

  @IsTest
  static void getHealthReturnsUpWithNoStore() {
    RestTestUtil.initGet(URI);
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    SAPIHealth.getHealth();
    Test.stopTest();

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(200, res.statusCode, 'Should return 200 OK');
    Assert.areEqual('UP', body.get('status'), 'Runtime is up');
    Assert.areEqual('SHALLOW', body.get('checkType'), 'Runtime-only check');
    Assert.areEqual(
      'no-store, no-cache',
      res.headers.get('Cache-Control'),
      'Health is never cached'
    );
  }

  @IsTest
  static void getHealthWithoutRequestIdIsRejected() {
    RestTestUtil.initGetRaw(
      URI,
      new Map<String, String>{ 'X-API-Version' => 'v1' },
      null
    );
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    SAPIHealth.getHealth();
    Test.stopTest();

    Assert.areEqual(400, res.statusCode, 'SAPI requires X-Request-Id');
    Assert.areEqual(
      'BAD_REQUEST',
      RestTestUtil.getBodyAsMap().get('errorCode'),
      'Standard error payload'
    );
  }

  @IsTest
  static void buildPayloadCarriesLimitsSnapshotAndOrgTime() {
    Test.startTest();
    Map<String, Object> payload = SAPIHealth.buildPayload();
    Test.stopTest();

    Map<String, Object> limitsSnapshot = (Map<String, Object>) payload.get(
      'limits'
    );
    Assert.areEqual(
      new Set<String>{
        'queries',
        'dmlStatements',
        'callouts',
        'cpuTimeMs',
        'heapBytes'
      },
      limitsSnapshot.keySet(),
      'One entry per governor limit reported'
    );
    Map<String, Object> queries = (Map<String, Object>) limitsSnapshot.get(
      'queries'
    );
    Assert.areEqual(
      new Set<String>{ 'used', 'limit' },
      queries.keySet(),
      'Each entry has used and limit'
    );
    Assert.isTrue(
      Pattern.matches(
        '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z',
        (String) payload.get('timestamp')
      ),
      'Timestamp is ISO 8601 UTC'
    );
    Assert.areEqual(
      UserInfo.getTimeZone().getID(),
      payload.get('orgTimeZone'),
      'Org time zone reported'
    );
    Assert.areEqual(
      'UP',
      ((Map<String, Object>) payload.get('dependencies')).get('salesforce'),
      'Salesforce core reachable in-process'
    );
  }
}

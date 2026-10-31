/**
 * @description       : Tests that, with the Api_Versionless_Urls switch Off, the shared path
 *                      handling in ApiRequestContext is the handling main 1c7a577d had before
 *                      the versionless URLs (ADR-040): the sunset exemptions, the unshaped
 *                      bodies, the AI rate tier, the endpoint segment and the request log
 *                      line. The assertions are the ones the old ApiVersionTest and
 *                      ApiRequestContextTest made. REMOVE WITH THE SWITCH.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/01/2026
 **/
@IsTest
private class ApiLegacyLogicTest {
  private static final String SAPI = '/services/apexrest/sapi/v1/';
  private static final String PAPI = '/services/apexrest/papi/v1/';
  private static final String VALID_ID = '123e4567-e89b-12d3-a456-426614174000';

  private class RecordingSink implements System.Callable {
    public List<Map<String, Object>> entries = new List<Map<String, Object>>();

    public Object call(String action, Map<String, Object> args) {
      entries.add(args);
      return new Map<String, Object>{ 'isSuccess' => true };
    }
  }

  private class CountingLimiter implements ApiRateLimiter {
    Integer checks = 0;
    String lastTier;
    Integer lastLimit;
    public ApiRequestContext.RateDecision check(
      String tierKey,
      Integer limitPerMinute
    ) {
      checks++;
      lastTier = tierKey;
      lastLimit = limitPerMinute;
      return new ApiRequestContext.RateDecision(true, limitPerMinute, 5, 0);
    }
    public ApiRequestContext.RateDecision checkKey(
      String callerKey,
      Integer limitPerMinute
    ) {
      return check(callerKey, limitPerMinute);
    }
  }

  private static void switchOff() {
    PortfolioSettings.overrides.put(
      ApiRoutes.SETTING,
      new Portfolio_Setting__mdt(
        DeveloperName = ApiRoutes.SETTING,
        Text_Value__c = 'Off'
      )
    );
  }

  private static void setting(String name, String text) {
    ApiRequestContext.readConfiguredDates = true;
    for (
      String dateSetting : new List<String>{
        ApiRequestContext.V1_DEPRECATION_SETTING,
        ApiRequestContext.V1_SUNSET_SETTING,
        ApiRequestContext.V1_PATH_DEPRECATION_SETTING,
        ApiRequestContext.V1_PATH_SUNSET_SETTING
      }
    ) {
      if (!PortfolioSettings.overrides.containsKey(dateSetting)) {
        PortfolioSettings.overrides.put(
          dateSetting,
          new Portfolio_Setting__mdt(DeveloperName = dateSetting)
        );
      }
    }
    PortfolioSettings.overrides.put(
      name,
      new Portfolio_Setting__mdt(DeveloperName = name, Text_Value__c = text)
    );
  }

  private static void send(String uri, String version) {
    Map<String, String> headers = new Map<String, String>{
      'X-Request-Id' => UUID.randomUUID().toString()
    };
    if (version != null) {
      headers.put('X-API-Version', version);
    }
    RestTestUtil.initGetRaw(uri, headers, null);
  }

  private static Map<String, Object> bodyMap() {
    return (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
  }

  // From the old ApiVersionTest.shouldKeepTokenAndHealthPathsOpenAfterTheSunset.
  @IsTest
  static void shouldKeepTokenAndHealthPathsOpenAfterTheSunset() {
    switchOff();
    setting('Api_V1_Sunset_Date', '2026-11-01');
    setting('Api_V1_Deprecation_Date', '2026-10-01');
    ApiRequestContext.nowOverride = Datetime.newInstanceGmt(2027, 1, 1);
    CountingLimiter limiter = new CountingLimiter();
    ApiRequestContext.limiterOverride = limiter;
    Integer expectedChecks = 0;
    for (
      String path : new List<String>{
        PAPI + 'auth/token',
        PAPI + 'auth/token/',
        PAPI + 'health',
        SAPI + 'health',
        '/portfoliovforcesite/services/apexrest/papi/v1/auth/token'
      }
    ) {
      send(path, null);
      ApiRequestContext ctx = ApiRequestContext.begin();
      expectedChecks++;
      Assert.isFalse(ctx.isRejected(), path + ' is not 410');
      Assert.isNotNull(RestContext.response.headers.get('Deprecation'), path);
      Assert.isNotNull(RestContext.response.headers.get('Sunset'), path);
      Assert.isFalse(
        String.valueOf(RestContext.response.headers.get('Link'))
          .contains('canonical'),
        path + ' has no canonical Link'
      );
      Assert.areEqual(expectedChecks, limiter.checks, path + ' as on main');
    }
    send(PAPI + 'healthcheck', null);
    Assert.isTrue(
      ApiRequestContext.begin().isRejected(),
      'A path that only starts like health is not exempt'
    );
    Assert.areEqual(410, RestContext.response.statusCode, 'Gone');
    Assert.isFalse(
      RestContext.response.headers.get('Link').contains('canonical'),
      'No canonical Link while Off'
    );
  }

  // From the old ApiVersionTest.shouldShapeRecordPathsAndLeaveOtherBodiesAlone,
  // widened to every unshaped path.
  @IsTest
  static void shouldShapeRecordPathsAndLeaveOtherBodiesAlone() {
    switchOff();
    Map<String, Object> body = new Map<String, Object>{
      'id' => 'x',
      'name' => 'n'
    };
    for (
      String path : new List<String>{
        PAPI + 'auth/token',
        SAPI + 'health',
        PAPI + 'health',
        PAPI + 'ai/generate',
        PAPI + 'resume/generate',
        SAPI + 'portfolio-config'
      }
    ) {
      send(path, 'v2');
      ApiRequestContext.begin().ok(body);
      Assert.isTrue(bodyMap().containsKey('id'), path + ' keeps id');
    }
    send(SAPI + 'skills/', 'v2');
    ApiRequestContext.begin().ok(body);
    Assert.isFalse(bodyMap().containsKey('id'), 'A record body loses id');
  }

  // From the old ApiRequestContextTest.rateLimitHeadersPerTier.
  @IsTest
  static void shouldPickTheRateTierFromTheOldAiPath() {
    switchOff();
    CountingLimiter limiter = new CountingLimiter();
    ApiRequestContext.limiterOverride = limiter;

    send(PAPI + 'ai/generate', 'v2');
    ApiRequestContext.begin();
    Assert.areEqual('papi-ai', limiter.lastTier, 'AI tier');
    Assert.areEqual(
      ApiRequestContext.PAPI_AI_LIMIT_PER_MINUTE,
      limiter.lastLimit
    );

    send(PAPI + 'health', 'v2');
    ApiRequestContext.begin();
    Assert.areEqual('papi', limiter.lastTier, 'PAPI tier');

    send(SAPI + 'skills/', 'v2');
    ApiRequestContext.begin();
    Assert.areEqual('sapi', limiter.lastTier, 'SAPI tier');

    // The old check was a contains on /papi/v1/ai/, so a versionless AI path is not the AI tier.
    send('/services/apexrest/papi/ai/generate', 'v2');
    ApiRequestContext.begin();
    Assert.areEqual('papi', limiter.lastTier, 'Old logic: not a v1 AI path');
  }

  // From the old ApiRequestContextTest.endpointSegmentCases.
  @IsTest
  static void shouldReadTheEndpointSegmentAsMainDid() {
    switchOff();
    Map<String, String> expected = new Map<String, String>{
      '/services/apexrest/papi/v1/profile/full' => 'full',
      '/services/apexrest/papi/v1/profile/summary/' => 'summary',
      '/services/apexrest/papi/v1/profile/' => null,
      '/services/apexrest/papi/v1/health' => null,
      '/services/apexrest/sapi/v1/projects/a015e00000ABCDE' => 'a015e00000ABCDE',
      '/services/apexrest/other/path' => null
    };
    Test.startTest();
    for (String uri : expected.keySet()) {
      RestTestUtil.initGet(uri);
      Assert.areEqual(
        expected.get(uri),
        ApiRequestContext.begin().endpointSegment(),
        'Segment for ' + uri
      );
    }
    Test.stopTest();
  }

  // From the old ApiRequestContextTest.okWritesOneLogLineWithoutHeaderValues.
  @IsTest
  static void shouldLogTheRawUriAsMainDid() {
    switchOff();
    RecordingSink sink = new RecordingSink();
    PortfolioLog.injectedSink = sink;
    String uri = '/services/apexrest/sapi/v1/skills/';
    RestTestUtil.initGetRaw(
      uri + '?limit=5',
      new Map<String, String>{ 'X-Request-Id' => VALID_ID },
      null
    );

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    ctx.ok(new Map<String, Object>{ 'body' => 'x' });
    Test.stopTest();

    String line = (String) sink.entries[0].get('message');
    Assert.areEqual(
      'api request path=' +
        uri +
        ' status=200 correlationId=' +
        VALID_ID +
        ' elapsedMs=' +
        line.substringAfter('elapsedMs='),
      line,
      'The old line, with the raw path and no legacyPath'
    );
  }
}

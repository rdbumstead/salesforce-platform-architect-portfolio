/**
 * @description       : Unit tests for ApiRequestContext, ApiRateLimiter and HeadersOnlyRateLimiter.
 *                      RateWindowLimiter has its own test class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/01/2026
 **/
@IsTest
private class ApiRequestContextTest {
  private static final String SAPI_URI = '/services/apexrest/sapi/v1/skills/';
  private static final String PAPI_URI = '/services/apexrest/papi/v1/health';
  private static final String PAPI_AI_URI = '/services/apexrest/papi/v1/ai/generate';
  private static final String VALID_ID = '123e4567-e89b-12d3-a456-426614174000';
  // The default limiter reads its own window row once per request; no data SOQL runs before a rejection.
  private static final Integer LIMITER_QUERIES = 1;
  private static final Pattern UUID_PATTERN = Pattern.compile(
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );

  /**
   * @description Limiter that refuses every request, used to reach the 429 path.
   */
  private class DenyingLimiter implements ApiRateLimiter {
    public ApiRequestContext.RateDecision check(
      String tierKey,
      Integer limitPerMinute
    ) {
      return new ApiRequestContext.RateDecision(false, limitPerMinute, 0, 42);
    }

    public ApiRequestContext.RateDecision checkKey(
      String callerKey,
      Integer limitPerMinute
    ) {
      return check(callerKey, limitPerMinute);
    }
  }

  private static Map<String, String> headers(String requestId, String version) {
    Map<String, String> result = new Map<String, String>();
    if (requestId != null) {
      result.put('X-Request-Id', requestId);
    }
    if (version != null) {
      result.put('X-API-Version', version);
    }
    return result;
  }

  private static String responseHeader(String name) {
    return RestTestUtil.getResponse().headers.get(name);
  }

  private static String requestHeader(String name) {
    Map<String, String> sent = RestContext.request.headers;
    for (String key : sent.keySet()) {
      if (key.equalsIgnoreCase(name)) {
        return sent.get(key);
      }
    }
    return null;
  }

  // The id the client sees: Apex's header when it generated one, else the caller's value,
  // which the platform echoes.
  private static String visibleRequestId() {
    String fromApex = responseHeader('X-Request-Id');
    return fromApex != null ? fromApex : requestHeader('X-Request-Id');
  }

  private static void assertErrorShape(
    Integer status,
    String errorCode,
    Boolean retryable
  ) {
    RestResponse res = RestTestUtil.getResponse();
    Assert.areEqual(status, res.statusCode, 'Unexpected status');
    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(
      new Set<String>{
        'httpStatus',
        'errorCode',
        'message',
        'correlationId',
        'retryable'
      },
      body.keySet(),
      'Error payload must match the Error schema'
    );
    Assert.areEqual(status, body.get('httpStatus'), 'httpStatus mismatch');
    Assert.areEqual(errorCode, body.get('errorCode'), 'errorCode mismatch');
    Assert.areEqual(retryable, body.get('retryable'), 'retryable mismatch');
    Assert.areEqual(
      visibleRequestId(),
      body.get('correlationId'),
      'correlationId must match the echoed X-Request-Id'
    );
    Assert.isTrue(
      UUID_PATTERN.matcher((String) body.get('correlationId')).matches(),
      'correlationId must be a UUID'
    );
  }

  // ---------- X-Request-Id rules

  @IsTest
  static void sapiMissingRequestIdRejectedBeforeAnySoql() {
    RestTestUtil.initGetRaw(SAPI_URI, headers(null, 'v1'), null);

    Test.startTest();
    SAPISkill.getSkills();
    Integer queries = Limits.getQueries();
    Test.stopTest();

    Assert.areEqual(
      LIMITER_QUERIES,
      queries,
      'Only the window read of the rate limiter runs before rejection'
    );
    assertErrorShape(400, 'BAD_REQUEST', false);
    Assert.areEqual(
      'X-Request-Id header is required.',
      RestTestUtil.getBodyAsMap().get('message'),
      'Message should name the missing header'
    );
  }

  @IsTest
  static void sapiMalformedRequestIdRejected() {
    RestTestUtil.initGetRaw(SAPI_URI, headers('TEST-REQ-1', 'v1'), null);

    Test.startTest();
    SAPISkill.getSkills();
    Integer queries = Limits.getQueries();
    Test.stopTest();

    Assert.areEqual(
      LIMITER_QUERIES,
      queries,
      'Only the window read of the rate limiter runs before rejection'
    );
    assertErrorShape(400, 'BAD_REQUEST', false);
    Assert.areEqual(
      'X-Request-Id must be a UUID.',
      RestTestUtil.getBodyAsMap().get('message'),
      'Message should explain the UUID rule'
    );
  }

  @IsTest
  static void papiMissingRequestIdGetsGeneratedUuid() {
    RestTestUtil.initGetRaw(PAPI_URI, new Map<String, String>(), null);

    Test.startTest();
    PAPIHealth.getHealth();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestTestUtil.getResponse().statusCode,
      'PAPI allows a missing id'
    );
    Assert.isTrue(
      UUID_PATTERN.matcher(responseHeader('X-Request-Id')).matches(),
      'A generated UUID must be echoed'
    );
    Assert.areEqual('v1', responseHeader('X-API-Version'), 'Version echoed');
    Assert.areEqual(
      'no-store, no-cache',
      responseHeader('Cache-Control'),
      'Health is never cached'
    );
  }

  // ---------- D3: the platform's own 32-hex id on PAPI

  private static final String PLATFORM_ID = '89b386134a6c191e614fc9ae695e52bf';

  @IsTest
  static void papiPlatformIdCountsAsMissing() {
    RestTestUtil.initGetRaw(PAPI_URI, headers(PLATFORM_ID, null), null);

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.isFalse(ctx.isRejected(), 'A platform id is not a malformed id');
    Assert.isTrue(
      UUID_PATTERN.matcher(ctx.correlationId()).matches(),
      'A UUID is generated as the correlation id'
    );
    Assert.isNull(
      responseHeader('X-Request-Id'),
      'Apex adds no second id: the platform echoes the one it injected'
    );
  }

  @IsTest
  static void papiPlatformIdServesTheRequest() {
    RestTestUtil.initGetRaw(PAPI_URI, headers(PLATFORM_ID, 'v1'), null);

    Test.startTest();
    PAPIHealth.getHealth();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestTestUtil.getResponse().statusCode,
      'PAPI no longer answers 400 to a request with no caller id'
    );
    Assert.isNull(responseHeader('X-Request-Id'), 'One id on the response');
  }

  @IsTest
  static void papiTrulyMissingIdSetsExactlyOneHeader() {
    RestTestUtil.initGetRaw(PAPI_URI, new Map<String, String>(), null);

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.areEqual(
      ctx.correlationId(),
      responseHeader('X-Request-Id'),
      'With no id at all, Apex sets its generated UUID once'
    );
  }

  @IsTest
  static void papiPlatformIdErrorBodyCarriesTheGeneratedUuid() {
    ApiRequestContext.limiterOverride = new DenyingLimiter();
    RestTestUtil.initGetRaw(PAPI_URI, headers(PLATFORM_ID, null), null);

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.isTrue(ctx.isRejected(), 'Refused by the limiter');
    Assert.areEqual(429, RestTestUtil.getResponse().statusCode, '429');
    Assert.areEqual(
      ctx.correlationId(),
      RestTestUtil.getBodyAsMap().get('correlationId'),
      'Body carries the generated UUID'
    );
    Assert.isNull(responseHeader('X-Request-Id'), 'Still no second id');
  }

  @IsTest
  static void sapiPlatformIdIsStillRejected() {
    RestTestUtil.initGetRaw(SAPI_URI, headers(PLATFORM_ID, 'v1'), null);

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.isTrue(ctx.isRejected(), 'SAPI rules are unchanged');
    Assert.areEqual(
      'X-Request-Id must be a UUID.',
      RestTestUtil.getBodyAsMap().get('message'),
      'SAPI message unchanged'
    );
  }

  // ---------- One log line per request

  private class RecordingSink implements System.Callable {
    public List<Map<String, Object>> entries = new List<Map<String, Object>>();

    public Object call(String action, Map<String, Object> args) {
      entries.add(args);
      return new Map<String, Object>{ 'isSuccess' => true };
    }
  }

  @IsTest
  static void okWritesOneLogLineWithoutHeaderValues() {
    RecordingSink sink = new RecordingSink();
    PortfolioLog.injectedSink = sink;
    RestTestUtil.initGetRaw(
      SAPI_URI + '?limit=5',
      new Map<String, String>{
        'X-Request-Id' => VALID_ID,
        'X-Evaluator-Note' => 'secret-header-value'
      },
      null
    );

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    ctx.ok(new Map<String, Object>{ 'body' => 'secret-body-value' });
    ctx.ok(new Map<String, Object>{ 'again' => true });
    Test.stopTest();

    Assert.areEqual(1, sink.entries.size(), 'Exactly one line per request');
    String line = (String) sink.entries[0].get('message');
    Assert.isTrue(line.contains('path=' + SAPI_URI), line);
    Assert.isTrue(line.contains('status=200'), line);
    Assert.isTrue(line.contains('correlationId=' + VALID_ID), line);
    Assert.isTrue(line.contains('elapsedMs='), line);
    Assert.isFalse(line.contains('limit=5'), 'No query string');
    Assert.isFalse(line.contains('secret'), 'No token and no body');
  }

  @IsTest
  static void rejectionWritesOneLogLineWithItsStatus() {
    RecordingSink sink = new RecordingSink();
    PortfolioLog.injectedSink = sink;
    RestTestUtil.initGetRaw(SAPI_URI, headers(null, 'v1'), null);

    Test.startTest();
    ApiRequestContext.begin();
    Test.stopTest();

    Assert.areEqual(1, sink.entries.size(), 'One line for the rejection');
    Assert.isTrue(
      ((String) sink.entries[0].get('message')).contains('status=400'),
      'Status logged'
    );
  }

  @IsTest
  static void papiMalformedRequestIdRejected() {
    RestTestUtil.initGetRaw(PAPI_URI, headers('not-a-uuid', null), null);

    Test.startTest();
    PAPIHealth.getHealth();
    Test.stopTest();

    assertErrorShape(400, 'BAD_REQUEST', false);
  }

  @IsTest
  static void callerRequestIdEchoedCaseInsensitively() {
    RestTestUtil.initGetRaw(
      SAPI_URI,
      new Map<String, String>{
        'x-request-id' => VALID_ID,
        'x-api-version' => 'v1'
      },
      null
    );

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.isFalse(ctx.isRejected(), 'Valid lower-case headers are accepted');
    Assert.areEqual(
      VALID_ID,
      ctx.correlationId(),
      'Caller id is the correlation id'
    );
    Assert.isNull(
      responseHeader('X-Request-Id'),
      'Apex leaves a valid caller id for the platform to echo'
    );
    Assert.areEqual(
      'application/json',
      responseHeader('Content-Type'),
      'JSON content type'
    );
  }

  @IsTest
  static void unknownPathAppliesStrictRequestIdRule() {
    RestTestUtil.initGetRaw(null, headers(null, null), null);

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.isTrue(ctx.isRejected(), 'Unknown paths require an id');
    assertErrorShape(400, 'BAD_REQUEST', false);
    Assert.areEqual(
      String.valueOf(ApiRequestContext.PAPI_LIMIT_PER_MINUTE),
      responseHeader('X-RateLimit-Limit'),
      'Unknown paths use the standard PAPI tier'
    );
  }

  // ---------- X-API-Version rules

  @IsTest
  static void unsupportedApiVersionRejected() {
    RestTestUtil.initGetRaw(SAPI_URI, headers(VALID_ID, 'v2'), null);

    Test.startTest();
    SAPISkill.getSkills();
    Integer queries = Limits.getQueries();
    Test.stopTest();

    Assert.areEqual(
      LIMITER_QUERIES,
      queries,
      'Only the window read of the rate limiter runs before rejection'
    );
    assertErrorShape(400, 'BAD_REQUEST', false);
    Assert.areEqual(
      'Unsupported X-API-Version',
      RestTestUtil.getBodyAsMap().get('message'),
      'Version message'
    );
    Assert.areEqual('v1', responseHeader('X-API-Version'), 'Version echoed');
  }

  @IsTest
  static void missingApiVersionTreatedAsV1() {
    RestTestUtil.initGetRaw(SAPI_URI, headers(VALID_ID, null), null);

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    Test.stopTest();

    Assert.isFalse(ctx.isRejected(), 'Missing version resolves to v1');
    Assert.areEqual('v1', responseHeader('X-API-Version'), 'Version echoed');
  }

  // ---------- Pagination

  private static ApiRequestContext contextWithParams(
    Map<String, String> params
  ) {
    RestTestUtil.initGet(SAPI_URI, params);
    return ApiRequestContext.begin();
  }

  @IsTest
  static void paginationDefaults() {
    Test.startTest();
    ApiRequestContext ctx = contextWithParams(null);
    Integer limitValue = ctx.limitParam();
    Integer offsetValue = ctx.offsetParam();
    Test.stopTest();

    Assert.areEqual(50, limitValue, 'Default limit');
    Assert.areEqual(0, offsetValue, 'Default offset');
    Assert.isFalse(ctx.isRejected(), 'Defaults are valid');
  }

  @IsTest
  static void paginationAcceptsBounds() {
    Test.startTest();
    ApiRequestContext ctx = contextWithParams(
      new Map<String, String>{ 'limit' => '200', 'offset' => '10' }
    );
    Integer limitValue = ctx.limitParam();
    Integer offsetValue = ctx.offsetParam();
    Test.stopTest();

    Assert.areEqual(200, limitValue, 'Max limit accepted');
    Assert.areEqual(10, offsetValue, 'Offset accepted');
  }

  @IsTest
  static void limitZeroRejected() {
    assertLimitRejected('0');
  }

  @IsTest
  static void limitAboveMaxRejected() {
    assertLimitRejected('201');
  }

  @IsTest
  static void limitNotIntegerRejected() {
    assertLimitRejected('abc');
  }

  @IsTest
  static void limitOverflowRejected() {
    assertLimitRejected('99999999999');
  }

  private static void assertLimitRejected(String value) {
    Test.startTest();
    ApiRequestContext ctx = contextWithParams(
      new Map<String, String>{ 'limit' => value }
    );
    Integer limitValue = ctx.limitParam();
    Integer offsetValue = ctx.offsetParam();
    Test.stopTest();

    Assert.isNull(limitValue, 'Invalid limit returns null');
    Assert.isNull(offsetValue, 'Offset is not read once rejected');
    Assert.isTrue(ctx.isRejected(), 'Invalid limit rejects the request');
    assertErrorShape(400, 'BAD_REQUEST', false);
    Assert.areEqual(
      'Limit must be an integer between 1 and 200.',
      RestTestUtil.getBodyAsMap().get('message'),
      'First error wins'
    );
  }

  @IsTest
  static void offsetNegativeRejected() {
    Test.startTest();
    ApiRequestContext ctx = contextWithParams(
      new Map<String, String>{ 'offset' => '-1' }
    );
    ctx.limitParam();
    Integer offsetValue = ctx.offsetParam();
    Test.stopTest();

    Assert.isNull(offsetValue, 'Invalid offset returns null');
    assertErrorShape(400, 'BAD_REQUEST', false);
    Assert.areEqual(
      'Offset cannot be negative.',
      RestTestUtil.getBodyAsMap().get('message'),
      'Negative offset message'
    );
  }

  @IsTest
  static void offsetNotIntegerRejected() {
    Test.startTest();
    ApiRequestContext ctx = contextWithParams(
      new Map<String, String>{ 'offset' => 'xyz' }
    );
    Integer offsetValue = ctx.offsetParam();
    Test.stopTest();

    Assert.isNull(offsetValue, 'Invalid offset returns null');
    assertErrorShape(400, 'BAD_REQUEST', false);
  }

  @IsTest
  static void endpointLimitAbcReturns400() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/experience/',
      new Map<String, String>{ 'limit' => 'abc' }
    );

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    assertErrorShape(400, 'BAD_REQUEST', false);
  }

  @IsTest
  static void paginateHeaders() {
    Test.startTest();
    ApiRequestContext ctx = contextWithParams(
      new Map<String, String>{ 'limit' => '2' }
    );
    ctx.limitParam();
    ctx.paginate(5, 2);
    Test.stopTest();

    Assert.areEqual('5', responseHeader('X-Total-Count'), 'Total count');
    Assert.areEqual(
      'true',
      responseHeader('X-Has-More'),
      'Full page means more'
    );
  }

  @IsTest
  static void paginateLastPage() {
    Test.startTest();
    ApiRequestContext ctx = contextWithParams(null);
    ctx.limitParam();
    ctx.paginate(3, 3);
    Test.stopTest();

    Assert.areEqual(
      'false',
      responseHeader('X-Has-More'),
      'Short page is last'
    );
  }

  // ---------- Parameters and paths

  @IsTest
  static void boolAndStringParams() {
    Test.startTest();
    ApiRequestContext ctx = contextWithParams(
      new Map<String, String>{ 'flag' => 'TRUE', 'name' => 'Apex' }
    );
    Test.stopTest();

    Assert.isTrue(ctx.boolParam('flag'), 'Boolean parsed');
    Assert.isNull(ctx.boolParam('missing'), 'Missing boolean is null');
    Assert.areEqual('Apex', ctx.stringParam('name'), 'String read');
    Assert.isNull(ctx.stringParam('missing'), 'Missing string is null');
  }

  @IsTest
  static void endpointSegmentCases() {
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
    RestTestUtil.initGetRaw(null, headers(VALID_ID, 'v1'), null);
    Assert.isNull(
      ApiRequestContext.begin().endpointSegment(),
      'Null URI has no segment'
    );
    Test.stopTest();
  }

  // ---------- Cache, body and errors

  @IsTest
  static void cachePolicyStrings() {
    Map<ApiRequestContext.CachePolicy, String> expected = new Map<ApiRequestContext.CachePolicy, String>{
      ApiRequestContext.CachePolicy.PUBLIC_300 => 'max-age=300, public',
      ApiRequestContext.CachePolicy.PRIVATE_300 => 'max-age=300, private',
      ApiRequestContext.CachePolicy.PRIVATE_60 => 'max-age=60, private',
      ApiRequestContext.CachePolicy.NO_STORE => 'no-store, no-cache'
    };
    Test.startTest();
    for (ApiRequestContext.CachePolicy policy : expected.keySet()) {
      ApiRequestContext ctx = contextWithParams(null);
      ctx.cache(policy);
      Assert.areEqual(
        expected.get(policy),
        responseHeader('Cache-Control'),
        'Directive for ' + policy
      );
    }
    Test.stopTest();
  }

  @IsTest
  static void okWritesJson() {
    Test.startTest();
    ApiRequestContext ctx = contextWithParams(null);
    ctx.ok(new Map<String, Object>{ 'a' => 1 });
    Test.stopTest();

    Assert.areEqual(200, RestTestUtil.getResponse().statusCode, 'OK status');
    Assert.areEqual(1, RestTestUtil.getBodyAsMap().get('a'), 'Body serialised');
  }

  @IsTest
  static void serverErrorsAreRetryable() {
    Test.startTest();
    ApiRequestContext ctx = contextWithParams(null);
    ctx.error(500, 'INTERNAL_SERVER_ERROR', 'boom');
    Test.stopTest();

    Assert.isTrue(ctx.isRejected(), 'Error marks the request rejected');
    assertErrorShape(500, 'INTERNAL_SERVER_ERROR', true);
  }

  @IsTest
  static void notFoundIsNotRetryable() {
    Test.startTest();
    ApiRequestContext ctx = contextWithParams(null);
    ctx.error(404, 'NOT_FOUND', 'missing');
    Test.stopTest();

    assertErrorShape(404, 'NOT_FOUND', false);
  }

  // ---------- Rate limiting

  @IsTest
  static void rateLimitHeadersPerTier() {
    Map<String, Integer> expected = new Map<String, Integer>{
      SAPI_URI => ApiRequestContext.SAPI_LIMIT_PER_MINUTE,
      PAPI_URI => ApiRequestContext.PAPI_LIMIT_PER_MINUTE,
      PAPI_AI_URI => ApiRequestContext.PAPI_AI_LIMIT_PER_MINUTE
    };
    Test.startTest();
    for (String uri : expected.keySet()) {
      RestTestUtil.initGet(uri);
      ApiRequestContext ctx = ApiRequestContext.begin();
      Assert.isFalse(ctx.isRejected(), 'First request in the window passes');
      Assert.areEqual(
        String.valueOf(expected.get(uri)),
        responseHeader('X-RateLimit-Limit'),
        'Limit for ' + uri
      );
      Assert.areEqual(
        String.valueOf(expected.get(uri) - 1),
        responseHeader('X-RateLimit-Remaining'),
        'One request used for ' + uri
      );
    }
    Test.stopTest();
    Assert.areEqual(120, ApiRequestContext.SAPI_LIMIT_PER_MINUTE, 'SAPI tier');
    Assert.areEqual(15, ApiRequestContext.PAPI_LIMIT_PER_MINUTE, 'PAPI tier');
    Assert.areEqual(10, ApiRequestContext.PAPI_AI_LIMIT_PER_MINUTE, 'AI tier');
  }

  @IsTest
  static void injectedLimiterReturns429BeforeAnySoql() {
    ApiRequestContext.limiterOverride = new DenyingLimiter();
    RestTestUtil.initGet(SAPI_URI);

    Test.startTest();
    SAPISkill.getSkills();
    Integer queries = Limits.getQueries();
    Test.stopTest();

    Assert.areEqual(0, queries, 'Rate-limit rejection happens before any SOQL');
    assertErrorShape(429, 'RATE_LIMIT_EXCEEDED', true);
    Assert.areEqual('42', responseHeader('Retry-After'), 'Retry-After emitted');
    Assert.areEqual(
      '0',
      responseHeader('X-RateLimit-Remaining'),
      'Nothing remaining'
    );
    Assert.areEqual('120', responseHeader('X-RateLimit-Limit'), 'SAPI tier');
  }

  @IsTest
  static void storedLimitReturns429WithOnlyTheLimiterQuery() {
    RestTestUtil.initGet(SAPI_URI);
    Datetime now = Datetime.now();
    insert new API_Rate_Window__c(
      Key__c = RateWindowLimiter.windowKeyOf(
        RateWindowLimiter.callerKeyFor('sapi'),
        now
      ),
      Window_Start__c = now,
      Count__c = ApiRequestContext.SAPI_LIMIT_PER_MINUTE
    );
    RateWindowLimiter.nowOverride = now;

    Test.startTest();
    SAPISkill.getSkills();
    Integer queries = Limits.getQueries();
    Integer dml = Limits.getDmlStatements();
    Test.stopTest();

    Assert.areEqual(
      LIMITER_QUERIES,
      queries,
      'A rate-limited request runs only the window read, no data SOQL'
    );
    Assert.areEqual(1, dml, 'Only the window count is written');
    assertErrorShape(429, 'RATE_LIMIT_EXCEEDED', true);
    Assert.isNotNull(responseHeader('Retry-After'), 'Retry-After emitted');
  }

  @IsTest
  static void defaultLimiterIsRateWindowLimiter() {
    Test.startTest();
    ApiRateLimiter active = ApiRequestContext.rateLimiter();
    Test.stopTest();

    Assert.isInstanceOfType(
      active,
      RateWindowLimiter.class,
      'Custom-object counter is the default store'
    );
  }

  @IsTest
  static void headersOnlyLimiterAllows() {
    Test.startTest();
    ApiRequestContext.RateDecision decision = new HeadersOnlyRateLimiter()
      .check('sapi', 120);
    Test.stopTest();

    Assert.isTrue(decision.allowed, 'Always allows');
    Assert.areEqual(120, decision.limitPerMinute, 'Limit passed through');
    Assert.areEqual(120, decision.remaining, 'Remaining equals limit');
    Assert.areEqual(0, decision.retryAfterSeconds, 'No retry wait');
  }

  @IsTest
  static void headersOnlyLimiterAllowsExplicitKey() {
    Test.startTest();
    ApiRequestContext.RateDecision decision = new HeadersOnlyRateLimiter()
      .checkKey('papi-token:abc', 15);
    Test.stopTest();

    Assert.isTrue(decision.allowed, 'Always allows');
    Assert.areEqual(15, decision.limitPerMinute, 'Limit passed through');
    Assert.areEqual(15, decision.remaining, 'Remaining equals limit');
  }

  @IsTest
  static void rateLimiterReturnsOverrideWhenSet() {
    ApiRateLimiter denying = new DenyingLimiter();
    ApiRequestContext.limiterOverride = denying;

    Test.startTest();
    ApiRateLimiter active = ApiRequestContext.rateLimiter();
    Test.stopTest();

    Assert.areEqual(denying, active, 'Override wins');
    Assert.isFalse(
      active.checkKey('papi-token:abc', 15).allowed,
      'Explicit keys go through the same limiter'
    );
  }
}

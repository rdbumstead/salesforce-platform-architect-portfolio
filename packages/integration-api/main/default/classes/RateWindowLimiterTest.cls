/**
 * @description       : Unit tests for RateWindowLimiter: counting, keying, the 429 at limit + 1,
 *                      writes deferred to the response (contract C2) and concurrent inserts.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 **/
@IsTest
private class RateWindowLimiterTest {
  private static final String PAPI_URI = '/services/apexrest/papi/v1/health';
  private static final String CALLER_KEY = 'papi-token:test-caller';
  // 2026-10-20 12:34:15 UTC: 45 seconds left in the window.
  private static final Datetime FIXED_NOW = Datetime.newInstanceGmt(
    2026,
    10,
    20,
    12,
    34,
    15
  );
  private static final Integer SECONDS_LEFT = 45;

  /**
   * @description Callout mock standing in for any outbound call a resource makes after begin().
   */
  private class OkCalloutMock implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest req) {
      HttpResponse res = new HttpResponse();
      res.setStatusCode(200);
      res.setBody('{"status":"UP"}');
      return res;
    }
  }

  private static String windowKey(String callerKey) {
    return RateWindowLimiter.windowKeyOf(
      callerKey,
      Datetime.newInstanceGmt(2026, 10, 20, 12, 34, 0)
    );
  }

  private static API_Rate_Window__c storedWindow(String callerKey) {
    List<API_Rate_Window__c> rows = [
      SELECT Id, Key__c, Count__c, Window_Start__c
      FROM API_Rate_Window__c
      WHERE Key__c = :windowKey(callerKey)
    ];
    return rows.isEmpty() ? null : rows[0];
  }

  private static void insertWindow(String callerKey, Integer count) {
    insert new API_Rate_Window__c(
      Key__c = windowKey(callerKey),
      Window_Start__c = Datetime.newInstanceGmt(2026, 10, 20, 12, 34, 0),
      Count__c = count
    );
  }

  private static HttpResponse callOut() {
    HttpRequest req = new HttpRequest();
    req.setEndpoint('https://example.com/health');
    req.setMethod('GET');
    return new Http().send(req);
  }

  // ---------- Counting and decisions

  @IsTest
  static void firstCheckReadsOnceAndWritesNothing() {
    RateWindowLimiter.nowOverride = FIXED_NOW;

    Test.startTest();
    ApiRequestContext.RateDecision decision = new RateWindowLimiter()
      .checkKey(CALLER_KEY, 15);
    Integer queries = Limits.getQueries();
    Integer dml = Limits.getDmlStatements();
    Test.stopTest();

    Assert.isTrue(decision.allowed, 'First request is allowed');
    Assert.areEqual(14, decision.remaining, 'One of 15 used');
    Assert.areEqual(0, decision.retryAfterSeconds, 'No wait when allowed');
    Assert.areEqual(1, queries, 'Exactly the window read');
    Assert.areEqual(0, dml, 'check never writes (contract C2)');
    Assert.isNull(storedWindow(CALLER_KEY), 'Nothing stored until commit');
  }

  @IsTest
  static void commitPendingInsertsTheWindow() {
    RateWindowLimiter.nowOverride = FIXED_NOW;

    Test.startTest();
    new RateWindowLimiter().checkKey(CALLER_KEY, 15);
    RateWindowLimiter.commitPending();
    RateWindowLimiter.commitPending();
    Test.stopTest();

    API_Rate_Window__c row = storedWindow(CALLER_KEY);
    Assert.areEqual(1, row.Count__c, 'One request recorded once');
    Assert.areEqual(
      CALLER_KEY + '|202610201234',
      row.Key__c,
      'Key is the caller key as given plus the UTC minute'
    );
    Assert.areEqual(
      Datetime.newInstanceGmt(2026, 10, 20, 12, 34, 0),
      row.Window_Start__c,
      'Window starts on the minute'
    );
  }

  @IsTest
  static void storedCountIsIncremented() {
    RateWindowLimiter.nowOverride = FIXED_NOW;
    insertWindow(CALLER_KEY, 7);

    Test.startTest();
    ApiRequestContext.RateDecision decision = new RateWindowLimiter()
      .checkKey(CALLER_KEY, 15);
    RateWindowLimiter.commitPending();
    Test.stopTest();

    Assert.areEqual(7, decision.remaining, '8 of 15 used');
    Assert.areEqual(8, storedWindow(CALLER_KEY).Count__c, 'Count written');
  }

  @IsTest
  static void storedLimitRejectsWithRetryAfter() {
    RateWindowLimiter.nowOverride = FIXED_NOW;
    insertWindow(CALLER_KEY, 15);

    Test.startTest();
    ApiRequestContext.RateDecision decision = new RateWindowLimiter()
      .checkKey(CALLER_KEY, 15);
    Test.stopTest();

    Assert.isFalse(decision.allowed, 'Sixteenth request is refused');
    Assert.areEqual(0, decision.remaining, 'Nothing remaining');
    Assert.areEqual(
      SECONDS_LEFT,
      decision.retryAfterSeconds,
      'Retry when the window rolls over'
    );
  }

  @IsTest
  static void limitPlusOneCallsInOneMinuteReturn429() {
    RateWindowLimiter.nowOverride = FIXED_NOW;
    Integer tierLimit = ApiRequestContext.PAPI_LIMIT_PER_MINUTE;

    Test.startTest();
    for (Integer i = 0; i < tierLimit; i++) {
      RestTestUtil.initGet(PAPI_URI);
      ApiRequestContext ctx = ApiRequestContext.begin();
      Assert.isFalse(ctx.isRejected(), 'Call ' + (i + 1) + ' is allowed');
      ctx.ok(new Map<String, Object>());
    }
    RestTestUtil.initGet(PAPI_URI);
    ApiRequestContext last = ApiRequestContext.begin();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.isTrue(last.isRejected(), 'Call limit + 1 is rejected');
    Assert.areEqual(429, res.statusCode, '429 status');
    Assert.areEqual(
      String.valueOf(SECONDS_LEFT),
      res.headers.get('Retry-After'),
      'Retry-After header'
    );
    Assert.areEqual('0', res.headers.get('X-RateLimit-Remaining'), 'None left');
    Assert.areEqual('RATE_LIMIT_EXCEEDED', body.get('errorCode'), 'Code');
    Assert.areEqual(true, body.get('retryable'), '429 is retryable');
    Assert.areEqual(
      tierLimit + 1,
      [SELECT Count__c FROM API_Rate_Window__c LIMIT 1].Count__c.intValue(),
      'Every call, including the rejected one, is counted in one row'
    );
  }

  @IsTest
  static void newMinuteStartsANewWindow() {
    RateWindowLimiter.nowOverride = FIXED_NOW;
    insertWindow(CALLER_KEY, 15);
    RateWindowLimiter.nowOverride = FIXED_NOW.addMinutes(1);

    Test.startTest();
    ApiRequestContext.RateDecision decision = new RateWindowLimiter()
      .checkKey(CALLER_KEY, 15);
    RateWindowLimiter.commitPending();
    Test.stopTest();

    Assert.isTrue(decision.allowed, 'A new minute resets the count');
    Assert.areEqual(
      2,
      [SELECT COUNT() FROM API_Rate_Window__c],
      'One row per caller key per minute'
    );
  }

  // ---------- Contract C2: no DML before a callout

  @IsTest
  static void calloutAfterCheckOnLockedRowSucceeds() {
    RateWindowLimiter.nowOverride = FIXED_NOW;
    ApiRequestContext.limiterOverride = null;
    RestTestUtil.initGet(PAPI_URI);
    String key = RateWindowLimiter.callerKeyFor('papi');
    insertWindow(key, 3);
    Test.setMock(HttpCalloutMock.class, new OkCalloutMock());

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    HttpResponse calloutResponse = callOut();
    ctx.ok(new Map<String, Object>{ 'status' => calloutResponse.getBody() });
    Test.stopTest();

    Assert.areEqual(200, calloutResponse.getStatusCode(), 'Callout ran');
    Assert.areEqual(200, RestTestUtil.getResponse().statusCode, 'Response OK');
    Assert.areEqual(
      4,
      storedWindow(key).Count__c,
      'Count written by ok() after the callout'
    );
  }

  @IsTest
  static void calloutAfterCheckOnNewWindowSucceeds() {
    RateWindowLimiter.nowOverride = FIXED_NOW;
    RestTestUtil.initGet(PAPI_URI);
    String key = RateWindowLimiter.callerKeyFor('papi');
    Test.setMock(HttpCalloutMock.class, new OkCalloutMock());

    Test.startTest();
    ApiRequestContext ctx = ApiRequestContext.begin();
    HttpResponse calloutResponse = callOut();
    ctx.error(502, 'BAD_GATEWAY', 'Upstream failed');
    Test.stopTest();

    Assert.areEqual(200, calloutResponse.getStatusCode(), 'Callout ran');
    Assert.areEqual(
      1,
      storedWindow(key).Count__c,
      'Count written by error() after the callout'
    );
  }

  @IsTest
  static void calloutAfterUncommittedDmlIsRefused() {
    // Control for the two tests above: proves the test runtime enforces the rule they rely on.
    RateWindowLimiter.nowOverride = FIXED_NOW;
    Test.setMock(HttpCalloutMock.class, new OkCalloutMock());

    Test.startTest();
    new RateWindowLimiter().checkKey(CALLER_KEY, 15);
    RateWindowLimiter.commitPending();
    try {
      callOut();
      Assert.fail('A callout after uncommitted DML must be refused');
    } catch (CalloutException e) {
      Assert.isTrue(
        e.getMessage().containsIgnoreCase('uncommitted work'),
        'Platform names uncommitted work: ' + e.getMessage()
      );
    }
    Test.stopTest();
  }

  @IsTest
  static void commitRateCountsWritesWithoutRestResponse() {
    // Contract C4: an Aura caller has no RestContext and never reaches ok() or error().
    RateWindowLimiter.nowOverride = FIXED_NOW;
    RestContext.request = null;
    RestContext.response = null;
    Test.setMock(HttpCalloutMock.class, new OkCalloutMock());

    Test.startTest();
    ApiRequestContext.RateDecision decision = ApiRequestContext.rateLimiter()
      .checkKey(CALLER_KEY, 15);
    HttpResponse calloutResponse = callOut();
    ApiRequestContext.commitRateCounts();
    Test.stopTest();

    Assert.isTrue(decision.allowed, 'First request allowed');
    Assert.areEqual(200, calloutResponse.getStatusCode(), 'Callout ran');
    Assert.areEqual(
      1,
      storedWindow(CALLER_KEY).Count__c,
      'Count written by commitRateCounts()'
    );
  }

  @IsTest
  static void commitRateCountsIsNoOpForStatelessLimiter() {
    ApiRequestContext.limiterOverride = new HeadersOnlyRateLimiter();

    Test.startTest();
    ApiRequestContext.rateLimiter().checkKey(CALLER_KEY, 15);
    ApiRequestContext.commitRateCounts();
    Integer dml = Limits.getDmlStatements();
    Test.stopTest();

    Assert.areEqual(0, dml, 'Nothing to write for a stateless limiter');
  }

  // ---------- Concurrency

  @IsTest
  static void concurrentInsertIsMergedNotLost() {
    RateWindowLimiter.nowOverride = FIXED_NOW;

    Test.startTest();
    new RateWindowLimiter().checkKey(CALLER_KEY, 15);
    // Another transaction creates the same window between this check and its commit.
    insertWindow(CALLER_KEY, 2);
    RateWindowLimiter.commitPending();
    Test.stopTest();

    Assert.areEqual(
      1,
      [SELECT COUNT() FROM API_Rate_Window__c],
      'Still one row for the key and minute'
    );
    Assert.areEqual(
      3,
      storedWindow(CALLER_KEY).Count__c,
      'Both transactions are counted'
    );
  }

  @IsTest
  static void commitWithNothingPendingWritesNothing() {
    Test.startTest();
    RateWindowLimiter.commitPending();
    Integer dml = Limits.getDmlStatements();
    Test.stopTest();

    Assert.areEqual(0, dml, 'No DML when nothing was checked');
  }

  // ---------- Keys

  @IsTest
  static void tierKeyUsesSessionHash() {
    RateWindowLimiter.useSessionIdOverride = true;
    RateWindowLimiter.sessionIdOverride = 'session-one';

    Test.startTest();
    String first = RateWindowLimiter.callerKeyFor('sapi');
    RateWindowLimiter.sessionIdOverride = 'session-two';
    String second = RateWindowLimiter.callerKeyFor('sapi');
    Test.stopTest();

    String expected =
      'sapi:' +
      EncodingUtil.convertToHex(
        Crypto.generateDigest('SHA-256', Blob.valueOf('session-one'))
      );
    Assert.areEqual(expected, first, 'Tier plus SHA-256 hex of the session');
    Assert.areNotEqual(first, second, 'Each session is its own bucket');
  }

  @IsTest
  static void tierKeyFallsBackToUserWithoutSession() {
    RateWindowLimiter.useSessionIdOverride = true;
    RateWindowLimiter.sessionIdOverride = null;

    Test.startTest();
    String key = RateWindowLimiter.callerKeyFor('papi');
    Test.stopTest();

    Assert.areEqual(
      'papi:' + UserInfo.getUserId(),
      key,
      'User id when there is no session'
    );
  }

  @IsTest
  static void longCallerKeyIsHashedToFit() {
    String longKey = 'x'.repeat(300);

    Test.startTest();
    String key = RateWindowLimiter.windowKeyOf(longKey, FIXED_NOW);
    String shortKey = RateWindowLimiter.windowKeyOf('x'.repeat(242), FIXED_NOW);
    Test.stopTest();

    Assert.isTrue(key.startsWith('sha256:'), 'Over-long keys are hashed');
    Assert.isTrue(key.length() <= 255, 'Fits Key__c');
    Assert.areEqual(255, shortKey.length(), 'Longest unhashed key fits');
  }
}

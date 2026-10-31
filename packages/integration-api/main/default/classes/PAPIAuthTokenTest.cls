/**
 * @description       : Unit tests for PAPIAuthToken (POST /papi/v1/auth/token): status codes,
 *                      response body and headers, and one audit row per attempt.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class PAPIAuthTokenTest {
  private static final String URI = '/services/apexrest/papi/v1/auth/token';
  private static final String IP = '198.51.100.23';
  private static final String VALID_BODY = '{"email":"reviewer@example.com","purpose":"Evaluating API contract parity"}';

  private class FakeLimiter implements ApiRateLimiter {
    Boolean allowTier = true;
    Boolean allowKey = true;

    public ApiRequestContext.RateDecision check(
      String tierKey,
      Integer limitPerMinute
    ) {
      return new ApiRequestContext.RateDecision(
        allowTier,
        limitPerMinute,
        allowTier ? limitPerMinute - 1 : 0,
        allowTier ? 0 : 30
      );
    }

    public ApiRequestContext.RateDecision checkKey(
      String callerKey,
      Integer limitPerMinute
    ) {
      return new ApiRequestContext.RateDecision(
        allowKey,
        limitPerMinute,
        allowKey ? limitPerMinute - 1 : 0,
        allowKey ? 0 : 42
      );
    }
  }

  private static FakeLimiter installLimiter() {
    FakeLimiter limiter = new FakeLimiter();
    ApiRequestContext.limiterOverride = limiter;
    return limiter;
  }

  private static void initPost(String body, Map<String, String> headers) {
    RestRequest req = new RestRequest();
    req.requestURI = URI;
    req.httpMethod = 'POST';
    req.remoteAddress = IP;
    req.requestBody = body == null ? null : Blob.valueOf(body);
    for (String name : headers.keySet()) {
      req.addHeader(name, headers.get(name));
    }
    RestContext.request = req;
    RestContext.response = new RestResponse();
  }

  private static void initPost(String body) {
    initPost(
      body,
      new Map<String, String>{
        'X-API-Version' => 'v1',
        'Content-Type' => 'application/json'
      }
    );
  }

  private static Map<String, Object> responseBody() {
    return (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
  }

  private static void assertOneRow(String outcome) {
    List<API_Access_Request__c> rows = [
      SELECT Outcome__c, Channel__c, Source_IP__c
      FROM API_Access_Request__c
    ];
    Assert.areEqual(1, rows.size(), 'Exactly one audit row per attempt');
    Assert.areEqual(outcome, rows[0].Outcome__c, 'Audit outcome');
    Assert.areEqual('REST', rows[0].Channel__c, 'Channel');
    Assert.areEqual(IP, rows[0].Source_IP__c, 'Source IP from remoteAddress');
  }

  private static void assertNoStore() {
    Assert.areEqual(
      'no-store, no-cache',
      RestContext.response.headers.get('Cache-Control'),
      'Cache-Control'
    );
  }

  @IsTest
  static void shouldReturn200WithTokenWhenRequestIsValid() {
    installLimiter();
    Test.setMock(HttpCalloutMock.class, new PortfolioApiCalloutMock());
    initPost(VALID_BODY);

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(200, RestContext.response.statusCode, 'Issued');
    Map<String, Object> body = responseBody();
    Assert.areEqual(
      new Set<String>{ 'access_token', 'token_type', 'instance_url', 'docs' },
      body.keySet(),
      'Body keys match the spec'
    );
    Assert.areEqual(
      PortfolioApiCalloutMock.TEST_ACCESS_TOKEN,
      body.get('access_token'),
      'Token'
    );
    Assert.isFalse(body.containsKey('expires_in'), 'No expires_in');
    assertNoStore();
    assertOneRow('Issued');
  }

  @IsTest
  static void shouldReturn400WhenEmailIsInvalid() {
    installLimiter();
    initPost('{"email":"nobody","purpose":"x"}');

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(400, RestContext.response.statusCode, 'Bad email');
    Assert.areEqual('BAD_REQUEST', responseBody().get('errorCode'), 'Code');
    assertNoStore();
    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldReturn400WhenBodyIsNotJson() {
    installLimiter();
    initPost('email=a@b.com');

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(400, RestContext.response.statusCode, 'Not JSON');
    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldReturn400WhenBodyIsEmpty() {
    installLimiter();
    initPost(null);

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(400, RestContext.response.statusCode, 'Empty');
    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldReturn400WhenBodyIsAnArray() {
    installLimiter();
    initPost('["reviewer@example.com"]');

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(400, RestContext.response.statusCode, 'Array');
    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldReturn400WhenEmailIsNotAString() {
    installLimiter();
    initPost('{"email":42,"purpose":"x"}');

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(400, RestContext.response.statusCode, 'Number email');
    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldReturn429WithRetryAfterWhenEmailIpLimitRefuses() {
    FakeLimiter limiter = installLimiter();
    limiter.allowKey = false;
    initPost(VALID_BODY);

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(429, RestContext.response.statusCode, 'Rate limited');
    Assert.areEqual(
      '42',
      RestContext.response.headers.get('Retry-After'),
      'Retry-After'
    );
    Assert.areEqual(
      String.valueOf(TokenExchangeService.TOKEN_REQUESTS_PER_MINUTE),
      RestContext.response.headers.get('X-RateLimit-Limit'),
      'Limit header carries the token limit'
    );
    Assert.areEqual(
      'RATE_LIMIT_EXCEEDED',
      responseBody().get('errorCode'),
      'Code'
    );
    assertNoStore();
    assertOneRow('Rate_Limited');
  }

  @IsTest
  static void shouldReturn429AndAuditWhenTierLimitRefuses() {
    FakeLimiter limiter = installLimiter();
    limiter.allowTier = false;
    PortfolioApiCalloutMock mock = new PortfolioApiCalloutMock();
    Test.setMock(HttpCalloutMock.class, mock);
    initPost(VALID_BODY);

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(429, RestContext.response.statusCode, 'Tier limit');
    Assert.areEqual(0, mock.requests.size(), 'No callout');
    assertOneRow('Rate_Limited');
  }

  @IsTest
  static void shouldReturn400AndAuditWhenApiVersionIsUnsupported() {
    installLimiter();
    initPost(VALID_BODY, new Map<String, String>{ 'X-API-Version' => 'v9' });

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(400, RestContext.response.statusCode, 'Bad version');
    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldReturn503WhenDailyCapReached() {
    installLimiter();
    TokenExchangeService.configOverride = new Portfolio_Config__mdt(
      Token_Daily_Cap__c = 0
    );
    initPost(VALID_BODY);

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(503, RestContext.response.statusCode, 'Cap');
    Assert.areEqual(
      'SERVICE_UNAVAILABLE',
      responseBody().get('errorCode'),
      'Code'
    );
    Assert.isNotNull(
      RestContext.response.headers.get('Retry-After'),
      'Retry-After until tomorrow'
    );
    assertOneRow('Cap_Reached');
  }

  @IsTest
  static void shouldReturn503WhenCredentialIsMissing() {
    installLimiter();
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock()
        .withTokenResponse(400, '{"error":"invalid_client_id"}')
    );
    initPost(VALID_BODY);

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(503, RestContext.response.statusCode, 'Not configured');
    Assert.areEqual(
      false,
      responseBody().get('retryable'),
      'Retrying cannot fix a missing credential'
    );
    Assert.isNull(
      RestContext.response.headers.get('Retry-After'),
      'No Retry-After for an error that cannot recover'
    );
    assertNoStore();
    assertOneRow('Credential_Missing');
  }

  @IsTest
  static void shouldReturn400WhenTheBodyIsTheTextNull() {
    installLimiter();
    initPost('null');

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(400, RestContext.response.statusCode, 'null is no object');
    Assert.areEqual('BAD_REQUEST', responseBody().get('errorCode'), 'Code');
    Assert.isFalse(
      RestContext.response.responseBody.toString().contains('NullPointer'),
      'No exception type reaches the caller'
    );
    assertNoStore();
    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldKeepAnRecoverableFailureRetryableWithRetryAfter() {
    installLimiter();
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock().withTokenResponse(500, 'not json')
    );
    initPost(VALID_BODY);

    Test.startTest();
    PAPIAuthToken.requestToken();
    Test.stopTest();

    Assert.areEqual(503, RestContext.response.statusCode, 'Exchange failed');
    Assert.areEqual(true, responseBody().get('retryable'), 'Retryable');
    Assert.areEqual(
      String.valueOf(ApiRequestContext.DEFAULT_RETRY_AFTER_SECONDS),
      RestContext.response.headers.get('Retry-After'),
      'A 503 that can recover carries Retry-After'
    );
  }
}

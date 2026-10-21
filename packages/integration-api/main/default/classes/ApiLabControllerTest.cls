/**
 * @description       : Unit tests for ApiLabController: path allowlist, proxied request
 *                      headers, returned header set, and the shared token path.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 **/
@IsTest
private class ApiLabControllerTest {
  private static final Pattern UUID_PATTERN = Pattern.compile(
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

  private class AllowAllLimiter implements ApiRateLimiter {
    public ApiRequestContext.RateDecision check(
      String tierKey,
      Integer limitPerMinute
    ) {
      return new ApiRequestContext.RateDecision(
        true,
        limitPerMinute,
        limitPerMinute,
        0
      );
    }

    public ApiRequestContext.RateDecision checkKey(
      String callerKey,
      Integer limitPerMinute
    ) {
      return new ApiRequestContext.RateDecision(
        true,
        limitPerMinute,
        limitPerMinute,
        0
      );
    }
  }

  private static Map<String, String> apiHeaders() {
    return new Map<String, String>{
      'X-Request-Id' => '3f2b9c1e-8a4d-4e6b-9c2f-1a2b3c4d5e6f',
      'X-RateLimit-Limit' => '120',
      'X-RateLimit-Remaining' => '119',
      'Cache-Control' => 'max-age=300, public',
      'X-Total-Count' => '12',
      'X-Has-More' => 'false',
      'Set-Cookie' => 'ignored=1'
    };
  }

  @IsTest
  static void shouldProxyAllowedPathWithTracingHeadersWhenInvoked() {
    PortfolioApiCalloutMock mock = new PortfolioApiCalloutMock()
      .withRestResponse(200, '[{"id":"a"}]', apiHeaders());
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    ApiLabController.InvokeResult result = ApiLabController.invoke(
      '/sapi/v1/skills',
      new Map<String, String>{ 'limit' => '5', 'category' => 'Apex & LWC' }
    );
    Test.stopTest();

    HttpRequest sent = mock.requests[0];
    Assert.areEqual(
      'callout:Portfolio_API/services/apexrest/sapi/v1/skills?category=Apex+%26+LWC&limit=5',
      sent.getEndpoint(),
      'Endpoint through Portfolio_API with encoded params'
    );
    Assert.areEqual('GET', sent.getMethod(), 'GET only');
    Assert.isTrue(
      UUID_PATTERN.matcher(sent.getHeader('X-Request-Id')).matches(),
      'Fresh UUID X-Request-Id'
    );
    Assert.areEqual(result.requestId, sent.getHeader('X-Request-Id'), 'Id');
    Assert.areEqual('v1', sent.getHeader('X-API-Version'), 'Version header');
    Assert.areEqual(200, result.statusCode, 'Status');
    Assert.areEqual('[{"id":"a"}]', result.body, 'Body');
    Assert.areEqual('Portfolio_API', result.namedCredential, 'NC name');
    Assert.isTrue(result.latencyMs >= 0, 'Latency measured');
  }

  @IsTest
  static void shouldReturnTheHeaderSetWhenApiReturnsThem() {
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock().withRestResponse(200, '[]', apiHeaders())
    );

    Test.startTest();
    ApiLabController.InvokeResult result = ApiLabController.invoke(
      '/papi/v1/projects/featured',
      null
    );
    Test.stopTest();

    Assert.areEqual(
      new Set<String>(ApiLabController.RETURNED_HEADERS),
      result.headers.keySet(),
      'Exactly the documented header set'
    );
    Assert.areEqual('119', result.headers.get('X-RateLimit-Remaining'), 'Val');
    Assert.areEqual(
      'max-age=300, public',
      result.headers.get('Cache-Control'),
      'Cache-Control passed through'
    );
  }

  @IsTest
  static void shouldReturnNonSuccessStatusWhenApiAnswersWithError() {
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock()
        .withRestResponse(400, '{"errorCode":"BAD_REQUEST"}', null)
    );

    Test.startTest();
    ApiLabController.InvokeResult result = ApiLabController.invoke(
      '/SAPI/v1/Projects',
      new Map<String, String>()
    );
    Test.stopTest();

    Assert.areEqual(400, result.statusCode, 'Status passed through');
    Assert.areEqual('/sapi/v1/projects', result.path, 'Path normalised');
    Assert.isTrue(result.headers.isEmpty(), 'No headers returned');
  }

  @IsTest
  static void shouldRejectUnlistedPathWhenInvoked() {
    PortfolioApiCalloutMock mock = new PortfolioApiCalloutMock();
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    try {
      ApiLabController.invoke('/services/data/v64.0/sobjects/User', null);
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('not available'), 'Message');
    }
    Test.stopTest();

    Assert.areEqual(0, mock.requests.size(), 'No callout for an unlisted path');
  }

  @IsTest
  static void shouldRejectTokenPathWhenInvoked() {
    Test.startTest();
    try {
      ApiLabController.invoke('/papi/v1/auth/token', null);
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('not available'), 'POST path');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldRejectBlankPathWhenInvoked() {
    Test.startTest();
    try {
      ApiLabController.invoke(null, null);
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('not available'), 'Blank');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldRejectBadParamNameWhenInvoked() {
    Test.startTest();
    try {
      ApiLabController.invoke(
        '/sapi/v1/skills',
        new Map<String, String>{ 'a&b' => '1' }
      );
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('name'), 'Param name');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldRejectNullParamValueWhenInvoked() {
    Test.startTest();
    try {
      ApiLabController.invoke(
        '/sapi/v1/skills',
        new Map<String, String>{ 'limit' => null }
      );
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('value'), 'Param value');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldRejectTooManyParamsWhenInvoked() {
    Map<String, String> params = new Map<String, String>();
    for (Integer i = 0; i < 11; i++) {
      params.put('p' + i, '1');
    }

    Test.startTest();
    try {
      ApiLabController.invoke('/sapi/v1/skills', params);
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('Too many'), 'Count');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldWrapCalloutFailureWhenApiIsUnreachable() {
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock().throwing('Read timed out')
    );

    Test.startTest();
    try {
      ApiLabController.invoke('/papi/v1/health', null);
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('could not be reached'), 'Msg');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldIssueTokenThroughSharedPathWhenRequestedFromApiLab() {
    ApiRequestContext.limiterOverride = new AllowAllLimiter();
    Test.setMock(HttpCalloutMock.class, new PortfolioApiCalloutMock());

    Test.startTest();
    ApiLabController.TokenResult result = ApiLabController.requestEvaluatorToken(
      'reviewer@example.com',
      'API Lab'
    );
    Test.stopTest();

    Assert.areEqual(200, result.statusCode, 'Issued');
    Assert.areEqual(
      PortfolioApiCalloutMock.TEST_ACCESS_TOKEN,
      result.token.get('access_token'),
      'Token'
    );
    API_Access_Request__c row = [
      SELECT Outcome__c, Channel__c, Source_IP__c, Correlation_Id__c
      FROM API_Access_Request__c
    ];
    Assert.areEqual('Issued', row.Outcome__c, 'Outcome');
    Assert.areEqual('Aura', row.Channel__c, 'Channel');
    Assert.areEqual(
      TokenExchangeService.IP_UNAVAILABLE,
      row.Source_IP__c,
      'No session IP in a test context'
    );
    Assert.areEqual(result.correlationId, row.Correlation_Id__c, 'Id');
  }

  @IsTest
  static void shouldReturn400WithoutTokenWhenApiLabEmailIsInvalid() {
    ApiRequestContext.limiterOverride = new AllowAllLimiter();

    Test.startTest();
    ApiLabController.TokenResult result = ApiLabController.requestEvaluatorToken(
      'bad',
      'API Lab'
    );
    Test.stopTest();

    Assert.areEqual(400, result.statusCode, 'Rejected');
    Assert.areEqual('BAD_REQUEST', result.errorCode, 'Code');
    Assert.isNull(result.token, 'No token');
    Assert.areEqual(
      1,
      [
        SELECT COUNT()
        FROM API_Access_Request__c
        WHERE Outcome__c = 'Invalid_Request'
      ],
      'One audit row'
    );
  }

  @IsTest
  static void shouldFallBackToUnavailableWhenNoSessionExists() {
    Assert.areEqual(
      TokenExchangeService.IP_UNAVAILABLE,
      ApiLabController.auraSourceIp(),
      'Tests have no current session'
    );
  }

  @IsTest
  static void shouldUseSessionSourceIpWhenSessionHasOne() {
    ApiLabController.sessionOverride = new Map<String, String>{
      'SourceIp' => '192.0.2.10'
    };

    Assert.areEqual(
      '192.0.2.10',
      ApiLabController.auraSourceIp(),
      'SourceIp from the current session'
    );
  }
}

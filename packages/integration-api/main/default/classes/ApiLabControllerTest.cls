/**
 * @description       : Unit tests for ApiLabController: path allowlist, proxied request
 *                      headers, returned header set, and the shared token path.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
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
      'X-API-Version' => 'v1',
      'Deprecation' => '@1793491200',
      'Sunset' => 'Sun, 01 Nov 2026 00:00:00 GMT',
      'Link' => '<https://ryanbumstead.com/api-lab/reference?version=v2>; rel="successor-version"',
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

  // One call per test: the usage counter writes after the first callout.
  private static String versionSentFor(String chosen) {
    PortfolioApiCalloutMock mock = new PortfolioApiCalloutMock()
      .withRestResponse(200, '[]', apiHeaders());
    Test.setMock(HttpCalloutMock.class, mock);
    ApiLabController.invokeVersioned('/sapi/v1/skills', null, chosen);
    Assert.isTrue(
      mock.requests[0].getEndpoint().endsWith('/sapi/v1/skills'),
      'The path keeps its v1 spelling'
    );
    return mock.requests[0].getHeader('X-API-Version');
  }

  @IsTest
  static void shouldSendV1WhenInvokedVersionedWithV1() {
    Assert.areEqual('v1', versionSentFor('v1'), 'v1');
  }

  @IsTest
  static void shouldSendV2AndTrimWhenInvokedVersionedWithV2() {
    Assert.areEqual('v2', versionSentFor(' v2 '), 'v2');
  }

  @IsTest
  static void shouldDefaultToV2WhenVersionIsNull() {
    Assert.areEqual('v2', versionSentFor(null), 'Null means v2');
  }

  @IsTest
  static void shouldDefaultToV2WhenVersionIsBlank() {
    Assert.areEqual('v2', versionSentFor('  '), 'Blank means v2');
  }

  @IsTest
  static void shouldRejectAnUnknownVersionWhenInvokedVersioned() {
    try {
      ApiLabController.invokeVersioned('/sapi/v1/skills', null, 'v3');
      Assert.fail('v3 must be refused');
    } catch (AuraHandledException e) {
      Assert.areEqual(
        'Version is not available in the API Lab',
        e.getMessage(),
        'Message'
      );
    }
  }

  @IsTest
  static void shouldReturnTheDeprecationHeadersToTheLab() {
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock().withRestResponse(200, '[]', apiHeaders())
    );

    ApiLabController.InvokeResult result = ApiLabController.invokeVersioned(
      '/sapi/v1/skills',
      null,
      'v1'
    );

    Assert.areEqual('@1793491200', result.headers.get('Deprecation'), 'Dep');
    Assert.isNotNull(result.headers.get('Sunset'), 'Sunset');
    Assert.isTrue(
      result.headers.get('Link').contains('successor-version'),
      'Link'
    );
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
  static void shouldAllowEveryCatalogPathWhenCatalogIsTheResource() {
    // The org's API_Lab_Catalog, generated from the specs by scripts/sync-specs.js.
    Test.startTest();
    Set<String> allowed = ApiLabController.allowedPaths();
    Map<String, Object> catalog = (Map<String, Object>) JSON.deserializeUntyped(
      ApiLabController.getCatalog()
    );
    Test.stopTest();

    Assert.areEqual(
      ((List<Object>) catalog.get('paths')).size(),
      allowed.size(),
      'One allowed path per catalog entry'
    );
    Assert.isTrue(allowed.contains('/sapi/v1/skills'), 'A SAPI GET path');
    Assert.isTrue(
      allowed.contains('/papi/v1/testimonials/feed'),
      'A PAPI path'
    );
    Assert.isFalse(allowed.contains('/papi/v1/auth/token'), 'Excluded');
  }

  @IsTest
  static void shouldReadTheCatalogWhenGuestOpensTheLab() {
    User guest = SiteGuestTestSupport.preparedGuest();

    Set<String> allowed;
    String body;
    Test.startTest();
    System.runAs(guest) {
      allowed = ApiLabController.allowedPaths();
      body = ApiLabController.getCatalog();
    }
    Test.stopTest();

    Assert.isTrue(allowed.contains('/sapi/v1/health'), 'Guest reads it');
    Assert.isTrue(body.contains('"paths"'), 'Guest gets the catalog');
  }

  @IsTest
  static void shouldFollowTheCatalogWhenItLists() {
    ApiLabController.catalogOverride = '{"paths":[{"path":"/SAPI/v1/New-Path"},{"path":7}]}';

    Test.startTest();
    Set<String> allowed = ApiLabController.allowedPaths();
    Test.stopTest();

    Assert.areEqual(
      new Set<String>{ '/sapi/v1/new-path' },
      allowed,
      'Lower cased, non text entries skipped, no code change for a new path'
    );
  }

  @IsTest
  static void shouldRefuseEveryPathWhenCatalogIsBroken() {
    ApiLabController.catalogOverride = 'not json';
    PortfolioApiCalloutMock mock = new PortfolioApiCalloutMock();
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    try {
      ApiLabController.invoke('/sapi/v1/skills', null);
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('not available'), 'Fails closed');
    }
    Test.stopTest();

    Assert.areEqual(0, mock.requests.size(), 'No callout');
  }

  @IsTest
  static void shouldThrowWhenCatalogIsEmpty() {
    // An empty body stands in for a missing resource.
    ApiLabController.catalogOverride = '';

    Test.startTest();
    try {
      ApiLabController.getCatalog();
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('catalog'), 'Says what is missing');
    }
    Set<String> allowed = ApiLabController.allowedPaths();
    Test.stopTest();

    Assert.isTrue(allowed.isEmpty(), 'No catalog, no path');
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

  private static Decimal requestsCounted() {
    Decimal total = 0;
    for (Usage_Counter__c row : [
      SELECT Count__c
      FROM Usage_Counter__c
      WHERE Kind__c = 'Api_Lab_Request'
    ]) {
      total += row.Count__c;
    }
    return total;
  }

  @IsTest
  static void shouldCountOneRequestWhenTheApiAnswers() {
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock().withRestResponse(200, '[]', apiHeaders())
    );
    User guest = SiteGuestTestSupport.preparedGuest();

    Test.startTest();
    System.runAs(guest) {
      ApiLabController.invoke('/sapi/v1/skills', null);
    }
    Test.stopTest();

    Assert.areEqual(1, requestsCounted(), 'One request, one count');
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Usage_Counter__c WHERE Kind__c = 'Cover_Letter'],
      'The other kind is untouched'
    );
  }

  @IsTest
  static void shouldCountARequestWhenTheApiAnswersWithAnError() {
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock().withRestResponse(400, '{}', null)
    );

    Test.startTest();
    ApiLabController.invoke('/sapi/v1/skills', null);
    Test.stopTest();

    Assert.areEqual(1, requestsCounted(), 'The request was sent, so it counts');
  }

  @IsTest
  static void shouldNotCountWhenThePathIsRefusedOrTheApiIsUnreachable() {
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock().throwing('Read timed out')
    );

    Test.startTest();
    try {
      ApiLabController.invoke('/services/data/v64.0/sobjects/User', null);
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('not available'), 'Refused');
    }
    try {
      ApiLabController.invoke('/papi/v1/health', null);
    } catch (AuraHandledException e) {
      Assert.isTrue(e.getMessage().contains('could not be reached'), 'Down');
    }
    Test.stopTest();

    Assert.areEqual(0, requestsCounted(), 'No request sent, no count');
  }

  @IsTest
  static void shouldReturnTheSameResultWhenTheCounterWriteFails() {
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock()
        .withRestResponse(200, '[{"id":"a"}]', apiHeaders())
    );
    UsageCounterWriter.failForTest = true;

    Test.startTest();
    ApiLabController.InvokeResult result = ApiLabController.invoke(
      '/sapi/v1/skills',
      null
    );
    Test.stopTest();

    Assert.areEqual(200, result.statusCode, 'Status unchanged');
    Assert.areEqual('[{"id":"a"}]', result.body, 'Body unchanged');
    Assert.areEqual(0, requestsCounted(), 'Nothing was counted');
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

  private static API_Rate_Window__c tokenWindow() {
    return [
      SELECT Key__c, Count__c
      FROM API_Rate_Window__c
      WHERE Key__c LIKE 'papi-token:%'
    ];
  }

  @IsTest
  static void shouldWriteAndIncrementRateWindowWhenApiLabRequestsTokens() {
    // Real default limiter: no limiterOverride. Fixed clock keeps both calls in one window.
    RateWindowLimiter.nowOverride = Datetime.newInstanceGmt(
      2026,
      10,
      20,
      12,
      30,
      15
    );
    Test.setMock(HttpCalloutMock.class, new PortfolioApiCalloutMock());
    String expectedKey =
      TokenExchangeService.rateKey(
        'reviewer@example.com',
        TokenExchangeService.IP_UNAVAILABLE
      ) + '|202610201230';

    ApiLabController.TokenResult first = ApiLabController.requestEvaluatorToken(
      'reviewer@example.com',
      'API Lab'
    );
    API_Rate_Window__c afterFirst = tokenWindow();

    Test.startTest();
    ApiLabController.TokenResult second = ApiLabController.requestEvaluatorToken(
      'Reviewer@Example.com',
      'API Lab again'
    );
    Test.stopTest();

    API_Rate_Window__c afterSecond = tokenWindow();
    Assert.areEqual(200, first.statusCode, 'First token issued');
    Assert.areEqual(200, second.statusCode, 'Second token issued');
    Assert.areEqual(
      expectedKey,
      afterFirst.Key__c,
      'Window keyed papi-token:<hash>|minute'
    );
    Assert.areEqual(
      1,
      afterFirst.Count__c.intValue(),
      'First call written by commitRateCounts'
    );
    Assert.areEqual(afterFirst.Id, afterSecond.Id, 'Same window row');
    Assert.areEqual(
      2,
      afterSecond.Count__c.intValue(),
      'Second call increments the count'
    );
  }

  @IsTest
  static void shouldRefuse429WhenApiLabCountReachesTokenLimit() {
    RateWindowLimiter.nowOverride = Datetime.newInstanceGmt(
      2026,
      10,
      20,
      12,
      30,
      15
    );
    String windowKey =
      TokenExchangeService.rateKey(
        'reviewer@example.com',
        TokenExchangeService.IP_UNAVAILABLE
      ) + '|202610201230';
    insert new API_Rate_Window__c(
      Key__c = windowKey,
      Window_Start__c = Datetime.newInstanceGmt(2026, 10, 20, 12, 30, 0),
      Count__c = TokenExchangeService.TOKEN_REQUESTS_PER_MINUTE
    );

    Test.startTest();
    ApiLabController.TokenResult result = ApiLabController.requestEvaluatorToken(
      'reviewer@example.com',
      'API Lab'
    );
    Test.stopTest();

    Assert.areEqual(429, result.statusCode, 'Limit reached');
    Assert.areEqual(
      TokenExchangeService.TOKEN_REQUESTS_PER_MINUTE + 1,
      tokenWindow().Count__c.intValue(),
      'Refused request is counted and written'
    );
  }
}

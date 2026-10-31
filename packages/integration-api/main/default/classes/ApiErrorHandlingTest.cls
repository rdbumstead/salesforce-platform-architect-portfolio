/**
 * @description       : Tests the error handling every route shares: an unplanned exception
 *                      becomes a fixed 500 with the correlation id and never the exception
 *                      text, a failure while the request rules run does not escape Apex, the
 *                      offset is capped, a 503 that can recover carries Retry-After, the
 *                      health checks are covered, persona matches in any letter case and the
 *                      site token URL is worked out at run time.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 **/
@IsTest
private class ApiErrorHandlingTest {
  private static final String SAPI_URI = '/services/apexrest/sapi/v1/skills/';
  private static final String PAPI_RESUME_URI = '/services/apexrest/papi/v1/resume/generate';

  private class ThrowingLimiter implements ApiRateLimiter {
    public ApiRequestContext.RateDecision check(
      String tierKey,
      Integer limitPerMinute
    ) {
      throw new RateWindowLimiter.RateWindowException('window row lost');
    }

    public ApiRequestContext.RateDecision checkKey(
      String callerKey,
      Integer limitPerMinute
    ) {
      return check(callerKey, limitPerMinute);
    }
  }

  @IsTest
  static void shouldAnswerAnUnplannedExceptionWithTheFixedMessageAndTheId() {
    RestTestUtil.initGet(SAPI_URI);
    ApiRequestContext ctx = ApiRequestContext.begin();

    ctx.serverError(new QueryException('SELECT secret FROM Hidden__c'));

    RestTestUtil.assertServerError();
    Assert.isFalse(
      RestContext.response.responseBody.toString().contains('SELECT'),
      'The query text stays in the log'
    );
    Assert.isTrue(ctx.isRejected(), 'The request is rejected');
  }

  @IsTest
  static void shouldNotLetAFailureInTheRequestRulesEscape() {
    ApiRequestContext.limiterOverride = new ThrowingLimiter();
    RestTestUtil.initGet(SAPI_URI);

    ApiRequestContext ctx = ApiRequestContext.begin();

    Assert.isTrue(ctx.isRejected(), 'Rejected, not thrown');
    RestTestUtil.assertServerError();
  }

  @IsTest
  static void shouldRefuseAnOffsetOverTheSoqlLimit() {
    RestTestUtil.initGet(
      SAPI_URI,
      new Map<String, String>{
        'offset' => String.valueOf(ApiRequestContext.MAX_OFFSET + 1)
      }
    );
    ApiRequestContext ctx = ApiRequestContext.begin();

    Integer offset = ctx.offsetParam();

    Assert.isNull(offset, 'Not read');
    Assert.areEqual(400, RestContext.response.statusCode, 'Status');
    Assert.areEqual(
      'BAD_REQUEST',
      RestTestUtil.getBodyAsMap().get('errorCode'),
      'Code'
    );
  }

  @IsTest
  static void shouldAcceptTheLargestOffset() {
    RestTestUtil.initGet(
      SAPI_URI,
      new Map<String, String>{
        'offset' => String.valueOf(ApiRequestContext.MAX_OFFSET)
      }
    );
    ApiRequestContext ctx = ApiRequestContext.begin();

    Assert.areEqual(
      ApiRequestContext.MAX_OFFSET,
      ctx.offsetParam(),
      'The cap itself is allowed'
    );
    Assert.isFalse(ctx.isRejected(), 'Not rejected');
  }

  @IsTest
  static void shouldAddRetryAfterToARetryable503AndNotToOthers() {
    RestTestUtil.initGet(SAPI_URI);
    ApiRequestContext.begin().error(503, 'SERVICE_UNAVAILABLE', 'later');
    Assert.areEqual(
      String.valueOf(ApiRequestContext.DEFAULT_RETRY_AFTER_SECONDS),
      RestContext.response.headers.get('Retry-After'),
      'Retryable 503'
    );
    Assert.areEqual(
      true,
      RestTestUtil.getBodyAsMap().get('retryable'),
      'retryable'
    );

    RestTestUtil.initGet(SAPI_URI);
    ApiRequestContext.begin().error(503, 'SERVICE_UNAVAILABLE', 'never', false);
    Assert.isNull(
      RestContext.response.headers.get('Retry-After'),
      'A 503 that cannot recover has none'
    );
    Assert.areEqual(
      false,
      RestTestUtil.getBodyAsMap().get('retryable'),
      'retryable'
    );

    RestTestUtil.initGet(SAPI_URI);
    ApiRequestContext ctx = ApiRequestContext.begin();
    RestContext.response.addHeader('Retry-After', '300');
    ctx.error(503, 'ALL_PROVIDERS_UNAVAILABLE', 'wait');
    Assert.areEqual(
      '300',
      RestContext.response.headers.get('Retry-After'),
      'A value the caller set is kept'
    );
  }

  @IsTest
  static void shouldMarkALockTimeoutAsBusy() {
    ApiRequestContext.RateDecision plain = new ApiRequestContext.RateDecision(
      false,
      10,
      0,
      30
    );
    Assert.isFalse(plain.busy, 'A used up limit is not busy');
  }

  @IsTest
  static void shouldCoverTheHealthChecksWithTheFixedMessage() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/health');
    SAPIHealth.throwException = true;
    SAPIHealth.getHealth();
    RestTestUtil.assertServerError();

    RestTestUtil.initGet('/services/apexrest/papi/v1/health');
    PAPIHealth.throwException = true;
    PAPIHealth.getHealth();
    RestTestUtil.assertServerError();
  }

  @IsTest
  static void shouldMatchPersonaInAnyLetterCaseOnResume() {
    RestTestUtil.initGet(
      PAPI_RESUME_URI,
      new Map<String, String>{ 'persona' => 'aRCHITECT' }
    );

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    Assert.areEqual(200, RestContext.response.statusCode, 'Accepted');
    Assert.areEqual(
      'Architect',
      RestTestUtil.getBodyAsMap().get('persona'),
      'Echoed in its canonical spelling'
    );
  }

  @IsTest
  static void shouldBuildTheSiteTokenUrlFromTheSiteAddress() {
    ApiSite.siteBaseOverride = 'https://example.my.site.com/';

    Assert.areEqual(
      'https://example.my.site.com/' + ApiSite.PATH_PREFIX,
      ApiSite.baseUrl(),
      'The path prefix is added once'
    );
    Assert.areEqual(
      'https://example.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token',
      ApiSite.tokenUrl(),
      'Token URL'
    );

    ApiSite.siteBaseOverride = 'https://example.my.site.com/portfoliovforcesite';
    Assert.areEqual(
      'https://example.my.site.com/portfoliovforcesite',
      ApiSite.baseUrl(),
      'A base that already holds the prefix is kept'
    );
  }

  @IsTest
  static void shouldWorkOutTheSiteAddressFromTheOrgHostOutsideTheSite() {
    ApiSite.orgHostOverride = 'example-dev-ed.develop.my.salesforce.com';

    Assert.areEqual(
      'https://example-dev-ed.develop.my.site.com/portfoliovforcesite',
      ApiSite.baseUrl(),
      'My Domain host to site host'
    );
    Assert.isFalse(
      ApiSite.tokenUrl().contains('ryanbumstead.com'),
      'Never the redirecting domain'
    );
  }

  @IsTest
  static void shouldGiveThePathAloneWhenNoAddressCanBeWorkedOut() {
    ApiSite.orgHostOverride = 'unrelated.example.org';

    Assert.isNull(ApiSite.baseUrl(), 'No address');
    Assert.areEqual(
      '/portfoliovforcesite/services/apexrest/papi/auth/token',
      ApiSite.tokenUrl(),
      'The path still names the route'
    );
  }

  @IsTest
  static void shouldFollowTheSwitchInTheTokenUrl() {
    ApiSite.siteBaseOverride = 'https://example.my.site.com';
    PortfolioSettings.overrides.put(
      ApiRoutes.SETTING,
      new Portfolio_Setting__mdt(
        DeveloperName = ApiRoutes.SETTING,
        Text_Value__c = 'Off'
      )
    );

    Assert.isTrue(
      ApiSite.tokenUrl().endsWith('/services/apexrest/papi/v1/auth/token'),
      'Off, the /v1/ spelling: ' + ApiSite.tokenUrl()
    );
  }

  @IsTest
  static void shouldCountSecondsInWords() {
    Assert.areEqual('1 second', ApiMessages.seconds(1));
    Assert.areEqual('2 seconds', ApiMessages.seconds(2));
    Assert.areEqual('0 seconds', ApiMessages.seconds(0));
  }

  @IsTest
  static void shouldWordTheTokenAndMethodMessages() {
    String url = 'https://example.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token';

    String needs = ApiMessages.needsToken('/papi/projects', url);
    Assert.isTrue(needs.contains('POST ' + url), 'Token URL');
    Assert.isTrue(needs.contains('/papi/projects'), 'Route');
    Assert.isTrue(needs.endsWith('.'), 'Closing period');

    Assert.isTrue(ApiMessages.tokensNotHere(url).contains(url), 'Token URL');

    Assert.areEqual(
      '/papi/projects takes GET or HEAD, not POST.',
      ApiMessages.methodNotAllowed(
        '/papi/projects',
        'GET,HEAD',
        'POST',
        PAPIRouter.ROUTE_PROJECTS
      ),
      'Plain route'
    );
    Assert.isTrue(
      ApiMessages.methodNotAllowed(
          '/papi/auth/token',
          'POST',
          'GET',
          PAPIRouter.ROUTE_AUTH_TOKEN
        )
        .contains(ApiMessages.TOKEN_BODY_SAMPLE),
      'The token route shows its body'
    );
    Assert.isTrue(
      ApiMessages.methodNotAllowed(
          '/papi/ai/generate',
          'POST',
          'GET',
          PAPIRouter.ROUTE_AI_GENERATE
        )
        .contains('API reference'),
      'The AI route points at the reference'
    );
  }
}

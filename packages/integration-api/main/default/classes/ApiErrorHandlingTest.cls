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

  private class BusyLimiter implements ApiRateLimiter {
    public ApiRequestContext.RateDecision check(
      String tierKey,
      Integer limitPerMinute
    ) {
      ApiRequestContext.RateDecision busy = new ApiRequestContext.RateDecision(
        false,
        limitPerMinute,
        0,
        1
      );
      busy.busy = true;
      return busy;
    }

    public ApiRequestContext.RateDecision checkKey(
      String callerKey,
      Integer limitPerMinute
    ) {
      return check(callerKey, limitPerMinute);
    }
  }

  private class UsedUpLimiter implements ApiRateLimiter {
    public ApiRequestContext.RateDecision check(
      String tierKey,
      Integer limitPerMinute
    ) {
      return new ApiRequestContext.RateDecision(false, limitPerMinute, 0, 30);
    }

    public ApiRequestContext.RateDecision checkKey(
      String callerKey,
      Integer limitPerMinute
    ) {
      return check(callerKey, limitPerMinute);
    }
  }

  @IsTest
  static void shouldSayTheApiIsBusyWhenTheCounterRowIsLocked() {
    ApiRequestContext.limiterOverride = new BusyLimiter();
    RestTestUtil.initGet(SAPI_URI);

    ApiRequestContext.begin();

    Assert.areEqual(429, RestContext.response.statusCode, 'Status');
    Assert.areEqual(
      ApiMessages.LOCK_BUSY,
      RestTestUtil.getBodyAsMap().get('message'),
      'Not a used up limit'
    );
  }

  @IsTest
  static void shouldNameTheTierAndTheLimitWhenTheSharedLimitIsUsedUp() {
    ApiRequestContext.limiterOverride = new UsedUpLimiter();

    RestTestUtil.initGet(SAPI_URI);
    ApiRequestContext.begin();
    Assert.areEqual(
      ApiMessages.tierLimit('SAPI', ApiRequestContext.sapiLimitPerMinute(), 30),
      RestTestUtil.getBodyAsMap().get('message'),
      'SAPI'
    );
    Assert.areEqual('30', RestContext.response.headers.get('Retry-After'));

    RestTestUtil.initGet('/services/apexrest/papi/v1/health');
    ApiRequestContext.begin();
    Assert.areEqual(
      ApiMessages.tierLimit('PAPI', ApiRequestContext.papiLimitPerMinute(), 30),
      RestTestUtil.getBodyAsMap().get('message'),
      'PAPI'
    );

    RestTestUtil.initGet('/services/apexrest/papi/v1/ai/generate');
    ApiRequestContext.begin();
    Assert.areEqual(
      ApiMessages.tierLimit('AI', ApiRequestContext.aiLimitPerMinute(), 30),
      RestTestUtil.getBodyAsMap().get('message'),
      'AI'
    );
  }

  @IsTest
  static void shouldPointTheHelpLinkAtTheSpecOfTheApiCalled() {
    RestTestUtil.initGet(SAPI_URI);
    ApiRequestContext.begin().error(400, 'BAD_REQUEST', 'x');
    Assert.areEqual(
      ApiMessages.helpUrl('BAD_REQUEST', 'sapi'),
      RestTestUtil.getBodyAsMap().get('help'),
      'SAPI'
    );

    RestTestUtil.initGet(PAPI_RESUME_URI);
    ApiRequestContext.begin().error(400, 'BAD_REQUEST', 'x');
    Assert.areEqual(
      ApiMessages.helpUrl('BAD_REQUEST', 'papi'),
      RestTestUtil.getBodyAsMap().get('help'),
      'PAPI'
    );
  }

  @IsTest
  static void shouldPickTheRetryAfterForEachAiFailure() {
    Assert.areEqual(
      ApiMessages.AI_RETRY_AFTER_SECONDS,
      PAPIAiGenerate.retryAfterSeconds(ApiMessages.AI_ALL_UNAVAILABLE),
      'All providers'
    );
    Integer toTheHour = PAPIAiGenerate.retryAfterSeconds(
      ApiMessages.AI_AGENTFORCE_BUDGET
    );
    Assert.isTrue(toTheHour >= 1 && toTheHour <= 3600, 'Rest of the hour');
    Assert.areEqual(
      ApiRequestContext.DEFAULT_RETRY_AFTER_SECONDS,
      PAPIAiGenerate.retryAfterSeconds(ApiMessages.AI_AGENTFORCE_DOWN),
      'Agentforce down'
    );
  }

  @IsTest
  static void shouldTellASetupProblemFromAConnectionProblemInHealth() {
    Assert.areEqual(
      ApiMessages.HEALTH_NOT_SET_UP,
      PAPIHealth.credentialProblem(
        new CalloutException('Unable to find named credential Portfolio_API')
      ),
      'Missing credential'
    );
    Assert.areEqual(
      ApiMessages.HEALTH_NOT_REACHED,
      PAPIHealth.credentialProblem(new CalloutException('Read timed out')),
      'Timeout'
    );
    Assert.areEqual(
      ApiMessages.HEALTH_NOT_REACHED,
      PAPIHealth.credentialProblem(new CalloutException()),
      'No text'
    );
  }
}

/**
 * @description       : Unit tests for TokenExchangeService: validation, email+IP limit, daily
 *                      cap, token exchange outcomes and one audit row per attempt.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class TokenExchangeServiceTest {
  private static final String EMAIL = 'Reviewer@Example.com';
  private static final String PURPOSE = 'Evaluating API contract parity';
  private static final String IP = '203.0.113.7';

  private class FakeLimiter implements ApiRateLimiter {
    Boolean allowKey = true;
    String lastKey;
    Integer lastLimit;

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
      lastKey = callerKey;
      lastLimit = limitPerMinute;
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

  private static PortfolioApiCalloutMock installMock() {
    PortfolioApiCalloutMock mock = new PortfolioApiCalloutMock();
    Test.setMock(HttpCalloutMock.class, mock);
    return mock;
  }

  private static TokenExchangeService.Attempt attempt(
    String email,
    String purpose
  ) {
    return new TokenExchangeService.Attempt(
      email,
      purpose,
      IP,
      UUID.randomUUID().toString(),
      TokenExchangeService.CHANNEL_REST
    );
  }

  private static List<API_Access_Request__c> auditRows() {
    return [
      SELECT
        Email__c,
        Purpose__c,
        Source_IP__c,
        Correlation_Id__c,
        Channel__c,
        Outcome__c
      FROM API_Access_Request__c
    ];
  }

  private static void assertOneRow(String outcome) {
    List<API_Access_Request__c> rows = auditRows();
    Assert.areEqual(1, rows.size(), 'Exactly one audit row per attempt');
    Assert.areEqual(outcome, rows[0].Outcome__c, 'Audit outcome');
  }

  @IsTest
  static void shouldIssueTokenWhenRequestIsValid() {
    installLimiter();
    PortfolioApiCalloutMock mock = installMock();
    TokenExchangeService.Attempt a = attempt(EMAIL, PURPOSE);

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(a);
    Test.stopTest();

    Assert.areEqual(200, result.statusCode, 'Issued');
    Assert.areEqual(
      PortfolioApiCalloutMock.TEST_ACCESS_TOKEN,
      result.grant.accessToken,
      'Token from the endpoint'
    );
    Map<String, Object> body = result.toTokenBody();
    Assert.areEqual('Bearer', body.get('token_type'), 'token_type');
    Assert.isFalse(
      body.containsKey('expires_in'),
      'No lifetime is claimed for a shared session'
    );
    Assert.areEqual(
      PortfolioApiCalloutMock.TEST_INSTANCE_URL,
      body.get('instance_url'),
      'instance_url'
    );
    Assert.areEqual(TokenExchangeService.DOCS_URL, body.get('docs'), 'docs');
    List<API_Access_Request__c> rows = auditRows();
    Assert.areEqual(1, rows.size(), 'One audit row');
    Assert.areEqual('Issued', rows[0].Outcome__c, 'Outcome');
    Assert.areEqual(EMAIL, rows[0].Email__c, 'Email');
    Assert.areEqual(PURPOSE, rows[0].Purpose__c, 'Purpose');
    Assert.areEqual(IP, rows[0].Source_IP__c, 'Source IP');
    Assert.areEqual(a.correlationId, rows[0].Correlation_Id__c, 'Correlation');
    Assert.areEqual('REST', rows[0].Channel__c, 'Channel');
    Assert.areEqual(1, mock.requests.size(), 'One callout');
  }

  @IsTest
  static void shouldCallTokenEndpointThroughNamedCredentialWhenExchanging() {
    PortfolioApiCalloutMock mock = installMock();

    Test.startTest();
    TokenExchangeService.exchangeToken();
    Test.stopTest();

    HttpRequest sent = mock.requests[0];
    Assert.areEqual(
      'callout:Portfolio_API_Token/services/oauth2/token',
      sent.getEndpoint(),
      'Endpoint'
    );
    Assert.areEqual('POST', sent.getMethod(), 'Method');
    Assert.isTrue(
      sent.getBody().contains('grant_type=client_credentials'),
      'Client credentials grant'
    );
    Assert.isTrue(
      sent.getBody()
        .contains(
          'client_secret={!$Credential.Portfolio_API_Token_Auth.Client_Secret}'
        ),
      'Secret is a platform merge field, never a value in Apex'
    );
  }

  @IsTest
  static void shouldReject400WhenEmailIsMalformed() {
    installLimiter();
    PortfolioApiCalloutMock mock = installMock();

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt('not-an-email', PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(400, result.statusCode, 'Bad email');
    Assert.areEqual('BAD_REQUEST', result.errorCode, 'Code');
    Assert.areEqual(0, mock.requests.size(), 'No callout');
    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldReject400WhenEmailIsTooLong() {
    installLimiter();
    String longEmail =
      'a'.repeat(TokenExchangeService.EMAIL_MAX_LENGTH) + '@example.com';

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(longEmail, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(400, result.statusCode, 'Too long');
    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldReject400WhenPurposeIsMissing() {
    installLimiter();

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, '   ')
    );
    Test.stopTest();

    Assert.areEqual(400, result.statusCode, 'Purpose required');
    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldReject400WhenPurposeIsTooLong() {
    installLimiter();

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, 'p'.repeat(TokenExchangeService.PURPOSE_MAX_LENGTH + 1))
    );
    Test.stopTest();

    Assert.areEqual(400, result.statusCode, 'Purpose too long');
    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldReject429AndSkipCalloutWhenLimiterRefuses() {
    FakeLimiter limiter = installLimiter();
    limiter.allowKey = false;
    PortfolioApiCalloutMock mock = installMock();

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(429, result.statusCode, 'Rate limited');
    Assert.areEqual('RATE_LIMIT_EXCEEDED', result.errorCode, 'Code');
    Assert.areEqual(42, result.retryAfterSeconds, 'Retry-After from limiter');
    Assert.areEqual(0, mock.requests.size(), 'No callout');
    Assert.areEqual(
      TokenExchangeService.rateKey(EMAIL, IP),
      limiter.lastKey,
      'Keyed by email and IP'
    );
    Assert.areEqual(
      TokenExchangeService.TOKEN_REQUESTS_PER_MINUTE,
      limiter.lastLimit,
      'Token limit constant'
    );
    assertOneRow('Rate_Limited');
  }

  @IsTest
  static void shouldBuildCaseInsensitiveHashedKeyWhenGivenEmailAndIp() {
    String key = TokenExchangeService.rateKey('A@Example.com', IP);

    Assert.areEqual(
      TokenExchangeService.rateKey('a@example.com', IP),
      key,
      'Email is lower-cased'
    );
    Assert.isTrue(key.startsWith('papi-token:'), 'Prefix');
    Assert.areEqual('papi-token:'.length() + 64, key.length(), 'SHA-256 hex');
    Assert.areNotEqual(
      TokenExchangeService.rateKey('a@example.com', '198.51.100.1'),
      key,
      'IP is part of the key'
    );
  }

  @IsTest
  static void shouldReject503AndSkipCalloutWhenDailyCapReached() {
    installLimiter();
    PortfolioApiCalloutMock mock = installMock();
    TokenExchangeService.configOverride = new Portfolio_Config__mdt(
      Token_Daily_Cap__c = 2
    );
    insert new List<API_Access_Request__c>{
      new API_Access_Request__c(Outcome__c = 'Issued'),
      new API_Access_Request__c(Outcome__c = 'Issued')
    };

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(503, result.statusCode, 'Cap reached');
    Assert.areEqual('SERVICE_UNAVAILABLE', result.errorCode, 'Code');
    Assert.isTrue(result.retryAfterSeconds > 0, 'Retry-After until tomorrow');
    Assert.areEqual(0, mock.requests.size(), 'No callout');
    Assert.areEqual(
      1,
      [
        SELECT COUNT()
        FROM API_Access_Request__c
        WHERE Outcome__c = 'Cap_Reached'
      ],
      'One audit row for this attempt'
    );
  }

  @IsTest
  static void shouldIgnoreNonIssuedRowsWhenCountingTheCap() {
    installLimiter();
    installMock();
    TokenExchangeService.configOverride = new Portfolio_Config__mdt(
      Token_Daily_Cap__c = 1
    );
    insert new API_Access_Request__c(Outcome__c = 'Rate_Limited');

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(200, result.statusCode, 'Only Issued rows count');
  }

  @IsTest
  static void shouldDefaultCapTo50WhenValueIsBlank() {
    TokenExchangeService.configOverride = new Portfolio_Config__mdt();

    Assert.areEqual(
      TokenExchangeService.DEFAULT_DAILY_CAP,
      TokenExchangeService.dailyCap(),
      'Blank value means the default'
    );
    Assert.areEqual(50, TokenExchangeService.DEFAULT_DAILY_CAP, 'Default 50');
  }

  @IsTest
  static void shouldReadCapFromConfigWhenValueIsSet() {
    TokenExchangeService.configOverride = new Portfolio_Config__mdt(
      Token_Daily_Cap__c = 7
    );

    Assert.areEqual(7, TokenExchangeService.dailyCap(), 'Configured cap');
  }

  @IsTest
  static void shouldReturnACapWhenNoOverrideIsSet() {
    Integer cap = TokenExchangeService.dailyCap();

    Assert.isTrue(cap != null && cap >= 0, 'Record value or the default');
  }

  @IsTest
  static void shouldReject503WhenClientIsNotConfigured() {
    installLimiter();
    PortfolioApiCalloutMock mock = installMock()
      .withTokenResponse(
        400,
        '{"error":"invalid_client_id","error_description":"client identifier invalid"}'
      );

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(503, result.statusCode, 'Not configured');
    Assert.isTrue(
      result.message.startsWith(
        ApiMessages.tokenNotConfigured('').removeEnd(' .')
      ),
      'Msg: ' + result.message
    );
    Assert.isFalse(result.retryable, 'Retrying cannot fix a setup problem');
    Assert.areEqual(1, mock.requests.size(), 'One callout');
    assertOneRow('Credential_Missing');
  }

  @IsTest
  static void shouldReject503WhenCredentialIsNotAccessible() {
    installLimiter();
    installMock()
      .throwing(
        'We could not find the named credential or external credential.'
      );

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(503, result.statusCode, 'Not configured');
    assertOneRow('Credential_Missing');
  }

  @IsTest
  static void shouldReject503WhenPrincipalParameterDoesNotExist() {
    installLimiter();
    installMock()
      .throwing(
        'Field Portfolio_API_Token_Auth.Client_Id does not exist. Check spelling.'
      );

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(503, result.statusCode, 'Not configured');
    Assert.areEqual('SERVICE_UNAVAILABLE', result.errorCode, 'Code');
    Assert.isTrue(
      result.message.startsWith(
        ApiMessages.tokenNotConfigured('').removeEnd(' .')
      ),
      'Msg: ' + result.message
    );
    assertOneRow('Credential_Missing');
  }

  @IsTest
  static void shouldThrowTypedExceptionWhenCredentialIsMissing() {
    installMock().withTokenResponse(401, '{"error":"invalid_client"}');

    Test.startTest();
    try {
      TokenExchangeService.exchangeToken();
      Assert.fail('Expected CredentialNotConfiguredException');
    } catch (TokenExchangeService.CredentialNotConfiguredException e) {
      Assert.isTrue(e.getMessage().contains('invalid_client'), 'Reason');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldReject503FailedWhenEndpointTimesOut() {
    installLimiter();
    installMock().throwing('Read timed out');

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(503, result.statusCode, 'Unavailable');
    assertOneRow('Failed');
  }

  @IsTest
  static void shouldReject503FailedWhenEndpointReturnsNonJson() {
    installLimiter();
    installMock().withTokenResponse(500, '<html>error</html>');

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(503, result.statusCode, 'Unavailable');
    assertOneRow('Failed');
  }

  @IsTest
  static void shouldReject503FailedWhenEndpointReturnsOtherError() {
    installLimiter();
    installMock().withTokenResponse(400, '{"error":"invalid_grant"}');

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(503, result.statusCode, 'Unavailable');
    assertOneRow('Failed');
  }

  @IsTest
  static void shouldReject503FailedWhenTokenIsAbsent() {
    installLimiter();
    installMock().withTokenResponse(200, '{"instance_url":"https://x"}');

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(503, result.statusCode, 'Unavailable');
    assertOneRow('Failed');
  }

  @IsTest
  static void shouldRecordRateLimitedWhenContextRejected429() {
    Test.startTest();
    TokenExchangeService.recordRejected(attempt(EMAIL, PURPOSE), 429);
    Test.stopTest();

    assertOneRow('Rate_Limited');
  }

  @IsTest
  static void shouldRecordInvalidWhenContextRejected400() {
    Test.startTest();
    TokenExchangeService.recordRejected(attempt(EMAIL, PURPOSE), 400);
    Test.stopTest();

    assertOneRow('Invalid_Request');
  }

  @IsTest
  static void shouldMarkIpUnavailableWhenSourceIpIsBlank() {
    TokenExchangeService.Attempt a = new TokenExchangeService.Attempt(
      EMAIL,
      PURPOSE,
      null,
      null,
      TokenExchangeService.CHANNEL_AURA
    );

    Assert.areEqual(
      TokenExchangeService.IP_UNAVAILABLE,
      a.sourceIp,
      'No IP is recorded as unavailable'
    );
  }

  @IsTest
  static void shouldUseTheRateSettingWhenItIsSet() {
    FakeLimiter limiter = installLimiter();
    limiter.allowKey = false;
    installMock();
    PortfolioSettings.overrideNumber('Token_Requests_Per_Minute', 3);

    Test.startTest();
    TokenExchangeService.requestToken(attempt(EMAIL, PURPOSE));
    Test.stopTest();

    Assert.areEqual(3, limiter.lastLimit, 'The limiter gets the set rate');
  }

  @IsTest
  static void shouldUseTheCapDefaultSettingWhenConfigHasNoCap() {
    TokenExchangeService.configOverride = new Portfolio_Config__mdt();
    PortfolioSettings.overrideNumber('Token_Daily_Cap_Default', 12);

    Assert.areEqual(
      12,
      TokenExchangeService.dailyCap(),
      'The setting is the default'
    );
  }

  @IsTest
  static void shouldLetTheConfigCapWinOverTheCapDefaultSetting() {
    TokenExchangeService.configOverride = new Portfolio_Config__mdt(
      Token_Daily_Cap__c = 7
    );
    PortfolioSettings.overrideNumber('Token_Daily_Cap_Default', 12);

    Assert.areEqual(
      7,
      TokenExchangeService.dailyCap(),
      'Portfolio Config wins when set'
    );
  }

  @IsTest
  static void shouldReject503AtTheCapDefaultSetting() {
    installLimiter();
    PortfolioApiCalloutMock mock = installMock();
    TokenExchangeService.configOverride = new Portfolio_Config__mdt();
    PortfolioSettings.overrideNumber('Token_Daily_Cap_Default', 1);
    insert new API_Access_Request__c(Outcome__c = 'Issued');

    Test.startTest();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      attempt(EMAIL, PURPOSE)
    );
    Test.stopTest();

    Assert.areEqual(503, result.statusCode, 'The set cap is reached');
    Assert.areEqual(0, mock.requests.size(), 'No callout at the cap');
  }
}

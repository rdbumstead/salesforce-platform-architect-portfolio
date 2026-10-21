/**
 * @description       : Unit tests for ApiLabController.generateCoverLetter, the site's proxy
 *                      to POST /papi/v1/ai/generate (pillar-d-design 3.9 test 9). The API is
 *                      answered by PortfolioApiCalloutMock.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@IsTest
private class ApiLabControllerCoverLetterTest {
  private static final String SERVED_BODY = JSON.serialize(
    new Map<String, Object>{
      'content' => 'Dear Hiring Manager',
      'provider' => 'Gemini',
      'model' => 'gemma-4-31b-it',
      'type' => 'CoverLetter',
      'tone' => 'Professional',
      'generatedAt' => '2026-10-21T10:00:00Z',
      'fallbackOccurred' => false,
      'latencyMs' => 1234,
      'promptShown' => 'Write a cover letter for Ryan Bumstead',
      'attempts' => new List<Object>{
        new Map<String, Object>{
          'provider' => 'Agentforce',
          'outcome' => 'skipped_off',
          'ms' => 0
        },
        new Map<String, Object>{
          'provider' => 'Gemini',
          'outcome' => 'served',
          'ms' => 1200
        }
      }
    }
  );

  private static PortfolioApiCalloutMock answer(Integer status, String body) {
    PortfolioApiCalloutMock mock = new PortfolioApiCalloutMock()
      .withRestResponse(status, body, null);
    Test.setMock(HttpCalloutMock.class, mock);
    return mock;
  }

  private static String errorBody(String code, String message) {
    return JSON.serialize(
      new Map<String, Object>{ 'errorCode' => code, 'message' => message }
    );
  }

  private static String refusal(Integer status, String body) {
    answer(status, body);
    Test.startTest();
    try {
      ApiLabController.generateCoverLetter('Acme', 'Architect', null);
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      return e.getMessage();
    } finally {
      Test.stopTest();
    }
    return null;
  }

  @IsTest
  static void postsTheCoverLetterRequestThroughPortfolioApi() {
    PortfolioApiCalloutMock mock = answer(200, SERVED_BODY);

    Test.startTest();
    ApiLabController.generateCoverLetter(
      ' Acme ',
      'Architect',
      'Design integrations'
    );
    Test.stopTest();

    HttpRequest sent = mock.requests[0];
    Assert.areEqual(
      'callout:Portfolio_API/services/apexrest/papi/v1/ai/generate',
      sent.getEndpoint(),
      'One fixed POST path'
    );
    Assert.areEqual('POST', sent.getMethod(), 'POST');
    Assert.areEqual('v1', sent.getHeader('X-API-Version'), 'Version');
    Assert.areEqual(
      'application/json',
      sent.getHeader('Content-Type'),
      'JSON body'
    );
    Assert.isNotNull(sent.getHeader('X-Request-Id'), 'Fresh request id');
    Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
      sent.getBody()
    );
    Assert.areEqual('CoverLetter', body.get('type'), 'Type');
    Assert.areEqual(1000, body.get('maxLength'), 'Spec maximum');
    Map<String, Object> context = (Map<String, Object>) body.get('context');
    Assert.areEqual('Acme', context.get('companyName'), 'Trimmed company');
    Assert.areEqual('Architect', context.get('role'), 'Title as role');
    Assert.areEqual(
      'Design integrations',
      context.get('jobDescription'),
      'Description passed'
    );
  }

  @IsTest
  static void returnsProviderAttemptsAndPromptFromTheResponse() {
    answer(200, SERVED_BODY);

    Test.startTest();
    ApiLabController.CoverLetterResult result = ApiLabController.generateCoverLetter(
      'Acme',
      'Architect',
      ''
    );
    Test.stopTest();

    Assert.areEqual('Dear Hiring Manager', result.content, 'Content');
    Assert.areEqual('Gemini', result.provider, 'Provider from the API');
    Assert.areEqual('gemma-4-31b-it', result.model, 'Model');
    Assert.isFalse(result.fallbackOccurred, 'Fallback flag');
    Assert.areEqual(1234L, result.generationMs, 'API dispatch time');
    Assert.isNotNull(result.latencyMs, 'Round trip measured');
    Assert.isNotNull(result.requestId, 'Request id kept');
    Assert.areEqual(
      'Write a cover letter for Ryan Bumstead',
      result.promptShown,
      'Prompt shown'
    );
    Assert.areEqual(2, result.attempts.size(), 'Both attempts');
    Assert.areEqual('Agentforce', result.attempts[0].provider, 'First');
    Assert.areEqual('skipped_off', result.attempts[0].outcome, 'Skipped');
    Assert.areEqual(1200L, result.attempts[1].ms, 'Gemini time');
  }

  @IsTest
  static void omitsABlankJobDescription() {
    PortfolioApiCalloutMock mock = answer(200, SERVED_BODY);

    Test.startTest();
    ApiLabController.generateCoverLetter('Acme', 'Architect', '  ');
    Test.stopTest();

    Map<String, Object> context = (Map<String, Object>) ((Map<String, Object>) JSON.deserializeUntyped(
        mock.requests[0].getBody()
      ))
      .get('context');
    Assert.isFalse(context.containsKey('jobDescription'), 'Not sent');
  }

  @IsTest
  static void badRequestCarriesTheApiMessage() {
    String message = refusal(
      400,
      errorBody('BAD_REQUEST', 'context.role is required for CoverLetter.')
    );

    Assert.isTrue(message.contains('status 400'), message);
    Assert.isTrue(message.contains('context.role is required'), message);
  }

  @IsTest
  static void rateLimitIsExplained() {
    String message = refusal(
      429,
      errorBody('RATE_LIMIT_EXCEEDED', 'Too many requests')
    );

    Assert.isTrue(message.contains('Try again in a minute'), message);
  }

  @IsTest
  static void allProvidersUnavailableIsExplained() {
    String message = refusal(
      503,
      errorBody('ALL_PROVIDERS_UNAVAILABLE', 'All AI providers unavailable')
    );

    Assert.isTrue(message.contains('No AI provider is available'), message);
  }

  @IsTest
  static void serverErrorIsReportedWithItsStatus() {
    String message = refusal(500, 'not json');

    Assert.isTrue(message.contains('failed (status 500)'), message);
  }

  @IsTest
  static void clientErrorWithoutABodyStillExplains() {
    String message = refusal(404, '');

    Assert.isTrue(message.contains('refused (status 404).'), message);
  }

  @IsTest
  static void unreadableSuccessBodyIsAnError() {
    String message = refusal(200, '{"provider":"Gemini"}');

    Assert.isTrue(message.contains('could not be read'), message);
  }

  @IsTest
  static void calloutFailureIsWrapped() {
    Test.setMock(
      HttpCalloutMock.class,
      new PortfolioApiCalloutMock().throwing('Read timed out')
    );

    Test.startTest();
    try {
      ApiLabController.generateCoverLetter('Acme', 'Architect', null);
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(
        e.getMessage().contains('could not be reached: Read timed out'),
        e.getMessage()
      );
    }
    Test.stopTest();
  }

  @IsTest
  static void missingCompanyIsRefusedBeforeAnyCallout() {
    PortfolioApiCalloutMock mock = answer(200, SERVED_BODY);
    try {
      ApiLabController.generateCoverLetter('', 'Architect', null);
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.areEqual('Company name is required.', e.getMessage(), 'Msg');
    }
    Assert.areEqual(0, mock.requests.size(), 'No callout');
  }

  @IsTest
  static void overlongTitleIsRefused() {
    try {
      ApiLabController.generateCoverLetter('Acme', 'x'.repeat(121), null);
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(
        e.getMessage().contains('at most 120 characters'),
        e.getMessage()
      );
    }
  }

  @IsTest
  static void overlongDescriptionIsRefused() {
    try {
      ApiLabController.generateCoverLetter(
        'Acme',
        'Architect',
        'x'.repeat(4001)
      );
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(
        e.getMessage().contains('at most 4000 characters'),
        e.getMessage()
      );
    }
  }

  @IsTest
  static void allowlistAndReturnedHeadersAreUnchanged() {
    Assert.areEqual(21, ApiLabController.ALLOWED_PATHS.size(), 'GET only');
    Assert.isFalse(
      ApiLabController.ALLOWED_PATHS.contains(
        ApiLabController.AI_GENERATE_PATH
      ),
      'The POST path is not in the GET allowlist'
    );
    Assert.areEqual(6, ApiLabController.RETURNED_HEADERS.size(), 'Headers');
  }
}

/**
 * @description       : Unit tests for ApiLabController.generateCoverLetter, the site's cover
 *                      letter path in process. The real
 *                      GeminiService runs against an HTTP mock that answers Gemini and records
 *                      every endpoint, so a call to the org's own Portfolio_API would show.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@IsTest
private class ApiLabControllerCoverLetterTest {
  private static final String GEMINI_ANSWER = 'Dear Hiring Manager, I build platforms.';
  private static final String GEMINI_BODY =
    '{"candidates":[{"content":{"parts":[{"text":"' +
    GEMINI_ANSWER +
    '"}]},"finishReason":"STOP"}]}';
  private static final Pattern PHONE_SHAPE = Pattern.compile(
    '\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}'
  );

  /**
   * @description Answers Gemini with a status and body and records every endpoint called.
   */
  private class RoutingMock implements HttpCalloutMock {
    public List<String> endpoints = new List<String>();
    public List<String> bodies = new List<String>();
    private final Integer geminiStatus;

    RoutingMock(Integer geminiStatus) {
      this.geminiStatus = geminiStatus;
    }

    public HttpResponse respond(HttpRequest req) {
      endpoints.add(req.getEndpoint());
      bodies.add(req.getBody());
      HttpResponse res = new HttpResponse();
      res.setHeader('Content-Type', 'application/json');
      if (req.getEndpoint().startsWith('callout:Gemini_API/')) {
        res.setStatusCode(geminiStatus);
        res.setBody(geminiStatus == 200 ? GEMINI_BODY : '{"error":{}}');
      } else {
        res.setStatusCode(500);
        res.setBody('{"message":"unexpected endpoint"}');
      }
      return res;
    }

    Integer callsTo(String prefix) {
      Integer count = 0;
      for (String endpoint : endpoints) {
        if (endpoint.startsWith(prefix)) {
          count++;
        }
      }
      return count;
    }
  }

  /**
   * @description Limiter that refuses every key.
   */
  private class DenyingLimiter implements ApiRateLimiter {
    public ApiRequestContext.RateDecision check(
      String key,
      Integer limitPerMinute
    ) {
      return checkKey(key, limitPerMinute);
    }

    public ApiRequestContext.RateDecision checkKey(
      String key,
      Integer limitPerMinute
    ) {
      return new ApiRequestContext.RateDecision(false, limitPerMinute, 0, 30);
    }
  }

  /**
   * @description A provider that never serves.
   */
  private class FailingProvider implements IAIGenerationService {
    public String generateContent(String prompt, Map<String, Object> context) {
      return 'Error: Unable to generate content. (Status: 503)';
    }

    public Boolean isAvailable() {
      return true;
    }
  }

  private class RecordingSink implements System.Callable {
    public List<String> messages = new List<String>();

    public Object call(String action, Map<String, Object> args) {
      messages.add((String) args.get('message'));
      return new Map<String, Object>{ 'isSuccess' => true };
    }
  }

  private static RoutingMock mockGemini(Integer status) {
    RoutingMock mock = new RoutingMock(status);
    Test.setMock(HttpCalloutMock.class, mock);
    return mock;
  }

  private static void switchAgentforceOn() {
    AgentforceService.configOverridden = true;
    AgentforceService.configOverride = (AI_Provider_Config__mdt) JSON.deserialize(
      '{"DeveloperName":"Agentforce","Enabled__c":true}',
      AI_Provider_Config__mdt.class
    );
    AgentforceService.guestOverride = null;
  }

  private static void insertGroundingFacts() {
    Account employer = new Account(Name = 'Acme Corp');
    insert employer;
    Experience__c role = new Experience__c(
      Name = 'Platform Architect',
      Sort_Order__c = 1,
      Employer__c = employer.Id,
      Is_Current_Role__c = true
    );
    insert role;
    insert new Experience_Highlight__c(
      Name = 'Highlight',
      Experience__c = role.Id,
      Description__c = 'Led an API program, call (555) 014-2424 or leak.sentinel@example.com',
      Persona_Tag__c = 'Architect',
      Sort_Order__c = 1,
      Lock_Sort_Across_Personas__c = false
    );
  }

  private static ApiLabController.AttemptView attemptFor(
    ApiLabController.CoverLetterResult result,
    String provider
  ) {
    for (ApiLabController.AttemptView attempt : result.attempts) {
      if (attempt.provider == provider) {
        return attempt;
      }
    }
    return null;
  }

  private static String refusalMessage(String company, String title) {
    try {
      ApiLabController.generateCoverLetter(company, title, null);
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      return e.getMessage();
    }
    return null;
  }

  @IsTest
  static void guestReachesGeminiInProcessWithNoCallToPortfolioApi() {
    switchAgentforceOn();
    insertGroundingFacts();
    User guest = SiteGuestTestSupport.preparedGuest();
    RoutingMock mock = mockGemini(200);
    ApiLabController.CoverLetterResult result;

    Test.startTest();
    System.runAs(guest) {
      result = ApiLabController.generateCoverLetter(
        ' Acme ',
        'Architect',
        'Design integrations'
      );
    }
    Test.stopTest();

    Assert.areEqual('Gemini', result.provider, 'Gemini serves the guest');
    Assert.areEqual(GEMINI_ANSWER, result.content, 'Answer text');
    Assert.isFalse(result.fallbackOccurred, 'No fallback');
    Assert.areEqual(
      'skipped_off',
      attemptFor(result, 'Agentforce').outcome,
      'Agentforce is never consulted for a guest, even switched on'
    );
    Assert.areEqual('served', attemptFor(result, 'Gemini').outcome, 'Served');
    Assert.areEqual(1, mock.callsTo('callout:Gemini_API/'), 'One Gemini call');
    Assert.areEqual(
      0,
      mock.callsTo('callout:Portfolio_API'),
      'No request goes to the org\'s own API'
    );
    Assert.areEqual(1, mock.endpoints.size(), 'No other callout at all');
    Assert.isTrue(
      result.promptShown.contains('companyName: Acme'),
      'Trimmed company in the prompt'
    );
    Assert.isTrue(
      result.promptShown.contains('Platform Architect'),
      'Grounding facts reach the guest prompt'
    );
    Assert.isFalse(result.promptShown.contains('@'), 'No email in the prompt');
    Assert.isFalse(
      PHONE_SHAPE.matcher(result.promptShown).find(),
      'No phone in the prompt'
    );
    Assert.isTrue(
      mock.bodies[0].contains('Platform Architect'),
      'The prompt Gemini receives is the one shown'
    );
    Assert.isNotNull(result.requestId, 'Request id');
    Assert.isNotNull(result.latencyMs, 'Latency measured');
  }

  @IsTest
  static void successWritesOneCountOnTheAiTierKey() {
    mockGemini(200);

    Test.startTest();
    ApiLabController.generateCoverLetter('Acme', 'Architect', null);
    Test.stopTest();

    List<API_Rate_Window__c> windows = [
      SELECT Key__c, Count__c
      FROM API_Rate_Window__c
    ];
    Assert.areEqual(1, windows.size(), 'One window row');
    Assert.isTrue(
      windows[0].Key__c.startsWith(ApiLabController.AI_RATE_KEY + '|'),
      windows[0].Key__c
    );
    Assert.isTrue(
      ApiLabController.AI_RATE_KEY.startsWith('papi-ai:'),
      'Same prefix as /papi/v1/ai/'
    );
    Assert.areEqual(1, windows[0].Count__c, 'Counted once');
  }

  @IsTest
  static void limitRefusalIsReadableAndCallsNothing() {
    ApiRequestContext.limiterOverride = new DenyingLimiter();
    RoutingMock mock = mockGemini(200);

    Test.startTest();
    String message = refusalMessage('Acme', 'Architect');
    Test.stopTest();

    Assert.areEqual(
      'Too many cover letters were requested in the last minute. Try again in a minute.',
      message,
      'Readable refusal'
    );
    Assert.areEqual(0, mock.endpoints.size(), 'No callout once refused');
  }

  @IsTest
  static void geminiFailureFallsBackToTheTemplate() {
    RoutingMock mock = mockGemini(500);

    Test.startTest();
    ApiLabController.CoverLetterResult result = ApiLabController.generateCoverLetter(
      'Acme',
      'Architect',
      null
    );
    Test.stopTest();

    Assert.areEqual('Local', result.provider, 'Template serves');
    Assert.isTrue(result.fallbackOccurred, 'Fallback reported');
    Assert.areEqual('failed', attemptFor(result, 'Gemini').outcome, 'Failed');
    Assert.isNotNull(attemptFor(result, 'Gemini').ms, 'Attempt time kept');
    Assert.isNull(result.promptShown, 'No prompt shown for the template');
    Assert.areEqual(0, mock.callsTo('callout:Portfolio_API'), 'No loop');
  }

  @IsTest
  static void noProviderIsExplained() {
    ContentGenerationController.mockGeminiService = new FailingProvider();
    ContentGenerationController.mockLocalService = new FailingProvider();

    Test.startTest();
    String message = refusalMessage('Acme', 'Architect');
    Test.stopTest();

    Assert.areEqual(
      'No AI provider is available right now. Try again later.',
      message,
      'Readable failure'
    );
  }

  @IsTest
  static void writesOneLogLinePerLetter() {
    RecordingSink sink = new RecordingSink();
    PortfolioLog.injectedSink = sink;
    mockGemini(200);

    Test.startTest();
    ApiLabController.CoverLetterResult result = ApiLabController.generateCoverLetter(
      'Acme',
      'Architect',
      null
    );
    Test.stopTest();

    Assert.areEqual(1, sink.messages.size(), 'One line');
    String expectedStart =
      'api request path=' +
      ApiLabController.COVER_LETTER_LOG_PATH +
      ' status=200 correlationId=' +
      result.requestId;
    Assert.isTrue(sink.messages[0].startsWith(expectedStart), sink.messages[0]);
    Assert.isFalse(sink.messages[0].contains('Acme'), 'No input in the log');
  }

  @IsTest
  static void missingCompanyIsRefusedBeforeAnyCallout() {
    RoutingMock mock = mockGemini(200);

    Assert.areEqual(
      'Company name is required.',
      refusalMessage('', 'Architect'),
      'Msg'
    );
    Assert.areEqual(0, mock.endpoints.size(), 'No callout');
  }

  @IsTest
  static void overlongTitleIsRefused() {
    Assert.isTrue(
      refusalMessage('Acme', 'x'.repeat(121))
        .contains('at most 120 characters'),
      'Title bound'
    );
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
  static void promptIsTheSharedCoverLetterPrompt() {
    Test.startTest();
    String prompt = ApiLabController.coverLetterPrompt(
      'Acme',
      'Architect',
      'Apex'
    );
    String shared = ContentGenerationController.coverLetterPrompt(
      'Acme',
      'Architect',
      'Apex'
    );
    Test.stopTest();

    Assert.areEqual(shared, prompt, 'One prompt builder for both paths');
    Assert.isTrue(
      prompt.contains(
        '\ncompanyName: Acme\nrole: Architect\njobDescription: Apex'
      ),
      'The job lines'
    );
    Assert.isFalse(
      prompt.contains('characters'),
      'No character cap in the prompt'
    );
  }

  @IsTest
  static void longLetterIsReturnedWhole() {
    String longAnswer = 'word '.repeat(600).trim();
    ContentGenerationController.mockGeminiService = new FixedProvider(
      longAnswer
    );
    RoutingMock mock = mockGemini(200);

    Test.startTest();
    ApiLabController.CoverLetterResult result = ApiLabController.generateCoverLetter(
      'Acme',
      'Architect',
      null
    );
    Test.stopTest();

    Assert.areEqual(longAnswer, result.content, 'No cut on the letter');
    Assert.areEqual(0, mock.endpoints.size(), 'The double served');
  }

  @IsTest
  static void geminiRequestFromThePageCarriesTheGenerationConfig() {
    RoutingMock mock = mockGemini(200);

    Test.startTest();
    ApiLabController.generateCoverLetter('Acme', 'Architect', null);
    Test.stopTest();

    Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
      mock.bodies[0]
    );
    Map<String, Object> config = (Map<String, Object>) body.get(
      'generationConfig'
    );
    Assert.isNotNull(config, 'generationConfig is sent');
    Assert.isNotNull(config.get('maxOutputTokens'), 'Output limit sent');
    Assert.isNotNull(config.get('temperature'), 'Temperature sent');
  }

  /**
   * @description A provider that always serves the same text.
   */
  private class FixedProvider implements IAIGenerationService {
    private final String text;

    FixedProvider(String text) {
      this.text = text;
    }

    public String generateContent(String prompt, Map<String, Object> context) {
      return text;
    }

    public Boolean isAvailable() {
      return true;
    }
  }

  @IsTest
  static void allowlistAndReturnedHeadersAreUnchanged() {
    // The allowlist is the API_Lab_Catalog resource the specs generate.
    Set<String> allowed = ApiLabController.allowedPaths();
    Assert.areEqual(21, allowed.size(), 'GET only');
    Assert.isFalse(
      allowed.contains('/papi/v1/ai/generate'),
      'The AI path is not in the GET allowlist'
    );
    Assert.areEqual(6, ApiLabController.RETURNED_HEADERS.size(), 'Headers');
  }

  /**
   * @description Refuses every request and keeps the limit it was asked to apply.
   */
  private class RecordingLimiter implements ApiRateLimiter {
    public Integer lastLimit;

    public ApiRequestContext.RateDecision check(
      String key,
      Integer limitPerMinute
    ) {
      return checkKey(key, limitPerMinute);
    }

    public ApiRequestContext.RateDecision checkKey(
      String key,
      Integer limitPerMinute
    ) {
      lastLimit = limitPerMinute;
      return new ApiRequestContext.RateDecision(false, limitPerMinute, 0, 30);
    }
  }

  @IsTest
  static void coverLetterLimitComesFromTheAiRateSetting() {
    RecordingLimiter limiter = new RecordingLimiter();
    ApiRequestContext.limiterOverride = limiter;
    PortfolioSettings.overrideNumber('Api_Ai_Rate_Per_Minute', 3);
    mockGemini(200);

    Test.startTest();
    refusalMessage('Acme', 'Architect');
    Test.stopTest();

    Assert.areEqual(3, limiter.lastLimit, 'The AI tier setting is applied');
  }
}

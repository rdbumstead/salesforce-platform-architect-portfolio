/**
 * @description       : Unit tests for ContentGenerationController: the one dispatch,
 *                      generateCoverLetter and
 *                      providerStatus. Providers are test doubles or HTTP callout mocks, and
 *                      the Agentforce switch is set in memory, so no test depends on org
 *                      records except the guest test, which needs the deployed site guest.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class ContentGenerationControllerTest {
  private static final String AGENTFORCE_TEXT = 'Agentforce Content';
  private static final String GEMINI_TEXT = 'Gemini Content';
  private static final String LOCAL_TEXT = 'Local Content';

  /** Provider double that counts calls and can be unavailable, fail or return text. */
  private class MockService implements IAIGenerationService {
    private final Boolean available;
    private final Boolean fail;
    private final String response;
    public Integer generateCalls = 0;

    MockService(Boolean available, Boolean fail, String response) {
      this.available = available;
      this.fail = fail;
      this.response = response;
    }

    public Boolean isAvailable() {
      return available;
    }

    public String generateContent(String prompt, Map<String, Object> context) {
      generateCalls++;
      if (fail) {
        throw new CalloutException('Service Unavailable');
      }
      return response;
    }
  }

  /** Wraps the real AgentforceService and counts generateContent calls. */
  private class AgentforceSpy implements IAIGenerationService {
    private final AgentforceService real = new AgentforceService();
    public Integer generateCalls = 0;

    public Boolean isAvailable() {
      return real.isAvailable();
    }

    public String generateContent(String prompt, Map<String, Object> context) {
      generateCalls++;
      return real.generateContent(prompt, context);
    }
  }

  private class GeminiTimeoutMock implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest req) {
      throw new CalloutException('Read timed out');
    }
  }

  private class GeminiOkMock implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest req) {
      HttpResponse res = new HttpResponse();
      res.setStatusCode(200);
      res.setBody(
        '{"candidates":[{"content":{"parts":[{"text":"Real Gemini Text"}]}}]}'
      );
      return res;
    }
  }

  private static void switchAgentforce(Boolean enabled) {
    AgentforceService.configOverridden = true;
    AgentforceService.configOverride = (AI_Provider_Config__mdt) JSON.deserialize(
      '{"DeveloperName":"Agentforce","Enabled__c":' + enabled + '}',
      AI_Provider_Config__mdt.class
    );
    AgentforceService.guestOverride = false;
  }

  private static ContentGenerationController.GenerationRequest request(
    Boolean localAllowed
  ) {
    return new ContentGenerationController.GenerationRequest(
      'Write a cover letter',
      new Map<String, Object>{
        'companyName' => 'Salesforce',
        'jobTitle' => 'Architect'
      },
      localAllowed
    );
  }

  private static ContentGenerationController.Attempt attemptFor(
    ContentGenerationController.GenerationResult result,
    String provider
  ) {
    for (ContentGenerationController.Attempt attempt : result.attempts) {
      if (attempt.provider == provider) {
        return attempt;
      }
    }
    return null;
  }

  // --- Off means off ---

  @IsTest
  static void switchedOffAgentforceIsNeverCalledAndGeminiServes() {
    switchAgentforce(false);
    AgentforceSpy spy = new AgentforceSpy();
    ContentGenerationController.mockAgentforceService = spy;
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      GEMINI_TEXT
    );

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );
    Test.stopTest();

    Assert.areEqual(0, spy.generateCalls, 'Agentforce generate never runs');
    Assert.areEqual('Gemini', result.provider, 'Gemini serves');
    Assert.areEqual(GEMINI_TEXT, result.content, 'Gemini text');
    Assert.areEqual(GeminiService.model(), result.model, 'Gemini model');
    Assert.isFalse(
      result.fallbackOccurred,
      'A skipped provider is no fallback'
    );
    Assert.areEqual(
      'skipped_off',
      attemptFor(result, 'Agentforce').outcome,
      'Skip is recorded'
    );
    Assert.areEqual(
      'Write a cover letter',
      result.promptShown,
      'Prompt sent to Gemini is shown'
    );
    Assert.isNotNull(result.latencyMs, 'Latency measured');
  }

  // --- A failing Agentforce falls to Gemini ---

  @IsTest
  static void switchedOnAgentforceThatFailsFallsToGemini() {
    // No PromptTemplateClient stub: the real client refuses inside a test, so the real
    // AgentforceService fails here as a broken template would in the org.
    switchAgentforce(true);
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      GEMINI_TEXT
    );

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );
    Test.stopTest();

    Assert.areEqual('Gemini', result.provider, 'Never Agentforce');
    Assert.areEqual(
      'failed',
      attemptFor(result, 'Agentforce').outcome,
      'The failing template is a failed attempt'
    );
    Assert.areEqual(
      'served',
      attemptFor(result, 'Gemini').outcome,
      'Gemini served'
    );
    Assert.isTrue(result.fallbackOccurred, 'An earlier provider failed');
  }

  // --- A real provider would be used ---

  @IsTest
  static void agentforceDoubleThatReturnsTextIsReportedAsAgentforce() {
    switchAgentforce(true);
    MockService gemini = new MockService(true, false, GEMINI_TEXT);
    ContentGenerationController.mockAgentforceService = new MockService(
      true,
      false,
      AGENTFORCE_TEXT
    );
    ContentGenerationController.mockGeminiService = gemini;

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );
    Test.stopTest();

    Assert.areEqual('Agentforce', result.provider, 'Test double served');
    Assert.areEqual(AGENTFORCE_TEXT, result.content, 'Its text');
    Assert.areEqual(
      AgentforceService.DEFAULT_MODEL,
      result.model,
      'No template configured'
    );
    Assert.areEqual(0, gemini.generateCalls, 'Gemini not needed');
    Assert.isFalse(result.fallbackOccurred, 'First provider served');
  }

  // --- A guest never runs generative AI ---

  @IsTest
  static void guestIsNeverOfferedAgentforceEvenWhenSwitchedOn() {
    switchAgentforce(true);
    AgentforceService.guestOverride = null;
    User guest = SiteGuestTestSupport.preparedGuest();
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      GEMINI_TEXT
    );
    ContentGenerationController.GenerationResult result;
    Boolean isGuest;

    Test.startTest();
    System.runAs(guest) {
      isGuest = Auth.CommunitiesUtil.isGuestUser();
      result = ContentGenerationController.dispatch(request(true));
    }
    Test.stopTest();

    Assert.isTrue(isGuest, 'The site guest is recognised as a guest');
    Assert.areEqual(
      'skipped_off',
      attemptFor(result, 'Agentforce').outcome,
      'Agentforce is skipped for the guest'
    );
    Assert.areEqual('Gemini', result.provider, 'Gemini serves the guest');
  }

  // --- Gemini error text is treated as a failure ---

  @IsTest
  static void geminiErrorTextFallsToLocalForCoverLetters() {
    switchAgentforce(false);
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      'Error: Unable to generate content. (Status: 429)'
    );
    ContentGenerationController.mockLocalService = new MockService(
      true,
      false,
      LOCAL_TEXT
    );

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );
    Test.stopTest();

    Assert.areEqual('Local', result.provider, 'Error text is not content');
    Assert.areEqual(LOCAL_TEXT, result.content, 'Local text');
    Assert.areEqual('local-template', result.model, 'Local model');
    Assert.isTrue(result.fallbackOccurred, 'Fallback flagged');
    Assert.isNull(result.promptShown, 'The template uses no prompt');
    Assert.areEqual(
      'failed',
      attemptFor(result, 'Gemini').outcome,
      'Gemini failure recorded'
    );
  }

  @IsTest
  static void geminiExceptionTextFailsOtherTypesWithoutLocal() {
    switchAgentforce(false);
    MockService local = new MockService(true, false, LOCAL_TEXT);
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      'Exception: Unauthorized endpoint'
    );
    ContentGenerationController.mockLocalService = local;

    Test.startTest();
    try {
      ContentGenerationController.dispatch(request(false));
      Assert.fail('Expected ContentGenerationException');
    } catch (ContentGenerationController.ContentGenerationException e) {
      Assert.isTrue(
        e.getMessage().contains('Gemini: no usable content'),
        e.getMessage()
      );
    }
    Test.stopTest();

    Assert.areEqual(0, local.generateCalls, 'Local is not offered');
  }

  // --- The timeout is honoured ---

  @IsTest
  static void geminiCalloutTimeoutFallsToLocal() {
    switchAgentforce(false);
    Test.setMock(HttpCalloutMock.class, new GeminiTimeoutMock());

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );
    Test.stopTest();

    Assert.areEqual('Local', result.provider, 'Timeout means Local');
    Assert.isTrue(
      result.content.contains('Salesforce'),
      'The real local template fills in the company'
    );
    Assert.areEqual(
      'failed',
      attemptFor(result, 'Gemini').outcome,
      'Timed out call is a failed attempt'
    );
  }

  @IsTest
  static void realGeminiServiceTextIsServed() {
    switchAgentforce(false);
    Test.setMock(HttpCalloutMock.class, new GeminiOkMock());

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );
    Test.stopTest();

    Assert.areEqual('Real Gemini Text', result.content, 'Parsed text');
    Assert.areEqual('Gemini', result.provider, 'Gemini served');
  }

  // --- No dead end without an error ---

  @IsTest
  static void allProvidersFailingThrowsWithEveryReason() {
    switchAgentforce(true);
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      true,
      null
    );
    ContentGenerationController.mockLocalService = new MockService(
      true,
      false,
      ''
    );

    Test.startTest();
    try {
      ContentGenerationController.dispatch(request(true));
      Assert.fail('Expected ContentGenerationException');
    } catch (ContentGenerationController.ContentGenerationException e) {
      Assert.isTrue(
        e.getMessage()
          .contains('Agentforce: A test must stub PromptTemplateClient'),
        e.getMessage()
      );
      Assert.isTrue(
        e.getMessage().contains('Gemini: Service Unavailable'),
        e.getMessage()
      );
      Assert.isTrue(
        e.getMessage().contains('Local: no usable content'),
        e.getMessage()
      );
    }
    Test.stopTest();
  }

  @IsTest
  static void unavailableGeminiIsRecordedAsSkipped() {
    switchAgentforce(false);
    ContentGenerationController.mockGeminiService = new MockService(
      false,
      false,
      null
    );
    ContentGenerationController.mockLocalService = new MockService(
      true,
      false,
      LOCAL_TEXT
    );

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );
    Test.stopTest();

    Assert.areEqual(
      'skipped_off',
      attemptFor(result, 'Gemini').outcome,
      'Unavailable Gemini is skipped'
    );
    Assert.areEqual('Local', result.provider, 'Local serves');
  }

  @IsTest
  static void blankPromptIsRefused() {
    Test.startTest();
    try {
      ContentGenerationController.dispatch(
        new ContentGenerationController.GenerationRequest(' ', null, true)
      );
      Assert.fail('Expected ContentGenerationException');
    } catch (ContentGenerationController.ContentGenerationException e) {
      Assert.areEqual('A prompt is required.', e.getMessage(), 'Message');
    }
    Test.stopTest();
  }

  // --- generateCoverLetter ---

  @IsTest
  static void coverLetterSendsTheJobDescriptionAndReportsTheProvider() {
    switchAgentforce(false);
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      GEMINI_TEXT
    );

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.generateCoverLetter(
      'Acme',
      'Architect',
      'Design integrations'
    );
    Test.stopTest();

    Assert.areEqual('Gemini', result.provider, 'Provider from the dispatch');
    Assert.isTrue(
      result.promptShown.contains('jobDescription: Design integrations'),
      result.promptShown
    );
    Assert.isTrue(
      result.promptShown.contains('companyName: Acme'),
      result.promptShown
    );
  }

  @IsTest
  static void coverLetterPromptCarriesPortfolioFactsWhenRecordsExist() {
    switchAgentforce(false);
    insert new Project__c(
      Name = 'Integration Hub',
      Sort_Order__c = 1,
      Is_Featured__c = true,
      Status__c = 'Active Development',
      Challenge__c = 'Integrations were brittle'
    );
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      GEMINI_TEXT
    );

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.generateCoverLetter(
      'Acme',
      'Integration Architect',
      null
    );
    Test.stopTest();

    Assert.isTrue(
      result.promptShown.contains('Integration Hub'),
      result.promptShown
    );
    Assert.isTrue(
      result.promptShown.contains('do not invent'),
      'Grounding instruction present'
    );
  }

  @IsTest
  static void coverLetterWithAllProvidersDownIsAnAuraError() {
    switchAgentforce(false);
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      true,
      null
    );
    ContentGenerationController.mockLocalService = new MockService(
      true,
      true,
      null
    );

    Test.startTest();
    try {
      ContentGenerationController.generateCoverLetter('Acme', 'Architect', '');
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.isTrue(
        e.getMessage().contains('No AI provider could write the letter'),
        e.getMessage()
      );
    }
    Test.stopTest();
  }

  @IsTest
  static void coverLetterWithoutCompanyIsRefused() {
    try {
      ContentGenerationController.generateCoverLetter(null, 'Architect', '');
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.areEqual('Company name is required.', e.getMessage(), 'Msg');
    }
  }

  @IsTest
  static void coverLetterWithoutTitleIsRefused() {
    try {
      ContentGenerationController.generateCoverLetter('Acme', ' ', '');
      Assert.fail('Expected AuraHandledException');
    } catch (AuraHandledException e) {
      Assert.areEqual('Job title is required.', e.getMessage(), 'Msg');
    }
  }

  // --- providerStatus ---

  @IsTest
  static void providerStatusReportsAgentforceOffWhenSwitchedOff() {
    switchAgentforce(false);

    Test.startTest();
    List<ContentGenerationController.ProviderStatus> rows = ContentGenerationController.providerStatus();
    Test.stopTest();

    Assert.areEqual(3, rows.size(), 'Three providers');
    Assert.areEqual('Agentforce', rows[0].provider, 'Dispatch order');
    Assert.areEqual('off', rows[0].state, 'Switched off');
    Assert.isFalse(rows[0].enabled, 'Flag value');
    Assert.areEqual('Gemini', rows[1].provider, 'Second');
    Assert.areEqual('on', rows[1].state, 'Gemini on');
    Assert.areEqual(GeminiService.model(), rows[1].model, 'Gemini model');
    Assert.areEqual('Local', rows[2].provider, 'Last');
    Assert.areEqual(3, rows[2].sortOrder, 'Sort order');
  }

  @IsTest
  static void providerStatusSaysOnWhenSwitchedOnNowTheProviderIsBuilt() {
    switchAgentforce(true);

    Test.startTest();
    List<ContentGenerationController.ProviderStatus> rows = ContentGenerationController.providerStatus();
    Test.stopTest();

    Assert.isTrue(AgentforceService.IMPLEMENTED, 'The provider is built');
    Assert.areEqual('on', rows[0].state, 'Switched on and built');
    Assert.isTrue(rows[0].enabled, 'Flag value');
  }

  @IsTest
  static void providerStatusTreatsAMissingRecordAsOff() {
    AgentforceService.configOverridden = true;
    AgentforceService.configOverride = null;

    Test.startTest();
    List<ContentGenerationController.ProviderStatus> rows = ContentGenerationController.providerStatus();
    Test.stopTest();

    Assert.areEqual('off', rows[0].state, 'No record means off');
  }

  @IsTest
  static void groundingSectionIsNullWithoutRecords() {
    Test.startTest();
    String section = ContentGenerationController.groundingSection(
      'Architect',
      'Apex'
    );
    Test.stopTest();

    Assert.isNull(section, 'Nothing to ground on');
  }

  // --- Circuit breakers and attempt detail ---

  private class GeminiStatusMock implements HttpCalloutMock {
    private final Integer status;
    GeminiStatusMock(Integer status) {
      this.status = status;
    }
    public HttpResponse respond(HttpRequest req) {
      HttpResponse res = new HttpResponse();
      res.setStatusCode(status);
      res.setBody('{"error":{"message":"API key not valid. key=SECRETKEY"}}');
      return res;
    }
  }

  private static void useLocalAndFailingGemini(MockService gemini) {
    switchAgentforce(false);
    ContentGenerationController.mockGeminiService = gemini;
    ContentGenerationController.mockLocalService = new MockService(
      true,
      false,
      LOCAL_TEXT
    );
  }

  @IsTest
  static void threeGeminiFailuresOpenTheCircuitAndTheNextDispatchServesLocal() {
    MockService gemini = new MockService(true, true, null);
    useLocalAndFailingGemini(gemini);

    Test.startTest();
    for (Integer i = 0; i < 3; i++) {
      ContentGenerationController.dispatch(request(true));
    }
    Boolean openAfterThree = CircuitBreaker.isOpen(CircuitBreaker.KEY_GEMINI);
    ContentGenerationController.GenerationResult fourth = ContentGenerationController.dispatch(
      request(true)
    );
    Test.stopTest();

    Assert.isTrue(openAfterThree, 'Three failures open the gemini circuit');
    Assert.areEqual(3, gemini.generateCalls, 'Gemini not called while open');
    Assert.areEqual(
      'skipped_open_circuit',
      attemptFor(fourth, 'Gemini').outcome,
      'Recorded as skipped_open_circuit'
    );
    Assert.areEqual(0L, attemptFor(fourth, 'Gemini').ms, 'No time spent');
    Assert.areEqual('Local', fourth.provider, 'Local serves');
    Assert.areEqual(LOCAL_TEXT, fourth.content, 'Local content');
  }

  @IsTest
  static void geminiCircuitClosesAfterTheCoolDown() {
    MockService gemini = new MockService(true, true, null);
    useLocalAndFailingGemini(gemini);
    Datetime start = Datetime.now();
    CircuitBreaker.nowOverride = start;
    for (Integer i = 0; i < 3; i++) {
      ContentGenerationController.dispatch(request(true));
    }

    CircuitBreaker.nowOverride = start.addMinutes(CircuitBreaker.OPEN_MINUTES);
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );

    Assert.areEqual(
      4,
      gemini.generateCalls,
      'Gemini tried again after 30 minutes'
    );
    Assert.areEqual(
      'failed',
      attemptFor(result, 'Gemini').outcome,
      'A real attempt, not a skip'
    );
  }

  @IsTest
  static void breakerWritesFollowTheGeminiCallout() {
    // C2: Agentforce fails first and its breaker result is held. The real Gemini callout
    // that follows in the same transaction succeeds, which it could not do after DML.
    switchAgentforce(true);
    Test.setMock(HttpCalloutMock.class, new GeminiOkMock());
    Integer dmlBefore = Limits.getDmlStatements();

    Test.startTest();
    Assert.isFalse(CircuitBreaker.isOpen(CircuitBreaker.KEY_GEMINI), 'Closed');
    Assert.areEqual(
      dmlBefore,
      Limits.getDmlStatements(),
      'The check wrote nothing'
    );
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );
    Integer callouts = Limits.getCallouts();
    Test.stopTest();

    Assert.areEqual(
      'Gemini',
      result.provider,
      'The callout after the check served'
    );
    Assert.areEqual(1, callouts, 'One callout');
    Assert.areEqual(
      'failed',
      attemptFor(result, 'Agentforce').outcome,
      'Agentforce failed first'
    );
    Assert.areEqual(
      1,
      [
        SELECT Consecutive_Failures__c
        FROM Circuit_Breaker_State__c
        WHERE Name = 'agentforce'
      ]
      .Consecutive_Failures__c,
      'The Agentforce failure was written after the callout'
    );
  }

  @IsTest
  static void openAgentforceCircuitIsSkippedAndGeminiServes() {
    switchAgentforce(true);
    AgentforceSpy spy = new AgentforceSpy();
    ContentGenerationController.mockAgentforceService = spy;
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      GEMINI_TEXT
    );
    for (Integer i = 0; i < CircuitBreaker.FAILURE_THRESHOLD; i++) {
      CircuitBreaker.recordFailure(CircuitBreaker.KEY_AGENTFORCE);
    }

    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );

    Assert.areEqual(0, spy.generateCalls, 'Agentforce not called while open');
    Assert.areEqual(
      'skipped_open_circuit',
      attemptFor(result, 'Agentforce').outcome,
      'Skipped'
    );
    Assert.areEqual('Gemini', result.provider, 'Gemini serves');
  }

  @IsTest
  static void switchedOffAgentforceNeverTouchesItsBreaker() {
    switchAgentforce(false);
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      GEMINI_TEXT
    );

    ContentGenerationController.dispatch(request(true));

    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Circuit_Breaker_State__c],
      'Skipped off and a healthy success write nothing'
    );
  }

  @IsTest
  static void geminiSuccessClosesItsCircuit() {
    switchAgentforce(false);
    CircuitBreaker.recordFailure(CircuitBreaker.KEY_GEMINI);
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      GEMINI_TEXT
    );

    ContentGenerationController.dispatch(request(true));

    Assert.areEqual(
      0,
      [
        SELECT Consecutive_Failures__c
        FROM Circuit_Breaker_State__c
        WHERE Name = 'gemini'
      ]
      .Consecutive_Failures__c,
      'A served attempt resets the count'
    );
  }

  @IsTest
  static void allFailingDispatchStillRecordsBreakerResults() {
    switchAgentforce(false);
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      true,
      null
    );

    try {
      ContentGenerationController.dispatch(request(false));
      Assert.fail('No provider served');
    } catch (ContentGenerationController.ContentGenerationException e) {
      Assert.isTrue(e.getMessage().contains('Gemini'), 'Gemini named');
    }

    Assert.areEqual(
      1,
      [
        SELECT Consecutive_Failures__c
        FROM Circuit_Breaker_State__c
        WHERE Name = 'gemini'
      ]
      .Consecutive_Failures__c,
      'The failure is counted before the throw'
    );
  }

  @IsTest
  static void attemptDetailHoldsTheHttpStatusAndNoKey() {
    switchAgentforce(false);
    Test.setMock(HttpCalloutMock.class, new GeminiStatusMock(400));

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );
    Test.stopTest();

    ContentGenerationController.Attempt gemini = attemptFor(result, 'Gemini');
    Assert.areEqual('failed', gemini.outcome, 'Failed');
    Assert.areEqual('HTTP 400', gemini.detail, 'Status only, never the body');
    Assert.isFalse(gemini.detail.contains('SECRETKEY'), 'No key');
    Assert.isNull(attemptFor(result, 'Local').detail, 'Served has no detail');
  }

  @IsTest
  static void attemptDetailNamesTheExceptionTypeAndMessage() {
    switchAgentforce(false);
    Test.setMock(HttpCalloutMock.class, new GeminiTimeoutMock());

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );
    Test.stopTest();

    Assert.areEqual(
      'System.CalloutException: Read timed out',
      attemptFor(result, 'Gemini').detail,
      'Exception type and a short message'
    );
  }

  @IsTest
  static void attemptDetailOfAThrowingDoubleIsItsException() {
    useLocalAndFailingGemini(new MockService(true, true, null));

    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );

    Assert.areEqual(
      'System.CalloutException: Service Unavailable',
      attemptFor(result, 'Gemini').detail,
      'Type and message'
    );
  }

  @IsTest
  static void attemptDetailOfUnusableTextSaysSo() {
    useLocalAndFailingGemini(new MockService(true, false, '   '));

    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );

    Assert.areEqual(
      'No usable content',
      attemptFor(result, 'Gemini').detail,
      'Blank text'
    );
  }

  @IsTest
  static void failureDetailRemovesUrlsAndKeys() {
    String detail = ContentGenerationController.failureDetail(
      new CalloutException(
        'Unauthorized endpoint https://generativelanguage.googleapis.com/v1beta?key=SECRETKEY api_key: SECRET2 ' +
        'x'.repeat(200)
      )
    );

    Assert.isFalse(detail.contains('SECRETKEY'), 'URL query removed');
    Assert.isFalse(detail.contains('SECRET2'), 'key pair removed');
    Assert.isFalse(detail.contains('googleapis'), 'No URL');
    Assert.isTrue(detail.startsWith('System.CalloutException: '), 'Type first');
    Assert.areEqual(120, detail.length(), 'Cut to 120 characters');
  }

  @IsTest
  static void geminiReportsAnEmptyAnswerAsAFailureDetail() {
    switchAgentforce(false);
    Test.setMock(HttpCalloutMock.class, new GeminiStatusMock(200));

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      request(true)
    );
    Test.stopTest();

    Assert.areEqual(
      'HTTP 200 with no answer text',
      attemptFor(result, 'Gemini').detail,
      'A 200 without an answer is explained'
    );
  }

  @IsTest
  static void providerStatusReportsWhenTheGeminiCircuitCloses() {
    switchAgentforce(false);
    Datetime start = Datetime.newInstanceGmt(2026, 10, 21, 12, 0, 0);
    CircuitBreaker.nowOverride = start;
    for (Integer i = 0; i < CircuitBreaker.FAILURE_THRESHOLD; i++) {
      CircuitBreaker.recordFailure(CircuitBreaker.KEY_GEMINI);
    }

    List<ContentGenerationController.ProviderStatus> rows = ContentGenerationController.providerStatus();

    Assert.isNull(rows[0].circuitOpenUntil, 'Agentforce closed');
    Assert.areEqual(
      start.addMinutes(30),
      rows[1].circuitOpenUntil,
      'Gemini open for 30 minutes'
    );
    Assert.isNull(rows[2].circuitOpenUntil, 'Local has no breaker');
  }
}

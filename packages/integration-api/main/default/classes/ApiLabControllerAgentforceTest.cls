/**
 * @description       : Unit tests for the Agentforce step of ApiLabController.generateCoverLetter:
 *                      the site guest's letter posted to POST /papi/ai/generate with
 *                      provider Agentforce through Portfolio_API, and every way that call can
 *                      fall back to Gemini in process. An HTTP mock answers both the API and
 *                      Gemini and records every request.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
@IsTest
private class ApiLabControllerAgentforceTest {
  private static final String API_PREFIX = 'callout:Portfolio_API/services/apexrest/papi/ai/generate';
  private static final String GEMINI_PREFIX = 'callout:Gemini_API/';
  private static final String AGENTFORCE_LETTER = 'Dear Acme team, an Agentforce letter.';
  private static final String GEMINI_ANSWER = 'Dear Hiring Manager, a Gemini letter.';
  private static final String API_200_BODY = JSON.serialize(
    new Map<String, Object>{
      'content' => AGENTFORCE_LETTER,
      'provider' => 'Agentforce',
      'model' => 'Portfolio_Cover_Letter',
      'fallbackOccurred' => false,
      'latencyMs' => 2700,
      'attempts' => new List<Object>{
        new Map<String, Object>{
          'provider' => 'Agentforce',
          'outcome' => 'served',
          'ms' => 2700
        }
      },
      'promptShown' => 'the prompt'
    }
  );

  /**
   * @description Answers the API with a fixed status and body, Gemini with a letter, and
   *              records every request. A null API status throws a CalloutException.
   */
  private class RoutingMock implements HttpCalloutMock {
    public List<HttpRequest> requests = new List<HttpRequest>();
    private final Integer apiStatus;
    private final String apiBody;

    RoutingMock(Integer apiStatus, String apiBody) {
      this.apiStatus = apiStatus;
      this.apiBody = apiBody;
    }

    public HttpResponse respond(HttpRequest req) {
      requests.add(req);
      HttpResponse res = new HttpResponse();
      res.setHeader('Content-Type', 'application/json');
      if (req.getEndpoint().startsWith(API_PREFIX)) {
        if (apiStatus == null) {
          throw new CalloutException('Read timed out');
        }
        res.setStatusCode(apiStatus);
        res.setBody(apiBody);
        // The platform refuses a bad session before Apex runs, so a 401 has no rate headers.
        if (apiStatus != 401) {
          res.setHeader('X-RateLimit-Limit', '10');
        }
      } else if (req.getEndpoint().startsWith(GEMINI_PREFIX)) {
        res.setStatusCode(200);
        res.setBody(
          '{"candidates":[{"content":{"parts":[{"text":"' +
            GEMINI_ANSWER +
            '"}]},"finishReason":"STOP"}]}'
        );
      } else {
        res.setStatusCode(500);
        res.setBody('{"message":"unexpected endpoint"}');
      }
      return res;
    }

    Integer callsTo(String prefix) {
      Integer count = 0;
      for (HttpRequest req : requests) {
        if (req.getEndpoint().startsWith(prefix)) {
          count++;
        }
      }
      return count;
    }

    HttpRequest firstTo(String prefix) {
      for (HttpRequest req : requests) {
        if (req.getEndpoint().startsWith(prefix)) {
          return req;
        }
      }
      return null;
    }
  }

  private static void switchAgentforceOn(Decimal timeoutMs) {
    Map<String, Object> fields = new Map<String, Object>{
      'DeveloperName' => 'Agentforce',
      'Enabled__c' => true
    };
    if (timeoutMs != null) {
      fields.put('Timeout_Ms__c', timeoutMs);
    }
    AgentforceService.configOverridden = true;
    AgentforceService.configOverride = (AI_Provider_Config__mdt) JSON.deserialize(
      JSON.serialize(fields),
      AI_Provider_Config__mdt.class
    );
    AgentforceService.guestOverride = null;
  }

  private static RoutingMock mockApi(Integer status, String body) {
    switchAgentforceOn(null);
    RoutingMock mock = new RoutingMock(status, body);
    Test.setMock(HttpCalloutMock.class, mock);
    return mock;
  }

  private static ApiLabController.CoverLetterResult letterAsGuest(
    String description
  ) {
    User guest = SiteGuestTestSupport.preparedGuest();
    ApiLabController.CoverLetterResult result;
    Test.startTest();
    System.runAs(guest) {
      result = ApiLabController.generateCoverLetter(
        'Acme',
        'Architect',
        description
      );
    }
    Test.stopTest();
    return result;
  }

  private static Circuit_Breaker_State__c agentforceBreaker() {
    List<Circuit_Breaker_State__c> rows = [
      SELECT Consecutive_Failures__c, Open_Until__c
      FROM Circuit_Breaker_State__c
      WHERE Name = :CircuitBreaker.KEY_AGENTFORCE
    ];
    return rows.isEmpty() ? null : rows[0];
  }

  // --- Agentforce serves through the API ---

  @IsTest
  static void shouldPostToTheOldPathWhileTheVersionlessSwitchIsOff() {
    PortfolioSettings.overrides.put(
      ApiRoutes.SETTING,
      new Portfolio_Setting__mdt(
        DeveloperName = ApiRoutes.SETTING,
        Text_Value__c = 'Off'
      )
    );
    RoutingMock mock = mockApi(200, '{}');

    letterAsGuest(null);

    Boolean seen = false;
    for (HttpRequest req : mock.requests) {
      if (
        req.getEndpoint() ==
        'callout:Portfolio_API/services/apexrest/papi/v1/ai/generate'
      ) {
        seen = true;
      }
    }
    Assert.isTrue(seen, 'The letter was posted to the /v1/ path');
    Assert.areEqual(0, mock.callsTo(API_PREFIX), 'Not to the versionless one');
  }

  @IsTest
  static void aLetterFromTheApiIsServedAsAgentforceWithNoGeminiCall() {
    RoutingMock mock = mockApi(200, API_200_BODY);

    ApiLabController.CoverLetterResult result = letterAsGuest('Design APIs');

    Assert.areEqual('Agentforce', result.provider, 'Served by Agentforce');
    Assert.areEqual(AGENTFORCE_LETTER, result.content, 'The API letter');
    Assert.areEqual('Portfolio_Cover_Letter', result.model, 'Model');
    Assert.isFalse(result.fallbackOccurred, 'No fallback');
    Assert.areEqual(2700, result.generationMs, 'Dispatch time from the API');
    Assert.areEqual(1, result.attempts.size(), 'The API attempt only');
    Assert.areEqual('served', result.attempts[0].outcome, 'Served');
    Assert.areEqual(2700, result.attempts[0].ms, 'Attempt time');
    Assert.areEqual('the prompt', result.promptShown, 'Prompt shown');
    Assert.areEqual(1, mock.callsTo(API_PREFIX), 'One call to the API');
    Assert.areEqual(0, mock.callsTo(GEMINI_PREFIX), 'Gemini never asked');
    Assert.isNotNull(result.latencyMs, 'Latency measured');
  }

  @IsTest
  static void theApiRequestAsksForAgentforceWithTheJob() {
    RoutingMock mock = mockApi(200, API_200_BODY);

    letterAsGuest('Design APIs');

    HttpRequest req = mock.firstTo(API_PREFIX);
    Assert.areEqual('POST', req.getMethod(), 'POST');
    Assert.areEqual('v2', req.getHeader('X-API-Version'), 'API version');
    Assert.isTrue(
      Pattern.matches(
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
        req.getHeader('X-Request-Id')
      ),
      'A UUID request id'
    );
    Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
      req.getBody()
    );
    Assert.areEqual('Agentforce', body.get('provider'), 'Agentforce only');
    Assert.areEqual('CoverLetter', body.get('type'), 'Type');
    Assert.isFalse(
      body.containsKey('maxLength'),
      'The letter comes back whole'
    );
    Map<String, Object> context = (Map<String, Object>) body.get('context');
    Assert.areEqual('Acme', context.get('companyName'), 'Company');
    Assert.areEqual('Architect', context.get('role'), 'Role');
    Assert.areEqual('Design APIs', context.get('jobDescription'), 'Job');
  }

  @IsTest
  static void noJobDescriptionLeavesItOutOfTheApiRequest() {
    RoutingMock mock = mockApi(200, API_200_BODY);

    letterAsGuest(null);

    Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
      mock.firstTo(API_PREFIX).getBody()
    );
    Map<String, Object> context = (Map<String, Object>) body.get('context');
    Assert.isFalse(context.containsKey('jobDescription'), 'Left out');
  }

  @IsTest
  static void aLetterFromTheApiCountsOnceOnTheAiTierKey() {
    mockApi(200, API_200_BODY);

    letterAsGuest(null);

    List<API_Rate_Window__c> windows = [
      SELECT Key__c, Count__c
      FROM API_Rate_Window__c
      WHERE Key__c LIKE :(ApiLabController.AI_RATE_KEY + '|%')
    ];
    Assert.areEqual(1, windows.size(), 'One window row');
    Assert.areEqual(1, windows[0].Count__c, 'One request counted');
    Assert.areEqual(1, markerCount(), 'The API counted it too, so one marker');
  }

  @IsTest
  static void aCallTheApiNeverCountedLeavesNoMarker() {
    mockApi(401, '{"message":"Session expired or invalid"}');

    letterAsGuest(null);

    Assert.areEqual(0, markerCount(), 'No rate headers, no marker');
  }

  @IsTest
  static void aCallThatFailedAfterTheApiCountedItStillLeavesAMarker() {
    mockApi(503, '{}');

    letterAsGuest(null);

    Assert.areEqual(1, markerCount(), 'The API counted its 503');
  }

  private static Decimal markerCount() {
    AggregateResult total = [
      SELECT SUM(Count__c) requests
      FROM API_Rate_Window__c
      WHERE Key__c LIKE :(ApiLabController.PROXIED_RATE_KEY + '|%')
    ];
    Decimal requests = (Decimal) total.get('requests');
    return requests ?? 0;
  }

  // --- Fallback to Gemini in process ---

  @IsTest
  static void a503FromTheApiFallsToGeminiAndLeavesTheBreakerToTheApi() {
    RoutingMock mock = mockApi(
      503,
      '{"errorCode":"ALL_PROVIDERS_UNAVAILABLE","message":"' +
        ApiMessages.AI_AGENTFORCE_DOWN +
        '"}'
    );

    ApiLabController.CoverLetterResult result = letterAsGuest(null);

    Assert.areEqual('Gemini', result.provider, 'Gemini served');
    Assert.areEqual(GEMINI_ANSWER, result.content, 'Gemini letter');
    Assert.isTrue(result.fallbackOccurred, 'Agentforce failed first');
    Assert.areEqual('Agentforce', result.attempts[0].provider, 'First');
    Assert.areEqual('failed', result.attempts[0].outcome, 'Failed');
    Assert.areEqual('HTTP 503', result.attempts[0].detail, 'Detail');
    Assert.areEqual('Gemini', result.attempts[1].provider, 'Then Gemini');
    Assert.areEqual(2, result.attempts.size(), 'No skipped_off row');
    Assert.areEqual(1, mock.callsTo(GEMINI_PREFIX), 'One Gemini call');
    Assert.isNull(
      agentforceBreaker(),
      'The API records its own breaker result when it answers'
    );
  }

  @IsTest
  static void aRefusedSessionIsNotABreakerFailure() {
    mockApi(401, '{"message":"Session expired or invalid"}');

    ApiLabController.CoverLetterResult result = letterAsGuest(null);

    Assert.areEqual('Gemini', result.provider, 'Gemini served');
    Assert.areEqual('HTTP 401', result.attempts[0].detail, 'Detail');
    Assert.isNull(agentforceBreaker(), 'Not Agentforce failing');
  }

  @IsTest
  static void aRateLimitedLetterNeverTipsTheBreakerOpen() {
    // Each letter is its own transaction, so a burst is shown as the state two earlier
    // failures left: a 429 now must not be the third that opens the circuit.
    insert new Circuit_Breaker_State__c(
      Name = CircuitBreaker.KEY_AGENTFORCE,
      Consecutive_Failures__c = 2
    );
    mockApi(
      429,
      '{"errorCode":"RATE_LIMITED","message":"Rate limit exceeded"}'
    );

    ApiLabController.CoverLetterResult result = letterAsGuest(null);

    Assert.areEqual('Gemini', result.provider, 'Gemini served');
    Assert.areEqual('HTTP 429', result.attempts[0].detail, 'Shown');
    Circuit_Breaker_State__c breaker = agentforceBreaker();
    Assert.areEqual(2, breaker.Consecutive_Failures__c, 'Not counted');
    Assert.isNull(breaker.Open_Until__c, 'The breaker stays closed');
  }

  @IsTest
  static void aUsedHourlyBudgetIsShownAsBudgetExhausted() {
    mockApi(
      503,
      JSON.serialize(
        new Map<String, Object>{
          'errorCode' => 'ALL_PROVIDERS_UNAVAILABLE',
          'message' => PAPIAiGenerate.MESSAGE_AGENTFORCE_BUDGET
        }
      )
    );

    ApiLabController.CoverLetterResult result = letterAsGuest(null);

    Assert.areEqual('Gemini', result.provider, 'Gemini served');
    Assert.areEqual(
      'budget_exhausted',
      result.attempts[0].outcome,
      'Its own outcome'
    );
    Assert.isFalse(result.fallbackOccurred, 'A skip is not a failure');
    Assert.isNull(agentforceBreaker(), 'Not a breaker failure');
  }

  @IsTest
  static void aCalloutFailureRecordsAnAgentforceFailureHere() {
    mockApi(null, null);

    ApiLabController.CoverLetterResult result = letterAsGuest(null);

    Assert.areEqual('Gemini', result.provider, 'Gemini served');
    Assert.areEqual('failed', result.attempts[0].outcome, 'Failed');
    Assert.areEqual(
      'System.CalloutException',
      result.attempts[0].detail,
      'The exception type, never its message'
    );
    Assert.areEqual(
      1,
      agentforceBreaker().Consecutive_Failures__c,
      'One failure'
    );
  }

  @IsTest
  static void a200WithNoLetterIsAFailedAttempt() {
    mockApi(200, '{"content":""}');

    ApiLabController.CoverLetterResult result = letterAsGuest(null);

    Assert.areEqual('Gemini', result.provider, 'Gemini served');
    Assert.areEqual('HTTP 200', result.attempts[0].detail, 'Detail');
    Assert.areEqual(
      1,
      agentforceBreaker().Consecutive_Failures__c,
      'A 200 with no letter counts as a failure'
    );
  }

  @IsTest
  static void anOpenAgentforceCircuitSkipsTheApi() {
    insert new Circuit_Breaker_State__c(
      Name = CircuitBreaker.KEY_AGENTFORCE,
      Consecutive_Failures__c = 3,
      Open_Until__c = Datetime.now().addMinutes(10)
    );
    RoutingMock mock = mockApi(200, API_200_BODY);

    ApiLabController.CoverLetterResult result = letterAsGuest(null);

    Assert.areEqual(0, mock.callsTo(API_PREFIX), 'The API is not called');
    Assert.areEqual(
      'skipped_open_circuit',
      result.attempts[0].outcome,
      'Shown as skipped'
    );
    Assert.areEqual('Gemini', result.provider, 'Gemini served');
    Assert.isFalse(result.fallbackOccurred, 'A skip is not a failure');
  }

  @IsTest
  static void everyProviderDownIsStillAReadableError() {
    mockApi(503, '{}');
    ContentGenerationController.mockGeminiService = new FailingProvider();
    ContentGenerationController.mockLocalService = new FailingProvider();
    User guest = SiteGuestTestSupport.preparedGuest();
    String message;

    Test.startTest();
    System.runAs(guest) {
      try {
        ApiLabController.generateCoverLetter('Acme', 'Architect', null);
      } catch (AuraHandledException e) {
        message = e.getMessage();
      }
    }
    Test.stopTest();

    Assert.areEqual(
      'No AI provider is available right now. Try again later.',
      message,
      'Readable failure'
    );
  }

  // --- The parts ---

  @IsTest
  static void theTimeoutIsTheRecordsWhenItFitsTheCalloutBudget() {
    switchAgentforceOn(20000);

    Integer timeout = ApiLabController.agentforceTimeoutMs();

    Assert.areEqual(20000, timeout, 'The record value');
  }

  @IsTest
  static void theTimeoutIsCappedSoGeminiStillFitsIn120Seconds() {
    switchAgentforceOn(115000);
    Decimal geminiConfigured = AI_Provider_Config__mdt.getInstance('Gemini')
      ?.Timeout_Ms__c;
    Integer geminiMs = geminiConfigured == null
      ? ApiLabController.GEMINI_DEFAULT_TIMEOUT_MS
      : geminiConfigured.intValue();

    Integer timeout = ApiLabController.agentforceTimeoutMs();

    Assert.areEqual(
      ApiLabController.CALLOUT_BUDGET_MS -
        geminiMs -
        ApiLabController.CALLOUT_MARGIN_MS,
      timeout,
      'Agentforce plus Gemini stay inside the transaction callout limit'
    );
  }

  @IsTest
  static void anUnreadableApiBodyIsNoLetter() {
    Assert.isNull(ApiLabController.fromApiBody('not json'), 'Not JSON');
    Assert.isNull(ApiLabController.fromApiBody('[1]'), 'Not an object');
    ApiLabController.CoverLetterResult odd = ApiLabController.fromApiBody(
      '{"content":"x","attempts":"no","latencyMs":"slow"}'
    );
    Assert.areEqual(0, odd.attempts.size(), 'Attempts that are not a list');
    Assert.isNull(odd.generationMs, 'A latency that is not a number');
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
}

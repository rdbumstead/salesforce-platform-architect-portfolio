/**
 * @description       : Unit tests for PAPIAiGenerate REST resource. Providers are always
 *                      mocked and the Agentforce switch is set in memory. No test calls Gemini.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 **/
@IsTest
private class PAPIAiGenerateTest {
  private static final String URI = '/services/apexrest/papi/v1/ai/generate';
  private static final String AGENTFORCE_TEXT = 'Agentforce Content';
  private static final String GEMINI_TEXT = 'Gemini Content for the role';
  private static final String LOCAL_TEXT = 'Local Content';

  /**
   * Provider stand-in that counts how often it is consulted.
   */
  private class ProviderMock implements IAIGenerationService {
    private final Boolean available;
    private final String response;
    private final Boolean fail;
    public Integer calls = 0;
    public String lastPrompt;

    ProviderMock(Boolean available, String response, Boolean fail) {
      this.available = available;
      this.response = response;
      this.fail = fail;
    }

    public Boolean isAvailable() {
      return available;
    }

    public String generateContent(String prompt, Map<String, Object> context) {
      calls++;
      lastPrompt = prompt;
      if (fail) {
        throw new CalloutException('Provider down');
      }
      return response;
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

  private static void initPost(String body) {
    RestTestUtil.initGet(URI);
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = body == null ? null : Blob.valueOf(body);
  }

  private static Map<String, Object> coverLetter() {
    return new Map<String, Object>{
      'type' => 'CoverLetter',
      'context' => new Map<String, Object>{
        'companyName' => 'Acme',
        'role' => 'Architect',
        'jobDescription' => 'Design systems',
        'skills' => new List<Object>{ 'Apex', 'LWC' }
      },
      'tone' => 'Technical',
      'maxLength' => 500
    };
  }

  private static void useProviders(
    ProviderMock agentforce,
    ProviderMock gemini,
    ProviderMock local
  ) {
    switchAgentforce(false);
    ContentGenerationController.mockAgentforceService = agentforce;
    ContentGenerationController.mockGeminiService = gemini;
    ContentGenerationController.mockLocalService = local;
  }

  private static RestResponse post(Map<String, Object> body) {
    return postRaw(JSON.serialize(body));
  }

  private static RestResponse postRaw(String body) {
    initPost(body);
    Test.startTest();
    PAPIAiGenerate.generate();
    Test.stopTest();
    return RestTestUtil.getResponse();
  }

  private static void assertBadRequest(RestResponse res, String fragment) {
    Assert.areEqual(400, res.statusCode, res.responseBody.toString());
    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual('BAD_REQUEST', body.get('errorCode'), 'Error code');
    Assert.isTrue(
      ((String) body.get('message')).contains(fragment),
      'Message should mention ' + fragment + ': ' + body.get('message')
    );
  }

  // --- Validation ---

  @IsTest
  static void invalidTypeIsRejected() {
    Map<String, Object> body = coverLetter();
    body.put('type', 'Poem');
    assertBadRequest(post(body), 'Invalid type');
  }

  @IsTest
  static void missingTypeIsRejected() {
    Map<String, Object> body = coverLetter();
    body.remove('type');
    assertBadRequest(post(body), 'type is required');
  }

  @IsTest
  static void nonStringTypeIsRejected() {
    Map<String, Object> body = coverLetter();
    body.put('type', 7);
    assertBadRequest(post(body), 'Invalid type');
  }

  @IsTest
  static void invalidToneIsRejected() {
    Map<String, Object> body = coverLetter();
    body.put('tone', 'Angry');
    assertBadRequest(post(body), 'Invalid tone');
  }

  @IsTest
  static void maxLengthBelowMinimumIsRejected() {
    Map<String, Object> body = coverLetter();
    body.put('maxLength', 99);
    assertBadRequest(post(body), 'maxLength');
  }

  @IsTest
  static void maxLengthAboveMaximumIsRejected() {
    Map<String, Object> body = coverLetter();
    body.put('maxLength', 1001);
    assertBadRequest(post(body), 'maxLength');
  }

  @IsTest
  static void nonIntegerMaxLengthIsRejected() {
    Map<String, Object> body = coverLetter();
    body.put('maxLength', 'long');
    assertBadRequest(post(body), 'maxLength');
  }

  @IsTest
  static void missingContextIsRejected() {
    Map<String, Object> body = coverLetter();
    body.remove('context');
    assertBadRequest(post(body), 'context is required');
  }

  @IsTest
  static void coverLetterWithoutCompanyIsRejected() {
    Map<String, Object> body = coverLetter();
    ((Map<String, Object>) body.get('context')).remove('companyName');
    assertBadRequest(post(body), 'context.companyName');
  }

  @IsTest
  static void emptyBodyIsRejected() {
    assertBadRequest(postRaw(null), 'Request body is required');
  }

  @IsTest
  static void malformedJsonIsRejected() {
    assertBadRequest(postRaw('{"type":'), 'valid JSON');
  }

  @IsTest
  static void jsonArrayIsRejected() {
    assertBadRequest(postRaw('[1,2]'), 'JSON object');
  }

  // --- Dispatch ---

  @IsTest
  static void geminiServesAndIsReportedWithAttempts() {
    useProviders(
      new ProviderMock(true, AGENTFORCE_TEXT, false),
      new ProviderMock(true, GEMINI_TEXT, false),
      new ProviderMock(true, LOCAL_TEXT, false)
    );

    RestResponse res = post(coverLetter());

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(200, res.statusCode, res.responseBody.toString());
    Assert.areEqual(GEMINI_TEXT, body.get('content'), 'Gemini text');
    Assert.areEqual('Gemini', body.get('provider'), 'Provider field');
    Assert.areEqual('Gemini', res.headers.get('X-AI-Provider'), 'Header');
    Assert.areEqual(false, body.get('fallbackOccurred'), 'Primary served');
    Assert.areEqual('Technical', body.get('tone'), 'Tone echoed');
    Assert.isNotNull(res.headers.get('X-Generation-Time-Ms'), 'Timing');
    Assert.areEqual(
      'no-store, no-cache',
      res.headers.get('Cache-Control'),
      'AI output is never cached'
    );
    Assert.areEqual(
      '10',
      res.headers.get('X-RateLimit-Limit'),
      'The ai tier applies by path'
    );
    Assert.isNotNull(body.get('latencyMs'), 'Dispatch time in the body');
    Assert.isTrue(
      ((String) body.get('promptShown')).contains('companyName: Acme'),
      'Prompt sent to Gemini is returned'
    );
    List<Object> attempts = (List<Object>) body.get('attempts');
    Assert.areEqual(2, attempts.size(), 'Agentforce skipped, Gemini served');
    Map<String, Object> skipped = (Map<String, Object>) attempts[0];
    Assert.areEqual('Agentforce', skipped.get('provider'), 'First attempt');
    Assert.areEqual('skipped_off', skipped.get('outcome'), 'Switch is off');
    Map<String, Object> served = (Map<String, Object>) attempts[1];
    Assert.areEqual('served', served.get('outcome'), 'Gemini served');
  }

  @IsTest
  static void switchedOffAgentforceIsNeverAskedToGenerate() {
    ProviderMock agentforce = new ProviderMock(false, AGENTFORCE_TEXT, false);
    useProviders(
      agentforce,
      new ProviderMock(false, null, false),
      new ProviderMock(true, LOCAL_TEXT, false)
    );

    RestResponse res = post(coverLetter());

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(200, res.statusCode, res.responseBody.toString());
    Assert.areEqual('Local', body.get('provider'), 'Local fallback served');
    Assert.areEqual(0, agentforce.calls, 'Agentforce never generated');
    Assert.areEqual(true, body.get('fallbackOccurred'), 'Fallback flagged');
    Assert.isNull(body.get('promptShown'), 'The template uses no prompt');
  }

  @IsTest
  static void productionAgentforceIsNeverReportedEvenWhenSwitchedOn() {
    useProviders(
      null,
      new ProviderMock(true, GEMINI_TEXT, false),
      new ProviderMock(true, LOCAL_TEXT, false)
    );
    switchAgentforce(true);

    RestResponse res = post(coverLetter());

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(200, res.statusCode, res.responseBody.toString());
    Assert.areEqual('Gemini', body.get('provider'), 'Spec enum holds');
    Assert.areEqual('Gemini', res.headers.get('X-AI-Provider'), 'Header');
    Map<String, Object> first = (Map<String, Object>) ((List<Object>) body.get(
      'attempts'
    ))[0];
    Assert.areEqual('failed', first.get('outcome'), 'The mock throws');
    Assert.areEqual(true, body.get('fallbackOccurred'), 'Earlier failure');
  }

  @IsTest
  static void coverLetterPromptIsGroundedOnFeaturedProjects() {
    insert new Project__c(
      Name = 'Grounding Sentinel Project',
      Sort_Order__c = 1,
      Is_Featured__c = true,
      Status__c = 'Active Development'
    );
    ProviderMock gemini = new ProviderMock(true, GEMINI_TEXT, false);
    useProviders(null, gemini, new ProviderMock(true, LOCAL_TEXT, false));

    post(coverLetter());

    Assert.isTrue(
      gemini.lastPrompt.contains('Grounding Sentinel Project'),
      gemini.lastPrompt
    );
  }

  @IsTest
  static void geminiErrorTextFallsBackToLocal() {
    useProviders(
      null,
      new ProviderMock(
        true,
        'Error: Unable to generate content. (Status: 500)',
        false
      ),
      new ProviderMock(true, LOCAL_TEXT, false)
    );

    post(coverLetter());

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual('Local', body.get('provider'), 'Error text is a failure');
    Assert.areEqual(LOCAL_TEXT, body.get('content'), 'Local text returned');
  }

  @IsTest
  static void nonCoverLetterWithGeminiDownIs503() {
    ProviderMock local = new ProviderMock(true, LOCAL_TEXT, false);
    ProviderMock gemini = new ProviderMock(true, null, true);
    useProviders(null, gemini, local);
    Map<String, Object> body = coverLetter();
    body.put('type', 'BioSummary');

    RestResponse res = post(body);

    Assert.areEqual(503, res.statusCode, 'No provider can serve a bio');
    Assert.areEqual(
      'ALL_PROVIDERS_UNAVAILABLE',
      RestTestUtil.getBodyAsMap().get('errorCode'),
      'Spec error code for /ai/generate 503'
    );
    Assert.areEqual(
      0,
      local.calls,
      'The cover-letter template is not used for other types'
    );
    Assert.isFalse(
      gemini.lastPrompt.contains('Facts about'),
      'Only cover letters are grounded'
    );
  }

  @IsTest
  static void contentIsCutToMaxLength() {
    useProviders(
      null,
      new ProviderMock(true, 'x'.repeat(2000), false),
      new ProviderMock(true, LOCAL_TEXT, false)
    );
    Map<String, Object> body = coverLetter();
    body.put('maxLength', 100);

    post(body);

    Assert.areEqual(
      100,
      ((String) RestTestUtil.getBodyAsMap().get('content')).length(),
      'Content never exceeds maxLength'
    );
  }

  @IsTest
  static void defaultsApplyWhenToneAndMaxLengthAreOmitted() {
    useProviders(
      null,
      new ProviderMock(true, GEMINI_TEXT, false),
      new ProviderMock(true, LOCAL_TEXT, false)
    );
    Map<String, Object> body = coverLetter();
    body.remove('tone');
    body.remove('maxLength');

    post(body);

    Assert.areEqual(
      'Professional',
      RestTestUtil.getBodyAsMap().get('tone'),
      'Default tone'
    );
  }

  @IsTest
  static void promptCarriesTypeToneLengthAndContext() {
    Map<String, Object> body = coverLetter();

    PAPIAiGenerate.GenerationRequest request = PAPIAiGenerate.parse(
      Blob.valueOf(JSON.serialize(body))
    );
    String prompt = request.prompt();

    Assert.isTrue(prompt.contains('cover letter'), prompt);
    Assert.isTrue(prompt.contains('technical tone'), prompt);
    Assert.isTrue(prompt.contains('500 characters'), prompt);
    Assert.isTrue(prompt.contains('skills: Apex, LWC'), prompt);
    Assert.areEqual(
      'Architect',
      request.providerContext().get('jobTitle'),
      'role is passed to providers as jobTitle'
    );
  }

  @IsTest
  static void internalErrorReturns500() {
    PAPIAiGenerate.throwException = true;

    RestResponse res = post(coverLetter());

    Assert.areEqual(500, res.statusCode, 'Unexpected failures are a 500');
  }
}

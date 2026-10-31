/**
 * @description       : Unit tests for the optional provider field of POST /papi/v1/ai/generate.
 *                      provider Agentforce runs Agentforce only: no Gemini, no template, 503 on
 *                      failure, the site's cover letter prompt, and the whole letter unless
 *                      maxLength is sent. Providers are doubles and the switch is set in memory.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
@IsTest
private class PAPIAiGenerateAgentforceTest {
  private static final String URI = '/services/apexrest/papi/v1/ai/generate';

  /** Provider double that counts calls and keeps the last prompt. */
  private class ProviderMock implements IAIGenerationService {
    private final String response;
    private final Boolean fail;
    public Integer calls = 0;
    public String lastPrompt;

    ProviderMock(String response, Boolean fail) {
      this.response = response;
      this.fail = fail;
    }

    public Boolean isAvailable() {
      return true;
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

  private static ProviderMock agentforce;
  private static ProviderMock gemini;
  private static ProviderMock local;

  private static void useProviders(String agentforceText, Boolean fails) {
    AgentforceService.configOverridden = true;
    AgentforceService.configOverride = (AI_Provider_Config__mdt) JSON.deserialize(
      '{"DeveloperName":"Agentforce","Enabled__c":true}',
      AI_Provider_Config__mdt.class
    );
    AgentforceService.guestOverride = false;
    agentforce = new ProviderMock(agentforceText, fails);
    gemini = new ProviderMock('Gemini text', false);
    local = new ProviderMock('Local text', false);
    ContentGenerationController.mockAgentforceService = agentforce;
    ContentGenerationController.mockGeminiService = gemini;
    ContentGenerationController.mockLocalService = local;
  }

  private static Map<String, Object> agentforceLetter() {
    return new Map<String, Object>{
      'type' => 'CoverLetter',
      'provider' => 'Agentforce',
      'context' => new Map<String, Object>{
        'companyName' => 'Acme',
        'role' => 'Architect',
        'jobDescription' => 'Design APIs'
      }
    };
  }

  private static RestResponse post(Map<String, Object> body) {
    RestTestUtil.initGet(URI);
    RestContext.request.httpMethod = 'POST';
    RestContext.request.requestBody = Blob.valueOf(JSON.serialize(body));
    Test.startTest();
    PAPIAiGenerate.generate();
    Test.stopTest();
    return RestTestUtil.getResponse();
  }

  @IsTest
  static void agentforceServesAndNoOtherProviderIsAsked() {
    useProviders('An Agentforce letter', false);

    RestResponse res = post(agentforceLetter());

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(200, res.statusCode, res.responseBody.toString());
    Assert.areEqual('Agentforce', body.get('provider'), 'Provider');
    Assert.areEqual('Agentforce', res.headers.get('X-AI-Provider'), 'Header');
    Assert.areEqual('An Agentforce letter', body.get('content'), 'Content');
    Assert.areEqual(0, gemini.calls, 'Gemini never asked');
    Assert.areEqual(0, local.calls, 'Template never asked');
    Assert.areEqual(
      1,
      ((List<Object>) body.get('attempts')).size(),
      'One attempt'
    );
  }

  @IsTest
  static void theCoverLetterUsesTheSitesPrompt() {
    useProviders('An Agentforce letter', false);

    post(agentforceLetter());

    Assert.areEqual(
      ContentGenerationController.coverLetterPrompt(
        'Acme',
        'Architect',
        'Design APIs'
      ),
      agentforce.lastPrompt,
      'One prompt builder for the site letter'
    );
  }

  @IsTest
  static void theLetterComesBackWholeWithNoMaxLength() {
    String longLetter = 'word '.repeat(400).trim();
    useProviders(longLetter, false);

    post(agentforceLetter());

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(longLetter, body.get('content'), 'Never cut');
  }

  @IsTest
  static void aSentMaxLengthStillCutsTheLetter() {
    useProviders('word '.repeat(400).trim(), false);
    Map<String, Object> request = agentforceLetter();
    request.put('maxLength', 200);

    post(request);

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(
      200,
      ((String) body.get('content')).length(),
      'Cut to maxLength'
    );
  }

  @IsTest
  static void aFailedAgentforceIs503AndNeverTheTemplate() {
    useProviders(null, true);

    RestResponse res = post(agentforceLetter());

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(503, res.statusCode, res.responseBody.toString());
    Assert.areEqual(
      'ALL_PROVIDERS_UNAVAILABLE',
      body.get('errorCode'),
      'Error code'
    );
    Assert.areEqual(
      ApiMessages.AI_AGENTFORCE_DOWN,
      body.get('message'),
      'Names Agentforce'
    );
    Assert.areEqual(0, gemini.calls, 'Gemini never asked');
    Assert.areEqual(0, local.calls, 'Template never asked');
  }

  @IsTest
  static void aFailedAgentforceRecordsItsBreakerFailure() {
    useProviders(null, true);

    post(agentforceLetter());

    List<Circuit_Breaker_State__c> rows = [
      SELECT Consecutive_Failures__c
      FROM Circuit_Breaker_State__c
      WHERE Name = :CircuitBreaker.KEY_AGENTFORCE
    ];
    Assert.areEqual(1, rows.size(), 'One breaker row');
    Assert.areEqual(1, rows[0].Consecutive_Failures__c, 'One failure');
  }

  @IsTest
  static void aUsedHourlyBudgetIs503ThatSaysSo() {
    useProviders('An Agentforce letter', false);
    AgentforceService.configOverride = (AI_Provider_Config__mdt) JSON.deserialize(
      '{"DeveloperName":"Agentforce","Enabled__c":true,"Hourly_Budget__c":0}',
      AI_Provider_Config__mdt.class
    );

    RestResponse res = post(agentforceLetter());

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(503, res.statusCode, res.responseBody.toString());
    Assert.areEqual(
      PAPIAiGenerate.MESSAGE_AGENTFORCE_BUDGET,
      body.get('message'),
      'Says the budget is used'
    );
    Assert.areEqual(0, agentforce.calls, 'The template never ran');
    Assert.areEqual(0, gemini.calls, 'Gemini never asked');
  }

  @IsTest
  static void anUnknownProviderIs400() {
    useProviders('text', false);
    Map<String, Object> request = agentforceLetter();
    request.put('provider', 'Gemini');

    RestResponse res = post(request);

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(400, res.statusCode, res.responseBody.toString());
    Assert.isTrue(
      ((String) body.get('message'))
        .contains(
          ApiMessages.fieldInvalid('provider', new List<String>{ 'Agentforce' })
        ),
      (String) body.get('message')
    );
    Assert.areEqual(0, agentforce.calls, 'Nothing generated');
  }

  @IsTest
  static void aNullProviderIs400() {
    useProviders('text', false);
    Map<String, Object> request = agentforceLetter();
    request.put('provider', null);

    RestResponse res = post(request);

    Assert.areEqual(400, res.statusCode, res.responseBody.toString());
  }

  @IsTest
  static void withoutProviderTheWholeChainRunsAsBefore() {
    useProviders(null, true);
    Map<String, Object> request = agentforceLetter();
    request.remove('provider');

    RestResponse res = post(request);

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(200, res.statusCode, res.responseBody.toString());
    Assert.areEqual('Gemini', body.get('provider'), 'Falls to Gemini');
    Assert.isTrue(
      gemini.lastPrompt.startsWith('Write a cover letter for Ryan Bumstead'),
      'The API prompt, not the site prompt'
    );
  }

  @IsTest
  static void anotherTypeAskedOfAgentforceKeepsTheApiPromptAndCut() {
    useProviders('word '.repeat(400).trim(), false);
    Map<String, Object> request = new Map<String, Object>{
      'type' => 'BioSummary',
      'provider' => 'Agentforce',
      'context' => new Map<String, Object>{ 'role' => 'Architect' }
    };

    post(request);

    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.isTrue(
      agentforce.lastPrompt.startsWith('Write a professional bio summary'),
      agentforce.lastPrompt
    );
    Assert.isTrue(
      ((String) body.get('content')).length() <
      'word '.repeat(400).trim().length(),
      'Cut to the default length'
    );
  }
}

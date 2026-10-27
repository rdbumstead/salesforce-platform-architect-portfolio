/**
 * @description       : Unit tests for the two dispatch options of ContentGenerationController:
 *                      agentforceOnly (Agentforce serves or the dispatch throws, nothing else is
 *                      asked) and skipAgentforce (the chain starts at Gemini and records no
 *                      Agentforce attempt). Providers are doubles and the switch is set in memory.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
@IsTest
private class ContentGenerationControllerOptionsTest {
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

  private static MockService agentforce;
  private static MockService gemini;
  private static MockService local;

  private static void useProviders(MockService agentforceDouble) {
    agentforce = agentforceDouble;
    gemini = new MockService(true, false, 'Gemini text');
    local = new MockService(true, false, 'Local text');
    ContentGenerationController.mockAgentforceService = agentforce;
    ContentGenerationController.mockGeminiService = gemini;
    ContentGenerationController.mockLocalService = local;
  }

  private static ContentGenerationController.GenerationRequest request() {
    return new ContentGenerationController.GenerationRequest(
      'Write a cover letter',
      new Map<String, Object>{ 'companyName' => 'Acme' },
      true
    );
  }

  @IsTest
  static void bothOptionsDefaultToFalse() {
    ContentGenerationController.GenerationRequest plain = request();

    Assert.isFalse(plain.agentforceOnly, 'agentforceOnly off by default');
    Assert.isFalse(plain.skipAgentforce, 'skipAgentforce off by default');
  }

  @IsTest
  static void agentforceOnlyServesFromAgentforce() {
    useProviders(new MockService(true, false, 'Agentforce text'));
    ContentGenerationController.GenerationRequest only = request();
    only.agentforceOnly = true;

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      only
    );
    Test.stopTest();

    Assert.areEqual('Agentforce', result.provider, 'Agentforce served');
    Assert.areEqual('Agentforce text', result.content, 'Its text');
    Assert.isFalse(result.fallbackOccurred, 'No fallback');
    Assert.areEqual(0, gemini.generateCalls, 'Gemini never asked');
  }

  @IsTest
  static void agentforceOnlyThatFailsThrowsAndAsksNobodyElse() {
    useProviders(new MockService(true, true, null));
    ContentGenerationController.GenerationRequest only = request();
    only.agentforceOnly = true;

    Test.startTest();
    try {
      ContentGenerationController.dispatch(only);
      Assert.fail('Expected ContentGenerationException');
    } catch (ContentGenerationController.ContentGenerationException e) {
      Assert.isTrue(
        e.getMessage().contains('Agentforce did not serve'),
        e.getMessage()
      );
    }
    Test.stopTest();

    Assert.areEqual(0, gemini.generateCalls, 'Gemini never asked');
    Assert.areEqual(0, local.generateCalls, 'Template never asked');
  }

  @IsTest
  static void agentforceOnlyThatFailsRecordsItsBreakerFailure() {
    useProviders(new MockService(true, true, null));
    ContentGenerationController.GenerationRequest only = request();
    only.agentforceOnly = true;

    Test.startTest();
    try {
      ContentGenerationController.dispatch(only);
    } catch (ContentGenerationController.ContentGenerationException e) {
      Assert.isNotNull(e.getMessage(), 'Thrown as expected');
    }
    Test.stopTest();

    Circuit_Breaker_State__c row = Circuit_Breaker_State__c.getInstance(
      CircuitBreaker.KEY_AGENTFORCE
    );
    Assert.isNotNull(row, 'Breaker row written');
    Assert.areEqual(1, row.Consecutive_Failures__c, 'One failure');
  }

  @IsTest
  static void agentforceOnlyWithTheSwitchOffThrows() {
    useProviders(new MockService(false, false, 'never'));
    ContentGenerationController.GenerationRequest only = request();
    only.agentforceOnly = true;

    Test.startTest();
    try {
      ContentGenerationController.dispatch(only);
      Assert.fail('Expected ContentGenerationException');
    } catch (ContentGenerationController.ContentGenerationException e) {
      Assert.isTrue(e.getMessage().contains('unavailable'), e.getMessage());
    }
    Test.stopTest();

    Assert.areEqual(0, agentforce.generateCalls, 'Off means off');
  }

  @IsTest
  static void skipAgentforceStartsAtGeminiWithNoAgentforceAttempt() {
    useProviders(new MockService(true, false, 'Agentforce text'));
    ContentGenerationController.GenerationRequest skip = request();
    skip.skipAgentforce = true;

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      skip
    );
    Test.stopTest();

    Assert.areEqual('Gemini', result.provider, 'Gemini served');
    Assert.areEqual(0, agentforce.generateCalls, 'Agentforce not asked');
    Assert.areEqual(1, result.attempts.size(), 'Only the Gemini attempt');
    Assert.areEqual('Gemini', result.attempts[0].provider, 'Gemini');
  }

  @IsTest
  static void skipAgentforceStillFallsToTheTemplate() {
    useProviders(new MockService(true, false, 'Agentforce text'));
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      true,
      null
    );
    ContentGenerationController.GenerationRequest skip = request();
    skip.skipAgentforce = true;

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.dispatch(
      skip
    );
    Test.stopTest();

    Assert.areEqual('Local', result.provider, 'Template served');
    Assert.areEqual(2, result.attempts.size(), 'Gemini then Local');
  }
}

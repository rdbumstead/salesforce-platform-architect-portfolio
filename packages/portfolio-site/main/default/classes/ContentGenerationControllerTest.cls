/**
 * @description       : Unit tests for ContentGenerationController class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class ContentGenerationControllerTest {
  // Mock implementation of IAIGenerationService
  private class MockService implements IAIGenerationService {
    private Boolean isAvailable;
    private Boolean throwCalloutException;
    private Boolean throwGenericException;
    private String response;

    public MockService(
      Boolean isAvailable,
      Boolean throwCalloutException,
      Boolean throwGenericException,
      String response
    ) {
      this.isAvailable = isAvailable;
      this.throwCalloutException = throwCalloutException;
      this.throwGenericException = throwGenericException;
      this.response = response;
    }

    public Boolean isAvailable() {
      return this.isAvailable;
    }

    public String generateContent(String prompt, Map<String, Object> context) {
      if (throwCalloutException) {
        throw new CalloutException('Service Unavailable');
      }
      if (throwGenericException) {
        throw new IllegalArgumentException('Generic Error');
      }
      return response;
    }
  }

  @IsTest
  static void testGenerateCoverLetterGoldPath() {
    // Setup Mock: Agentforce works
    ContentGenerationController.mockAgentforceService = new MockService(
      true,
      false,
      false,
      'Agentforce Content'
    );

    Test.startTest();
    String result = ContentGenerationController.generateCoverLetter(
      'Salesforce',
      'Architect',
      'Desc'
    );
    Test.stopTest();

    System.assertEquals(
      'Agentforce Content',
      result,
      'Should use Agentforce when available'
    );
  }

  @IsTest
  static void testGenerateCoverLetterSilverPath() {
    // Setup Mock: Agentforce fails/unavailable, Gemini works
    ContentGenerationController.mockAgentforceService = new MockService(
      false,
      false,
      false,
      null
    ); // Not available
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      false,
      'Gemini Content'
    );

    Test.startTest();
    String result = ContentGenerationController.generateCoverLetter(
      'Salesforce',
      'Architect',
      'Desc'
    );
    Test.stopTest();

    System.assertEquals(
      'Gemini Content',
      result,
      'Should fallback to Gemini when Agentforce is unavailable'
    );
  }

  @IsTest
  static void testGenerateCoverLetterBronzePath() {
    // Setup Mock: Agentforce & Gemini fail, Local works (default)
    ContentGenerationController.mockAgentforceService = new MockService(
      true,
      true,
      false,
      null
    ); // Throws CalloutException
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      true,
      null
    ); // Throws Generic Exception
    ContentGenerationController.mockLocalService = new MockService(
      true,
      false,
      false,
      'Local Content'
    );

    Test.startTest();
    String result = ContentGenerationController.generateCoverLetter(
      'Salesforce',
      'Architect',
      'Desc'
    );
    Test.stopTest();

    System.assertEquals(
      'Local Content',
      result,
      'Should fallback to Local when others fail'
    );
  }

  @IsTest
  static void testGenerateCoverLetterAllFail() {
    // Setup Mock: All fail
    ContentGenerationController.mockAgentforceService = new MockService(
      false,
      false,
      false,
      null
    );
    ContentGenerationController.mockGeminiService = new MockService(
      false,
      false,
      false,
      null
    );
    ContentGenerationController.mockLocalService = new MockService(
      true,
      false,
      true,
      null
    ); // Throws Exception

    try {
      Test.startTest();
      ContentGenerationController.generateCoverLetter(
        'Salesforce',
        'Architect',
        'Desc'
      );
      Test.stopTest();
      System.assert(false, 'Should have thrown AuraHandledException');
    } catch (AuraHandledException e) {
      System.assert(true, 'Exception thrown as expected');
    }
  }

  @IsTest
  static void testValidation() {
    try {
      ContentGenerationController.generateCoverLetter(
        null,
        'Architect',
        'Desc'
      );
      System.assert(false, 'Should throw exception for missing company');
    } catch (AuraHandledException e) {
      System.assert(true);
    }

    try {
      ContentGenerationController.generateCoverLetter(
        'Salesforce',
        null,
        'Desc'
      );
      System.assert(false, 'Should throw exception for missing job title');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
  }

  @IsTest
  static void coverLetterFallsBackPastUnexpectedAndCalloutErrors() {
    ContentGenerationController.mockAgentforceService = new MockService(
      true,
      false,
      true,
      null
    ); // Generic exception
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      true,
      false,
      null
    ); // CalloutException
    ContentGenerationController.mockLocalService = new MockService(
      true,
      false,
      false,
      'Local Content'
    );

    Test.startTest();
    String result = ContentGenerationController.generateCoverLetter(
      'Salesforce',
      'Architect',
      'Desc'
    );
    Test.stopTest();

    Assert.areEqual(
      'Local Content',
      result,
      'Both earlier providers fail, so Local serves'
    );
  }

  // --- generateWithoutAgentforce (PAPI /ai/generate dispatch, build plan P5) ---

  private class CountingService implements IAIGenerationService {
    public Integer calls = 0;

    public Boolean isAvailable() {
      calls++;
      return true;
    }

    public String generateContent(String prompt, Map<String, Object> context) {
      calls++;
      return 'Agentforce Content';
    }
  }

  private static Map<String, Object> context() {
    return new Map<String, Object>{
      'companyName' => 'Salesforce',
      'jobTitle' => 'Architect'
    };
  }

  @IsTest
  static void apiDispatchUsesGeminiAndNeverAgentforce() {
    CountingService agentforce = new CountingService();
    ContentGenerationController.mockAgentforceService = agentforce;
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      false,
      'Gemini Content'
    );

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.generateWithoutAgentforce(
      'prompt',
      context(),
      true
    );
    Test.stopTest();

    Assert.areEqual('Gemini Content', result.content, 'Gemini text');
    Assert.areEqual(
      ContentGenerationController.PROVIDER_GEMINI,
      result.provider,
      'Provider is Gemini'
    );
    Assert.areEqual(
      ContentGenerationController.MODEL_GEMINI,
      result.model,
      'Model'
    );
    Assert.isFalse(result.fallbackOccurred, 'Primary served');
    Assert.areEqual(0, agentforce.calls, 'Agentforce is never consulted');
  }

  @IsTest
  static void apiDispatchTreatsGeminiErrorTextAsFailure() {
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      false,
      'Exception: Unauthorized endpoint'
    );
    ContentGenerationController.mockLocalService = new MockService(
      true,
      false,
      false,
      'Local Content'
    );

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.generateWithoutAgentforce(
      'prompt',
      context(),
      true
    );
    Test.stopTest();

    Assert.areEqual(
      ContentGenerationController.PROVIDER_LOCAL,
      result.provider,
      'Error text is not content'
    );
    Assert.isTrue(result.fallbackOccurred, 'Fallback flagged');
  }

  @IsTest
  static void apiDispatchFallsBackWhenGeminiThrows() {
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      true,
      false,
      null
    );
    ContentGenerationController.mockLocalService = new MockService(
      true,
      false,
      false,
      'Local Content'
    );

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.generateWithoutAgentforce(
      'prompt',
      context(),
      true
    );
    Test.stopTest();

    Assert.areEqual('Local Content', result.content, 'Local served');
  }

  @IsTest
  static void apiDispatchThrowsWhenLocalNotAllowed() {
    ContentGenerationController.mockGeminiService = new MockService(
      false,
      false,
      false,
      null
    );

    Test.startTest();
    try {
      ContentGenerationController.generateWithoutAgentforce(
        'prompt',
        context(),
        false
      );
      Assert.fail('Expected ContentGenerationException');
    } catch (ContentGenerationController.ContentGenerationException e) {
      Assert.isTrue(
        e.getMessage().contains('Gemini: unavailable'),
        e.getMessage()
      );
    }
    Test.stopTest();
  }

  @IsTest
  static void apiDispatchThrowsWhenLocalFails() {
    ContentGenerationController.mockGeminiService = new MockService(
      true,
      false,
      false,
      ''
    );
    ContentGenerationController.mockLocalService = new MockService(
      true,
      false,
      true,
      null
    );

    Test.startTest();
    try {
      ContentGenerationController.generateWithoutAgentforce(
        'prompt',
        context(),
        true
      );
      Assert.fail('Expected ContentGenerationException');
    } catch (ContentGenerationController.ContentGenerationException e) {
      Assert.isTrue(
        e.getMessage().contains('LocalTemplate: Generic Error'),
        e.getMessage()
      );
    }
    Test.stopTest();
  }

  @IsTest
  static void apiDispatchThrowsWhenLocalReturnsNothing() {
    ContentGenerationController.mockGeminiService = new MockService(
      false,
      false,
      false,
      null
    );
    ContentGenerationController.mockLocalService = new MockService(
      true,
      false,
      false,
      ''
    );

    Test.startTest();
    try {
      ContentGenerationController.generateWithoutAgentforce(
        'prompt',
        context(),
        true
      );
      Assert.fail('Expected ContentGenerationException');
    } catch (ContentGenerationController.ContentGenerationException e) {
      Assert.isTrue(
        e.getMessage().contains('LocalTemplate: no content'),
        e.getMessage()
      );
    }
    Test.stopTest();
  }

  private class GeminiHttpMock implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest req) {
      HttpResponse res = new HttpResponse();
      res.setStatusCode(200);
      res.setBody(
        '{"candidates":[{"content":{"parts":[{"text":"Real Gemini Text"}]}}]}'
      );
      return res;
    }
  }

  @IsTest
  static void apiDispatchUsesRealServicesWhenNotMocked() {
    Test.setMock(HttpCalloutMock.class, new GeminiHttpMock());

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.generateWithoutAgentforce(
      'prompt',
      context(),
      true
    );
    Test.stopTest();

    Assert.areEqual(
      'Real Gemini Text',
      result.content,
      'GeminiService parses the mocked HTTP response'
    );
  }

  @IsTest
  static void apiDispatchUsesRealLocalTemplateWhenNotMocked() {
    ContentGenerationController.mockGeminiService = new MockService(
      false,
      false,
      false,
      null
    );

    Test.startTest();
    ContentGenerationController.GenerationResult result = ContentGenerationController.generateWithoutAgentforce(
      'prompt',
      context(),
      true
    );
    Test.stopTest();

    Assert.isTrue(
      result.content.contains('Salesforce'),
      'LocalTemplateService fills in the company'
    );
  }
}

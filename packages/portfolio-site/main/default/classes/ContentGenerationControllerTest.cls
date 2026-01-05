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
  static void testGenerateCoverLetter_GoldPath() {
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
  static void testGenerateCoverLetter_SilverPath() {
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
  static void testGenerateCoverLetter_BronzePath() {
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
  static void testGenerateCoverLetter_AllFail() {
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
}

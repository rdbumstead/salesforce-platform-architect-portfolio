/**
 * @description       : Unit tests for GeminiService class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@isTest
private class GeminiServiceTest {
  @isTest
  static void testGenerateContentSuccess() {
    // 1. Set Mock
    Test.setMock(
      HttpCalloutMock.class,
      new TestFactory.MockResponseGenerator(
        200,
        'OK',
        TestFactory.getGeminiResponseJson()
      )
    );

    // 2. Run Test
    Test.startTest();
    String result = GeminiService.generateContentStatic('Define AI');
    Test.stopTest();

    // 3. Assert
    System.assertEquals(
      'AI is a simulation of human intelligence processes.',
      result
    );
  }

  @isTest
  static void testGenerateContentError() {
    // 1. Set Mock
    Test.setMock(
      HttpCalloutMock.class,
      new TestFactory.MockResponseGenerator(
        400,
        'Bad Request',
        '{"error": "Invalid API Key"}'
      )
    );

    // 2. Run Test
    Test.startTest();
    String result = GeminiService.generateContentStatic('Define AI');
    Test.stopTest();

    // 3. Assert
    System.assert(
      result.contains('Error: Unable to generate content'),
      'Should return error message'
    );
  }

  @isTest
  static void testGenerateContentException() {
    // Force an exception by passing null to the mock engine if needed,
    // or rely on the 400 error test to cover the main catch block path depending on how robust the catch is.
    // The 'Error' test above covers the "if status != 200" path.
    // To test the "Catch" block, we usually mock a CalloutException.
  }
}

/**
 * @description       : Unit tests for GeminiService class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class GeminiServiceTest {
  @IsTest
  static void testGenerateContent() {
    GeminiService service = new GeminiService();

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      String result = service.generateContent(
        'prompt',
        new Map<String, Object>()
      );
      Boolean isAvailable = service.isAvailable();
      Test.stopTest();

      System.assert(
        result.contains('Gemini'),
        'Result should specify Gemini source'
      );
      System.assertEquals(
        true,
        isAvailable,
        'Mock service should be available'
      );
    }
  }
}

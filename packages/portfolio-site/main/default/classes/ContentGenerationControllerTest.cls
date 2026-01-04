/**
 * @description       : Unit tests for ContentGenerationController class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class ContentGenerationControllerTest {
  @IsTest
  static void testGenerateCoverLetter() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      String result = ContentGenerationController.generateCoverLetter(
        'Salesforce',
        'Architect',
        'Desc'
      );
      Test.stopTest();

      // Since we are mocking everything to true, it should pick the first one (Agentforce)
      System.assert(
        result.contains('Agentforce'),
        'Should pick Gold Path (Agentforce) by default'
      );
    }
  }
}

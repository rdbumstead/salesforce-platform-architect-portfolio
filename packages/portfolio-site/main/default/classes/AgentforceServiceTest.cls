/**
 * @description       : Unit tests for AgentforceService class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class AgentforceServiceTest {
  @IsTest
  static void testGenerateContent() {
    AgentforceService service = new AgentforceService();

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      String result = service.generateContent(
        'prompt',
        new Map<String, Object>()
      );
      Boolean isAvailable = service.isAvailable();
      Test.stopTest();

      System.assert(
        result.contains('Agentforce'),
        'Result should specify Agentforce source'
      );
      System.assertEquals(
        true,
        isAvailable,
        'Mock service should be available'
      );
    }
  }
}

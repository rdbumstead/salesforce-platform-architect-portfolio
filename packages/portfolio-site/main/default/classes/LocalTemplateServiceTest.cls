/**
 * @description       : Unit tests for LocalTemplateService class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class LocalTemplateServiceTest {
  @IsTest
  static void testGenerateContent() {
    LocalTemplateService service = new LocalTemplateService();
    Map<String, Object> context = new Map<String, Object>{
      'jobTitle' => 'Architect',
      'companyName' => 'Salesforce'
    };

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      String result = service.generateContent('prompt', context);
      Boolean isAvailable = service.isAvailable();
      Test.stopTest();

      System.assert(
        result.contains('Salesforce'),
        'Result should contain company name'
      );
      System.assert(
        result.contains('Architect'),
        'Result should contain job title'
      );
      System.assertEquals(
        true,
        isAvailable,
        'Local service should always be available'
      );
    }
  }
}

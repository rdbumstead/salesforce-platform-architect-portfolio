@isTest
private class PortfolioServiceTest {
  @isTest
  static void testGetConfig() {
    // Inject Mock
    Portfolio_Config__mdt mock = new Portfolio_Config__mdt(
      Jira_Project_Key__c = 'TEST',
      GitHub_Repo_Path__c = 'test/repo'
    );
    PortfolioService.mockConfig = mock;

    Test.startTest();
    Portfolio_Config__mdt config = PortfolioService.getConfig();
    Test.stopTest();

    // Assertions
    // Note: If no record exists in the org, this might return null or error.
    // In a real CI/CD pipeline, you might need to insert a "Hack" record using JSON.deserialize
    // if your org doesn't have the data deployed yet.

    System.assertNotEquals(null, config, 'Config should not be null');
    System.assertNotEquals(
      null,
      config.Jira_Project_Key__c,
      'Jira Key should be set'
    );
    System.assertNotEquals(
      null,
      config.GitHub_Repo_Path__c,
      'Repo Path should be set'
    );
  }
}

/**
 * @description       : Unit tests for PortfolioService.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/04/2025
 **/
@isTest
private class PortfolioServiceTest {
  @isTest
  static void getConfigWithMockReturnsMock() {
    PortfolioService.mockConfig = new Portfolio_Config__mdt(
      Jira_Project_Key__c = 'TEST',
      GitHub_Repo_Path__c = 'test/repo'
    );

    Test.startTest();
    Portfolio_Config__mdt config = PortfolioService.getConfig();
    Test.stopTest();

    Assert.areEqual('TEST', config.Jira_Project_Key__c, 'Jira key from mock');
    Assert.areEqual('test/repo', config.GitHub_Repo_Path__c, 'Repo from mock');
  }

  @isTest
  static void getConfigWithoutMockReturnsTheOrgRecordWhateverItsName() {
    // Custom metadata records are visible to tests. The org holds zero or one record, and
    // its DeveloperName is not Default, which the old filter required.
    List<Portfolio_Config__mdt> expected = [
      SELECT DeveloperName
      FROM Portfolio_Config__mdt
      ORDER BY DeveloperName
      LIMIT 1
    ];

    Test.startTest();
    Portfolio_Config__mdt config = PortfolioService.getConfig();
    Test.stopTest();

    if (expected.isEmpty()) {
      Assert.isNull(config, 'No record in the org means null');
    } else {
      Assert.areEqual(
        expected[0].DeveloperName,
        config.DeveloperName,
        'The single record is found by order, not by a fixed name'
      );
    }
  }

  @isTest
  static void getConfigSecondCallUsesTheCache() {
    Portfolio_Config__mdt first = PortfolioService.getConfig();

    Test.startTest();
    Integer queriesBefore = Limits.getQueries();
    Portfolio_Config__mdt second = PortfolioService.getConfig();
    Integer queriesAfter = Limits.getQueries();
    Test.stopTest();

    Assert.areEqual(first, second, 'Same record on the second call');
    if (first != null) {
      Assert.areEqual(
        queriesBefore,
        queriesAfter,
        'No second query when cached'
      );
    }
  }
}

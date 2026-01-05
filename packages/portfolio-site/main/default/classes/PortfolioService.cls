/**
 * @description       : Implementation of the Portfolio Service.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/04/2025
 * @Test Class        : [PortfolioServiceTest]
 **/

public with sharing class PortfolioService {
  private static Portfolio_Config__mdt cachedConfig;
  @TestVisible
  private static Portfolio_Config__mdt mockConfig;

  public static Portfolio_Config__mdt getConfig() {
    if (mockConfig != null) {
      return mockConfig;
    }
    if (cachedConfig == null) {
      // Ensure these fields exist on your Custom Metadata Type
      List<Portfolio_Config__mdt> configs = [
        SELECT Jira_Project_Key__c, GitHub_Repo_Path__c
        FROM Portfolio_Config__mdt
        WHERE DeveloperName = 'Default'
        LIMIT 1
      ];
      if (!configs.isEmpty()) {
        cachedConfig = configs[0];
      }
    }
    return cachedConfig;
  }
}

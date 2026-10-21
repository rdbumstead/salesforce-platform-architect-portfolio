/**
 * @description       : Implementation of the Portfolio Service. getConfig() returns the single
 *                      Portfolio_Config__mdt record, whatever its DeveloperName, so the org's
 *                      Ryan_Bumstead record is found (Round 3 plan, pillar-e-design T4).
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

  /**
   * @description The portfolio configuration record. The org holds one record. If more ever
   *              exist, the first by DeveloperName wins so the choice stays stable.
   * @return Portfolio_Config__mdt The record, or null when the org has none.
   */
  public static Portfolio_Config__mdt getConfig() {
    if (mockConfig != null) {
      return mockConfig;
    }
    if (cachedConfig == null) {
      // Selects every field a caller reads: GitHubService and JiraService.
      List<Portfolio_Config__mdt> configs = [
        SELECT DeveloperName, Jira_Project_Key__c, GitHub_Repo_Path__c
        FROM Portfolio_Config__mdt
        ORDER BY DeveloperName
        LIMIT 1
      ];
      cachedConfig = configs.isEmpty() ? null : configs[0];
    }
    return cachedConfig;
  }
}

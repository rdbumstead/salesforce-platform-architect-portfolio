/**
 * @description       : Orchestrator for cleaning up GitHub and Jira cache records and expired
 *                      API rate-limit windows.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/30/2025
 * @Test Class        : [CacheCleanupOrchestratorTest]
 **/
public with sharing class CacheCleanupOrchestrator {
  /**
   * @description Runs the GitHub cleanup batch (which chains Jira) and the rate-window cleanup batch.
   */
  public void run() {
    if (!CacheCleanupSettings.isEnabled()) {
      return;
    }

    Database.executeBatch(
      new GithubCacheCleanupBatch(),
      CacheCleanupSettings.batchSize()
    );
    runRateWindowCleanup();
  }

  /**
   * @description Runs the batch that deletes expired API_Rate_Window__c rows.
   */
  public static void runRateWindowCleanup() {
    if (!CacheCleanupSettings.isEnabled()) {
      return;
    }

    Database.executeBatch(
      new CacheCleanupRateWindowBatch(),
      CacheCleanupSettings.batchSize()
    );
  }

  public static void runJiraCleanup() {
    if (!CacheCleanupSettings.isEnabled()) {
      return;
    }

    Database.executeBatch(
      new JiraCacheCleanupBatch(),
      CacheCleanupSettings.batchSize()
    );
  }
}

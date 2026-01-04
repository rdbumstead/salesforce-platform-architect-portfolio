/**
 * @description       : Orchestrator for cleaning up GitHub and Jira cache records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/30/2025
 * @Test Class        : [CacheCleanupOrchestratorTest]
 **/
public with sharing class CacheCleanupOrchestrator {
  /**
   * @description Runs the GitHub cleanup batch.
   */
  public void run() {
    if (!CacheCleanupSettings.isEnabled()) {
      return;
    }

    Database.executeBatch(
      new GithubCacheCleanupBatch(),
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

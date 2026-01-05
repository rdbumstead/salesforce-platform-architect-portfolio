/**
 * @description       : Batch job for cleaning up GitHub cache records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 * @Test Class        : [GithubCacheCleanupBatchTest]
 **/
public with sharing class GithubCacheCleanupBatch implements Database.Batchable<SObject>, Database.Stateful {
  /**
   * @description Start method to query records to be deleted.
   * @param bc BatchableContext
   * @return Database.QueryLocator
   */
  @TestVisible
  private static Boolean forceHardDelete = false;
  @TestVisible
  private static Boolean forceChainBatch = false;

  public Database.QueryLocator start(Database.BatchableContext bc) {
    if (!CacheCleanupSettings.isEnabled()) {
      return Database.getQueryLocator(
        'SELECT Id FROM Github_Cache__c WHERE Id = null'
      );
    }

    Datetime cutoff = Datetime.now().addHours(-2);

    return Database.getQueryLocator(
      'SELECT Id FROM Github_Cache__c WHERE CreatedDate < :cutoff WITH USER_MODE'
    );
  }

  public void execute(Database.BatchableContext bc, List<SObject> scope) {
    if (!scope.isEmpty()) {
      delete scope;

      if (
        CacheCleanupSettings.allowHardDelete() &&
        (!Test.isRunningTest() || forceHardDelete)
      ) {
        Database.emptyRecycleBin(scope);
      }
    }
  }

  public void finish(Database.BatchableContext bc) {
    // Intentionally disabled during tests to avoid recursive async execution
    if (
      CacheCleanupSettings.isEnabled() &&
      (!Test.isRunningTest() || forceChainBatch)
    ) {
      CacheCleanupOrchestrator.runJiraCleanup();
    }
  }
}

/**
 * @description       : Batch job for cleaning up GitHub cache records. Deletes rows older than
 *                      two hours, except the newest row, which always stays so the Delivery
 *                      page keeps its last good commits through an outage.
 *                      "Newest" is the row DeliveryController serves:
 *                      CreatedDate DESC, then Id DESC. Chains the Jira cleanup when it finishes.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 * @Test Class        : [GithubCacheCleanupBatchTest]
 **/
public with sharing class GithubCacheCleanupBatch implements Database.Batchable<SObject>, Database.Stateful {
  /** Rows older than this many hours are deleted, the newest row excepted. */
  public static final Integer MAX_AGE_HOURS = 2;

  @TestVisible
  private static Boolean forceHardDelete = false;
  @TestVisible
  private static Boolean forceChainBatch = false;

  /**
   * @description Start method to query records to be deleted.
   * @param bc BatchableContext
   * @return Database.QueryLocator Rows past the age limit, never the newest row.
   */
  public Database.QueryLocator start(Database.BatchableContext bc) {
    if (!CacheCleanupSettings.isEnabled()) {
      return Database.getQueryLocator(
        'SELECT Id FROM Github_Cache__c WHERE Id = null'
      );
    }

    Datetime cutoff = Datetime.now().addHours(-MAX_AGE_HOURS);
    Id newestId = newestRowId();

    return Database.getQueryLocator(
      'SELECT Id FROM Github_Cache__c WHERE CreatedDate < :cutoff AND Id != :newestId WITH USER_MODE'
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

  // System mode so the row kept is the one DeliveryController serves, whoever runs the job.
  private static Id newestRowId() {
    List<Github_Cache__c> rows = [
      SELECT Id
      FROM Github_Cache__c
      WITH SYSTEM_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1
    ];
    return rows.isEmpty() ? null : rows[0].Id;
  }
}

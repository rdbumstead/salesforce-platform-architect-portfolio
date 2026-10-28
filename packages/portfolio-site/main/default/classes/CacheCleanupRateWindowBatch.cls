/**
 * @description       : Batch job that deletes API_Rate_Window__c counter rows whose window
 *                      started longer ago than Cache_Cleanup_Settings__mdt
 *                      Rate_Window_Retention_Days__c (default 1 day). Started by
 *                      CacheCleanupOrchestrator. Runs without sharing on purpose: the rows are
 *                      owned by the API integration user and the site guest, and must be removed
 *                      whoever schedules the job.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [CacheCleanupRateWindowBatchTest]
 **/
public without sharing class CacheCleanupRateWindowBatch implements Database.Batchable<SObject> {
  /**
   * @description Selects the expired windows, or nothing when cleanup is disabled.
   * @param bc BatchableContext
   * @return Database.QueryLocator Expired API_Rate_Window__c rows.
   */
  public Database.QueryLocator start(Database.BatchableContext bc) {
    if (!CacheCleanupSettings.isEnabled()) {
      return Database.getQueryLocator(
        'SELECT Id FROM API_Rate_Window__c WHERE Id = null'
      );
    }

    Datetime cutoff = Datetime.now()
      .addDays(-CacheCleanupSettings.rateWindowRetentionDays());

    return Database.getQueryLocator(
      'SELECT Id FROM API_Rate_Window__c WHERE Window_Start__c < :cutoff WITH SYSTEM_MODE'
    );
  }

  /**
   * @description Deletes one chunk of expired windows, and empties them from the recycle bin
   *              when hard delete is allowed.
   * @param bc BatchableContext
   * @param records Expired rows.
   */
  public void execute(Database.BatchableContext bc, List<SObject> records) {
    if (records.isEmpty()) {
      return;
    }
    Database.delete(records, AccessLevel.SYSTEM_MODE);
    if (CacheCleanupSettings.allowHardDelete()) {
      Database.emptyRecycleBin(records);
    }
  }

  /**
   * @description Nothing to chain.
   * @param bc BatchableContext
   */
  public void finish(Database.BatchableContext bc) {
    return;
  }
}

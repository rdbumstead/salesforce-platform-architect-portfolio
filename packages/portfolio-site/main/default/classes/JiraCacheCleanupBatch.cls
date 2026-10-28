/**
 * @description       : Batch job for cleaning up Jira cache records. Deletes rows older than
 *                      30 minutes, except the newest row, which always stays so the Delivery
 *                      page keeps its last good roadmap through an outage.
 *                      "Newest" is the row DeliveryController serves:
 *                      CreatedDate DESC, then Id DESC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/03/2026
 * @Test Class        : [JiraCacheCleanupBatchTest]
 **/
public with sharing class JiraCacheCleanupBatch implements Database.Batchable<SObject> {
  /** Rows older than this many minutes are deleted, the newest row excepted. */
  public static final Integer MAX_AGE_MINUTES = 30;

  @TestVisible
  private static Boolean forceHardDelete = false;

  /**
   * @description Start method to query records to be deleted.
   * @param bc BatchableContext
   * @return Database.QueryLocator Rows past the age limit, never the newest row.
   */
  public Database.QueryLocator start(Database.BatchableContext bc) {
    if (!CacheCleanupSettings.isEnabled()) {
      return Database.getQueryLocator(
        'SELECT Id FROM Jira_Cache__c WHERE Id = null'
      );
    }

    Datetime cutoffJira = Datetime.now().addMinutes(-MAX_AGE_MINUTES);
    Id newestId = newestRowId();

    return Database.getQueryLocator(
      'SELECT Id FROM Jira_Cache__c WHERE CreatedDate < :cutoffJira AND Id != :newestId WITH USER_MODE'
    );
  }

  public void execute(Database.BatchableContext bc, List<SObject> records) {
    if (!records.isEmpty()) {
      delete records;

      if (
        CacheCleanupSettings.allowHardDelete() &&
        (!Test.isRunningTest() || forceHardDelete)
      ) {
        Database.emptyRecycleBin(records);
      }
    }
  }

  public void finish(Database.BatchableContext bc) {
    System.debug('Jira cache cleanup completed.');
  }

  // System mode so the row kept is the one DeliveryController serves, whoever runs the job.
  private static Id newestRowId() {
    List<Jira_Cache__c> rows = [
      SELECT Id
      FROM Jira_Cache__c
      WITH SYSTEM_MODE
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1
    ];
    return rows.isEmpty() ? null : rows[0].Id;
  }
}

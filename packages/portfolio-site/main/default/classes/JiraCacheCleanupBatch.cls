/**
 * @description       : Batch job for cleaning up Jira cache records.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 * @Test Class        : [JiraCacheCleanupBatchTest]
 **/
public with sharing class JiraCacheCleanupBatch implements Database.Batchable<SObject> {
  /**
   * @description Start method to query records to be deleted.
   * @param bc BatchableContext
   * @return Database.QueryLocator
   */
  public Database.QueryLocator start(Database.BatchableContext bc) {
    if (!CacheCleanupSettings.isEnabled()) {
      return Database.getQueryLocator(
        'SELECT Id FROM Jira_Cache__c WHERE Id = null'
      );
    }

    Datetime cutoffJira = Datetime.now().addMinutes(-30);

    return Database.getQueryLocator(
      'SELECT Id FROM Jira_Cache__c WHERE CreatedDate < :cutoffJira WITH USER_MODE'
    );
  }

  @TestVisible
  private static Boolean forceHardDelete = false;

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
}

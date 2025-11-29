public class JiraCacheCleanupBatch
    implements Database.Batchable<SObject> {  // Changed to SObject

    public Database.QueryLocator start(Database.BatchableContext bc) {

        if (!CacheCleanupSettings.isEnabled()) {
            return Database.getQueryLocator('SELECT Id FROM Jira_Cache__c WHERE Id = null');
        }

        Datetime cutoffJira = Datetime.now().addMinutes(-30);

        return Database.getQueryLocator(
            'SELECT Id FROM Jira_Cache__c WHERE CreatedDate < :cutoffJira'
        );
    }

    public void execute(Database.BatchableContext bc, List<SObject> records) {  // Changed to SObject

        if (!records.isEmpty()) {
            delete records;

            if (CacheCleanupSettings.allowHardDelete() &&
                !Test.isRunningTest()) {
                Database.emptyRecycleBin(records);
            }
        }
    }

    public void finish(Database.BatchableContext bc) {
        System.debug('Jira cache cleanup completed.');
    }
}
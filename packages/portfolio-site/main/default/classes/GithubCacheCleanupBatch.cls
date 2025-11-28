public class GithubCacheCleanupBatch
    implements Database.Batchable<Github_Cache__c>, Database.Stateful {

    public Database.QueryLocator start(Database.BatchableContext bc) {

        if (!CacheCleanupSettings.isEnabled()) {
            return Database.getQueryLocator('SELECT Id FROM Github_Cache__c WHERE Id = null');
        }

        Datetime cutoff = Datetime.now().addHours(-2);

        return Database.getQueryLocator(
            'SELECT Id FROM Github_Cache__c WHERE CreatedDate < :cutoff'
        );
    }

    public void execute(Database.BatchableContext bc, List<Github_Cache__c> scope) {

        if (!scope.isEmpty()) {
            delete scope;

            if (CacheCleanupSettings.allowHardDelete() &&
                !Test.isRunningTest()) {
                Database.emptyRecycleBin(scope);
            }
        }
    }

    public void finish(Database.BatchableContext bc) {

        if (CacheCleanupSettings.isEnabled()) {
            CacheCleanupOrchestrator.runJiraCleanup();
        }
    }
}
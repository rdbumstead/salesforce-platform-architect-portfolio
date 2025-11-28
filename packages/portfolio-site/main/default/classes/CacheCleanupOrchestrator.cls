public class CacheCleanupOrchestrator {

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
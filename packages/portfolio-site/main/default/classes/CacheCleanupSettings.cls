public class CacheCleanupSettings {

    @TestVisible
    private static Boolean testOverrideEnabled;

    public static Boolean isEnabled() {
        if (Test.isRunningTest() && testOverrideEnabled != null) {
            return testOverrideEnabled;
        }
        return settings()?.Is_Enabled__c ?? true;  // Default to true
    }

    public static Boolean allowHardDelete() {
        return settings()?.Allow_Hard_Delete__c ?? false;  // Default to false
    }

    public static Integer batchSize() {
        Integer size = Integer.valueOf(settings()?.Max_Batch_Size__c ?? 200);
        return size > 0 ? size : 200;
    }

    private static Cache_Cleanup_Settings__mdt settings() {
        return Cache_Cleanup_Settings__mdt.getInstance('Default');
    }
}
@IsTest
private class CacheCleanupSettingsTest {

    @IsTest
    static void testDefaultFallbackValues() {
        Test.startTest();

        Boolean enabled = CacheCleanupSettings.isEnabled();
        Boolean hardDelete = CacheCleanupSettings.allowHardDelete();
        Integer batchSize = CacheCleanupSettings.batchSize();

        Test.stopTest();

        System.assertEquals(true, enabled, 'Default Is_Enabled__c should be true.');
        System.assertEquals(false, hardDelete, 'Default Allow_Hard_Delete__c should be false.');
        System.assertEquals(200, batchSize, 'Default Max_Batch_Size__c should be 200.');
    }

    @IsTest
    static void testTestOverrideEnabled() {
        CacheCleanupSettings.testOverrideEnabled = false;

        Test.startTest();
        Boolean enabled = CacheCleanupSettings.isEnabled();
        Test.stopTest();

        System.assertEquals(false, enabled, 'Test override should disable cleanup.');

        CacheCleanupSettings.testOverrideEnabled = null;
    }
}
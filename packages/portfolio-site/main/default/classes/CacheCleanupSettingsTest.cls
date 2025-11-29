@IsTest
private class CacheCleanupSettingsTest {

    @IsTest
    static void testDefaultFallbackValues() {
        
        Test.startTest();

        Boolean enabled = CacheCleanupSettings.isEnabled();
        Boolean hardDelete = CacheCleanupSettings.allowHardDelete();
        Integer batchSize = CacheCleanupSettings.batchSize();

        Test.stopTest();

        System.assertNotEquals(null, enabled, 'isEnabled should return a value.');
        System.assertNotEquals(null, hardDelete, 'allowHardDelete should return a value.');
        System.assert(batchSize > 0, 'batchSize should be positive: ' + batchSize);
    }

    @IsTest
    static void testTestOverrideEnabled() {
        CacheCleanupSettings.testOverrideEnabled = false;

        Test.startTest();
        Boolean enabled = CacheCleanupSettings.isEnabled();
        Test.stopTest();

        System.assertEquals(false, enabled, 'Test override should disable cleanup.');
    }
    
    @IsTest
    static void testTestOverrideEnabledTrue() {
        CacheCleanupSettings.testOverrideEnabled = true;

        Test.startTest();
        Boolean enabled = CacheCleanupSettings.isEnabled();
        Test.stopTest();

        System.assertEquals(true, enabled, 'Test override should enable cleanup.');
    }
}
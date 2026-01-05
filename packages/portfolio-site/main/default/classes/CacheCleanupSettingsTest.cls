/**
 * @description       : Unit tests for CacheCleanupSettings wrapper.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/30/2025
 **/
@IsTest
private class CacheCleanupSettingsTest {
  @IsTest
  static void testDefaultFallbackValues() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();

      Boolean enabled = CacheCleanupSettings.isEnabled();
      Boolean hardDelete = CacheCleanupSettings.allowHardDelete();
      Integer batchSize = CacheCleanupSettings.batchSize();

      Test.stopTest();

      System.assertNotEquals(null, enabled, 'isEnabled should return a value.');
      System.assertNotEquals(
        null,
        hardDelete,
        'allowHardDelete should return a value.'
      );
      System.assert(
        batchSize > 0,
        'batchSize should be positive: ' + batchSize
      );
    }
  }

  @IsTest
  static void testTestOverrideEnabled() {
    CacheCleanupSettings.testOverrideEnabled = false;

    Test.startTest();
    Boolean enabled = CacheCleanupSettings.isEnabled();
    Test.stopTest();

    System.assertEquals(
      false,
      enabled,
      'Test override should disable cleanup.'
    );
  }

  @IsTest
  static void testTestOverrideEnabledTrue() {
    CacheCleanupSettings.testOverrideEnabled = true;

    Test.startTest();
    Boolean enabled = CacheCleanupSettings.isEnabled();
    Test.stopTest();

    System.assertEquals(true, enabled, 'Test override should enable cleanup.');
  }

  @IsTest
  static void testSettingsNull() {
    CacheCleanupSettings.useMockSettings = true;
    CacheCleanupSettings.mockSettings = null; // Force null settings

    Test.startTest();
    // When settings is null, batchSize returns 200
    Integer size = CacheCleanupSettings.batchSize();
    // When settings is null, isEnabled returns true (default)
    Boolean enabled = CacheCleanupSettings.isEnabled();
    Test.stopTest();

    System.assertEquals(200, size, 'Should default to 200');
    System.assertEquals(true, enabled, 'Should default to true');
  }
}

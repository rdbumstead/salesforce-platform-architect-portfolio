/**
 * @description       : Custom settings wrapper for Cache Cleanup logic.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/30/2025
 * @Test Class        : [CacheCleanupSettingsTest]
 **/
public with sharing class CacheCleanupSettings {
  @TestVisible
  private static Boolean testOverrideEnabled;

  /**
   * @description Checks if cleanup is enabled.
   * @return Boolean True if enabled.
   */
  public static Boolean isEnabled() {
    if (Test.isRunningTest() && testOverrideEnabled != null) {
      return testOverrideEnabled;
    }
    Cache_Cleanup_Settings__mdt s = settings();
    return s != null ? s.Is_Enabled__c : true;
  }

  public static Boolean allowHardDelete() {
    Cache_Cleanup_Settings__mdt s = settings();
    return s != null ? s.Allow_Hard_Delete__c : false;
  }

  public static Integer batchSize() {
    Cache_Cleanup_Settings__mdt s = settings();
    if (s == null || s.Max_Batch_Size__c == null) {
      return 200;
    }
    Integer size = Integer.valueOf(s.Max_Batch_Size__c);
    return size > 0 ? size : 200;
  }

  private static Cache_Cleanup_Settings__mdt settings() {
    return Cache_Cleanup_Settings__mdt.getInstance('Default');
  }
}

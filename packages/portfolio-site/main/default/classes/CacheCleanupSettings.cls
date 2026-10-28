/**
 * @description       : Custom settings wrapper for Cache Cleanup logic.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/30/2025
 * @Test Class        : [CacheCleanupSettingsTest]
 **/
public with sharing class CacheCleanupSettings {
  public static final Integer DEFAULT_RATE_WINDOW_RETENTION_DAYS = 1;

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

  /**
   * @description Days an API_Rate_Window__c row is kept after its window starts.
   * @return Integer Rate_Window_Retention_Days__c, or 1 when blank or below 1.
   */
  public static Integer rateWindowRetentionDays() {
    Cache_Cleanup_Settings__mdt s = settings();
    if (s == null || s.Rate_Window_Retention_Days__c == null) {
      return DEFAULT_RATE_WINDOW_RETENTION_DAYS;
    }
    Integer days = Integer.valueOf(s.Rate_Window_Retention_Days__c);
    return days >= 1 ? days : DEFAULT_RATE_WINDOW_RETENTION_DAYS;
  }

  @TestVisible
  private static Cache_Cleanup_Settings__mdt mockSettings;
  @TestVisible
  private static Boolean useMockSettings = false;

  private static Cache_Cleanup_Settings__mdt settings() {
    if (useMockSettings) {
      return mockSettings;
    }
    return Cache_Cleanup_Settings__mdt.getInstance('Default');
  }
}

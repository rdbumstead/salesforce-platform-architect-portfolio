/**
 * @description       : Unit tests for CacheCleanupRateWindowBatch and the orchestrator hook.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class CacheCleanupRateWindowBatchTest {
  private static final Integer OLD_ROWS = 3;
  private static final Integer CURRENT_ROWS = 2;

  private static void insertWindows(Integer count, Datetime windowStart) {
    List<API_Rate_Window__c> rows = new List<API_Rate_Window__c>();
    for (Integer i = 0; i < count; i++) {
      rows.add(
        new API_Rate_Window__c(
          Key__c = 'test:' + windowStart.getTime() + ':' + i,
          Window_Start__c = windowStart,
          Count__c = 1
        )
      );
    }
    insert rows;
  }

  private static void insertOldAndCurrentWindows() {
    insertWindows(OLD_ROWS, Datetime.now().addDays(-2));
    insertWindows(CURRENT_ROWS, Datetime.now().addMinutes(-1));
  }

  private static Cache_Cleanup_Settings__mdt settings(
    Boolean hardDelete,
    Decimal retentionDays
  ) {
    return new Cache_Cleanup_Settings__mdt(
      Is_Enabled__c = true,
      Allow_Hard_Delete__c = hardDelete,
      Max_Batch_Size__c = 200,
      Rate_Window_Retention_Days__c = retentionDays
    );
  }

  @IsTest
  static void deletesOldWindowsAndKeepsCurrentOnes() {
    CacheCleanupSettings.useMockSettings = true;
    CacheCleanupSettings.mockSettings = settings(false, 1);
    insertOldAndCurrentWindows();

    Test.startTest();
    Database.executeBatch(new CacheCleanupRateWindowBatch(), 200);
    Test.stopTest();

    Assert.areEqual(
      CURRENT_ROWS,
      [SELECT COUNT() FROM API_Rate_Window__c],
      'Windows older than one day are deleted, current ones kept'
    );
    Assert.areEqual(
      0,
      [
        SELECT COUNT()
        FROM API_Rate_Window__c
        WHERE Window_Start__c < :Datetime.now().addDays(-1)
      ],
      'No expired window remains'
    );
  }

  @IsTest
  static void longerRetentionKeepsTwoDayOldWindows() {
    CacheCleanupSettings.useMockSettings = true;
    CacheCleanupSettings.mockSettings = settings(false, 3);
    insertOldAndCurrentWindows();

    Test.startTest();
    Database.executeBatch(new CacheCleanupRateWindowBatch(), 200);
    Test.stopTest();

    Assert.areEqual(
      OLD_ROWS + CURRENT_ROWS,
      [SELECT COUNT() FROM API_Rate_Window__c],
      'Three-day retention keeps two-day-old windows'
    );
  }

  @IsTest
  static void hardDeleteSettingStillDeletesOnlyExpiredWindows() {
    // Database.emptyRecycleBin does not purge inside a test transaction, so this proves the
    // hard-delete branch runs without error and deletes the right rows.
    CacheCleanupSettings.useMockSettings = true;
    CacheCleanupSettings.mockSettings = settings(true, 1);
    insertOldAndCurrentWindows();

    Test.startTest();
    Database.executeBatch(new CacheCleanupRateWindowBatch(), 200);
    Test.stopTest();

    Assert.areEqual(
      CURRENT_ROWS,
      [SELECT COUNT() FROM API_Rate_Window__c],
      'Expired windows deleted, current windows kept'
    );
  }

  @IsTest
  static void disabledCleanupDeletesNothing() {
    CacheCleanupSettings.testOverrideEnabled = false;
    insertOldAndCurrentWindows();

    Test.startTest();
    Database.executeBatch(new CacheCleanupRateWindowBatch(), 200);
    CacheCleanupOrchestrator.runRateWindowCleanup();
    Test.stopTest();

    Assert.areEqual(
      OLD_ROWS + CURRENT_ROWS,
      [SELECT COUNT() FROM API_Rate_Window__c],
      'Nothing deleted when cleanup is disabled'
    );
  }

  @IsTest
  static void orchestratorRunDeletesOldWindows() {
    CacheCleanupSettings.testOverrideEnabled = true;
    insertOldAndCurrentWindows();

    Test.startTest();
    new CacheCleanupOrchestrator().run();
    Test.stopTest();

    Assert.areEqual(
      CURRENT_ROWS,
      [SELECT COUNT() FROM API_Rate_Window__c],
      'The scheduled orchestrator run removes expired windows'
    );
  }
}

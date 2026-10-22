/**
 * @description       : Unit tests for JiraCacheCleanupBatch: rows past 30 minutes go, the
 *                      newest row always stays (pillar-e-design 4.4, G10).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class JiraCacheCleanupBatchTest {
  /** Creates rows aged minutesOld[i] minutes and returns them in the same order. */
  private static List<Jira_Cache__c> rowsAged(List<Integer> minutesOld) {
    List<Jira_Cache__c> rows = TestFactory.createJiraCache(minutesOld.size());
    Datetime now = Datetime.now();
    for (Integer i = 0; i < rows.size(); i++) {
      Test.setCreatedDate(rows[i].Id, now.addMinutes(-minutesOld[i]));
    }
    return rows;
  }

  @IsTest
  static void shouldKeepNewestRowWhenEveryRowIsPastTheLimit() {
    CacheCleanupSettings.testOverrideEnabled = true;
    List<Jira_Cache__c> rows = rowsAged(new List<Integer>{ 90, 45, 120 });

    Test.startTest();
    Database.executeBatch(new JiraCacheCleanupBatch(), 200);
    Test.stopTest();

    List<Jira_Cache__c> left = [SELECT Id FROM Jira_Cache__c];
    Assert.areEqual(1, left.size(), 'Only the newest row stays');
    Assert.areEqual(
      rows[1].Id,
      left[0].Id,
      'The 45 minute old row is the newest'
    );
  }

  @IsTest
  static void shouldKeepRecentRowsWhenInsideTheLimit() {
    CacheCleanupSettings.testOverrideEnabled = true;
    rowsAged(new List<Integer>{ 60, 10, 0 });

    Test.startTest();
    Database.executeBatch(new JiraCacheCleanupBatch(), 200);
    Test.stopTest();

    Assert.areEqual(
      2,
      [SELECT COUNT() FROM Jira_Cache__c],
      'Only the old row goes'
    );
  }

  @IsTest
  static void shouldDeleteBulkWhenManyRowsAreOld() {
    CacheCleanupSettings.testOverrideEnabled = true;
    List<Integer> ages = new List<Integer>();
    for (Integer i = 0; i < 251; i++) {
      ages.add(31 + i);
    }
    rowsAged(ages);

    Test.startTest();
    Database.executeBatch(new JiraCacheCleanupBatch(), 300);
    Test.stopTest();

    Assert.areEqual(1, [SELECT COUNT() FROM Jira_Cache__c], 'Newest stays');
  }

  @IsTest
  static void shouldDeleteNothingWhenDisabled() {
    CacheCleanupSettings.testOverrideEnabled = false;
    rowsAged(new List<Integer>{ 60, 60 });

    Test.startTest();
    Database.executeBatch(new JiraCacheCleanupBatch(), 200);
    Test.stopTest();

    Assert.areEqual(2, [SELECT COUNT() FROM Jira_Cache__c], 'All kept');
  }

  @IsTest
  static void shouldBeSafeWhenNoRows() {
    CacheCleanupSettings.testOverrideEnabled = true;

    Test.startTest();
    Database.executeBatch(new JiraCacheCleanupBatch(), 200);
    Test.stopTest();

    Assert.areEqual(0, [SELECT COUNT() FROM Jira_Cache__c], 'Nothing to do');
  }

  @IsTest
  static void shouldEmptyRecycleBinWhenHardDeleteAllowed() {
    CacheCleanupSettings.testOverrideEnabled = true;
    CacheCleanupSettings.useMockSettings = true;
    CacheCleanupSettings.mockSettings = new Cache_Cleanup_Settings__mdt(
      Is_Enabled__c = true,
      Allow_Hard_Delete__c = true
    );
    JiraCacheCleanupBatch.forceHardDelete = true;
    rowsAged(new List<Integer>{ 60, 50 });

    Test.startTest();
    Database.executeBatch(new JiraCacheCleanupBatch(), 200);
    Test.stopTest();

    Assert.areEqual(1, [SELECT COUNT() FROM Jira_Cache__c], 'Newest stays');
  }
}

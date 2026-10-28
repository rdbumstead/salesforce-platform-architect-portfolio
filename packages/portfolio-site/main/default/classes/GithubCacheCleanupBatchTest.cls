/**
 * @description       : Unit tests for GithubCacheCleanupBatch: rows past two hours go, the
 *                      newest row always stays.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/03/2026
 **/
@IsTest
private class GithubCacheCleanupBatchTest {
  /** Creates rows aged hoursOld[i] hours and returns them in the same order. */
  private static List<Github_Cache__c> rowsAged(List<Integer> hoursOld) {
    List<Github_Cache__c> rows = TestFactory.createGithubCache(hoursOld.size());
    Datetime now = Datetime.now();
    for (Integer i = 0; i < rows.size(); i++) {
      Test.setCreatedDate(rows[i].Id, now.addHours(-hoursOld[i]));
    }
    return rows;
  }

  private static void allowHardDelete() {
    CacheCleanupSettings.useMockSettings = true;
    CacheCleanupSettings.mockSettings = new Cache_Cleanup_Settings__mdt(
      Is_Enabled__c = true,
      Allow_Hard_Delete__c = true
    );
  }

  @IsTest
  static void shouldKeepNewestRowWhenEveryRowIsPastTheLimit() {
    CacheCleanupSettings.testOverrideEnabled = true;
    List<Github_Cache__c> rows = rowsAged(new List<Integer>{ 5, 4, 3, 6 });

    Test.startTest();
    Database.executeBatch(new GithubCacheCleanupBatch(), 200);
    Test.stopTest();

    List<Github_Cache__c> left = [SELECT Id FROM Github_Cache__c];
    Assert.areEqual(1, left.size(), 'Only the newest row stays');
    Assert.areEqual(rows[2].Id, left[0].Id, 'The 3 hour old row is the newest');
  }

  @IsTest
  static void shouldKeepRecentRowsWhenInsideTheLimit() {
    CacheCleanupSettings.testOverrideEnabled = true;
    List<Github_Cache__c> rows = rowsAged(new List<Integer>{ 5, 1, 0 });

    Test.startTest();
    Database.executeBatch(new GithubCacheCleanupBatch(), 200);
    Test.stopTest();

    Set<Id> left = new Map<Id, Github_Cache__c>(
        [SELECT Id FROM Github_Cache__c]
      )
      .keySet();
    Assert.areEqual(2, left.size(), 'Only the 5 hour old row goes');
    Assert.isFalse(left.contains(rows[0].Id), 'Old row deleted');
  }

  @IsTest
  static void shouldDeleteBulkWhenManyRowsAreOld() {
    CacheCleanupSettings.testOverrideEnabled = true;
    List<Integer> ages = new List<Integer>();
    for (Integer i = 0; i < 251; i++) {
      ages.add(3 + i);
    }
    rowsAged(ages);

    Test.startTest();
    Database.executeBatch(new GithubCacheCleanupBatch(), 300);
    Test.stopTest();

    Assert.areEqual(1, [SELECT COUNT() FROM Github_Cache__c], 'Newest stays');
  }

  @IsTest
  static void shouldDeleteNothingWhenDisabled() {
    CacheCleanupSettings.testOverrideEnabled = false;
    rowsAged(new List<Integer>{ 5, 5, 5 });

    Test.startTest();
    Database.executeBatch(new GithubCacheCleanupBatch(), 200);
    Test.stopTest();

    Assert.areEqual(3, [SELECT COUNT() FROM Github_Cache__c], 'All kept');
  }

  @IsTest
  static void shouldBeSafeWhenNoRows() {
    CacheCleanupSettings.testOverrideEnabled = true;

    Test.startTest();
    Database.executeBatch(new GithubCacheCleanupBatch(), 200);
    Test.stopTest();

    Assert.areEqual(0, [SELECT COUNT() FROM Github_Cache__c], 'Nothing to do');
  }

  @IsTest
  static void shouldHardDeleteAndChainWhenAllowed() {
    CacheCleanupSettings.testOverrideEnabled = true;
    allowHardDelete();
    rowsAged(new List<Integer>{ 5, 4 });
    GithubCacheCleanupBatch.forceHardDelete = true;
    GithubCacheCleanupBatch.forceChainBatch = true;

    Test.startTest();
    Database.executeBatch(new GithubCacheCleanupBatch(), 200);
    Test.stopTest();

    Assert.areEqual(1, [SELECT COUNT() FROM Github_Cache__c], 'Newest stays');
  }
}

/**
 * @description Unit tests for GithubCacheCleanupBatch.
 * @author Ryan Bumstead
 */
@IsTest
private class GithubCacheCleanupBatchTest {
  @IsTest
  static void testGithubBatchDeletesExpiredRecords() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      CacheCleanupSettings.testOverrideEnabled = true;

      TestFactory.createGithubCache(10);

      for (Github_Cache__c rec : [SELECT Id FROM Github_Cache__c]) {
        Test.setCreatedDate(rec.Id, Datetime.now().addHours(-5));
      }

      Test.startTest();
      Database.executeBatch(new GithubCacheCleanupBatch(), 200);
      Test.stopTest();

      System.assertEquals(
        0,
        [SELECT COUNT() FROM Github_Cache__c],
        'All expired GitHub cache records should be deleted.'
      );
    }
  }

  @IsTest
  static void testGithubBatchWhenDisabled() {
    CacheCleanupSettings.testOverrideEnabled = false;

    TestFactory.createGithubCache(10);

    Test.startTest();
    Database.executeBatch(new GithubCacheCleanupBatch(), 200);
    Test.stopTest();

    System.assertEquals(
      10,
      [SELECT COUNT() FROM Github_Cache__c],
      'No GitHub cache records should be deleted when cleanup is disabled.'
    );
  }
}

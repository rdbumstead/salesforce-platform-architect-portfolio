/**
 * @description Unit tests for JiraCacheCleanupBatch.
 * @author Ryan Bumstead
 */
@IsTest
private class JiraCacheCleanupBatchTest {
  @IsTest
  static void testDeletesExpiredRecords() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      CacheCleanupSettings.testOverrideEnabled = true;

      TestFactory.createJiraCache(200);

      for (Jira_Cache__c rec : [SELECT Id FROM Jira_Cache__c]) {
        Test.setCreatedDate(rec.Id, Datetime.now().addHours(-1));
      }

      Test.startTest();
      Database.executeBatch(new JiraCacheCleanupBatch(), 200);
      Test.stopTest();

      System.assertEquals(
        0,
        [SELECT COUNT() FROM Jira_Cache__c],
        'All expired Jira records should be deleted.'
      );
    }
  }

  @IsTest
  static void testBatchWhenDisabledDoesNothing() {
    CacheCleanupSettings.testOverrideEnabled = false;

    CacheCleanupTestDataFactory.createJiraCache(6);

    Test.startTest();
    Database.executeBatch(new JiraCacheCleanupBatch(), 200);
    Test.stopTest();

    System.assertEquals(
      6,
      [SELECT COUNT() FROM Jira_Cache__c],
      'Records must remain when cleanup is disabled.'
    );
  }

  @IsTest
  static void testBatchWithEmptyScopeIsSafe() {
    CacheCleanupSettings.testOverrideEnabled = true;

    CacheCleanupTestDataFactory.createJiraCache(5);

    Test.startTest();
    Database.executeBatch(new JiraCacheCleanupBatch(), 200);
    Test.stopTest();

    System.assertEquals(
      5,
      [SELECT COUNT() FROM Jira_Cache__c],
      'Recent Jira records should not be deleted.'
    );
  }
}

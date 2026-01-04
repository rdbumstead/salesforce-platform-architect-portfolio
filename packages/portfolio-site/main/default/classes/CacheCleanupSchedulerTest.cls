/**
 * @description Unit tests for CacheCleanupScheduler.
 * @author Ryan Bumstead
 */
@IsTest
private class CacheCleanupSchedulerTest {
  @IsTest
  static void testSchedulerExecution() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      CacheCleanupTestDataFactory.createGithubCache(3);

      for (Github_Cache__c g : [SELECT Id FROM Github_Cache__c]) {
        Test.setCreatedDate(g.Id, Datetime.now().addHours(-3));
      }

      Test.startTest();
      new CacheCleanupScheduler().execute(null);
      Test.stopTest();

      System.assertEquals(
        0,
        [SELECT COUNT() FROM Github_Cache__c],
        'Scheduler should trigger GitHub cleanup.'
      );
    }
  }
}

/**
 * @description       : Unit tests for CacheCleanup orchestration logic.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/30/2025
 **/
@IsTest
private class CacheCleanupOrchestratorTest {
  @IsTest
  static void testRunWhenEnabledDeletesGithub() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      CacheCleanupSettings.testOverrideEnabled = true;

      CacheCleanupTestDataFactory.createGithubCache(5);

      for (Github_Cache__c g : [SELECT Id FROM Github_Cache__c]) {
        Test.setCreatedDate(g.Id, Datetime.now().addHours(-5));
      }

      Test.startTest();
      new CacheCleanupOrchestrator().run();
      Test.stopTest();

      System.assertEquals(
        0,
        [SELECT COUNT() FROM Github_Cache__c],
        'GitHub records should be deleted when orchestrator is enabled.'
      );
    }
  }

  @IsTest
  static void testRunWhenDisabledDoesNothing() {
    CacheCleanupSettings.testOverrideEnabled = false;

    CacheCleanupTestDataFactory.createGithubCache(3);

    Test.startTest();
    new CacheCleanupOrchestrator().run();
    Test.stopTest();

    System.assertEquals(
      3,
      [SELECT COUNT() FROM Github_Cache__c],
      'No GitHub records should be deleted when orchestrator is disabled.'
    );
  }

  @IsTest
  static void testRunWithNoRecordsIsSafe() {
    CacheCleanupSettings.testOverrideEnabled = true;

    Test.startTest();
    new CacheCleanupOrchestrator().run();
    Test.stopTest();

    System.assertEquals(0, [SELECT COUNT() FROM Github_Cache__c]);
  }

  @IsTest
  static void testRunJiraCleanupWhenEnabled() {
    CacheCleanupSettings.testOverrideEnabled = true;

    CacheCleanupTestDataFactory.createJiraCache(4);

    for (Jira_Cache__c j : [SELECT Id FROM Jira_Cache__c]) {
      Test.setCreatedDate(j.Id, Datetime.now().addHours(-2));
    }

    Test.startTest();
    CacheCleanupOrchestrator.runJiraCleanup();
    Test.stopTest();

    System.assertEquals(
      0,
      [SELECT COUNT() FROM Jira_Cache__c],
      'Jira cache should be deleted when runJiraCleanup is called.'
    );
  }

  @IsTest
  static void testRunJiraCleanupWhenDisabledDoesNothing() {
    CacheCleanupSettings.testOverrideEnabled = false;

    CacheCleanupTestDataFactory.createJiraCache(2);

    Test.startTest();
    CacheCleanupOrchestrator.runJiraCleanup();
    Test.stopTest();

    System.assertEquals(
      2,
      [SELECT COUNT() FROM Jira_Cache__c],
      'Jira cache should not be deleted when cleanup is disabled.'
    );
  }
}

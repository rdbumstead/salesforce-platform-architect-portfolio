@IsTest
private class CacheCleanupOrchestratorTest {

    @IsTest
    static void testFullCleanupChain() {

        CacheCleanupTestDataFactory.createGithubCache(5);
        CacheCleanupTestDataFactory.createJiraCache(5);

        for (Github_Cache__c g : [SELECT Id FROM Github_Cache__c]) {
            Test.setCreatedDate(g.Id, Datetime.now().addHours(-5));
        }

        for (Jira_Cache__c j : [SELECT Id FROM Jira_Cache__c]) {
            Test.setCreatedDate(j.Id, Datetime.now().addHours(-1));
        }

        Test.startTest();
        new CacheCleanupOrchestrator().run();
        Test.stopTest();

        System.assertEquals(0, [SELECT COUNT() FROM Github_Cache__c]);
        System.assertEquals(0, [SELECT COUNT() FROM Jira_Cache__c]);
    }
}
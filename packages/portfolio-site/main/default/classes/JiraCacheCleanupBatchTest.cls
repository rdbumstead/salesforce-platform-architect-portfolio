@IsTest
private class JiraCacheCleanupBatchTest {

    @IsTest
    static void testJiraBatchDeletesExpiredRecords() {

        CacheCleanupTestDataFactory.createJiraCache(10);

        for (Jira_Cache__c rec : [
            SELECT Id, CreatedDate FROM Jira_Cache__c
        ]) {
            Test.setCreatedDate(rec.Id, Datetime.now().addHours(-1));
        }

        Test.startTest();
        Database.executeBatch(new JiraCacheCleanupBatch(), 5);
        Test.stopTest();

        System.assertEquals(
            0,
            [SELECT COUNT() FROM Jira_Cache__c],
            'All expired Jira cache records should be deleted.'
        );
    }
}
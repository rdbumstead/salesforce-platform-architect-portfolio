@IsTest
private class GithubCacheCleanupBatchTest {

    @IsTest
    static void testGithubBatchDeletesExpiredRecords() {

        CacheCleanupTestDataFactory.createGithubCache(10);

        for (Github_Cache__c rec : [
            SELECT Id, CreatedDate FROM Github_Cache__c
        ]) {
            Test.setCreatedDate(rec.Id, Datetime.now().addHours(-5));
        }

        Test.startTest();
        Database.executeBatch(new GithubCacheCleanupBatch(), 5);
        Test.stopTest();

        System.assertEquals(
            0,
            [SELECT COUNT() FROM Github_Cache__c],
            'All expired GitHub cache records should be deleted.'
        );
    }
}
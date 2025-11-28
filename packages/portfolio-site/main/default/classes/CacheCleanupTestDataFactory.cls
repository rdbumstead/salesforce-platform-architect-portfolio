@IsTest
public class CacheCleanupTestDataFactory {

    public static void createGithubCache(Integer count) {
        List<Github_Cache__c> records = new List<Github_Cache__c>();

        for (Integer i = 0; i < count; i++) {
            records.add(new Github_Cache__c(
                Name = 'GitHub Cache ' + i
            ));
        }
        insert records;
    }

    public static void createJiraCache(Integer count) {
        List<Jira_Cache__c> records = new List<Jira_Cache__c>();

        for (Integer i = 0; i < count; i++) {
            records.add(new Jira_Cache__c(
                Name = 'Jira Cache ' + i
            ));
        }
        insert records;
    }
}
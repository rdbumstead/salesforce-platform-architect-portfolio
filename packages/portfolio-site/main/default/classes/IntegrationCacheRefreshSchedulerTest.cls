/**
 * @description       : Tests for IntegrationCacheRefreshScheduler: four runs an hour at :00,
 *                      :15, :30 and :45, each run enqueues both refresh jobs, and the source
 *                      refresh joins them only when a file is due. Scheduling runs under a
 *                      test prefix, so the test passes in an org where the real four jobs are
 *                      already scheduled, as in production.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@IsTest
private class IntegrationCacheRefreshSchedulerTest {
  private static final String TEST_PREFIX = 'Test Integration Cache Refresh :';

  @IsTest
  static void shouldScheduleFourRunsWhenScheduleAll() {
    IntegrationCacheRefreshScheduler.jobNamePrefix = TEST_PREFIX;

    Test.startTest();
    List<Id> jobIds = IntegrationCacheRefreshScheduler.scheduleAll();
    Test.stopTest();

    Assert.areEqual(4, jobIds.size(), 'Four jobs');
    Map<String, String> cronByName = new Map<String, String>();
    for (CronTrigger scheduled : [
      SELECT CronExpression, CronJobDetail.Name
      FROM CronTrigger
      WHERE Id IN :jobIds
    ]) {
      cronByName.put(scheduled.CronJobDetail.Name, scheduled.CronExpression);
    }
    Assert.areEqual('0 0 * * * ?', cronByName.get(TEST_PREFIX + '00'), ':00');
    Assert.areEqual('0 15 * * * ?', cronByName.get(TEST_PREFIX + '15'), ':15');
    Assert.areEqual('0 30 * * * ?', cronByName.get(TEST_PREFIX + '30'), ':30');
    Assert.areEqual('0 45 * * * ?', cronByName.get(TEST_PREFIX + '45'), ':45');
  }

  @IsTest
  static void shouldUseTheRealNamesOutsideTests() {
    Test.startTest();
    String prefix = IntegrationCacheRefreshScheduler.jobNamePrefix;
    Test.stopTest();

    Assert.areEqual(
      IntegrationCacheRefreshScheduler.JOB_NAME_PREFIX,
      prefix,
      'Production schedules under Integration Cache Refresh :'
    );
  }

  @IsTest
  static void shouldEnqueueSourceRefreshWhenAFileIsDue() {
    GitHubCacheRefreshJob.configOverridden = true;
    JiraCacheRefreshJob.configOverridden = true;
    SourceCacheRefreshJob.configOverridden = true;
    SourceController.filesOverride = new List<Source_File__mdt>{
      new Source_File__mdt(
        Source_Key__c = 'apiTester',
        Path__c = 'a/b.js',
        Label__c = 'b.js'
      )
    };

    Test.startTest();
    new IntegrationCacheRefreshScheduler().execute(null);
    Integer queued = Limits.getQueueableJobs();
    Test.stopTest();

    Assert.areEqual(3, queued, 'GitHub, Jira and source jobs enqueued');
  }

  @IsTest
  static void shouldEnqueueBothRefreshJobsWhenExecuted() {
    GitHubCacheRefreshJob.configOverridden = true;
    JiraCacheRefreshJob.configOverridden = true;
    // No source file configured, so nothing is due and only the two jobs run.
    SourceController.filesOverride = new List<Source_File__mdt>();

    Test.startTest();
    new IntegrationCacheRefreshScheduler().execute(null);
    Integer queued = Limits.getQueueableJobs();
    Test.stopTest();

    Assert.areEqual(2, queued, 'GitHub and Jira jobs enqueued');
    Assert.areEqual(
      2,
      [
        SELECT COUNT()
        FROM AsyncApexJob
        WHERE
          JobType = 'Queueable'
          AND ApexClass.Name IN ('GitHubCacheRefreshJob', 'JiraCacheRefreshJob')
      ],
      'Both ran'
    );
  }
}

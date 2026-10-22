/**
 * @description       : Tests for IntegrationCacheRefreshScheduler: four runs an hour at :00,
 *                      :15, :30 and :45, and each run enqueues both refresh jobs.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@IsTest
private class IntegrationCacheRefreshSchedulerTest {
  @IsTest
  static void shouldScheduleFourRunsWhenScheduleAll() {
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
    Assert.areEqual(
      '0 0 * * * ?',
      cronByName.get('Integration Cache Refresh :00'),
      ':00'
    );
    Assert.areEqual(
      '0 15 * * * ?',
      cronByName.get('Integration Cache Refresh :15'),
      ':15'
    );
    Assert.areEqual(
      '0 30 * * * ?',
      cronByName.get('Integration Cache Refresh :30'),
      ':30'
    );
    Assert.areEqual(
      '0 45 * * * ?',
      cronByName.get('Integration Cache Refresh :45'),
      ':45'
    );
  }

  @IsTest
  static void shouldEnqueueBothRefreshJobsWhenExecuted() {
    GitHubCacheRefreshJob.configOverridden = true;
    JiraCacheRefreshJob.configOverridden = true;

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

/**
 * @description       : Tests for IntegrationCacheRefreshScheduler: four runs an hour at :00,
 *                      :15, :30 and :45, each run enqueues both refresh jobs, and the source
 *                      refresh joins them only when a file is due. Scheduling runs under a
 *                      test prefix, so the test passes in an org where the real four jobs are
 *                      already scheduled, as in production. Test.stopTest() runs the queued
 *                      refresh jobs, and an org with real configuration (a GitHub repo path, a
 *                      Jira project, source paths with no cache row) would make them call
 *                      out, which a test method may not do. So each test that queues them
 *                      stands in for that configuration and sets a mock that answers any
 *                      callout that still happens.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@IsTest
private class IntegrationCacheRefreshSchedulerTest {
  private static final String TEST_PREFIX = 'Test Integration Cache Refresh :';

  /** Answers every callout with 503, so a refresh records a failure and writes no data. */
  private class UnavailableMock implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest request) {
      HttpResponse response = new HttpResponse();
      response.setStatusCode(503);
      response.setBody('{}');
      return response;
    }
  }

  /**
   * Keeps the queued refresh jobs from reading the org's own configuration: no GitHub or
   * Jira record and no source file, so each job returns before any callout.
   */
  private static void isolateRefreshJobs() {
    GitHubCacheRefreshJob.configOverridden = true;
    JiraCacheRefreshJob.configOverridden = true;
    SourceCacheRefreshJob.configOverridden = true;
    SourceController.filesOverride = new List<Source_File__mdt>();
    Test.setMock(HttpCalloutMock.class, new UnavailableMock());
  }

  @IsTest
  static void shouldScheduleFourRunsWhenScheduleAll() {
    IntegrationCacheRefreshScheduler.jobNamePrefix = TEST_PREFIX;
    isolateRefreshJobs();

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
    isolateRefreshJobs();
    // One source file with no cache row, so the source refresh is due.
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

    Assert.areEqual(
      4,
      queued,
      'GitHub, Jira, source and storage snapshot jobs enqueued'
    );
  }

  @IsTest
  static void shouldEnqueueTheStorageSnapshotWhenNoneIsStored() {
    isolateRefreshJobs();

    Test.startTest();
    new IntegrationCacheRefreshScheduler().execute(null);
    Test.stopTest();

    Assert.areEqual(
      1,
      [
        SELECT COUNT()
        FROM AsyncApexJob
        WHERE JobType = 'Queueable' AND ApexClass.Name = 'StorageSnapshotJob'
      ],
      'The storage snapshot job ran'
    );
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Storage_Snapshot__c],
      'It stored the snapshot'
    );
  }

  @IsTest
  static void shouldEnqueueBothRefreshJobsWhenExecuted() {
    // No source file configured, so no source refresh, and a fresh snapshot is stored.
    isolateRefreshJobs();
    StorageSnapshot.save(StorageSnapshotJob.build());

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

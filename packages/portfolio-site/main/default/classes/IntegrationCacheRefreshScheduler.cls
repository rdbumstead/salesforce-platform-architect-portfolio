/**
 * @description       : Schedules the integration cache refresh four times an hour, at :00,
 *                      :15, :30 and :45 (pillar-e-design 4.4). Each run enqueues
 *                      GitHubCacheRefreshJob and JiraCacheRefreshJob, which make the callouts,
 *                      and SourceCacheRefreshJob when a source file is due, which is at most
 *                      once a day per file (Round 7 contract P2). Schedule it once, as the admin who holds the GitHub and Jira principal
 *                      access, with IntegrationCacheRefreshScheduler.scheduleAll(). That takes 4
 *                      of the 100 scheduled job slots.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [IntegrationCacheRefreshSchedulerTest]
 **/
public with sharing class IntegrationCacheRefreshScheduler implements Schedulable {
  public static final String JOB_NAME_PREFIX = 'Integration Cache Refresh :';

  // Tests schedule under their own prefix, because an org that runs the refresh already
  // holds jobs with the real names and a second schedule under a name in use fails.
  @TestVisible
  private static String jobNamePrefix = JOB_NAME_PREFIX;

  /** Minutes past the hour the refresh runs. */
  public static final List<Integer> MINUTES = new List<Integer>{
    0,
    15,
    30,
    45
  };

  /**
   * @description Enqueues both refresh jobs, and the source refresh when a file is due.
   * @param context Schedulable context.
   */
  public void execute(SchedulableContext context) {
    System.enqueueJob(new GitHubCacheRefreshJob());
    System.enqueueJob(new JiraCacheRefreshJob());
    if (SourceCacheRefreshJob.isDue()) {
      System.enqueueJob(new SourceCacheRefreshJob());
    }
  }

  /**
   * @description The CRON expression for a minute past every hour.
   * @param minute 0 to 59.
   * @return String For example 0 15 * * * ?.
   */
  public static String cronFor(Integer minute) {
    return '0 ' + minute + ' * * * ?';
  }

  /**
   * @description Schedules the four runs, named JOB_NAME_PREFIX plus the minute (":00" and
   *              so on). A test sets its own prefix. Fails if a job with that name is
   *              already scheduled.
   * @return List<Id> The CronTrigger ids, in MINUTES order.
   * @example
   * IntegrationCacheRefreshScheduler.scheduleAll();
   */
  public static List<Id> scheduleAll() {
    List<Id> jobIds = new List<Id>();
    for (Integer minute : MINUTES) {
      jobIds.add(
        System.schedule(
          jobNamePrefix + String.valueOf(minute).leftPad(2, '0'),
          cronFor(minute),
          new IntegrationCacheRefreshScheduler()
        )
      );
    }
    return jobIds;
  }
}

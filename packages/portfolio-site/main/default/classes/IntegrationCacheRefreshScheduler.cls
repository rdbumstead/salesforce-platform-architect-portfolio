/**
 * @description       : Schedules the integration cache refresh four times an hour, at :00,
 *                      :15, :30 and :45 (pillar-e-design 4.4). Each run enqueues
 *                      GitHubCacheRefreshJob and JiraCacheRefreshJob, which make the callouts.
 *                      Schedule it once, as the admin who holds the GitHub and Jira principal
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

  /** Minutes past the hour the refresh runs. */
  public static final List<Integer> MINUTES = new List<Integer>{
    0,
    15,
    30,
    45
  };

  /**
   * @description Enqueues both refresh jobs.
   * @param context Schedulable context.
   */
  public void execute(SchedulableContext context) {
    System.enqueueJob(new GitHubCacheRefreshJob());
    System.enqueueJob(new JiraCacheRefreshJob());
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
   *              so on). Fails if a job with that name is already scheduled.
   * @return List<Id> The CronTrigger ids, in MINUTES order.
   * @example
   * IntegrationCacheRefreshScheduler.scheduleAll();
   */
  public static List<Id> scheduleAll() {
    List<Id> jobIds = new List<Id>();
    for (Integer minute : MINUTES) {
      jobIds.add(
        System.schedule(
          JOB_NAME_PREFIX + String.valueOf(minute).leftPad(2, '0'),
          cronFor(minute),
          new IntegrationCacheRefreshScheduler()
        )
      );
    }
    return jobIds;
  }
}

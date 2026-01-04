/**
 * @description       : Scheduler for CacheCleanupOrchestrator.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/30/2025
 * @Test Class        : [CacheCleanupSchedulerTest]
 **/
global with sharing class CacheCleanupScheduler implements Schedulable {
  /**
   * @description Executes the scheduled job.
   * @param sc SchedulableContext
   */
  global void execute(SchedulableContext sc) {
    if (!CacheCleanupSettings.isEnabled()) {
      System.debug('Cache cleanup is DISABLED via Custom Metadata.');
      return;
    }

    new CacheCleanupOrchestrator().run();
  }
}

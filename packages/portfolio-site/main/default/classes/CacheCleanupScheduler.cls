public class CacheCleanupScheduler implements Schedulable {
  global void execute(SchedulableContext sc) {
    if (!CacheCleanupSettings.isEnabled()) {
      System.debug('Cache cleanup is DISABLED via Custom Metadata.');
      return;
    }

    new CacheCleanupOrchestrator().run();
  }
}

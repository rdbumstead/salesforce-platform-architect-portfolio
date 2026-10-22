/**
 * @description       : Refreshes the Jira roadmap cache (pillar-e-design 4.4). Reads the project
 *                      key from Portfolio_Config__mdt (SPAP when the field is blank), runs the
 *                      roadmap search through JiraService, and inserts one Jira_Cache__c row
 *                      holding the schemaVersion 1 payload built from DeliveryController's
 *                      DTOs. A failed call inserts nothing, so the newest good row keeps
 *                      serving, and counts as a failure on the jira circuit breaker. Three
 *                      failures in a row open it, and refreshes skip Jira for 30 minutes (SAS
 *                      8.4). With no config record it logs and exits. Queueable because
 *                      scheduled Apex cannot call out synchronously.
 *                      IntegrationCacheRefreshScheduler enqueues it every 15 minutes.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [JiraCacheRefreshJobTest]
 **/
public with sharing class JiraCacheRefreshJob implements Queueable, Database.AllowsCallouts {
  /**
   * @description Queueable entry point. Runs refresh().
   * @param context Queueable context.
   */
  public void execute(QueueableContext context) {
    refresh();
  }

  /**
   * @description One refresh: config, breaker check, callout, then the writes. Every write
   *              happens after the callout (contract C2).
   * @return String One of the GitHubCacheRefreshJob.OUTCOME_ constants.
   */
  public static String refresh() {
    Portfolio_Config__mdt config = config();
    if (config == null) {
      PortfolioLog.info(
        'JiraCacheRefreshJob: no Portfolio_Config__mdt record, nothing refreshed.'
      );
      return GitHubCacheRefreshJob.OUTCOME_NO_CONFIG;
    }
    if (CircuitBreaker.isOpen(CircuitBreaker.KEY_JIRA)) {
      return GitHubCacheRefreshJob.OUTCOME_OPEN_CIRCUIT;
    }

    List<DeliveryController.RoadmapItem> items;
    try {
      items = JiraService.fetchRoadmap(JiraService.projectKey(config));
    } catch (Exception e) {
      // Recovered on purpose: the newest good row keeps serving and the breaker counts it.
      PortfolioLog.info('JiraCacheRefreshJob failed: ' + e.getTypeName());
      CircuitBreaker.recordFailure(CircuitBreaker.KEY_JIRA);
      return GitHubCacheRefreshJob.OUTCOME_FAILED;
    }

    DeliveryController.RoadmapPayload payload = new DeliveryController.RoadmapPayload();
    payload.schemaVersion = DeliveryController.SCHEMA_VERSION;
    payload.items = items;
    insert as system new Jira_Cache__c(
      JSON_Payload__c = JSON.serialize(payload)
    );
    CircuitBreaker.recordSuccess(CircuitBreaker.KEY_JIRA);
    return GitHubCacheRefreshJob.OUTCOME_REFRESHED;
  }

  // Tests set these to stand in for the org's record, or for its absence.
  @TestVisible
  private static Boolean configOverridden = false;
  @TestVisible
  private static Portfolio_Config__mdt configOverride;

  private static Portfolio_Config__mdt config() {
    return configOverridden ? configOverride : PortfolioService.getConfig();
  }
}

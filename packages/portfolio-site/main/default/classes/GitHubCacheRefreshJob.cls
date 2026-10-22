/**
 * @description       : Refreshes the GitHub commit cache (pillar-e-design 4.4, SAS A.4 name).
 *                      Reads the repository path from Portfolio_Config__mdt, calls GitHub
 *                      through GitHubService, and inserts one Github_Cache__c row holding the
 *                      schemaVersion 1 payload built from DeliveryController's DTOs. A failed
 *                      call inserts nothing, so the newest good row keeps serving, and counts
 *                      as a failure on the github circuit breaker. While that circuit is open
 *                      the job skips the call. With no config record it logs and exits.
 *                      Queueable because scheduled Apex cannot call out synchronously.
 *                      IntegrationCacheRefreshScheduler enqueues it every 15 minutes.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [GitHubCacheRefreshJobTest]
 **/
public with sharing class GitHubCacheRefreshJob implements Queueable, Database.AllowsCallouts {
  public static final String OUTCOME_REFRESHED = 'refreshed';
  public static final String OUTCOME_NO_CONFIG = 'skipped_no_config';
  public static final String OUTCOME_OPEN_CIRCUIT = 'skipped_open_circuit';
  public static final String OUTCOME_FAILED = 'failed';

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
   * @return String One of the OUTCOME_ constants.
   */
  public static String refresh() {
    Portfolio_Config__mdt config = config();
    if (config == null || String.isBlank(config.GitHub_Repo_Path__c)) {
      System.debug(
        LoggingLevel.WARN,
        'GitHubCacheRefreshJob: no Portfolio_Config__mdt record with a GitHub_Repo_Path__c, nothing refreshed.'
      );
      return OUTCOME_NO_CONFIG;
    }
    if (CircuitBreaker.isOpen(CircuitBreaker.KEY_GITHUB)) {
      return OUTCOME_OPEN_CIRCUIT;
    }

    List<DeliveryController.CommitItem> items;
    try {
      items = GitHubService.fetchRecentCommits(config.GitHub_Repo_Path__c);
    } catch (Exception e) {
      // Recovered on purpose: the newest good row keeps serving and the breaker counts it.
      System.debug(
        LoggingLevel.WARN,
        'GitHubCacheRefreshJob failed: ' + e.getTypeName()
      );
      CircuitBreaker.recordFailure(CircuitBreaker.KEY_GITHUB);
      return OUTCOME_FAILED;
    }

    DeliveryController.CommitPayload payload = new DeliveryController.CommitPayload();
    payload.schemaVersion = DeliveryController.SCHEMA_VERSION;
    payload.items = items;
    insert as system new Github_Cache__c(
      JSON_Payload__c = JSON.serialize(payload)
    );
    CircuitBreaker.recordSuccess(CircuitBreaker.KEY_GITHUB);
    return OUTCOME_REFRESHED;
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

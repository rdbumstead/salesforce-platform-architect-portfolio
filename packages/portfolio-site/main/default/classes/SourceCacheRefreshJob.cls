/**
 * @description       : Fills Source_Cache__c, the View source cache (Round 7 contract P2,
 *                      reading R17). It reads every Source_File__mdt path from GitHub on main
 *                      through GitHubService and upserts one row per path. A path is due when it
 *                      has no row or its last check is REFRESH_HOURS old, so each file is read
 *                      at most once a day, a failing one included. A failed read keeps the
 *                      newest good content and only records the check and the status. All
 *                      callouts happen before any write (contract C2). Rows for paths no longer
 *                      configured are deleted. IntegrationCacheRefreshScheduler enqueues it on
 *                      its existing schedule only when isDue() is true, so no new schedule and
 *                      no new Setup step is needed. It runs as the admin who scheduled that job.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 * @Test Class        : [SourceCacheRefreshJobTest]
 **/
public with sharing class SourceCacheRefreshJob implements Queueable, Database.AllowsCallouts {
  public static final String OUTCOME_REFRESHED = 'refreshed';
  public static final String OUTCOME_NOT_DUE = 'skipped_not_due';
  public static final String OUTCOME_NO_CONFIG = 'skipped_no_config';
  public static final String OUTCOME_OPEN_CIRCUIT = 'skipped_open_circuit';
  public static final String OUTCOME_FAILED = 'failed';

  public static final Integer REFRESH_HOURS = 24;
  /** Source_Cache__c.Content__c length. */
  public static final Integer CONTENT_MAX_LENGTH = 131072;
  /** Callouts per run, under the limit of 100 with room for the other work. */
  public static final Integer MAX_FILES_PER_RUN = 90;
  public static final String STATUS_OK = '200';
  private static final Integer STATUS_MAX_LENGTH = 80;

  /**
   * @description Queueable entry point. Runs refresh().
   * @param context Queueable context.
   */
  public void execute(QueueableContext context) {
    refresh();
  }

  /**
   * @description Whether any configured path is due. One query, no callout, so the
   *              scheduler can ask four times an hour for nothing.
   * @return Boolean True when a path has no row or a check older than REFRESH_HOURS.
   */
  public static Boolean isDue() {
    return !duePaths(configuredPaths()).isEmpty();
  }

  /**
   * @description One refresh: due paths, config, breaker, the callouts, then the writes.
   * @return String One of the OUTCOME_ constants.
   */
  public static String refresh() {
    Set<String> configured = configuredPaths();
    List<String> due = duePaths(configured);
    if (due.isEmpty()) {
      deleteUnconfigured(configured);
      return OUTCOME_NOT_DUE;
    }
    Portfolio_Config__mdt config = config();
    if (config == null || String.isBlank(config.GitHub_Repo_Path__c)) {
      PortfolioLog.info(
        'SourceCacheRefreshJob: no Portfolio_Config__mdt record with a GitHub_Repo_Path__c, nothing refreshed.'
      );
      return OUTCOME_NO_CONFIG;
    }
    if (CircuitBreaker.isOpen(CircuitBreaker.KEY_GITHUB)) {
      return OUTCOME_OPEN_CIRCUIT;
    }

    Datetime checkedAt = System.now();
    List<Source_Cache__c> rows = new List<Source_Cache__c>();
    Integer failures = 0;
    for (String path : due) {
      Source_Cache__c row = read(config.GitHub_Repo_Path__c, path, checkedAt);
      if (row.Last_Status__c != STATUS_OK) {
        failures++;
      }
      rows.add(row);
    }

    // Every write follows every callout (contract C2).
    upsert as system rows Path__c;
    deleteUnconfigured(configured);
    if (failures == rows.size()) {
      CircuitBreaker.recordFailure(CircuitBreaker.KEY_GITHUB);
      return OUTCOME_FAILED;
    }
    CircuitBreaker.recordSuccess(CircuitBreaker.KEY_GITHUB);
    return OUTCOME_REFRESHED;
  }

  /**
   * @description Reads one file. The callout happens inside a loop on purpose: one file per
   *              request is how the contents API works, and the loop is capped at
   *              MAX_FILES_PER_RUN.
   */
  private static Source_Cache__c read(
    String repoPath,
    String path,
    Datetime checkedAt
  ) {
    Source_Cache__c row = new Source_Cache__c(
      Path__c = path,
      Checked_At__c = checkedAt
    );
    try {
      GitHubService.FileContent file = GitHubService.fetchFile(repoPath, path);
      String content = file.content ?? '';
      row.Truncated__c = content.length() > CONTENT_MAX_LENGTH;
      row.Content__c = content.left(CONTENT_MAX_LENGTH);
      row.Html_Url__c = file.htmlUrl;
      row.Fetched_At__c = checkedAt;
      row.Last_Status__c = STATUS_OK;
    } catch (GitHubService.GitHubServiceException e) {
      // Recovered on purpose: the newest good content keeps serving.
      row.Last_Status__c = e.getMessage().left(STATUS_MAX_LENGTH);
    } catch (CalloutException e) {
      row.Last_Status__c = ('Callout failed: ' + e.getTypeName())
        .left(STATUS_MAX_LENGTH);
    }
    return row;
  }

  private static Set<String> configuredPaths() {
    Set<String> paths = new Set<String>();
    for (Source_File__mdt file : SourceController.configuredFiles()) {
      paths.add(file.Path__c.trim());
    }
    return paths;
  }

  private static List<String> duePaths(Set<String> configured) {
    List<String> due = new List<String>();
    if (configured.isEmpty()) {
      return due;
    }
    Datetime staleBefore = System.now().addHours(-REFRESH_HOURS);
    Map<String, Datetime> checkedByPath = new Map<String, Datetime>();
    for (Source_Cache__c row : [
      SELECT Path__c, Checked_At__c
      FROM Source_Cache__c
      WHERE Path__c IN :configured
      WITH SYSTEM_MODE
    ]) {
      checkedByPath.put(row.Path__c, row.Checked_At__c);
    }
    List<String> sorted = new List<String>(configured);
    sorted.sort();
    for (String path : sorted) {
      Datetime checked = checkedByPath.get(path);
      if (checked == null || checked < staleBefore) {
        due.add(path);
      }
      if (due.size() == MAX_FILES_PER_RUN) {
        break;
      }
    }
    return due;
  }

  private static void deleteUnconfigured(Set<String> configured) {
    List<Source_Cache__c> orphans = [
      SELECT Id
      FROM Source_Cache__c
      WHERE Path__c NOT IN :configured
      WITH SYSTEM_MODE
      LIMIT 200
    ];
    if (!orphans.isEmpty()) {
      delete as system orphans;
    }
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

/**
 * @description       : Serves the Delivery page governance checklist.
 *                      getPipelineStatus() returns the latest Pipeline_Run__c per workflow, the
 *                      newest CreatedDate of each integration cache, and three checklist items
 *                      worked out from that evidence. An item passes only on evidence: no run
 *                      means NO_SIGNAL, a Failure means FAIL, and old evidence means STALE.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/21/2026
 * @Test Class        : [GovernanceControllerTest]
 **/
public with sharing class GovernanceController implements QueryDefinitions.Provider {
  private static final String RUNS_QUERY = 'GovernanceController_PipelineRuns';
  private static final String GITHUB_QUERY = 'GovernanceController_GithubCache';
  private static final String JIRA_QUERY = 'GovernanceController_JiraCache';
  public static final String ITEM_DEPLOY = 'deploy';
  public static final String ITEM_HEARTBEAT = 'heartbeat';
  public static final String ITEM_CACHES = 'caches';
  public static final String STATE_PASS = 'PASS';
  public static final String STATE_FAIL = 'FAIL';
  public static final String STATE_STALE = 'STALE';
  public static final String STATE_NO_SIGNAL = 'NO_SIGNAL';
  // Code defaults. The Heartbeat_Stale_Hours and Governance_Cache_Minutes settings give
  // the values in force.
  public static final Integer HEARTBEAT_HOURS = 26;
  public static final Integer CACHE_MINUTES = 30;

  private static final List<String> WORKFLOWS = new List<String>{
    GovernanceEventHandler.WORKFLOW_DEPLOY,
    GovernanceEventHandler.WORKFLOW_HEARTBEAT
  };

  @TestVisible
  private static Datetime nowOverride;

  /**
   * @description The latest run per workflow, the cache times and the three checklist items.
   *              Cacheable, so the component refreshes it with refreshApex when the page is
   *              opened or shown again. No timer and no callout.
   * @return PipelineStatus The evidence and the checklist built from it.
   */
  @AuraEnabled(cacheable=true)
  public static PipelineStatus getPipelineStatus() {
    EvidenceSelector selector = new EvidenceSelector();
    Datetime now = nowOverride ?? Datetime.now();
    PipelineStatus result = new PipelineStatus();
    result.generatedAt = now;
    result.runs = selector.latestRunPerWorkflow();
    result.githubCacheAt = selector.newestGithubCache();
    result.jiraCacheAt = selector.newestJiraCache();

    Map<String, RunInfo> runByWorkflow = new Map<String, RunInfo>();
    for (RunInfo run : result.runs) {
      runByWorkflow.put(run.workflow, run);
    }
    result.items = new List<ChecklistItem>{
      deployItem(runByWorkflow.get(GovernanceEventHandler.WORKFLOW_DEPLOY)),
      heartbeatItem(
        runByWorkflow.get(GovernanceEventHandler.WORKFLOW_HEARTBEAT),
        now
      ),
      cacheItem(result.githubCacheAt, result.jiraCacheAt, now)
    };
    return result;
  }

  // The deploy item. A deploy has no age limit: the last production deploy stays the evidence.
  private static ChecklistItem deployItem(RunInfo run) {
    ChecklistItem item = new ChecklistItem(
      ITEM_DEPLOY,
      'Production deploy green'
    );
    item.run = run;
    item.state = run == null ? STATE_NO_SIGNAL : runState(run);
    return item;
  }

  // The heartbeat item. A heartbeat older than the stale hours (26 by default) is stale,
  // never a tick.
  private static ChecklistItem heartbeatItem(RunInfo run, Datetime now) {
    Integer staleHours = PortfolioSettings.getInteger(
      'Heartbeat_Stale_Hours',
      HEARTBEAT_HOURS
    );
    ChecklistItem item = new ChecklistItem(
      ITEM_HEARTBEAT,
      'Org heartbeat in the last ' + staleHours + ' hours'
    );
    item.run = run;
    if (run == null) {
      item.state = STATE_NO_SIGNAL;
    } else if (runState(run) == STATE_FAIL) {
      item.state = STATE_FAIL;
    } else {
      item.state = isWithin(run.completedAt, now, staleHours * 60)
        ? STATE_PASS
        : STATE_STALE;
    }
    return item;
  }

  // The cache item, computed in the org. Both caches must be under the cache minutes
  // (30 by default) old.
  private static ChecklistItem cacheItem(
    Datetime githubAt,
    Datetime jiraAt,
    Datetime now
  ) {
    Integer cacheMinutes = PortfolioSettings.getInteger(
      'Governance_Cache_Minutes',
      CACHE_MINUTES
    );
    ChecklistItem item = new ChecklistItem(
      ITEM_CACHES,
      'Integration caches under ' + cacheMinutes + ' minutes old'
    );
    if (githubAt == null && jiraAt == null) {
      item.state = STATE_NO_SIGNAL;
    } else if (
      isWithin(githubAt, now, cacheMinutes) &&
      isWithin(jiraAt, now, cacheMinutes)
    ) {
      item.state = STATE_PASS;
    } else {
      item.state = STATE_STALE;
    }
    return item;
  }

  private static String runState(RunInfo run) {
    return run.status == GovernanceEventHandler.STATUS_SUCCESS
      ? STATE_PASS
      : STATE_FAIL;
  }

  private static Boolean isWithin(
    Datetime value,
    Datetime now,
    Integer minutes
  ) {
    return value != null &&
      value <= now.addMinutes(1) &&
      value > now.addMinutes(-minutes);
  }

  /**
   * @description Reads Pipeline_Run__c and the two cache objects in system mode and without
   *              sharing. The site guest has no grant on any of them on purpose,
   *              so no guest sharing rule is needed. The
   *              outer class returns only public pipeline metadata and two timestamps.
   */
  private without sharing class EvidenceSelector {
    private List<RunInfo> latestRunPerWorkflow() {
      List<RunInfo> latest = new List<RunInfo>();
      Set<String> seen = new Set<String>();
      List<Pipeline_Run__c> rows = (List<Pipeline_Run__c>) QueryDefinitions.run(
        RUNS_QUERY,
        runBinds(),
        runsDefault()
      );
      for (Pipeline_Run__c row : rows) {
        if (seen.add(row.Workflow__c)) {
          latest.add(new RunInfo(row));
        }
      }
      return latest;
    }

    private Datetime newestGithubCache() {
      List<Github_Cache__c> rows = (List<Github_Cache__c>) QueryDefinitions.run(
        GITHUB_QUERY,
        new Map<String, Object>(),
        githubDefault()
      );
      return rows.isEmpty() ? null : rows[0].CreatedDate;
    }

    private Datetime newestJiraCache() {
      List<Jira_Cache__c> rows = (List<Jira_Cache__c>) QueryDefinitions.run(
        JIRA_QUERY,
        new Map<String, Object>(),
        jiraDefault()
      );
      return rows.isEmpty() ? null : rows[0].CreatedDate;
    }
  }

  /**
   * @description The runs read as code: the deploy and heartbeat runs, newest first, in
   *              system mode. Query_Definition.GovernanceController_PipelineRuns ships equal
   *              to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault runsDefault() {
    return new QueryDefinitions.QueryDefault(
        'Pipeline_Run__c',
        'Workflow__c, Status__c, Run_Id__c, Run_Url__c, Commit_Sha__c, Completed_At__c'
      )
      .filter('Workflow__c IN :workflows')
      .orderBy('Completed_At__c DESC NULLS LAST, CreatedDate DESC, Id DESC')
      .rowLimit(200)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE)
      .binds(runBinds());
  }

  private static Map<String, Object> runBinds() {
    return new Map<String, Object>{ 'workflows' => WORKFLOWS };
  }

  /**
   * @description The newest GitHub cache time as code, in system mode.
   *              Query_Definition.GovernanceController_GithubCache ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault githubDefault() {
    return newestCacheDefault('Github_Cache__c');
  }

  /**
   * @description The newest Jira cache time as code, in system mode.
   *              Query_Definition.GovernanceController_JiraCache ships equal to it.
   * @return QueryDefinitions.QueryDefault The default.
   */
  @TestVisible
  private static QueryDefinitions.QueryDefault jiraDefault() {
    return newestCacheDefault('Jira_Cache__c');
  }

  private static QueryDefinitions.QueryDefault newestCacheDefault(
    String objectName
  ) {
    return new QueryDefinitions.QueryDefault(objectName, 'CreatedDate')
      .orderBy('CreatedDate DESC')
      .rowLimit(1)
      .mode(QueryDefinitions.Mode.SYSTEM_MODE);
  }

  /**
   * @description The code defaults this class owns, for QueryDefinitions.validateAll().
   * @return Map<String, QueryDefinitions.QueryDefault> The defaults by record name.
   */
  public Map<String, QueryDefinitions.QueryDefault> queryDefaults() {
    return new Map<String, QueryDefinitions.QueryDefault>{
      RUNS_QUERY => runsDefault(),
      GITHUB_QUERY => githubDefault(),
      JIRA_QUERY => jiraDefault()
    };
  }

  /**
   * @description Everything the checklist shows.
   */
  public class PipelineStatus {
    @AuraEnabled
    public List<ChecklistItem> items;
    @AuraEnabled
    public List<RunInfo> runs;
    @AuraEnabled
    public Datetime githubCacheAt;
    @AuraEnabled
    public Datetime jiraCacheAt;
    @AuraEnabled
    public Datetime generatedAt;
  }

  /**
   * @description One checklist row. passed is true only when state is PASS.
   */
  public class ChecklistItem {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public String label;
    @AuraEnabled
    public String state;
    @AuraEnabled
    public RunInfo run;
    @AuraEnabled
    public Boolean passed {
      get {
        return state == STATE_PASS;
      }
    }

    public ChecklistItem(String key, String label) {
      this.key = key;
      this.label = label;
    }
  }

  /**
   * @description The latest stored run of one workflow.
   */
  public class RunInfo {
    @AuraEnabled
    public String workflow;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String runId;
    @AuraEnabled
    public String runUrl;
    @AuraEnabled
    public String commitSha;
    @AuraEnabled
    public Datetime completedAt;

    public RunInfo(Pipeline_Run__c row) {
      this.workflow = row.Workflow__c;
      this.status = row.Status__c;
      this.runId = row.Run_Id__c;
      this.runUrl = row.Run_Url__c;
      this.commitSha = row.Commit_Sha__c;
      this.completedAt = row.Completed_At__c;
    }
  }
}

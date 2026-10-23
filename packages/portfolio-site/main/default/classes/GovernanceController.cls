/**
 * @description       : Serves the Delivery page governance checklist.
 *                      getPipelineStatus() returns the latest Pipeline_Run__c per workflow, the
 *                      newest CreatedDate of each integration cache, and three checklist items
 *                      worked out from that evidence. An item passes only on evidence: no run
 *                      means NO_SIGNAL, a Failure means FAIL, and old evidence means STALE.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [GovernanceControllerTest]
 **/
public with sharing class GovernanceController {
  public static final String ITEM_DEPLOY = 'deploy';
  public static final String ITEM_HEARTBEAT = 'heartbeat';
  public static final String ITEM_CACHES = 'caches';
  public static final String STATE_PASS = 'PASS';
  public static final String STATE_FAIL = 'FAIL';
  public static final String STATE_STALE = 'STALE';
  public static final String STATE_NO_SIGNAL = 'NO_SIGNAL';
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

  // The heartbeat item. A heartbeat older than 26 hours is stale, never a tick.
  private static ChecklistItem heartbeatItem(RunInfo run, Datetime now) {
    ChecklistItem item = new ChecklistItem(
      ITEM_HEARTBEAT,
      'Org heartbeat in the last ' + HEARTBEAT_HOURS + ' hours'
    );
    item.run = run;
    if (run == null) {
      item.state = STATE_NO_SIGNAL;
    } else if (runState(run) == STATE_FAIL) {
      item.state = STATE_FAIL;
    } else {
      item.state = isWithin(run.completedAt, now, HEARTBEAT_HOURS * 60)
        ? STATE_PASS
        : STATE_STALE;
    }
    return item;
  }

  // The cache item, computed in the org. Both caches must be under 30 minutes old.
  private static ChecklistItem cacheItem(
    Datetime githubAt,
    Datetime jiraAt,
    Datetime now
  ) {
    ChecklistItem item = new ChecklistItem(
      ITEM_CACHES,
      'Integration caches under ' + CACHE_MINUTES + ' minutes old'
    );
    if (githubAt == null && jiraAt == null) {
      item.state = STATE_NO_SIGNAL;
    } else if (
      isWithin(githubAt, now, CACHE_MINUTES) &&
      isWithin(jiraAt, now, CACHE_MINUTES)
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
      for (Pipeline_Run__c row : [
        SELECT
          Workflow__c,
          Status__c,
          Run_Id__c,
          Run_Url__c,
          Commit_Sha__c,
          Completed_At__c
        FROM Pipeline_Run__c
        WHERE Workflow__c IN :WORKFLOWS
        WITH SYSTEM_MODE
        ORDER BY Completed_At__c DESC NULLS LAST, CreatedDate DESC, Id DESC
        LIMIT 200
      ]) {
        if (seen.add(row.Workflow__c)) {
          latest.add(new RunInfo(row));
        }
      }
      return latest;
    }

    private Datetime newestGithubCache() {
      List<Github_Cache__c> rows = [
        SELECT CreatedDate
        FROM Github_Cache__c
        WITH SYSTEM_MODE
        ORDER BY CreatedDate DESC
        LIMIT 1
      ];
      return rows.isEmpty() ? null : rows[0].CreatedDate;
    }

    private Datetime newestJiraCache() {
      List<Jira_Cache__c> rows = [
        SELECT CreatedDate
        FROM Jira_Cache__c
        WITH SYSTEM_MODE
        ORDER BY CreatedDate DESC
        LIMIT 1
      ];
      return rows.isEmpty() ? null : rows[0].CreatedDate;
    }
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

/**
 * @description       : Stores Governance_Event__e messages as Pipeline_Run__c rows.
 *                      Each event is upserted on Run_Key__c,
 *                      which is "<workflow>:<run id>", so a replayed event never adds a row and an
 *                      identical replay writes nothing. Only the newest 60 rows per workflow are
 *                      kept. Events with an unknown workflow or status, or no run id, are skipped.
 *                      The known workflows are deploy, heartbeat and smoke (the live site check
 *                      that runs after a production deploy).
 *                      Test counts and org coverage are stored only when they make sense together
 *                      (whole numbers, passed no more than run, coverage from 0 to 100), so the
 *                      Pillar E card never shows a broken number. The Jest counts follow the
 *                      same rule as a pair of their own, kept or dropped apart from the Apex ones.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/21/2026
 * @Test Class        : [GovernanceEventHandlerTest]
 **/
public with sharing class GovernanceEventHandler {
  public static final String WORKFLOW_DEPLOY = 'deploy';
  public static final String WORKFLOW_HEARTBEAT = 'heartbeat';
  public static final String WORKFLOW_SMOKE = 'smoke';
  public static final String STATUS_SUCCESS = 'Success';
  public static final String STATUS_FAILURE = 'Failure';
  public static final Integer KEEP_PER_WORKFLOW = 60;
  @TestVisible
  private static final Integer MAX_RETRIES = 2;

  private static final Set<String> WORKFLOWS = new Set<String>{
    WORKFLOW_DEPLOY,
    WORKFLOW_HEARTBEAT,
    WORKFLOW_SMOKE
  };
  private static final Map<String, String> STATUSES = new Map<String, String>{
    'success' => STATUS_SUCCESS,
    'failure' => STATUS_FAILURE
  };
  private static final String RUN_URL_PREFIX = 'https://github.com/';
  private static final Pattern SHA_PATTERN = Pattern.compile(
    '[A-Za-z0-9]{1,40}'
  );
  private static final Pattern RUN_ID_PATTERN = Pattern.compile(
    '[A-Za-z0-9_-]{1,40}'
  );

  @TestVisible
  private static Boolean failNextSave = false;
  @TestVisible
  private static Integer lastWriteCount = 0;

  /**
   * @description Entry point for GovernanceEventTrigger. Upserts one row per valid event and
   *              prunes each touched workflow to the newest 60 rows. A failed save is retried
   *              by the event bus up to MAX_RETRIES times, then the error is rethrown.
   * @param events The event messages delivered to the trigger.
   */
  public static void handle(List<Governance_Event__e> events) {
    if (events == null || events.isEmpty()) {
      return;
    }
    Map<String, Pipeline_Run__c> runsByKey = toRuns(events);
    if (runsByKey.isEmpty()) {
      return;
    }
    try {
      save(runsByKey);
    } catch (DmlException e) {
      if (EventBus.TriggerContext.currentContext().retries < MAX_RETRIES) {
        throw new EventBus.RetryableException(
          'Pipeline_Run__c save failed, retrying: ' + e.getMessage()
        );
      }
      throw e;
    }
  }

  // Later events in the same batch win for the same key.
  private static Map<String, Pipeline_Run__c> toRuns(
    List<Governance_Event__e> events
  ) {
    Map<String, Pipeline_Run__c> runsByKey = new Map<String, Pipeline_Run__c>();
    for (Governance_Event__e event : events) {
      Pipeline_Run__c run = toRun(event);
      if (run != null) {
        runsByKey.put(run.Run_Key__c, run);
      }
    }
    return runsByKey;
  }

  @TestVisible
  private static Pipeline_Run__c toRun(Governance_Event__e event) {
    String workflow = event.Workflow__c?.trim()?.toLowerCase();
    String status = STATUSES.get(event.Status__c?.trim()?.toLowerCase());
    String runId = event.Run_Id__c?.trim();
    if (
      !WORKFLOWS.contains(workflow) ||
      status == null ||
      !matches(RUN_ID_PATTERN, runId)
    ) {
      return null;
    }
    String sha = event.Commit_Sha__c?.trim();
    String url = event.Run_Url__c?.trim();
    Boolean testsValid = validTestResult(
      event.Tests_Run__c,
      event.Tests_Passed__c,
      event.Org_Coverage__c
    );
    Boolean jestValid = validJestResult(
      event.Jest_Tests_Run__c,
      event.Jest_Tests_Passed__c
    );
    return new Pipeline_Run__c(
      Run_Key__c = workflow + ':' + runId,
      Workflow__c = workflow,
      Status__c = status,
      Run_Id__c = runId,
      Run_Url__c = isRunUrl(url) ? url : null,
      Commit_Sha__c = matches(SHA_PATTERN, sha) ? sha : null,
      Completed_At__c = event.Completed_At__c,
      Tests_Run__c = testsValid ? event.Tests_Run__c : null,
      Tests_Passed__c = testsValid ? event.Tests_Passed__c : null,
      Org_Coverage__c = testsValid ? event.Org_Coverage__c : null,
      Jest_Tests_Run__c = jestValid ? event.Jest_Tests_Run__c : null,
      Jest_Tests_Passed__c = jestValid ? event.Jest_Tests_Passed__c : null
    );
  }

  // The Jest pair is judged on its own. A deploy can report Apex without Jest and the other
  // way round, so one pair being absent or broken never drops the other.
  @TestVisible
  private static Boolean validJestResult(
    Decimal testsRun,
    Decimal testsPassed
  ) {
    return testsRun != null &&
      testsPassed != null &&
      testsRun > 0 &&
      testsRun == testsRun.round(System.RoundingMode.DOWN) &&
      testsPassed >= 0 &&
      testsPassed == testsPassed.round(System.RoundingMode.DOWN) &&
      testsPassed <= testsRun;
  }

  // All three values arrive together from one test run, or none of them is kept.
  @TestVisible
  private static Boolean validTestResult(
    Decimal testsRun,
    Decimal testsPassed,
    Decimal coverage
  ) {
    return testsRun != null &&
      testsPassed != null &&
      coverage != null &&
      testsRun > 0 &&
      testsRun == testsRun.round(System.RoundingMode.DOWN) &&
      testsPassed >= 0 &&
      testsPassed == testsPassed.round(System.RoundingMode.DOWN) &&
      testsPassed <= testsRun &&
      coverage >= 0 &&
      coverage <= 100;
  }

  private static Boolean matches(Pattern valuePattern, String value) {
    return String.isNotBlank(value) && valuePattern.matcher(value).matches();
  }

  private static Boolean isRunUrl(String url) {
    return String.isNotBlank(url) &&
      url.length() <= 255 &&
      url.startsWith(RUN_URL_PREFIX) &&
      !url.containsWhitespace();
  }

  private static void save(Map<String, Pipeline_Run__c> runsByKey) {
    RunStore store = new RunStore();
    List<Pipeline_Run__c> changed = new List<Pipeline_Run__c>();
    Map<String, Pipeline_Run__c> existingByKey = store.byKeys(
      runsByKey.keySet()
    );
    Set<String> workflows = new Set<String>();
    for (Pipeline_Run__c run : runsByKey.values()) {
      Pipeline_Run__c existing = existingByKey.get(run.Run_Key__c);
      if (existing == null || !sameValues(existing, run)) {
        changed.add(run);
        workflows.add(run.Workflow__c);
      }
    }
    lastWriteCount = changed.size();
    if (changed.isEmpty()) {
      return;
    }
    if (failNextSave) {
      failNextSave = false;
      throw new DmlException('Forced failure for the retry test');
    }
    store.upsertRuns(changed);
    store.deleteRuns(beyondRetention(store.newestFirst(workflows)));
  }

  private static Boolean sameValues(
    Pipeline_Run__c existing,
    Pipeline_Run__c incoming
  ) {
    return existing.Status__c == incoming.Status__c &&
      existing.Run_Url__c == incoming.Run_Url__c &&
      existing.Commit_Sha__c == incoming.Commit_Sha__c &&
      existing.Completed_At__c == incoming.Completed_At__c &&
      existing.Tests_Run__c == incoming.Tests_Run__c &&
      existing.Tests_Passed__c == incoming.Tests_Passed__c &&
      existing.Org_Coverage__c == incoming.Org_Coverage__c &&
      existing.Jest_Tests_Run__c == incoming.Jest_Tests_Run__c &&
      existing.Jest_Tests_Passed__c == incoming.Jest_Tests_Passed__c;
  }

  // Rows arrive grouped by workflow, newest first, so everything past the 60th of a group goes.
  private static List<Pipeline_Run__c> beyondRetention(
    List<Pipeline_Run__c> rows
  ) {
    List<Pipeline_Run__c> extra = new List<Pipeline_Run__c>();
    Map<String, Integer> seenByWorkflow = new Map<String, Integer>();
    for (Pipeline_Run__c row : rows) {
      Integer seen = (seenByWorkflow.get(row.Workflow__c) ?? 0) + 1;
      seenByWorkflow.put(row.Workflow__c, seen);
      if (seen > KEEP_PER_WORKFLOW) {
        extra.add(row);
      }
    }
    return extra;
  }

  /**
   * @description Reads and writes Pipeline_Run__c in system mode and without sharing. The
   *              trigger is the only writer of this object, it runs as the platform's event
   *              user, and pruning has to see every row of a workflow whoever owns it. The
   *              rows hold only public pipeline metadata.
   */
  private without sharing class RunStore {
    private Map<String, Pipeline_Run__c> byKeys(Set<String> keys) {
      Map<String, Pipeline_Run__c> byKey = new Map<String, Pipeline_Run__c>();
      for (Pipeline_Run__c row : [
        SELECT
          Id,
          Run_Key__c,
          Status__c,
          Run_Url__c,
          Commit_Sha__c,
          Completed_At__c,
          Tests_Run__c,
          Tests_Passed__c,
          Org_Coverage__c,
          Jest_Tests_Run__c,
          Jest_Tests_Passed__c
        FROM Pipeline_Run__c
        WHERE Run_Key__c IN :keys
        WITH SYSTEM_MODE
      ]) {
        byKey.put(row.Run_Key__c, row);
      }
      return byKey;
    }

    private List<Pipeline_Run__c> newestFirst(Set<String> workflows) {
      return [
        SELECT Id, Workflow__c
        FROM Pipeline_Run__c
        WHERE Workflow__c IN :workflows
        WITH SYSTEM_MODE
        ORDER BY
          Workflow__c,
          Completed_At__c DESC NULLS LAST,
          CreatedDate DESC,
          Id DESC
        LIMIT 10000
      ];
    }

    private void upsertRuns(List<Pipeline_Run__c> runs) {
      Database.upsert(
        runs,
        Pipeline_Run__c.Run_Key__c,
        true,
        AccessLevel.SYSTEM_MODE
      );
    }

    private void deleteRuns(List<Pipeline_Run__c> runs) {
      if (!runs.isEmpty()) {
        Database.delete(runs, true, AccessLevel.SYSTEM_MODE);
      }
    }
  }
}

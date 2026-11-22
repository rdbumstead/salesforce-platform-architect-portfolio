/**
 * @description       : Tests for GovernanceController. Checklist items
 *                      tick only on evidence. The guest test runs as the real Portfolio1 site
 *                      guest user with Portfolio_Guest.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/21/2026
 **/
@isTest
private class GovernanceControllerTest {
  private static final Datetime NOW = Datetime.newInstanceGmt(
    2026,
    10,
    21,
    12,
    0,
    0
  );

  private static Pipeline_Run__c run(
    String workflow,
    String status,
    String runId,
    Datetime completedAt
  ) {
    return new Pipeline_Run__c(
      Run_Key__c = workflow + ':' + runId,
      Workflow__c = workflow,
      Status__c = status,
      Run_Id__c = runId,
      Run_Url__c = 'https://github.com/rdbumstead/repo/actions/runs/' + runId,
      Commit_Sha__c = 'sha' + runId,
      Completed_At__c = completedAt
    );
  }

  private static void insertCaches(
    Integer githubMinutesOld,
    Integer jiraMinutesOld
  ) {
    if (githubMinutesOld != null) {
      Github_Cache__c github = new Github_Cache__c(JSON_Payload__c = '{}');
      insert github;
      Test.setCreatedDate(github.Id, NOW.addMinutes(-githubMinutesOld));
    }
    if (jiraMinutesOld != null) {
      Jira_Cache__c jira = new Jira_Cache__c(JSON_Payload__c = '{}');
      insert jira;
      Test.setCreatedDate(jira.Id, NOW.addMinutes(-jiraMinutesOld));
    }
  }

  private static Map<String, GovernanceController.ChecklistItem> itemsByKey(
    GovernanceController.PipelineStatus status
  ) {
    Map<String, GovernanceController.ChecklistItem> byKey = new Map<String, GovernanceController.ChecklistItem>();
    for (GovernanceController.ChecklistItem item : status.items) {
      byKey.put(item.key, item);
    }
    return byKey;
  }

  private static Map<String, GovernanceController.ChecklistItem> load() {
    GovernanceController.nowOverride = NOW;
    Test.startTest();
    GovernanceController.PipelineStatus status = GovernanceController.getPipelineStatus();
    Test.stopTest();
    Assert.areEqual(4, status.items.size(), 'Four checklist items');
    return itemsByKey(status);
  }

  @isTest
  static void shouldShowNoSignalWhenNoEvidence() {
    Map<String, GovernanceController.ChecklistItem> items = load();

    for (GovernanceController.ChecklistItem item : items.values()) {
      Assert.areEqual(
        GovernanceController.STATE_NO_SIGNAL,
        item.state,
        item.key + ' has no signal'
      );
      Assert.isFalse(item.passed, item.key + ' never ticks without evidence');
      Assert.isNull(item.run, item.key + ' has no run');
    }
  }

  @isTest
  static void shouldPassDeployWhenLatestDeploySucceeded() {
    insert run('deploy', 'Success', '1', NOW.addDays(-9));

    GovernanceController.ChecklistItem deploy = load()
      .get(GovernanceController.ITEM_DEPLOY);

    Assert.areEqual(GovernanceController.STATE_PASS, deploy.state, 'Pass');
    Assert.isTrue(deploy.passed, 'Ticked');
    Assert.areEqual('sha1', deploy.run.commitSha, 'Evidence sha');
    Assert.areEqual(
      'https://github.com/rdbumstead/repo/actions/runs/1',
      deploy.run.runUrl,
      'Evidence link'
    );
    Assert.areEqual(NOW.addDays(-9), deploy.run.completedAt, 'Evidence time');
  }

  @isTest
  static void shouldPassSiteWhenLatestSiteBuildSucceeded() {
    insert run('site', 'Success', '7', NOW.addDays(-20));

    GovernanceController.ChecklistItem site = load()
      .get(GovernanceController.ITEM_SITE);

    Assert.areEqual('Static site build green', site.label, 'Label');
    Assert.areEqual(GovernanceController.STATE_PASS, site.state, 'Pass');
    Assert.areEqual('sha7', site.run.commitSha, 'Evidence sha');
  }

  @isTest
  static void shouldFlagTheSiteRowOnlyOnceASiteBuildHasReported() {
    GovernanceController.ChecklistItem none = load()
      .get(GovernanceController.ITEM_SITE);
    Assert.areEqual(false, none.everReported, 'No site build row yet');
    Assert.areEqual(
      GovernanceController.STATE_NO_SIGNAL,
      none.state,
      'No signal with no row'
    );
  }

  @isTest
  static void shouldFlagTheSiteRowForASingleOldFailedBuild() {
    insert run('site', 'Failure', '9', NOW.addDays(-400));
    GovernanceController.ChecklistItem failed = load()
      .get(GovernanceController.ITEM_SITE);
    Assert.areEqual(
      true,
      failed.everReported,
      'One failed build, however old, counts as reported'
    );
    Assert.areEqual(GovernanceController.STATE_FAIL, failed.state, 'Red');
  }

  @isTest
  static void shouldLeaveEverReportedOffTheOtherItems() {
    Map<String, GovernanceController.ChecklistItem> items = load();
    Assert.isNull(items.get(GovernanceController.ITEM_DEPLOY).everReported);
    Assert.isNull(items.get(GovernanceController.ITEM_HEARTBEAT).everReported);
    Assert.isNull(items.get(GovernanceController.ITEM_CACHES).everReported);
  }

  @isTest
  static void shouldFailSiteWhenLatestSiteBuildFailed() {
    insert run('site', 'Success', '7', NOW.addDays(-2));
    insert run('site', 'Failure', '8', NOW.addDays(-1));

    GovernanceController.ChecklistItem site = load()
      .get(GovernanceController.ITEM_SITE);

    Assert.areEqual(GovernanceController.STATE_FAIL, site.state, 'Fail');
    Assert.areEqual('8', site.run.runId, 'The failed build is the evidence');
  }

  @isTest
  static void shouldNeverTickWhenFailureEventDelivered() {
    insert run('deploy', 'Success', '1', NOW.addHours(-3));
    EventBus.publish(
      new Governance_Event__e(
        Workflow__c = 'deploy',
        Status__c = 'Failure',
        Run_Id__c = '2',
        Run_Url__c = 'https://github.com/rdbumstead/repo/actions/runs/2',
        Commit_Sha__c = 'sha2',
        Completed_At__c = NOW.addHours(-1)
      )
    );
    Test.getEventBus().deliver();

    GovernanceController.ChecklistItem deploy = load()
      .get(GovernanceController.ITEM_DEPLOY);

    Assert.areEqual(GovernanceController.STATE_FAIL, deploy.state, 'Fail');
    Assert.isFalse(deploy.passed, 'A Failure never ticks');
    Assert.areEqual('2', deploy.run.runId, 'The failed run is the evidence');
  }

  @isTest
  static void shouldReturnLatestRunPerWorkflowWhenSeveralStored() {
    insert new List<Pipeline_Run__c>{
      run('deploy', 'Success', 'old', NOW.addDays(-2)),
      run('deploy', 'Success', 'new', NOW.addDays(-1)),
      run('heartbeat', 'Success', 'hb1', NOW.addHours(-30)),
      run('heartbeat', 'Success', 'hb2', NOW.addHours(-2))
    };
    GovernanceController.nowOverride = NOW;

    Test.startTest();
    GovernanceController.PipelineStatus status = GovernanceController.getPipelineStatus();
    Test.stopTest();

    Assert.areEqual(2, status.runs.size(), 'One run per workflow');
    Map<String, GovernanceController.RunInfo> byWorkflow = new Map<String, GovernanceController.RunInfo>();
    for (GovernanceController.RunInfo info : status.runs) {
      byWorkflow.put(info.workflow, info);
    }
    Assert.areEqual('new', byWorkflow.get('deploy').runId, 'Latest deploy');
    Assert.areEqual(
      'hb2',
      byWorkflow.get('heartbeat').runId,
      'Latest heartbeat'
    );
    Assert.areEqual(NOW, status.generatedAt, 'Generated at');
  }

  @isTest
  static void shouldPassHeartbeatWhenWithin26Hours() {
    insert run('heartbeat', 'Success', 'hb', NOW.addHours(-25));

    GovernanceController.ChecklistItem heartbeat = load()
      .get(GovernanceController.ITEM_HEARTBEAT);

    Assert.areEqual(GovernanceController.STATE_PASS, heartbeat.state, 'Pass');
    Assert.isTrue(heartbeat.passed, 'Ticked');
  }

  @isTest
  static void shouldMarkHeartbeatStaleWhenOlderThan26Hours() {
    insert run('heartbeat', 'Success', 'hb', NOW.addHours(-27));

    GovernanceController.ChecklistItem heartbeat = load()
      .get(GovernanceController.ITEM_HEARTBEAT);

    Assert.areEqual(GovernanceController.STATE_STALE, heartbeat.state, 'Stale');
    Assert.isFalse(heartbeat.passed, 'Stale never ticks');
  }

  @isTest
  static void shouldFailHeartbeatWhenLatestHeartbeatFailed() {
    insert run('heartbeat', 'Failure', 'hb', NOW.addHours(-1));

    GovernanceController.ChecklistItem heartbeat = load()
      .get(GovernanceController.ITEM_HEARTBEAT);

    Assert.areEqual(GovernanceController.STATE_FAIL, heartbeat.state, 'Fail');
    Assert.isFalse(heartbeat.passed, 'Failure never ticks');
  }

  @isTest
  static void shouldPassCachesWhenBothUnder30Minutes() {
    insertCaches(5, 29);
    GovernanceController.nowOverride = NOW;

    Test.startTest();
    GovernanceController.PipelineStatus status = GovernanceController.getPipelineStatus();
    Test.stopTest();

    GovernanceController.ChecklistItem caches = itemsByKey(status)
      .get(GovernanceController.ITEM_CACHES);
    Assert.areEqual(GovernanceController.STATE_PASS, caches.state, 'Pass');
    Assert.areEqual(
      NOW.addMinutes(-5),
      status.githubCacheAt,
      'GitHub cache age'
    );
    Assert.areEqual(NOW.addMinutes(-29), status.jiraCacheAt, 'Jira cache age');
  }

  @isTest
  static void shouldMarkCachesStaleWhenOneIsOld() {
    insertCaches(5, 31);

    GovernanceController.ChecklistItem caches = load()
      .get(GovernanceController.ITEM_CACHES);

    Assert.areEqual(GovernanceController.STATE_STALE, caches.state, 'Stale');
    Assert.isFalse(caches.passed, 'Not ticked');
  }

  @isTest
  static void shouldMarkCachesStaleWhenOneIsMissing() {
    insertCaches(5, null);

    GovernanceController.ChecklistItem caches = load()
      .get(GovernanceController.ITEM_CACHES);

    Assert.areEqual(GovernanceController.STATE_STALE, caches.state, 'Stale');
  }

  @isTest
  static void shouldServeGuestWhenCalledAsSiteGuest() {
    insert run('deploy', 'Success', 'g1', NOW.addHours(-1));
    insertCaches(1, 1);
    GovernanceController.nowOverride = NOW;
    User guest = SiteGuestTestSupport.preparedGuest();
    GovernanceController.PipelineStatus status;

    Test.startTest();
    System.runAs(guest) {
      status = GovernanceController.getPipelineStatus();
    }
    Test.stopTest();

    Map<String, GovernanceController.ChecklistItem> items = itemsByKey(status);
    Assert.areEqual(
      GovernanceController.STATE_PASS,
      items.get(GovernanceController.ITEM_DEPLOY).state,
      'Guest sees the deploy run'
    );
    Assert.areEqual(
      'shag1',
      items.get(GovernanceController.ITEM_DEPLOY).run.commitSha,
      'Sha'
    );
    Assert.areEqual(
      GovernanceController.STATE_PASS,
      items.get(GovernanceController.ITEM_CACHES).state,
      'Guest sees cache age'
    );
  }

  @isTest
  static void shouldMarkHeartbeatStaleAtTheStaleHoursSetting() {
    PortfolioSettings.overrideNumber('Heartbeat_Stale_Hours', 12);
    insert run('heartbeat', 'Success', 'hb', NOW.addHours(-13));

    GovernanceController.ChecklistItem heartbeat = load()
      .get(GovernanceController.ITEM_HEARTBEAT);

    Assert.areEqual(
      GovernanceController.STATE_STALE,
      heartbeat.state,
      'Stale after 12 hours'
    );
    Assert.areEqual(
      'Org heartbeat in the last 12 hours',
      heartbeat.label,
      'The label names the hours in force'
    );
  }

  @isTest
  static void shouldPassCachesUnderTheCacheMinutesSetting() {
    PortfolioSettings.overrideNumber('Governance_Cache_Minutes', 60);
    insertCaches(5, 45);

    GovernanceController.ChecklistItem caches = load()
      .get(GovernanceController.ITEM_CACHES);

    Assert.areEqual(
      GovernanceController.STATE_PASS,
      caches.state,
      '45 minutes passes under 60'
    );
    Assert.areEqual(
      'Integration caches under 60 minutes old',
      caches.label,
      'The label names the minutes in force'
    );
  }

  private static Pipeline_Run__c evidenceRun(
    String workflow,
    String status,
    String runId,
    Datetime completedAt,
    String permitId
  ) {
    Pipeline_Run__c row = run(workflow, status, runId, completedAt);
    row.Permit_Id__c = permitId;
    return row;
  }

  private static void insertCounter(Integer count) {
    insert new Usage_Counter__c(
      Kind__c = UsageCounterWriter.KIND_GLASSOPS_DEPLOY,
      Day__c = Date.newInstance(2026, 11, 1).addDays(count),
      Key__c = 'Glassops_Deploy:' + count,
      Count__c = count
    );
  }

  @isTest
  static void shouldReturnGovernedDeploysAndDrillsNewestFirstWithTheTotal() {
    Pipeline_Run__c governed = evidenceRun(
      'deploy',
      'Success',
      'd1',
      NOW.addDays(-3),
      'PERMIT-1'
    );
    governed.Approver__c = 'rdbumstead';
    governed.Gate_Checks__c = '[{"rule":"sod","outcome":"pass"},{"rule":"coverage_min","outcome":"skipped"}]';
    governed.Tests_Run__c = 970;
    governed.Tests_Passed__c = 969;
    governed.Org_Coverage__c = 96.5;
    Pipeline_Run__c drill = evidenceRun(
      'drill',
      'Denied',
      'x1',
      NOW.addDays(-1),
      '0123456789abcdef0123456789abcdef'
    );
    drill.Gate_Checks__c = '[{"rule":"validate_passed","outcome":"fail"}]';
    insert new List<Pipeline_Run__c>{
      governed,
      drill,
      evidenceRun('deploy', 'Success', 'd0', NOW.addDays(-9), 'PERMIT-0'),
      // Not governed: no permit id.
      evidenceRun('deploy', 'Success', 'd2', NOW.addDays(-2), null),
      evidenceRun('heartbeat', 'Success', 'h1', NOW, null),
      evidenceRun('site', 'Success', 's1', NOW, null),
      evidenceRun('smoke', 'Success', 'm1', NOW, null)
    };
    insertCounter(4);
    insertCounter(3);

    Test.startTest();
    GovernanceController.GovernanceEvidence evidence = GovernanceController.getGovernanceEvidence();
    Test.stopTest();

    Assert.areEqual(7, evidence.governedTotal, 'The Glassops_Deploy sum');
    Assert.areEqual(
      3,
      evidence.runs.size(),
      'Two governed deploys and a drill'
    );
    Assert.areEqual('x1', evidence.runs[0].runId, 'Newest first');
    Assert.areEqual('d1', evidence.runs[1].runId, 'Then the deploy');
    Assert.areEqual('d0', evidence.runs[2].runId, 'Then the oldest');

    GovernanceController.EvidenceRun deploy = evidence.runs[1];
    Assert.areEqual('deploy', deploy.workflow, 'Workflow');
    Assert.areEqual('Success', deploy.status, 'Status');
    Assert.areEqual('PERMIT-1', deploy.permitId, 'Permit');
    Assert.areEqual('rdbumstead', deploy.approver, 'Approver');
    Assert.areEqual('shad1', deploy.commitSha, 'Sha');
    Assert.areEqual(
      'https://github.com/rdbumstead/repo/actions/runs/d1',
      deploy.runUrl,
      'Run link'
    );
    Assert.areEqual(NOW.addDays(-3), deploy.completedAt, 'Completed');
    Assert.areEqual(970, deploy.testsRun, 'Tests run');
    Assert.areEqual(969, deploy.testsPassed, 'Tests passed');
    Assert.areEqual(96.5, deploy.coverage, 'Coverage');
    Assert.areEqual(2, deploy.checks.size(), 'Two checks');
    Assert.areEqual('sod', deploy.checks[0].rule, 'Rule');
    Assert.areEqual('pass', deploy.checks[0].outcome, 'Outcome');
    Assert.areEqual('skipped', deploy.checks[1].outcome, 'Skipped outcome');

    GovernanceController.EvidenceRun denied = evidence.runs[0];
    Assert.areEqual('drill', denied.workflow, 'Drill workflow');
    Assert.areEqual('Denied', denied.status, 'Denied');
    Assert.areEqual(
      '0123456789abcdef0123456789abcdef',
      denied.permitId,
      'The deny id'
    );
    Assert.isNull(denied.approver, 'No approver on a drill');
    Assert.areEqual('fail', denied.checks[0].outcome, 'The failed check');
    Assert.isNull(denied.testsRun, 'No tests');
    Assert.isNull(denied.coverage, 'No coverage');
  }

  @isTest
  static void shouldReturnAnEmptyListAndZeroNeverNullWhenNothingIsRecorded() {
    Test.startTest();
    GovernanceController.GovernanceEvidence evidence = GovernanceController.getGovernanceEvidence();
    Test.stopTest();

    Assert.areEqual(0, evidence.governedTotal, 'No rows, a real zero');
    Assert.isNotNull(evidence.runs, 'The list is never null');
    Assert.isTrue(evidence.runs.isEmpty(), 'No runs');
  }

  @isTest
  static void shouldReturnANullTotalWhenTheCounterCannotBeRead() {
    insertCounter(2);
    insert evidenceRun('deploy', 'Success', 'd3', NOW, 'PERMIT-3');
    GovernanceController.failTotalRead = true;

    Test.startTest();
    GovernanceController.GovernanceEvidence evidence = GovernanceController.getGovernanceEvidence();
    Test.stopTest();

    Assert.isNull(evidence.governedTotal, 'Unreadable is null, not 0');
    Assert.areEqual(1, evidence.runs.size(), 'The runs still come back');
  }

  @isTest
  static void shouldCapGovernedDeploysAtTwentyFiveAndKeepEveryDrill() {
    List<Pipeline_Run__c> rows = new List<Pipeline_Run__c>();
    for (Integer i = 0; i < 30; i++) {
      rows.add(
        evidenceRun('deploy', 'Success', 'c' + i, NOW.addHours(-i), 'P-' + i)
      );
    }
    for (Integer i = 0; i < 4; i++) {
      rows.add(
        evidenceRun('drill', 'Denied', 'k' + i, NOW.addDays(-30 - i), 'D-' + i)
      );
    }
    // A drill that was not denied is not evidence and is left out.
    rows.add(evidenceRun('drill', 'Success', 'k-not-denied', NOW, null));
    insert rows;

    GovernanceController.GovernanceEvidence evidence = GovernanceController.getGovernanceEvidence();

    Assert.areEqual(29, evidence.runs.size(), '25 deploys and 4 drills');
    Integer deploys = 0;
    for (GovernanceController.EvidenceRun item : evidence.runs) {
      deploys += item.workflow == 'deploy' ? 1 : 0;
    }
    Assert.areEqual(25, deploys, 'Deploys capped at 25');
    Assert.areEqual('c0', evidence.runs[0].runId, 'The newest deploy leads');
  }

  @isTest
  static void shouldSortARunWithNoCompletionTimeLastAndHandleBrokenChecks() {
    Pipeline_Run__c undated = evidenceRun('drill', 'Denied', 'u1', null, 'D-1');
    undated.Gate_Checks__c = 'broken';
    Pipeline_Run__c dated = evidenceRun('drill', 'Denied', 'u2', NOW, 'D-2');
    Pipeline_Run__c olderDated = evidenceRun(
      'drill',
      'Denied',
      'u3',
      NOW.addDays(-1),
      'D-3'
    );
    olderDated.Gate_Checks__c = '[{"rule":"r","outcome":"fail"}';
    insert new List<Pipeline_Run__c>{ undated, dated, olderDated };

    GovernanceController.GovernanceEvidence evidence = GovernanceController.getGovernanceEvidence();

    Assert.areEqual('u2', evidence.runs[0].runId, 'Dated, newest');
    Assert.areEqual('u3', evidence.runs[1].runId, 'Dated, older');
    Assert.areEqual('u1', evidence.runs[2].runId, 'No time, last');
    Assert.isTrue(evidence.runs[2].checks.isEmpty(), 'Broken JSON gives none');
    Assert.isTrue(evidence.runs[0].checks.isEmpty(), 'Blank gives none');

    GovernanceController.EvidenceRun a = new GovernanceController.EvidenceRun(
      undated
    );
    GovernanceController.EvidenceRun b = new GovernanceController.EvidenceRun(
      dated
    );
    Assert.areEqual(
      0,
      a.compareTo(new GovernanceController.EvidenceRun(undated)),
      'Both undated'
    );
    Assert.areEqual(-1, b.compareTo(a), 'Dated before undated');
    Assert.areEqual(1, a.compareTo(b), 'Undated after dated');
    Assert.areEqual(
      -1,
      b.compareTo(new GovernanceController.EvidenceRun(olderDated)),
      'Newer first'
    );
  }

  @isTest
  static void shouldKeepDrillRowsOutOfTheChecklist() {
    insert new List<Pipeline_Run__c>{
      evidenceRun('deploy', 'Success', 'ok', NOW.addDays(-5), 'P-1'),
      evidenceRun('drill', 'Denied', 'newer', NOW.addDays(-1), 'D-1')
    };

    GovernanceController.ChecklistItem deploy = load()
      .get(GovernanceController.ITEM_DEPLOY);

    Assert.areEqual(
      GovernanceController.STATE_PASS,
      deploy.state,
      'Still green'
    );
    Assert.areEqual(
      'ok',
      deploy.run.runId,
      'The drill is not the latest deploy'
    );
  }

  @isTest
  static void shouldServeTheEvidenceToTheSiteGuest() {
    insert evidenceRun('deploy', 'Success', 'g9', NOW.addHours(-1), 'P-9');
    insert evidenceRun('drill', 'Denied', 'g8', NOW.addHours(-2), 'D-8');
    insertCounter(1);
    User guest = SiteGuestTestSupport.preparedGuest();
    GovernanceController.GovernanceEvidence evidence;

    Test.startTest();
    System.runAs(guest) {
      evidence = GovernanceController.getGovernanceEvidence();
    }
    Test.stopTest();

    Assert.areEqual(1, evidence.governedTotal, 'The guest sees the total');
    Assert.areEqual(2, evidence.runs.size(), 'The guest sees both runs');
  }
}

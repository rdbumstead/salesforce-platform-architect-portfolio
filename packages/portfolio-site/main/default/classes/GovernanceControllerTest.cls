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
    Assert.areEqual(3, status.items.size(), 'Three checklist items');
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
}

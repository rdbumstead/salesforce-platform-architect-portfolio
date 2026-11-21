/**
 * @description       : Tests for GovernanceEventTrigger and GovernanceEventHandler.
 *                      Events go through the real event bus with
 *                      Test.getEventBus().deliver().
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/21/2026
 **/
@isTest
private class GovernanceEventHandlerTest {
  private static final Datetime COMPLETED = Datetime.newInstanceGmt(
    2026,
    10,
    21,
    12,
    0,
    0
  );
  private static final String RUN_URL = 'https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/runs/';
  private static final String SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

  private static Governance_Event__e event(
    String workflow,
    String status,
    String runId
  ) {
    return new Governance_Event__e(
      Workflow__c = workflow,
      Status__c = status,
      Run_Id__c = runId,
      Run_Url__c = RUN_URL + runId,
      Commit_Sha__c = SHA,
      Completed_At__c = COMPLETED
    );
  }

  private static void publishAndDeliver(List<Governance_Event__e> events) {
    List<Database.SaveResult> results = EventBus.publish(events);
    for (Database.SaveResult result : results) {
      Assert.isTrue(result.isSuccess(), 'Publish should succeed');
    }
    Test.getEventBus().deliver();
  }

  private static List<Pipeline_Run__c> runs() {
    return [
      SELECT
        Run_Key__c,
        Workflow__c,
        Status__c,
        Run_Id__c,
        Run_Url__c,
        Commit_Sha__c,
        Completed_At__c,
        Tests_Run__c,
        Tests_Passed__c,
        Org_Coverage__c,
        Jest_Tests_Run__c,
        Jest_Tests_Passed__c,
        Jest_Coverage__c,
        Permit_Id__c,
        Approver__c,
        Gate_Checks__c
      FROM Pipeline_Run__c
      ORDER BY Run_Key__c
    ];
  }

  private static List<Pipeline_Run__c> storedRuns(
    String workflow,
    Integer count,
    Integer startMinutesAgo
  ) {
    List<Pipeline_Run__c> rows = new List<Pipeline_Run__c>();
    for (Integer i = 0; i < count; i++) {
      String runId = workflow + '-old-' + i;
      rows.add(
        new Pipeline_Run__c(
          Run_Key__c = workflow + ':' + runId,
          Workflow__c = workflow,
          Status__c = GovernanceEventHandler.STATUS_SUCCESS,
          Run_Id__c = runId,
          Completed_At__c = COMPLETED.addMinutes(-(startMinutesAgo + i))
        )
      );
    }
    insert rows;
    return rows;
  }

  @isTest
  static void shouldStoreRunWhenValidEventDelivered() {
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ event('deploy', 'Success', '101') }
    );
    Test.stopTest();

    List<Pipeline_Run__c> stored = runs();
    Assert.areEqual(1, stored.size(), 'One row per event');
    Assert.areEqual('deploy:101', stored[0].Run_Key__c, 'Run key');
    Assert.areEqual('deploy', stored[0].Workflow__c, 'Workflow');
    Assert.areEqual('Success', stored[0].Status__c, 'Status');
    Assert.areEqual('101', stored[0].Run_Id__c, 'Run id');
    Assert.areEqual(RUN_URL + '101', stored[0].Run_Url__c, 'Run URL');
    Assert.areEqual(SHA, stored[0].Commit_Sha__c, 'Sha');
    Assert.areEqual(COMPLETED, stored[0].Completed_At__c, 'Completed at');
  }

  @isTest
  static void shouldChangeNothingWhenEventReplayed() {
    publishAndDeliver(
      new List<Governance_Event__e>{ event('deploy', 'Success', '102') }
    );
    Pipeline_Run__c before = [
      SELECT Id, SystemModstamp
      FROM Pipeline_Run__c
      WHERE Run_Key__c = 'deploy:102'
    ];

    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ event('deploy', 'Success', '102') }
    );
    Test.stopTest();

    List<Pipeline_Run__c> stored = runs();
    Assert.areEqual(1, stored.size(), 'A replay adds no row');
    Assert.areEqual(
      0,
      GovernanceEventHandler.lastWriteCount,
      'An identical replay writes nothing'
    );
    Pipeline_Run__c afterReplay = [
      SELECT Id, SystemModstamp
      FROM Pipeline_Run__c
      WHERE Run_Key__c = 'deploy:102'
    ];
    Assert.areEqual(before.Id, afterReplay.Id, 'Same row');
    Assert.areEqual(
      before.SystemModstamp,
      afterReplay.SystemModstamp,
      'Row not touched'
    );
  }

  @isTest
  static void shouldUpdateSameRowWhenRerunReportsNewStatus() {
    publishAndDeliver(
      new List<Governance_Event__e>{ event('deploy', 'Failure', '103') }
    );

    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ event('deploy', 'Success', '103') }
    );
    Test.stopTest();

    List<Pipeline_Run__c> stored = runs();
    Assert.areEqual(1, stored.size(), 'Upsert by run key keeps one row');
    Assert.areEqual('Success', stored[0].Status__c, 'Status updated');
  }

  @isTest
  static void shouldKeepNewestSixtyWhenWorkflowExceedsRetention() {
    storedRuns('deploy', GovernanceEventHandler.KEEP_PER_WORKFLOW, 10);
    storedRuns('heartbeat', 5, 10);

    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ event('deploy', 'Success', 'new') }
    );
    Test.stopTest();

    Integer deployCount = [
      SELECT COUNT()
      FROM Pipeline_Run__c
      WHERE Workflow__c = 'deploy'
    ];
    Integer heartbeatCount = [
      SELECT COUNT()
      FROM Pipeline_Run__c
      WHERE Workflow__c = 'heartbeat'
    ];
    Integer oldestLeft = [
      SELECT COUNT()
      FROM Pipeline_Run__c
      WHERE Run_Key__c = 'deploy:deploy-old-59'
    ];
    Integer newestLeft = [
      SELECT COUNT()
      FROM Pipeline_Run__c
      WHERE Run_Key__c = 'deploy:new'
    ];
    Assert.areEqual(
      GovernanceEventHandler.KEEP_PER_WORKFLOW,
      deployCount,
      'Deploy pruned to 60'
    );
    Assert.areEqual(5, heartbeatCount, 'Other workflow untouched');
    Assert.areEqual(0, oldestLeft, 'Oldest deploy row deleted');
    Assert.areEqual(1, newestLeft, 'New row kept');
  }

  @isTest
  static void shouldKeepSixtyWhenBulkEventsDelivered() {
    List<Governance_Event__e> events = new List<Governance_Event__e>();
    for (Integer i = 0; i < 251; i++) {
      Governance_Event__e bulkEvent = event('heartbeat', 'Success', 'b' + i);
      bulkEvent.Completed_At__c = COMPLETED.addMinutes(i);
      events.add(bulkEvent);
    }

    Test.startTest();
    publishAndDeliver(events);
    Test.stopTest();

    Integer kept = [
      SELECT COUNT()
      FROM Pipeline_Run__c
      WHERE Workflow__c = 'heartbeat'
    ];
    Integer newest = [
      SELECT COUNT()
      FROM Pipeline_Run__c
      WHERE Run_Key__c = 'heartbeat:b250'
    ];
    Integer oldest = [
      SELECT COUNT()
      FROM Pipeline_Run__c
      WHERE Run_Key__c = 'heartbeat:b0'
    ];
    Assert.areEqual(
      GovernanceEventHandler.KEEP_PER_WORKFLOW,
      kept,
      'Bulk batch pruned to 60'
    );
    Assert.areEqual(1, newest, 'Newest kept');
    Assert.areEqual(0, oldest, 'Oldest pruned');
  }

  @isTest
  static void shouldSkipEventWhenWorkflowUnknown() {
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ event('tests', 'Success', '201') }
    );
    Test.stopTest();

    Assert.areEqual(0, runs().size(), 'Unknown workflow stores nothing');
  }

  @isTest
  static void shouldStoreSmokeFailureWhenSmokeEventDelivered() {
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ event('Smoke', 'failure', '301') }
    );
    Test.stopTest();

    List<Pipeline_Run__c> stored = runs();
    Assert.areEqual(1, stored.size(), 'One row for the smoke event');
    Assert.areEqual('smoke:301', stored[0].Run_Key__c, 'Smoke run key');
    Assert.areEqual(
      GovernanceEventHandler.WORKFLOW_SMOKE,
      stored[0].Workflow__c,
      'Smoke workflow'
    );
    Assert.areEqual(
      GovernanceEventHandler.STATUS_FAILURE,
      stored[0].Status__c,
      'Failure status'
    );
    Assert.isNull(stored[0].Tests_Run__c, 'A smoke row carries no test count');
  }

  @isTest
  static void shouldKeepDeployAndSmokeRowsApartWhenTheyShareARunId() {
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{
        event('deploy', 'Success', '302'),
        event('smoke', 'Failure', '302')
      }
    );
    Test.stopTest();

    List<Pipeline_Run__c> stored = runs();
    Assert.areEqual(2, stored.size(), 'One row per workflow for the same run');
    Assert.areEqual('deploy:302', stored[0].Run_Key__c, 'Deploy row');
    Assert.areEqual('Success', stored[0].Status__c, 'Deploy stays a success');
    Assert.areEqual('smoke:302', stored[1].Run_Key__c, 'Smoke row');
    Assert.areEqual('Failure', stored[1].Status__c, 'Smoke failure kept');
  }

  @isTest
  static void shouldStoreSiteBuildWhenSiteEventDelivered() {
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ event('site', 'Success', '410') }
    );
    Test.stopTest();

    List<Pipeline_Run__c> stored = runs();
    Assert.areEqual(
      1,
      stored.size(),
      'The static site build is a known workflow'
    );
    Assert.areEqual(
      'site:410',
      stored[0].Run_Key__c,
      'Site row keyed by workflow and run'
    );
    Assert.areEqual('Success', stored[0].Status__c, 'Site build status kept');
  }

  @isTest
  static void shouldSkipEventWhenStatusUnknown() {
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ event('deploy', 'Cancelled', '202') }
    );
    Test.stopTest();

    Assert.areEqual(0, runs().size(), 'Unknown status stores nothing');
  }

  @isTest
  static void shouldSkipEventWhenRunIdBlank() {
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ event('deploy', 'Success', ' ') }
    );
    Test.stopTest();

    Assert.areEqual(0, runs().size(), 'Blank run id stores nothing');
  }

  @isTest
  static void shouldNormaliseAndDropUnsafeValuesWhenEventIsLoose() {
    Governance_Event__e loose = event(' Deploy ', 'success', '203');
    loose.Run_Url__c = 'https://example.com/actions/runs/203';
    loose.Commit_Sha__c = 'abc<script>';

    Test.startTest();
    publishAndDeliver(new List<Governance_Event__e>{ loose });
    Test.stopTest();

    List<Pipeline_Run__c> stored = runs();
    Assert.areEqual(1, stored.size(), 'Stored');
    Assert.areEqual('deploy:203', stored[0].Run_Key__c, 'Workflow trimmed');
    Assert.areEqual('Success', stored[0].Status__c, 'Status normalised');
    Assert.isNull(stored[0].Run_Url__c, 'Non GitHub link dropped');
    Assert.isNull(stored[0].Commit_Sha__c, 'Unsafe sha dropped');
  }

  @isTest
  static void shouldRetryAndStoreWhenFirstSaveFails() {
    GovernanceEventHandler.failNextSave = true;
    EventBus.publish(event('deploy', 'Success', '204'));

    Test.startTest();
    Test.getEventBus().deliver();
    Integer afterFailure = runs().size();
    Test.getEventBus().deliver();
    Test.stopTest();

    Assert.areEqual(0, afterFailure, 'Nothing stored on the failed attempt');
    Assert.areEqual(1, runs().size(), 'Stored on the retry');
  }

  @isTest
  static void shouldStoreTestResultWhenEventCarriesOne() {
    Governance_Event__e withTests = event('deploy', 'Success', '301');
    withTests.Tests_Run__c = 671;
    withTests.Tests_Passed__c = 671;
    withTests.Org_Coverage__c = 97;

    Test.startTest();
    publishAndDeliver(new List<Governance_Event__e>{ withTests });
    Test.stopTest();

    List<Pipeline_Run__c> stored = runs();
    Assert.areEqual(671, stored[0].Tests_Run__c, 'Tests run');
    Assert.areEqual(671, stored[0].Tests_Passed__c, 'Tests passed');
    Assert.areEqual(97, stored[0].Org_Coverage__c, 'Coverage');
  }

  @isTest
  static void shouldDropTestResultWhenValuesDoNotFit() {
    Governance_Event__e morePassed = event('deploy', 'Success', '302');
    morePassed.Tests_Run__c = 10;
    morePassed.Tests_Passed__c = 11;
    morePassed.Org_Coverage__c = 90;
    Governance_Event__e badCoverage = event('deploy', 'Success', '303');
    badCoverage.Tests_Run__c = 10;
    badCoverage.Tests_Passed__c = 10;
    badCoverage.Org_Coverage__c = 120;
    Governance_Event__e partial = event('deploy', 'Success', '304');
    partial.Tests_Run__c = 10;

    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ morePassed, badCoverage, partial }
    );
    Test.stopTest();

    List<Pipeline_Run__c> stored = runs();
    Assert.areEqual(3, stored.size(), 'Every run is still stored');
    for (Pipeline_Run__c run : stored) {
      Assert.isNull(run.Tests_Run__c, 'No tests run on ' + run.Run_Key__c);
      Assert.isNull(run.Tests_Passed__c, 'No passed on ' + run.Run_Key__c);
      Assert.isNull(run.Org_Coverage__c, 'No coverage on ' + run.Run_Key__c);
    }
    Assert.isFalse(
      GovernanceEventHandler.validTestResult(10.5, 10, 90),
      'A fraction of a test is not a count'
    );
    Assert.isFalse(
      GovernanceEventHandler.validTestResult(0, 0, 90),
      'A run with no tests is not a result'
    );
  }

  @isTest
  static void shouldStoreJestCountsWhenEventCarriesThem() {
    Governance_Event__e both = event('deploy', 'Success', '310');
    both.Tests_Run__c = 1000;
    both.Tests_Passed__c = 1000;
    both.Org_Coverage__c = 98;
    both.Jest_Tests_Run__c = 748;
    both.Jest_Tests_Passed__c = 747;
    both.Jest_Coverage__c = 81.5;
    Governance_Event__e jestOnly = event('deploy', 'Success', '311');
    jestOnly.Jest_Tests_Run__c = 10;
    jestOnly.Jest_Tests_Passed__c = 10;

    Test.startTest();
    publishAndDeliver(new List<Governance_Event__e>{ both, jestOnly });
    Test.stopTest();

    Map<String, Pipeline_Run__c> byKey = new Map<String, Pipeline_Run__c>();
    for (Pipeline_Run__c run : runs()) {
      byKey.put(run.Run_Key__c, run);
    }
    Assert.areEqual(748, byKey.get('deploy:310').Jest_Tests_Run__c, 'Jest run');
    Assert.areEqual(
      747,
      byKey.get('deploy:310').Jest_Tests_Passed__c,
      'Jest passed'
    );
    Assert.areEqual(1000, byKey.get('deploy:310').Tests_Run__c, 'Apex kept');
    Assert.areEqual(
      81.5,
      byKey.get('deploy:310').Jest_Coverage__c,
      'Jest coverage'
    );
    Assert.isNull(
      byKey.get('deploy:311').Jest_Coverage__c,
      'No coverage when the event has none'
    );
    Assert.areEqual(10, byKey.get('deploy:311').Jest_Tests_Run__c, 'Alone');
    Assert.isNull(
      byKey.get('deploy:311').Tests_Run__c,
      'A Jest pair does not need an Apex one'
    );
  }

  @isTest
  static void shouldDropJestCoverageOutsideZeroToHundred() {
    Assert.isTrue(GovernanceEventHandler.validCoverage(0), 'Zero fits');
    Assert.isTrue(GovernanceEventHandler.validCoverage(100), 'A hundred fits');
    Assert.isFalse(GovernanceEventHandler.validCoverage(100.5), 'Over');
    Assert.isFalse(GovernanceEventHandler.validCoverage(-1), 'Under');
    Assert.isFalse(GovernanceEventHandler.validCoverage(null), 'Blank');
    Governance_Event__e bad = event('deploy', 'Success', '315');
    bad.Jest_Tests_Run__c = 10;
    bad.Jest_Tests_Passed__c = 10;
    bad.Jest_Coverage__c = 120;
    Test.startTest();
    publishAndDeliver(new List<Governance_Event__e>{ bad });
    Test.stopTest();
    Pipeline_Run__c stored = [
      SELECT Jest_Tests_Run__c, Jest_Coverage__c
      FROM Pipeline_Run__c
      WHERE Run_Id__c = '315'
    ];
    Assert.areEqual(10, stored.Jest_Tests_Run__c, 'The counts stay');
    Assert.isNull(stored.Jest_Coverage__c, 'The coverage goes');
  }

  @isTest
  static void shouldDropJestCountsWhenValuesDoNotFit() {
    Governance_Event__e morePassed = event('deploy', 'Success', '312');
    morePassed.Jest_Tests_Run__c = 10;
    morePassed.Jest_Tests_Passed__c = 11;
    Governance_Event__e partial = event('deploy', 'Success', '313');
    partial.Jest_Tests_Run__c = 10;
    Governance_Event__e apexOnly = event('deploy', 'Success', '314');
    apexOnly.Tests_Run__c = 5;
    apexOnly.Tests_Passed__c = 5;
    apexOnly.Org_Coverage__c = 95;
    apexOnly.Jest_Tests_Run__c = 0;
    apexOnly.Jest_Tests_Passed__c = 0;

    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ morePassed, partial, apexOnly }
    );
    Test.stopTest();

    for (Pipeline_Run__c run : runs()) {
      Assert.isNull(run.Jest_Tests_Run__c, 'No Jest run on ' + run.Run_Key__c);
      Assert.isNull(
        run.Jest_Tests_Passed__c,
        'No Jest passed on ' + run.Run_Key__c
      );
    }
    Assert.areEqual(
      5,
      [SELECT Tests_Run__c FROM Pipeline_Run__c WHERE Run_Id__c = '314']
      .Tests_Run__c,
      'A bad Jest pair never drops the Apex counts'
    );
    Assert.isFalse(
      GovernanceEventHandler.validJestResult(10.5, 10),
      'A fraction of a test is not a count'
    );
  }

  @isTest
  static void shouldUpdateRowWhenReplayAddsJestCounts() {
    publishAndDeliver(
      new List<Governance_Event__e>{ event('deploy', 'Success', '315') }
    );
    Governance_Event__e withJest = event('deploy', 'Success', '315');
    withJest.Jest_Tests_Run__c = 748;
    withJest.Jest_Tests_Passed__c = 748;

    Test.startTest();
    publishAndDeliver(new List<Governance_Event__e>{ withJest });
    Test.stopTest();

    List<Pipeline_Run__c> stored = runs();
    Assert.areEqual(1, stored.size(), 'Same row');
    Assert.areEqual(748, stored[0].Jest_Tests_Run__c, 'Jest added');
    Assert.areEqual(1, GovernanceEventHandler.lastWriteCount, 'One write');
  }

  @isTest
  static void shouldUpdateRowWhenReplayAddsTestResult() {
    publishAndDeliver(
      new List<Governance_Event__e>{ event('deploy', 'Success', '305') }
    );
    Governance_Event__e withTests = event('deploy', 'Success', '305');
    withTests.Tests_Run__c = 5;
    withTests.Tests_Passed__c = 4;
    withTests.Org_Coverage__c = 91.5;

    Test.startTest();
    publishAndDeliver(new List<Governance_Event__e>{ withTests });
    Test.stopTest();

    List<Pipeline_Run__c> stored = runs();
    Assert.areEqual(1, stored.size(), 'Same row');
    Assert.areEqual(4, stored[0].Tests_Passed__c, 'Passed added');
    Assert.areEqual(91.5, stored[0].Org_Coverage__c, 'Coverage added');
    Assert.areEqual(1, GovernanceEventHandler.lastWriteCount, 'One write');
  }

  @isTest
  static void shouldDoNothingWhenNoEvents() {
    Test.startTest();
    GovernanceEventHandler.handle(new List<Governance_Event__e>());
    GovernanceEventHandler.handle(null);
    Test.stopTest();

    Assert.areEqual(0, runs().size(), 'No rows');
  }

  @isTest
  static void shouldStopRetryingAndStoreNothingWhenEverySaveFails() {
    EventBus.publish(event('deploy', 'Success', '205'));

    Test.startTest();
    // Two retries are allowed, so the third failed delivery is the one that rethrows.
    for (Integer attempt = 0; attempt < 3; attempt++) {
      GovernanceEventHandler.failNextSave = true;
      Test.getEventBus().deliver();
    }
    Test.stopTest();

    Assert.areEqual(0, runs().size(), 'A run that never saved is not stored');
  }

  private static Governance_Event__e permitEvent(
    String status,
    String runId,
    String permitId
  ) {
    Governance_Event__e e = event('deploy', status, runId);
    e.Permit_Id__c = permitId;
    return e;
  }

  private static Decimal governedTotal() {
    Decimal total = 0;
    for (Usage_Counter__c row : [
      SELECT Count__c
      FROM Usage_Counter__c
      WHERE Kind__c = :UsageCounterWriter.KIND_GLASSOPS_DEPLOY
    ]) {
      total += row.Count__c;
    }
    return total;
  }

  @isTest
  static void shouldCopyThePermitIdAndCountTheDeployWhenASuccessCarriesOne() {
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{
        permitEvent('Success', '501', ' PERMIT-2026-11-20-A '),
        permitEvent('Success', '502', null)
      }
    );
    Test.stopTest();

    Map<String, Pipeline_Run__c> byKey = new Map<String, Pipeline_Run__c>();
    for (Pipeline_Run__c run : runs()) {
      byKey.put(run.Run_Key__c, run);
    }
    Assert.areEqual(
      'PERMIT-2026-11-20-A',
      byKey.get('deploy:501').Permit_Id__c,
      'Trimmed copy'
    );
    Assert.isNull(byKey.get('deploy:502').Permit_Id__c, 'Blank stays blank');
    Assert.areEqual(1, governedTotal(), 'Only the governed run counts');
  }

  @isTest
  static void shouldCountARunOnceWhenItsEventArrivesTwiceOrDropsThePermit() {
    publishAndDeliver(
      new List<Governance_Event__e>{ permitEvent('Success', '511', 'P-1') }
    );
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{
        permitEvent('Success', '511', 'P-1'),
        permitEvent('Success', '511', 'P-1')
      }
    );
    publishAndDeliver(
      new List<Governance_Event__e>{ permitEvent('Success', '511', null) }
    );
    publishAndDeliver(
      new List<Governance_Event__e>{ permitEvent('Failure', '511', 'P-2') }
    );
    Test.stopTest();

    Assert.areEqual(1, governedTotal(), 'Counted once');
    Assert.areEqual('P-1', runs()[0].Permit_Id__c, 'The first permit stays');
  }

  @isTest
  static void shouldNotCountWhenTheRunFailedOrIsNotADeployOrThePermitIsUnsafe() {
    Governance_Event__e smoke = event('smoke', 'Success', '521');
    smoke.Permit_Id__c = 'P-3';
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{
        permitEvent('Failure', '520', 'P-4'),
        smoke,
        permitEvent('Success', '522', 'has space')
      }
    );
    Test.stopTest();

    Assert.areEqual(0, governedTotal(), 'Nothing counted');
    Assert.areEqual(3, runs().size(), 'All three runs stored');
    for (Pipeline_Run__c run : runs()) {
      Assert.isNull(run.Permit_Id__c, 'No permit kept on ' + run.Run_Key__c);
    }
  }

  @isTest
  static void shouldCountAFailedRunThatLaterSucceedsOnTheSameKey() {
    publishAndDeliver(
      new List<Governance_Event__e>{ permitEvent('Failure', '530', 'P-5') }
    );
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ permitEvent('Success', '530', 'P-5') }
    );
    Test.stopTest();

    Assert.areEqual(1, governedTotal(), 'Counted when it succeeds');
    Assert.areEqual('P-5', runs()[0].Permit_Id__c, 'Permit stored');
  }

  @isTest
  static void shouldKeepTheTotalWhenRetentionDeletesTheCountedRun() {
    storedRuns('deploy', GovernanceEventHandler.KEEP_PER_WORKFLOW, 600);
    // A governed run older than all 60 stored ones is counted and then pruned at once.
    Governance_Event__e oldest = permitEvent('Success', '540', 'P-6');
    oldest.Completed_At__c = COMPLETED.addDays(-30);

    Test.startTest();
    publishAndDeliver(new List<Governance_Event__e>{ oldest });
    Test.stopTest();

    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Pipeline_Run__c WHERE Run_Id__c = '540'],
      'The counted run was pruned'
    );
    Assert.areEqual(1, governedTotal(), 'Pruning never lowers the total');
  }

  @isTest
  static void shouldStoreTheRunWithoutAPermitWhenTheCounterCannotBeWritten() {
    UsageCounterWriter.failForTest = true;
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{ permitEvent('Success', '560', 'P-8') }
    );
    Test.stopTest();

    Assert.areEqual(0, governedTotal(), 'Nothing counted');
    Assert.areEqual(1, runs().size(), 'The run is still stored');
    Assert.isNull(runs()[0].Permit_Id__c, 'No permit, so a replay counts it');

    UsageCounterWriter.failForTest = false;
    publishAndDeliver(
      new List<Governance_Event__e>{ permitEvent('Success', '560', 'P-8') }
    );
    Assert.areEqual(1, governedTotal(), 'The replay counts it');
    Assert.areEqual('P-8', runs()[0].Permit_Id__c, 'Permit stored now');
  }

  private static Governance_Event__e drillEvent(String runId, String denyId) {
    Governance_Event__e e = event('drill', 'Denied', runId);
    e.Permit_Id__c = denyId;
    e.Gate_Checks__c = '[{"rule":"validate_passed","outcome":"fail"}]';
    return e;
  }

  @isTest
  static void shouldStoreADeniedDrillWithItsDenyIdAndChecksAndNeverCountIt() {
    Test.startTest();
    publishAndDeliver(
      new List<Governance_Event__e>{
        drillEvent('601', '0123456789abcdef0123456789abcdef')
      }
    );
    Test.stopTest();

    Pipeline_Run__c stored = runs()[0];
    Assert.areEqual('drill:601', stored.Run_Key__c, 'Drill key');
    Assert.areEqual('Denied', stored.Status__c, 'Denied is a known status');
    Assert.areEqual(
      '0123456789abcdef0123456789abcdef',
      stored.Permit_Id__c,
      'The deny id is kept on a denied drill'
    );
    Assert.areEqual(
      '[{"rule":"validate_passed","outcome":"fail"}]',
      stored.Gate_Checks__c,
      'The failed check is kept'
    );
    Assert.isNull(stored.Approver__c, 'A drill has no approver');
    Assert.areEqual(0, governedTotal(), 'A drill is never a governed deploy');
  }

  @isTest
  static void shouldNeverCountADrillWhateverItCarriesAndNotOnReplay() {
    Governance_Event__e carrying = drillEvent('611', 'deny-1');
    carrying.Approver__c = 'rdbumstead';
    publishAndDeliver(new List<Governance_Event__e>{ carrying });
    publishAndDeliver(
      new List<Governance_Event__e>{ drillEvent('611', 'deny-1') }
    );
    Governance_Event__e success = event('drill', 'Success', '612');
    success.Permit_Id__c = 'deny-2';
    publishAndDeliver(new List<Governance_Event__e>{ success });

    Assert.areEqual(0, governedTotal(), 'No drill row counts');
    Map<String, Pipeline_Run__c> byKey = new Map<String, Pipeline_Run__c>();
    for (Pipeline_Run__c run : runs()) {
      byKey.put(run.Run_Key__c, run);
    }
    Assert.areEqual('deny-1', byKey.get('drill:611').Permit_Id__c, 'Deny id');
    Assert.isNull(
      byKey.get('drill:612').Permit_Id__c,
      'Only a Denied drill keeps the id'
    );
  }

  @isTest
  static void shouldKeepAValidApproverAndDropAnInvalidOne() {
    Assert.areEqual(
      'rdbumstead',
      GovernanceEventHandler.validApprover('rdbumstead')
    );
    Assert.areEqual(
      'a',
      GovernanceEventHandler.validApprover('a'),
      'One letter'
    );
    Assert.areEqual(
      'a-b-1',
      GovernanceEventHandler.validApprover('a-b-1'),
      'Single hyphens'
    );
    Assert.isNull(GovernanceEventHandler.validApprover(null), 'Null');
    Assert.isNull(GovernanceEventHandler.validApprover(' '), 'Blank');
    Assert.isNull(
      GovernanceEventHandler.validApprover('bad--login'),
      'Double hyphen'
    );
    Assert.isNull(
      GovernanceEventHandler.validApprover('-leading'),
      'Leading hyphen'
    );
    Assert.isNull(
      GovernanceEventHandler.validApprover('trailing-'),
      'Trailing hyphen'
    );
    Assert.isNull(GovernanceEventHandler.validApprover('has space'), 'Space');
    Assert.isNull(
      GovernanceEventHandler.validApprover('under_score'),
      'Underscore'
    );
    Assert.isNull(
      GovernanceEventHandler.validApprover('x'.repeat(40)),
      'More than 39 characters'
    );
    Assert.areEqual(
      'x'.repeat(39),
      GovernanceEventHandler.validApprover('x'.repeat(39)),
      '39 characters'
    );
  }

  @isTest
  static void shouldTrimAndDropTheApproverOnTheWayIn() {
    Governance_Event__e padded = permitEvent('Success', '701', 'P-701');
    padded.Approver__c = '  padded-1  ';
    Governance_Event__e bad = permitEvent('Success', '702', 'P-702');
    bad.Approver__c = 'bad--login';
    publishAndDeliver(new List<Governance_Event__e>{ padded, bad });

    Map<String, String> stored = new Map<String, String>();
    for (Pipeline_Run__c run : runs()) {
      stored.put(run.Run_Id__c, run.Approver__c);
    }
    Assert.areEqual('padded-1', stored.get('701'), 'Trimmed');
    Assert.isNull(stored.get('702'), 'Invalid dropped');
  }

  @isTest
  static void shouldKeepValidChecksInAFixedShapeAndDropAnythingElse() {
    Assert.isNull(GovernanceEventHandler.validChecks(null), 'Null');
    Assert.isNull(GovernanceEventHandler.validChecks('  '), 'Blank');
    Assert.isNull(GovernanceEventHandler.validChecks('not json'), 'Broken');
    Assert.isNull(GovernanceEventHandler.validChecks('{"a":1}'), 'An object');
    Assert.areEqual(
      '[]',
      GovernanceEventHandler.validChecks('[]'),
      'An empty list is valid'
    );
    Assert.areEqual(
      '[{"rule":"coverage_min","outcome":"skipped"},{"rule":"sod","outcome":"pass"}]',
      GovernanceEventHandler.validChecks(
        '[{"rule":" coverage_min ","outcome":"skipped","extra":"x"},{"rule":"sod","outcome":"pass"}]'
      ),
      'Kept in the fixed shape'
    );
    Assert.isNull(
      GovernanceEventHandler.validChecks('["text"]'),
      'An item that is not an object'
    );
    Assert.isNull(
      GovernanceEventHandler.validChecks('[{"rule":"r","outcome":"maybe"}]'),
      'Unknown outcome'
    );
    Assert.isNull(
      GovernanceEventHandler.validChecks('[{"rule":"","outcome":"pass"}]'),
      'Blank rule'
    );
    Assert.isNull(
      GovernanceEventHandler.validChecks('[{"rule":7,"outcome":"pass"}]'),
      'Rule not text'
    );
    Assert.isNull(
      GovernanceEventHandler.validChecks('[{"rule":"r","outcome":1}]'),
      'Outcome not text'
    );
    Assert.isNull(
      GovernanceEventHandler.validChecks('[{"outcome":"pass"}]'),
      'No rule'
    );
    Assert.isNull(
      GovernanceEventHandler.validChecks(
        '[{"rule":"' + 'r'.repeat(101) + '","outcome":"pass"}]'
      ),
      'Rule too long'
    );
  }

  @isTest
  static void shouldDropChecksOverThirtyItems() {
    List<String> thirty = new List<String>();
    for (Integer i = 0; i < 30; i++) {
      thirty.add('{"rule":"' + 'r'.repeat(100) + '","outcome":"pass"}');
    }
    Assert.isNotNull(
      GovernanceEventHandler.validChecks('[' + String.join(thirty, ',') + ']'),
      'Thirty is allowed'
    );
    Assert.IsTrue(
      GovernanceEventHandler.validChecks('[' + String.join(thirty, ',') + ']')
        .length() < 4000,
      'Thirty of the longest rules still fit the field'
    );
    thirty.add('{"rule":"r30","outcome":"pass"}');
    Assert.isNull(
      GovernanceEventHandler.validChecks('[' + String.join(thirty, ',') + ']'),
      'Thirty one is not'
    );
  }

  @isTest
  static void shouldStoreTheChecksAndApproverOnADeployAndTreatAChangeAsNew() {
    Governance_Event__e first = permitEvent('Success', '801', 'P-801');
    first.Approver__c = 'rdbumstead';
    first.Gate_Checks__c = '[{"rule":"sod","outcome":"pass"}]';
    publishAndDeliver(new List<Governance_Event__e>{ first });

    Pipeline_Run__c stored = runs()[0];
    Assert.areEqual('rdbumstead', stored.Approver__c, 'Approver stored');
    Assert.areEqual(
      '[{"rule":"sod","outcome":"pass"}]',
      stored.Gate_Checks__c,
      'Checks stored'
    );

    Governance_Event__e again = permitEvent('Success', '801', 'P-801');
    again.Approver__c = 'rdbumstead';
    again.Gate_Checks__c = '[{"rule":"sod","outcome":"pass"}]';
    publishAndDeliver(new List<Governance_Event__e>{ again });
    Assert.areEqual(
      0,
      GovernanceEventHandler.lastWriteCount,
      'Replay writes nothing'
    );

    Governance_Event__e changed = permitEvent('Success', '801', 'P-801');
    changed.Approver__c = 'someone-else';
    changed.Gate_Checks__c = '[{"rule":"sod","outcome":"pass"}]';
    publishAndDeliver(new List<Governance_Event__e>{ changed });
    Assert.areEqual(
      1,
      GovernanceEventHandler.lastWriteCount,
      'Approver change'
    );
    Assert.areEqual('someone-else', runs()[0].Approver__c, 'Approver updated');

    Governance_Event__e newChecks = permitEvent('Success', '801', 'P-801');
    newChecks.Approver__c = 'someone-else';
    newChecks.Gate_Checks__c = '[{"rule":"sod","outcome":"fail"}]';
    publishAndDeliver(new List<Governance_Event__e>{ newChecks });
    Assert.areEqual(1, GovernanceEventHandler.lastWriteCount, 'Checks change');
    Assert.areEqual(1, governedTotal(), 'Still counted once');
  }
}

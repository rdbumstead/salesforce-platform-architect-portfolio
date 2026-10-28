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
        Jest_Tests_Passed__c
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
    Assert.areEqual(10, byKey.get('deploy:311').Jest_Tests_Run__c, 'Alone');
    Assert.isNull(
      byKey.get('deploy:311').Tests_Run__c,
      'A Jest pair does not need an Apex one'
    );
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
}

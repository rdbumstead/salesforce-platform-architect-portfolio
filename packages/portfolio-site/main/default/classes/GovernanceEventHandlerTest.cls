/**
 * @description       : Tests for GovernanceEventTrigger and GovernanceEventHandler (Round 4
 *                      plan L11). Events go through the real event bus with
 *                      Test.getEventBus().deliver().
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
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
        Completed_At__c
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
  static void shouldDoNothingWhenNoEvents() {
    Test.startTest();
    GovernanceEventHandler.handle(new List<Governance_Event__e>());
    GovernanceEventHandler.handle(null);
    Test.stopTest();

    Assert.areEqual(0, runs().size(), 'No rows');
  }
}

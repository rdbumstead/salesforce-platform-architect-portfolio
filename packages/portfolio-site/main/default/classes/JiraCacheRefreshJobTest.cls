/**
 * @description       : Tests for JiraCacheRefreshJob and JiraService.
 *                      @TestSetup, a separate
 *                      transaction, leaves one good roadmap row and a jira breaker with two
 *                      failures, so the next failure is the third and no test writes before its
 *                      callout.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
@IsTest
private class JiraCacheRefreshJobTest {
  private static final String GOOD_KEY = 'SPAP-GOOD';
  private static final String SEARCH_JSON =
    '{"isLast":true,"issues":[' +
    '{"id":"1","key":"SPAP-10","fields":{"summary":"Delivery pillar","updated":"2026-10-21T10:00:00.000+0200",' +
    '"status":{"name":"Backlog","statusCategory":{"key":"new","colorName":"blue-gray"}},' +
    '"issuetype":{"name":"Epic"}}},' +
    '{"id":"2","key":"SPAP-11","fields":{"summary":"Refresh job","updated":"2026-10-21T08:00:00.000+0000",' +
    '"status":{"name":"In Review","statusCategory":{"key":"indeterminate"}},' +
    '"issuetype":{"name":"Story"},"parent":{"key":"SPAP-10"}}}]}';

  /** Answers every request the same way and counts the calls. Null status throws. */
  private class CountingMock implements HttpCalloutMock {
    private final Integer status;
    private final String body;
    public Integer calls = 0;
    public HttpRequest lastRequest;

    CountingMock(Integer status, String body) {
      this.status = status;
      this.body = body;
    }

    public HttpResponse respond(HttpRequest request) {
      calls++;
      lastRequest = request;
      if (status == null) {
        throw new CalloutException('Read timed out');
      }
      HttpResponse response = new HttpResponse();
      response.setStatusCode(status);
      response.setBody(body);
      return response;
    }
  }

  @TestSetup
  static void setUpGoodRowAndTwoFailures() {
    DeliveryController.RoadmapItem item = new DeliveryController.RoadmapItem();
    item.key = GOOD_KEY;
    item.statusCategory = 'done';
    DeliveryController.RoadmapPayload payload = new DeliveryController.RoadmapPayload();
    payload.schemaVersion = DeliveryController.SCHEMA_VERSION;
    payload.items = new List<DeliveryController.RoadmapItem>{ item };
    Jira_Cache__c row = new Jira_Cache__c(
      JSON_Payload__c = JSON.serialize(payload)
    );
    insert row;
    Test.setCreatedDate(row.Id, Datetime.now().addMinutes(-20));
    insert new Circuit_Breaker_State__c(
      Name = CircuitBreaker.KEY_JIRA,
      Consecutive_Failures__c = 2
    );
  }

  private static void useKey(String projectKey) {
    JiraCacheRefreshJob.configOverridden = true;
    JiraCacheRefreshJob.configOverride = new Portfolio_Config__mdt(
      Jira_Project_Key__c = projectKey
    );
  }

  private static Jira_Cache__c newestRow() {
    return [
      SELECT JSON_Payload__c
      FROM Jira_Cache__c
      ORDER BY CreatedDate DESC, Id DESC
      LIMIT 1
    ];
  }

  @IsTest
  static void shouldInsertDtoPayloadWhenJiraAnswers() {
    useKey('SPAP');
    CountingMock mock = new CountingMock(200, SEARCH_JSON);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = JiraCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(
      GitHubCacheRefreshJob.OUTCOME_REFRESHED,
      outcome,
      'Outcome'
    );
    Assert.areEqual(2, [SELECT COUNT() FROM Jira_Cache__c], 'One row added');
    Assert.areEqual(
      'callout:Jira_API/rest/api/3/search/jql',
      mock.lastRequest.getEndpoint(),
      'The search/jql endpoint'
    );
    Assert.areEqual('POST', mock.lastRequest.getMethod(), 'POST');
    Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
      mock.lastRequest.getBody()
    );
    Assert.areEqual(
      'project = SPAP AND labels = "portfolio-roadmap" ORDER BY updated DESC',
      body.get('jql'),
      'The roadmap JQL'
    );
    Assert.areEqual(50, body.get('maxResults'), 'maxResults');
    Assert.areEqual(
      new List<Object>{ 'summary', 'status', 'issuetype', 'parent', 'updated' },
      (List<Object>) body.get('fields'),
      'Fields'
    );

    DeliveryController.RoadmapPayload payload = (DeliveryController.RoadmapPayload) JSON.deserialize(
      newestRow().JSON_Payload__c,
      DeliveryController.RoadmapPayload.class
    );
    Assert.areEqual(1, payload.schemaVersion, 'schemaVersion 1');
    Assert.areEqual(2, payload.items.size(), 'Both issues');
    DeliveryController.RoadmapItem epic = payload.items[0];
    Assert.areEqual('SPAP-10', epic.key, 'key');
    Assert.areEqual('Delivery pillar', epic.summary, 'summary');
    Assert.areEqual('Backlog', epic.status, 'status name');
    Assert.areEqual('new', epic.statusCategory, 'statusCategory key');
    Assert.areEqual('Epic', epic.type, 'type');
    Assert.isNull(epic.epicKey, 'An epic has no parent');
    Assert.areEqual(
      Datetime.newInstanceGmt(2026, 10, 21, 8, 0, 0),
      epic.updatedAt,
      'Jira offset applied'
    );
    Assert.areEqual('SPAP-10', payload.items[1].epicKey, 'Parent key');
    Assert.areEqual(
      'indeterminate',
      payload.items[1].statusCategory,
      'Category'
    );
  }

  @IsTest
  static void shouldResetBreakerWhenRefreshSucceeds() {
    useKey('SPAP');
    Test.setMock(HttpCalloutMock.class, new CountingMock(200, SEARCH_JSON));

    Test.startTest();
    JiraCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(
      0,
      [
        SELECT Consecutive_Failures__c
        FROM Circuit_Breaker_State__c
        WHERE Name = 'jira'
      ]
      .Consecutive_Failures__c,
      'A success resets the two earlier failures'
    );
    Assert.areEqual(
      DeliveryController.STATUS_FRESH,
      DeliveryController.getRoadmap(null).status,
      'Fresh roadmap served'
    );
  }

  @IsTest
  static void shouldUseSpapWhenProjectKeyBlank() {
    useKey(null);
    CountingMock mock = new CountingMock(200, SEARCH_JSON);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    JiraCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.isTrue(
      mock.lastRequest.getBody().contains('project = SPAP AND'),
      'Default project SPAP'
    );
  }

  @IsTest
  static void shouldUseConfiguredKeyWhenSet() {
    Assert.areEqual(
      'ABC',
      JiraService.projectKey(
        new Portfolio_Config__mdt(Jira_Project_Key__c = ' ABC ')
      ),
      'Configured key, trimmed'
    );
    Assert.areEqual(
      'SPAP',
      JiraService.projectKey(null),
      'No record means SPAP'
    );
  }

  @IsTest
  static void shouldInsertNothingAndOpenCircuitWhenThirdFailure() {
    useKey('SPAP');
    CountingMock mock = new CountingMock(500, 'error');
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = JiraCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(GitHubCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
    Assert.areEqual(1, mock.calls, 'The call was made');
    Assert.areEqual(1, [SELECT COUNT() FROM Jira_Cache__c], 'Nothing inserted');
    Assert.isTrue(
      newestRow().JSON_Payload__c.contains(GOOD_KEY),
      'Good row kept'
    );
    Assert.isTrue(
      CircuitBreaker.isOpen(CircuitBreaker.KEY_JIRA),
      'The third failure in a row opens the circuit'
    );
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(null);
    Assert.areEqual(
      DeliveryController.STATUS_DEGRADED,
      feed.status,
      'Degraded'
    );
    Assert.areEqual(GOOD_KEY, feed.items[0].key, 'Last good roadmap served');
  }

  @IsTest
  static void shouldSkipJiraForThirtyMinutesWhenCircuitOpen() {
    useKey('SPAP');
    CountingMock mock = new CountingMock(200, SEARCH_JSON);
    Test.setMock(HttpCalloutMock.class, mock);
    Datetime opened = Datetime.now();
    CircuitBreaker.nowOverride = opened;
    CircuitBreaker.recordFailure(CircuitBreaker.KEY_JIRA);

    CircuitBreaker.nowOverride = opened.addMinutes(29);
    String during = JiraCacheRefreshJob.refresh();
    CircuitBreaker.nowOverride = opened.addMinutes(30);
    Boolean openAfter = CircuitBreaker.isOpen(CircuitBreaker.KEY_JIRA);

    Assert.areEqual(
      GitHubCacheRefreshJob.OUTCOME_OPEN_CIRCUIT,
      during,
      'Skipped'
    );
    Assert.areEqual(0, mock.calls, 'No Jira call while open');
    Assert.isFalse(openAfter, 'Closed again after 30 minutes');
  }

  @IsTest
  static void shouldKeepGoodRowThroughCleanupWhenRefreshFailed() {
    useKey('SPAP');
    Test.setMock(HttpCalloutMock.class, new CountingMock(503, 'down'));
    String outcome = JiraCacheRefreshJob.refresh();
    // Age the only good row past the 30 minute limit, after the callout.
    Jira_Cache__c good = [SELECT Id FROM Jira_Cache__c];
    Test.setCreatedDate(good.Id, Datetime.now().addHours(-3));
    CacheCleanupSettings.testOverrideEnabled = true;

    Test.startTest();
    Database.executeBatch(new JiraCacheCleanupBatch(), 200);
    Test.stopTest();

    Assert.areEqual(
      GitHubCacheRefreshJob.OUTCOME_FAILED,
      outcome,
      'Refresh failed'
    );
    Assert.areEqual(1, [SELECT COUNT() FROM Jira_Cache__c], 'Row survived');
    DeliveryController.RoadmapFeed feed = DeliveryController.getRoadmap(null);
    Assert.areEqual(GOOD_KEY, feed.items[0].key, 'Last good roadmap served');
    Assert.areEqual(
      DeliveryController.STATUS_DEGRADED,
      feed.status,
      'Third failure opened the breaker, so the page says degraded'
    );
  }

  @IsTest
  static void shouldInsertNothingWhenCalloutThrows() {
    useKey('SPAP');
    Test.setMock(HttpCalloutMock.class, new CountingMock(null, null));

    Test.startTest();
    String outcome = JiraCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(GitHubCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
    Assert.areEqual(1, [SELECT COUNT() FROM Jira_Cache__c], 'Nothing inserted');
  }

  @IsTest
  static void shouldInsertNothingWhenBodyHasNoIssues() {
    useKey('SPAP');
    Test.setMock(HttpCalloutMock.class, new CountingMock(200, '[]'));

    Test.startTest();
    String outcome = JiraCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(GitHubCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
    Assert.areEqual(1, [SELECT COUNT() FROM Jira_Cache__c], 'Nothing inserted');
  }

  @IsTest
  static void shouldInsertNothingWhenBodyIsNotJson() {
    useKey('SPAP');
    Test.setMock(HttpCalloutMock.class, new CountingMock(200, '<html>'));

    Test.startTest();
    String outcome = JiraCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(GitHubCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
  }

  @IsTest
  static void shouldNotCallOutWhenProjectKeyInvalid() {
    useKey('SPAP OR 1=1');
    CountingMock mock = new CountingMock(200, SEARCH_JSON);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = JiraCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(GitHubCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
    Assert.areEqual(0, mock.calls, 'An unsafe key is never sent');
  }

  @IsTest
  static void shouldLogAndExitWhenNoConfigRecord() {
    JiraCacheRefreshJob.configOverridden = true;
    JiraCacheRefreshJob.configOverride = null;
    CountingMock mock = new CountingMock(200, SEARCH_JSON);
    Test.setMock(HttpCalloutMock.class, mock);

    Test.startTest();
    String outcome = JiraCacheRefreshJob.refresh();
    Test.stopTest();

    Assert.areEqual(
      GitHubCacheRefreshJob.OUTCOME_NO_CONFIG,
      outcome,
      'Outcome'
    );
    Assert.areEqual(0, mock.calls, 'No callout');
    Assert.areEqual(1, [SELECT COUNT() FROM Jira_Cache__c], 'Nothing inserted');
  }

  @IsTest
  static void shouldRefreshWhenRunAsQueueable() {
    useKey('SPAP');
    Test.setMock(HttpCalloutMock.class, new CountingMock(200, SEARCH_JSON));

    Test.startTest();
    System.enqueueJob(new JiraCacheRefreshJob());
    Test.stopTest();

    Assert.areEqual(2, [SELECT COUNT() FROM Jira_Cache__c], 'Row added');
  }
}

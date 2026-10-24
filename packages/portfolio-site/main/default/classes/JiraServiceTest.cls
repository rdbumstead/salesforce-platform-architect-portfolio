/**
 * @description       : Unit tests for JiraService: the roadmap JQL, the issue mapping and its
 *                      failures. The refresh path end to end is in JiraCacheRefreshJobTest.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class JiraServiceTest {
  private class StatusMock implements HttpCalloutMock {
    private final Integer status;
    private final String body;

    StatusMock(Integer status, String body) {
      this.status = status;
      this.body = body;
    }

    public HttpResponse respond(HttpRequest request) {
      HttpResponse response = new HttpResponse();
      response.setStatusCode(status);
      response.setBody(body);
      return response;
    }
  }

  @IsTest
  static void shouldBuildTheRoadmapJqlWhenGivenAKey() {
    Assert.areEqual(
      'project = SPAP AND labels = "portfolio-roadmap" ORDER BY updated DESC',
      JiraService.roadmapJql('SPAP'),
      'The roadmap JQL'
    );
  }

  @IsTest
  static void shouldThrowWithStatusWhenJiraFails() {
    Test.setMock(HttpCalloutMock.class, new StatusMock(401, 'Unauthorized'));

    Test.startTest();
    try {
      JiraService.fetchRoadmap('SPAP');
      Assert.fail('A 401 must throw');
    } catch (JiraService.JiraServiceException e) {
      Assert.areEqual('HTTP 401', e.getMessage(), 'Status only');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldMapIssuesWhenFieldsMissing() {
    List<DeliveryController.RoadmapItem> items = JiraService.parseIssues(
      '{"issues":[{"key":"SPAP-1"}, "x"]}'
    );

    Assert.areEqual(1, items.size(), 'Only the issue object');
    Assert.areEqual('SPAP-1', items[0].key, 'key');
    Assert.isNull(items[0].statusCategory, 'No fields, no category');
  }

  @IsTest
  static void shouldMapAnEmptyListWhenNoIssues() {
    Assert.areEqual(
      0,
      JiraService.parseIssues('{"issues":[]}').size(),
      'An empty roadmap is still a good answer'
    );
  }

  @IsTest
  static void shouldMapTheEpicNameWhenTheParentHasASummary() {
    List<DeliveryController.RoadmapItem> items = JiraService.parseIssues(
      '{"issues":[{"key":"SPAP-12","fields":{"parent":{"key":"SPAP-11",' +
      '"fields":{"summary":"Launch readiness"}}}}]}'
    );

    Assert.areEqual('SPAP-11', items[0].epicKey, 'Parent key');
    Assert.areEqual('Launch readiness', items[0].epicName, 'Parent summary');
  }

  @IsTest
  static void shouldLeaveTheEpicNameNullWhenTheParentHasNoSummary() {
    List<DeliveryController.RoadmapItem> items = JiraService.parseIssues(
      '{"issues":[{"key":"SPAP-12","fields":{"parent":{"key":"SPAP-11"}}}]}'
    );

    Assert.areEqual('SPAP-11', items[0].epicKey, 'Parent key');
    Assert.isNull(items[0].epicName, 'No parent summary, no name');
  }

  @IsTest
  static void shouldLeaveBothEpicFieldsNullWhenThereIsNoParent() {
    List<DeliveryController.RoadmapItem> items = JiraService.parseIssues(
      '{"issues":[{"key":"SPAP-11","fields":{"summary":"Launch readiness"}}]}'
    );

    Assert.isNull(items[0].epicKey, 'No parent, no key');
    Assert.isNull(items[0].epicName, 'No parent, no name');
  }

  @IsTest
  static void shouldMapTheEpicNameThroughTheCallout() {
    Test.setMock(
      HttpCalloutMock.class,
      new StatusMock(
        200,
        '{"issues":[{"key":"SPAP-12","fields":{"summary":"Card",' +
        '"parent":{"key":"SPAP-11","fields":{"summary":"Launch readiness"}}}}]}'
      )
    );

    Test.startTest();
    List<DeliveryController.RoadmapItem> items = JiraService.fetchRoadmap(
      'SPAP'
    );
    Test.stopTest();

    Assert.areEqual(1, items.size(), 'One issue');
    Assert.areEqual('Launch readiness', items[0].epicName, 'Parent summary');
  }

  @IsTest
  static void shouldUseTheDefaultProjectWhenNoConfig() {
    Assert.areEqual(
      JiraService.DEFAULT_PROJECT_KEY,
      JiraService.projectKey(null),
      'No config record'
    );
  }

  @IsTest
  static void shouldUseTheConfiguredProjectWhenSet() {
    Portfolio_Config__mdt config = new Portfolio_Config__mdt(
      Jira_Project_Key__c = ' ABC '
    );

    Assert.areEqual('ABC', JiraService.projectKey(config), 'Trimmed key');
  }

  @IsTest
  static void shouldThrowWhenTheProjectKeyIsInvalid() {
    try {
      JiraService.fetchRoadmap('spap; DROP');
      Assert.fail('An invalid key must throw');
    } catch (JiraService.JiraServiceException e) {
      Assert.areEqual('Invalid Jira project key.', e.getMessage(), 'Message');
    }
  }

  @IsTest
  static void shouldThrowWhenTheBodyIsNotJson() {
    try {
      JiraService.parseIssues('not json');
      Assert.fail('A body that is not JSON must throw');
    } catch (JiraService.JiraServiceException e) {
      Assert.areEqual('Body is not JSON.', e.getMessage(), 'Message');
    }
  }

  @IsTest
  static void shouldThrowWhenTheBodyHasNoIssueList() {
    try {
      JiraService.parseIssues('[1, 2]');
      Assert.fail('A body without an issue list must throw');
    } catch (JiraService.JiraServiceException e) {
      Assert.areEqual('Body has no issue list.', e.getMessage(), 'Message');
    }
  }
}

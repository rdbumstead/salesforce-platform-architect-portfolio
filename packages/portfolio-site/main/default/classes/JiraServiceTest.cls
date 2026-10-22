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
      'E6 (a)'
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
}

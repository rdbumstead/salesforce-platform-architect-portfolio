/**
 * @description       : Unit tests for GitHubService: the commit mapping and its failures. The
 *                      refresh path end to end is in GitHubCacheRefreshJobTest.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class GitHubServiceTest {
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
  static void shouldMapCommitsWhenGitHubAnswers() {
    Test.setMock(
      HttpCalloutMock.class,
      new StatusMock(
        200,
        '[{"sha":"123","html_url":"u","commit":{"message":"msg","author":{"name":"GitUser","date":"2023-01-01T00:00:00Z"}}}]'
      )
    );

    Test.startTest();
    List<DeliveryController.CommitItem> items = GitHubService.fetchRecentCommits(
      'test/repo'
    );
    Test.stopTest();

    Assert.areEqual(1, items.size(), 'One commit');
    Assert.areEqual('123', items[0].sha, 'sha');
    Assert.areEqual('GitUser', items[0].authorName, 'Git author name');
    Assert.areEqual(
      Datetime.newInstanceGmt(2023, 1, 1, 0, 0, 0),
      items[0].committedAt,
      'Date'
    );
  }

  @IsTest
  static void shouldThrowWithStatusWhenGitHubFails() {
    Test.setMock(HttpCalloutMock.class, new StatusMock(401, 'Unauthorized'));

    Test.startTest();
    try {
      GitHubService.fetchRecentCommits('test/repo');
      Assert.fail('A 401 must throw');
    } catch (GitHubService.GitHubServiceException e) {
      Assert.areEqual('HTTP 401', e.getMessage(), 'Status only');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldSkipNonObjectsWhenListHasOtherValues() {
    List<DeliveryController.CommitItem> items = GitHubService.parseCommits(
      '[1, {"sha":"abc"}]'
    );

    Assert.areEqual(1, items.size(), 'Only the commit object');
    Assert.isNull(items[0].message, 'No message');
  }

  @IsTest
  static void shouldRejectPathsWhenNotOwnerSlashRepo() {
    Assert.isTrue(GitHubService.isValidRepoPath('owner/repo.name'), 'Valid');
    Assert.isFalse(GitHubService.isValidRepoPath('owner'), 'No repository');
    Assert.isFalse(GitHubService.isValidRepoPath('a/b/c'), 'Extra segment');
    Assert.isFalse(GitHubService.isValidRepoPath(null), 'Null');
  }
}

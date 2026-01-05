/**
 * @description       : Unit tests for GitHubService class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@isTest
private class GitHubServiceTest {
  @isTest
  static void testGetRecentCommitsSuccess() {
    // 0. Set Service Mock
    PortfolioService.mockConfig = new Portfolio_Config__mdt(
      GitHub_Repo_Path__c = 'test/repo'
    );

    // 1. Set Mock
    Test.setMock(
      HttpCalloutMock.class,
      new TestFactory.MockResponseGenerator(
        200,
        'OK',
        TestFactory.getGitHubCommitJson()
      )
    );

    // 2. Run Test
    Test.startTest();
    List<GitHubService.CommitItem> commits = GitHubService.getRecentCommits();
    Test.stopTest();

    // 3. Assert
    System.assertEquals(1, commits.size(), 'Should return 1 commit');
    System.assertEquals('feat: Added new test feature', commits[0].message);
    System.assertEquals('testuser', commits[0].authorName);
  }

  @isTest
  static void testGetRecentCommitsError() {
    // 1. Set Mock (Failure)
    Test.setMock(
      HttpCalloutMock.class,
      new TestFactory.MockResponseGenerator(
        500,
        'Server Error',
        '{"message": "Bad Gateway"}'
      )
    );

    // 2. Run Test
    Test.startTest();
    List<GitHubService.CommitItem> commits = GitHubService.getRecentCommits();
    Test.stopTest();

    // 3. Assert (Circuit Breaker)
    System.assertEquals(0, commits.size(), 'Should return empty list on error');
  }
  @isTest
  static void testGetRecentCommitsException() {
    PortfolioService.mockConfig = new Portfolio_Config__mdt(
      GitHub_Repo_Path__c = 'test/repo'
    );
    Test.setMock(HttpCalloutMock.class, new MockTrigger());

    Test.startTest();
    List<GitHubService.CommitItem> commits = GitHubService.getRecentCommits();
    Test.stopTest();

    System.assertEquals(
      0,
      commits.size(),
      'Should handle exception gracefully'
    );
  }

  @isTest
  static void testGetRecentCommitsParsingEdgeCase() {
    PortfolioService.mockConfig = new Portfolio_Config__mdt(
      GitHub_Repo_Path__c = 'test/repo'
    );

    // JSON with git author but no github user
    String json = '[{"sha":"123","commit":{"message":"msg","author":{"name":"GitUser","date":"2023-01-01T00:00:00Z"}}, "html_url":"url"}]';

    Test.setMock(
      HttpCalloutMock.class,
      new TestFactory.MockResponseGenerator(200, 'OK', json)
    );

    Test.startTest();
    List<GitHubService.CommitItem> commits = GitHubService.getRecentCommits();
    Test.stopTest();

    System.assertEquals(
      'GitUser',
      commits[0].authorName,
      'Should parse git author name'
    );
  }

  public class MockTrigger implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest req) {
      CalloutException e = (CalloutException) CalloutException.class
        .newInstance();
      e.setMessage('Service Unavailable');
      throw e;
    }
  }
}

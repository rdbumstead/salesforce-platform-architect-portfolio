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
  static void testGetRecentCommits_Success() {
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
  static void testGetRecentCommits_Error() {
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
}

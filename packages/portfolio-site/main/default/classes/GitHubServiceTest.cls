/**
 * @description       : Unit tests for GitHubService class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class GitHubServiceTest {
  @IsTest
  static void testGetRecentCommits() {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      List<Map<String, String>> commits = GitHubService.getRecentCommits();
      Test.stopTest();

      System.assert(commits.size() > 0, 'Should return commits');
      System.assertEquals(
        '12345',
        commits[0].get('sha'),
        'First commit SHA should mock 12345'
      );
    }
  }
}

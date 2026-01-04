/**
 * @description       : Service class for interacting with the GitHub API.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [GitHubServiceTest]
 **/
public with sharing class GitHubService {
  /**
   * @description Retrieves recent commits from the repository.
   * @return List<Map<String, String>> List of commit data.
   */
  @AuraEnabled(cacheable=true)
  public static List<Map<String, String>> getRecentCommits() {
    // Retrieve from Custom Setting Cache first
    // GitHub_Cache__c cache = GitHub_Cache__c.getValues('RecentCommits');

    // Mock Implementation
    List<Map<String, String>> commits = new List<Map<String, String>>();
    commits.add(
      new Map<String, String>{
        'sha' => '12345',
        'message' => 'feat: Added Changelog component',
        'author' => 'Ryan Bumstead',
        'date' => String.valueOf(Date.today()),
        'url' => '#'
      }
    );
    return commits;
  }
}

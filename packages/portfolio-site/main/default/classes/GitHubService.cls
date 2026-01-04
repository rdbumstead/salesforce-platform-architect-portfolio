/**
 * @description       : Service class for interacting with the GitHub API.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [GitHubServiceTest]
 **/
public with sharing class GitHubService {
  // --- LWC Data Model ---
  public class CommitItem {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String message;
    @AuraEnabled
    public String authorName;
    @AuraEnabled
    public String authorAvatar;
    @AuraEnabled
    public String url;
    @AuraEnabled
    public DateTime commitDate;
  }

  @AuraEnabled(cacheable=true)
  public static List<CommitItem> getRecentCommits() {
    try {
      HttpResponse res = fetchCommits();
      if (res.getStatusCode() == 200) {
        return parseResponse(res.getBody());
      }
      System.debug('GitHub Error: ' + res.getStatus() + ' ' + res.getBody());
      return new List<CommitItem>(); // Return empty list for Degraded Mode
    } catch (Exception e) {
      System.debug('Exception in GitHubService: ' + e.getMessage());
      return new List<CommitItem>();
    }
  }

  private static HttpResponse fetchCommits() {
    String repoPath = PortfolioService.getConfig().GitHub_Repo_Path__c;
    HttpRequest req = new HttpRequest();
    req.setEndpoint(
      'callout:GitHub_API/repos/' + repoPath + '/commits?per_page=5'
    );
    req.setMethod('GET');
    req.setHeader('Accept', 'application/vnd.github.v3+json');
    return new Http().send(req);
  }

  private static List<CommitItem> parseResponse(String jsonBody) {
    List<CommitItem> items = new List<CommitItem>();
    List<Object> rawList = (List<Object>) JSON.deserializeUntyped(jsonBody);

    for (Object obj : rawList) {
      Map<String, Object> root = (Map<String, Object>) obj;
      Map<String, Object> commitData = (Map<String, Object>) root.get('commit');
      Map<String, Object> authorData = (Map<String, Object>) root.get('author'); // GitHub User
      Map<String, Object> gitAuthor = (Map<String, Object>) commitData.get(
        'author'
      ); // Git Signature

      CommitItem item = new CommitItem();
      item.id = (String) root.get('sha');
      item.url = (String) root.get('html_url');
      item.message = (String) commitData.get('message');

      // Truncate long messages
      if (item.message != null && item.message.length() > 80) {
        item.message = item.message.substring(0, 80) + '...';
      }

      // Safe Author Parsing
      if (authorData != null) {
        item.authorName = (String) authorData.get('login');
        item.authorAvatar = (String) authorData.get('avatar_url');
      } else if (gitAuthor != null) {
        item.authorName = (String) gitAuthor.get('name');
      }

      // ISO 8601 Date Parsing
      if (gitAuthor != null) {
        String dateStr = (String) gitAuthor.get('date');
        item.commitDate = (DateTime) JSON.deserialize(
          '"' + dateStr + '"',
          DateTime.class
        );
      }
      items.add(item);
    }
    return items;
  }
}

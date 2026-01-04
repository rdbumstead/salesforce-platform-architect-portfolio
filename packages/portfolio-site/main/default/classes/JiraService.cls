/**
 * @description       : Service class for interacting with the Jira API.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [JiraServiceTest]
 **/
public with sharing class JiraService {
  /**
   * @description Retrieves roadmap items (Epics/Stories) from Jira.
   * @return List<Map<String, String>> List of roadmap items.
   */
  @AuraEnabled(cacheable=true)
  public static List<Map<String, String>> getRoadmapItems() {
    // Future: Make callout to Jira via Named Credential
    /*
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Jira_API/rest/api/3/search?jql=project=PORT');
        req.setMethod('GET');
        Http http = new Http();
        HttpResponse res = http.send(req);
        // Parse JSON
        */

    // Mock Response for MVP
    List<Map<String, String>> items = new List<Map<String, String>>();
    items.add(
      new Map<String, String>{
        'id' => 'PORT-101',
        'title' => 'Implement Skill Graph',
        'status' => 'In Progress',
        'type' => 'Story'
      }
    );
    items.add(
      new Map<String, String>{
        'id' => 'PORT-102',
        'title' => 'Setup Agentforce',
        'status' => 'To Do',
        'type' => 'Epic'
      }
    );
    return items;
  }
}

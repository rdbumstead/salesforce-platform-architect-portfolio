/**
 * @description       : Service class for interacting with the Jira API.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [JiraServiceTest]
 **/
public with sharing class JiraService {
  // --- LWC Data Model ---
  public class RoadmapItem {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String key; // SPAP-1
    @AuraEnabled
    public String summary;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String statusColor; // e.g. "yellow"
    @AuraEnabled
    public String type; // Epic
  }

  @AuraEnabled(cacheable=true)
  public static List<RoadmapItem> getRoadmap() {
    try {
      HttpResponse res = fetchRoadmapItems();
      if (res.getStatusCode() == 200) {
        return parseResponse(res.getBody());
      }
      System.debug('Jira Error: ' + res.getBody());
      return new List<RoadmapItem>();
    } catch (Exception e) {
      System.debug('Exception in JiraService: ' + e.getMessage());
      return new List<RoadmapItem>();
    }
  }

  private static HttpResponse fetchRoadmapItems() {
    String projectKey = PortfolioService.getConfig().Jira_Project_Key__c;

    Map<String, Object> payload = new Map<String, Object>{
      'jql' => 'project = "' +
      projectKey +
      '" AND issuetype IN ("Epic", "Story") ORDER BY Rank ASC',
      'fields' => new List<String>{ 'summary', 'status', 'issuetype' },
      'maxResults' => 50
    };

    HttpRequest req = new HttpRequest();
    req.setEndpoint('callout:Jira_API/rest/api/3/search/jql');
    req.setMethod('POST');
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('Accept', 'application/json');
    req.setBody(JSON.serialize(payload));
    return new Http().send(req);
  }

  private static List<RoadmapItem> parseResponse(String jsonBody) {
    List<RoadmapItem> items = new List<RoadmapItem>();
    Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(
      jsonBody
    );
    List<Object> issues = (List<Object>) root.get('issues');

    if (issues == null)
      return items;

    for (Object obj : issues) {
      Map<String, Object> issue = (Map<String, Object>) obj;
      Map<String, Object> fields = (Map<String, Object>) issue.get('fields');

      RoadmapItem item = new RoadmapItem();
      item.id = (String) issue.get('id');
      item.key = (String) issue.get('key');

      if (fields != null) {
        item.summary = (String) fields.get('summary');

        Map<String, Object> statusObj = (Map<String, Object>) fields.get(
          'status'
        );
        if (statusObj != null) {
          item.status = (String) statusObj.get('name');
          Map<String, Object> cat = (Map<String, Object>) statusObj.get(
            'statusCategory'
          );
          if (cat != null)
            item.statusColor = (String) cat.get('colorName');
        }

        Map<String, Object> typeObj = (Map<String, Object>) fields.get(
          'issuetype'
        );
        if (typeObj != null)
          item.type = (String) typeObj.get('name');
      }
      items.add(item);
    }
    return items;
  }
}

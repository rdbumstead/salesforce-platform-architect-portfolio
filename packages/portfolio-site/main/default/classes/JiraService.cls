/**
 * @description       : Reads the public roadmap from Jira through the Jira_API Named Credential
 *                      and maps it to DeliveryController.RoadmapItem, the payload DTO of the
 *                      Delivery page (pillar-e-design 4.2 and 4.4). The search is
 *                      POST /rest/api/3/search/jql with the JQL of owner decision E6 (a): only
 *                      issues labelled portfolio-roadmap in the configured project, SPAP by
 *                      default. Only JiraCacheRefreshJob calls it, as the scheduling admin.
 *                      A failure throws JiraServiceException so the job inserts nothing and
 *                      counts the failure on the circuit breaker.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [JiraServiceTest]
 **/
public with sharing class JiraService {
  /**
   * @description Thrown when the roadmap cannot be read: a bad project key, a non-200 status
   *              or a body without an issue list.
   */
  public class JiraServiceException extends Exception {
  }

  public static final String DEFAULT_PROJECT_KEY = 'SPAP';
  public static final String ROADMAP_LABEL = 'portfolio-roadmap';
  public static final Integer MAX_RESULTS = 50;
  public static final List<String> FIELDS = new List<String>{
    'summary',
    'status',
    'issuetype',
    'parent',
    'updated'
  };

  /** A Jira project key: a capital letter, then capitals, digits or underscores. */
  private static final Pattern PROJECT_KEY = Pattern.compile(
    '^[A-Z][A-Z0-9_]{0,9}$'
  );

  /**
   * @description The project to read: Jira_Project_Key__c of the config record, or SPAP when
   *              the field is blank.
   * @param config The Portfolio_Config__mdt record, may be null.
   * @return String The project key, trimmed.
   */
  public static String projectKey(Portfolio_Config__mdt config) {
    String configured = config?.Jira_Project_Key__c;
    return String.isBlank(configured) ? DEFAULT_PROJECT_KEY : configured.trim();
  }

  /**
   * @description The roadmap JQL for a project (E6 a). The label is quoted because it holds
   *              a hyphen.
   * @param projectKey A valid Jira project key.
   * @return String The JQL.
   */
  public static String roadmapJql(String projectKey) {
    return 'project = ' +
      projectKey +
      ' AND labels = "' +
      ROADMAP_LABEL +
      '" ORDER BY updated DESC';
  }

  /**
   * @description Runs the roadmap search and maps the issues.
   * @param projectKey A Jira project key, for example SPAP.
   * @return List<DeliveryController.RoadmapItem> At most MAX_RESULTS issues.
   * @throws JiraServiceException When the key is invalid, the status is not 200 or the body
   *                              holds no issue list.
   */
  public static List<DeliveryController.RoadmapItem> fetchRoadmap(
    String projectKey
  ) {
    if (
      String.isBlank(projectKey) || !PROJECT_KEY.matcher(projectKey).matches()
    ) {
      throw new JiraServiceException('Invalid Jira project key.');
    }
    HttpResponse response = new Http().send(searchRequest(projectKey));
    if (response.getStatusCode() != 200) {
      throw new JiraServiceException('HTTP ' + response.getStatusCode());
    }
    return parseIssues(response.getBody());
  }

  private static HttpRequest searchRequest(String projectKey) {
    Map<String, Object> body = new Map<String, Object>{
      'jql' => roadmapJql(projectKey),
      'fields' => FIELDS,
      'maxResults' => MAX_RESULTS
    };
    HttpRequest request = new HttpRequest();
    request.setEndpoint('callout:Jira_API/rest/api/3/search/jql');
    request.setMethod('POST');
    request.setHeader('Content-Type', 'application/json');
    request.setHeader('Accept', 'application/json');
    request.setBody(JSON.serialize(body));
    return request;
  }

  @TestVisible
  private static List<DeliveryController.RoadmapItem> parseIssues(String body) {
    Object parsed;
    try {
      parsed = JSON.deserializeUntyped(body);
    } catch (JSONException e) {
      throw new JiraServiceException('Body is not JSON.', e);
    }
    Object issues = parsed instanceof Map<String, Object>
      ? ((Map<String, Object>) parsed).get('issues')
      : null;
    if (!(issues instanceof List<Object>)) {
      throw new JiraServiceException('Body has no issue list.');
    }
    List<DeliveryController.RoadmapItem> items = new List<DeliveryController.RoadmapItem>();
    for (Object entry : (List<Object>) issues) {
      if (entry instanceof Map<String, Object>) {
        items.add(toItem((Map<String, Object>) entry));
      }
    }
    return items;
  }

  private static DeliveryController.RoadmapItem toItem(
    Map<String, Object> issue
  ) {
    Map<String, Object> fields = mapOf(issue.get('fields'));
    Map<String, Object> status = mapOf(fields?.get('status'));
    Map<String, Object> category = mapOf(status?.get('statusCategory'));

    DeliveryController.RoadmapItem item = new DeliveryController.RoadmapItem();
    item.key = stringOf(issue.get('key'));
    item.summary = stringOf(fields?.get('summary'));
    item.status = stringOf(status?.get('name'));
    item.statusCategory = stringOf(category?.get('key'));
    item.type = stringOf(mapOf(fields?.get('issuetype'))?.get('name'));
    item.epicKey = stringOf(mapOf(fields?.get('parent'))?.get('key'));
    item.updatedAt = DeliveryController.parseTimestamp(
      stringOf(fields?.get('updated'))
    );
    return item;
  }

  private static Map<String, Object> mapOf(Object value) {
    return value instanceof Map<String, Object>
      ? (Map<String, Object>) value
      : null;
  }

  private static String stringOf(Object value) {
    return value instanceof String ? (String) value : null;
  }
}

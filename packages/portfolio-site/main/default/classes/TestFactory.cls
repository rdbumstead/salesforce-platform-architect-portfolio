/**
 * @description       : Central factory for creating test data (SObjects) and mock responses (Callouts).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/04/2025
 **/

@isTest
public class TestFactory {
  // ============================================================================
  // PART 1: MOCK RESPONSE GENERATOR (For Service Classes)
  // ============================================================================
  public class MockResponseGenerator implements HttpCalloutMock {
    private Integer statusCode;
    private String status;
    private String body;
    private Map<String, String> headers;

    public MockResponseGenerator(Integer code, String status, String body) {
      this.statusCode = code;
      this.status = status;
      this.body = body;
      this.headers = new Map<String, String>{
        'Content-Type' => 'application/json'
      };
    }

    public HTTPResponse respond(HTTPRequest req) {
      HttpResponse res = new HttpResponse();
      res.setStatusCode(this.statusCode);
      res.setStatus(this.status);
      res.setBody(this.body);
      if (this.headers != null) {
        for (String key : this.headers.keySet()) {
          res.setHeader(key, this.headers.get(key));
        }
      }
      return res;
    }
  }

  // ============================================================================
  // PART 2: JSON PAYLOAD BUILDERS (For Service Classes)
  // ============================================================================

  public static String getGitHubCommitJson() {
    return '[{' +
      '"sha": "test-sha-123",' +
      '"html_url": "https://github.com/test/repo",' +
      '"commit": {' +
      '"message": "feat: Added new test feature",' +
      '"author": { "name": "Test User", "date": "2026-01-01T12:00:00Z" }' +
      '},' +
      '"author": {' +
      '"login": "testuser",' +
      '"avatar_url": "https://avatars.githubusercontent.com/u/12345"' +
      '}' +
      '}]';
  }

  public static String getJiraRoadmapJson() {
    return '{' +
      '"issues": [{' +
      '"id": "10001",' +
      '"key": "SPAP-1",' +
      '"fields": {' +
      '"summary": "Build Core Architecture",' +
      '"status": { "name": "In Progress", "statusCategory": { "colorName": "blue" } },' +
      '"issuetype": { "name": "Epic" }' +
      '}' +
      '}]' +
      '}';
  }

  public static String getGeminiResponseJson() {
    return '{' +
      '"candidates": [{' +
      '"content": {' +
      '"parts": [{' +
      '"text": "AI is a simulation of human intelligence processes."' +
      '}]' +
      '}' +
      '}]' +
      '}';
  }

  // ============================================================================
  // PART 3: SOBJECT DATA CREATION (For Cache Cleanup & Database Tests)
  // ============================================================================

  public static List<Github_Cache__c> createGithubCache(Integer count) {
    List<Github_Cache__c> records = new List<Github_Cache__c>();
    for (Integer i = 0; i < count; i++) {
      records.add(
        new Github_Cache__c()
        // Best Practice: Populate required fields or useful defaults here if needed
        // e.g., JSON_Payload__c = 'Test Payload ' + i
      );
    }
    insert records;
    return records; // Return the list so tests can assert against IDs
  }

  public static List<Jira_Cache__c> createJiraCache(Integer count) {
    List<Jira_Cache__c> records = new List<Jira_Cache__c>();
    for (Integer i = 0; i < count; i++) {
      records.add(new Jira_Cache__c());
    }
    insert records;
    return records;
  }

  public static List<Testimonial__c> createTestimonial(Integer count) {
    List<Testimonial__c> records = new List<Testimonial__c>();
    for (Integer i = 0; i < count; i++) {
      records.add(
        new Testimonial__c(
          Author_Title__c = 'Manager ' + i,
          Context__c = 'Project ' + i,
          Sort_Order__c = i
        )
      );
    }
    insert records;
    return records;
  }
}

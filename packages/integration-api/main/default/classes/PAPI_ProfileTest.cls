/**
 * @description       : Unit tests for PAPI_Profile REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class PAPI_ProfileTest {
  @TestSetup
  static void setup() {
    // Create Portfolio Owner Contact
    Contact c = new Contact(
      FirstName = 'Ryan',
      LastName = 'Bumstead',
      Email = 'ryan@test.com',
      Is_Portfolio_Owner__c = true,
      LinkedIn_URL__c = 'https://linkedin.com/in/test',
      Career_Objective__c = 'Test objective'
    );
    insert c;

    // Create Employer
    Account employer = new Account(Name = 'Test Company');
    insert employer;

    // Create Experience
    Experience__c exp = new Experience__c(
      Employer__c = employer.Id,
      Role__c = 'Test Architect',
      Start_Date__c = Date.today().addYears(-2),
      Is_Current__c = true,
      Contact__c = c.Id
    );
    insert exp;

    // Create Skill
    Skill__c skill = new Skill__c(
      Name = 'Apex',
      Category__c = 'Backend',
      Proficiency__c = 5
    );
    insert skill;

    // Create Project
    Project__c proj = new Project__c(
      Name = 'Test Project',
      Status__c = 'Live – In Production',
      Is_Featured__c = true
    );
    insert proj;

    // Create Testimonial
    Testimonial__c t = new Testimonial__c(
      Author_Name__c = 'Jane Doe',
      Approved__c = true
    );
    insert t;
  }

  @IsTest
  static void testGetFullPortfolioSuccess() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params = new Map<String, String>();

    req.requestURI = '/services/apexrest/papi/v1/profile/full';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    Test.startTest();
    PAPI_Profile.getProfile();
    Test.stopTest();

    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    System.assertNotEquals(
      null,
      res.responseBody,
      'Response body should not be null'
    );

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('contactInfo'),
      'Response should contain contactInfo'
    );
    System.assert(
      responseJson.contains('skills'),
      'Response should contain skills'
    );
    System.assert(
      responseJson.contains('experience'),
      'Response should contain experience'
    );
  }

  @IsTest
  static void testGetProfileSummarySuccess() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params = new Map<String, String>();

    req.requestURI = '/services/apexrest/papi/v1/profile/summary';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    Test.startTest();
    PAPI_Profile.getProfile();
    Test.stopTest();

    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
  }

  @IsTest
  static void testGetProfileInvalidEndpoint() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params = new Map<String, String>();

    req.requestURI = '/services/apexrest/papi/v1/profile/invalid';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    Test.startTest();
    PAPI_Profile.getProfile();
    Test.stopTest();

    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
  }
}

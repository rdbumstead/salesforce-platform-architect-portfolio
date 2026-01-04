/**
 * @description       : Unit tests for SAPI_Resume REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class SAPI_ResumeTest {
  @TestSetup
  static void setup() {
    Account employer = new Account(Name = 'Salesforce');
    insert employer;

    Experience__c exp = new Experience__c(
      Employer__c = employer.Id,
      Role__c = 'Technical Architect',
      Start_Date__c = Date.today()
    );
    insert exp;

    Experience_Highlight__c h = new Experience_Highlight__c(
      Experience__c = exp.Id,
      Name = 'DevOps Transformation',
      Description__c = 'Led CI/CD implementation',
      Persona_Tag__c = 'General'
    );
    insert h;
  }

  @IsTest
  static void testGetResumeDataDefaultPersona() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params = new Map<String, String>();

    req.requestURI = '/services/apexrest/sapi/v1/resume/';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPI_Resume.getResumeData();
      Test.stopTest();

      System.assertEquals(200, res.statusCode, 'Should return 200 OK');

      String responseJson = res.responseBody.toString();
      System.assert(
        responseJson.contains('General'),
        'Response should contain default persona'
      );
      System.assert(
        responseJson.contains('Led CI/CD'),
        'Response should contain highlight description'
      );
    }
  }

  @IsTest
  static void testGetResumeDataSpecificPersona() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params = new Map<String, String>{ 'persona' => 'Architect' };

    req.requestURI = '/services/apexrest/sapi/v1/resume/';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPI_Resume.getResumeData();
      Test.stopTest();

      System.assertEquals(200, res.statusCode, 'Should return 200 OK');

      String responseJson = res.responseBody.toString();
      System.assert(
        responseJson.contains('Architect'),
        'Response should contain requested persona'
      );
    }
  }

  @IsTest
  static void testGetResumeDataInvalidPersona() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params = new Map<String, String>{ 'persona' => 'InvalidPersona' };

    req.requestURI = '/services/apexrest/sapi/v1/resume/';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPI_Resume.getResumeData();
      Test.stopTest();

      System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');

      String responseJson = res.responseBody.toString();
      System.assert(
        responseJson.contains('Invalid persona'),
        'Response should contain validation error'
      );
    }
  }
}

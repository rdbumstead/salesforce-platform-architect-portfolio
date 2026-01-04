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
      Position_Title__c = 'Technical Architect',
      Start_Date__c = Date.today(),
      Sort_Order__c = 1
    );
    insert exp;

    Experience_Highlight__c h = new Experience_Highlight__c(
      Experience__c = exp.Id,
      Name = 'DevOps Transformation',
      Description__c = 'Led CI/CD implementation',
      Persona_Tag__c = 'Architect',
      Sort_Order__c = 1
    );
    insert h;

    Experience_Highlight__c h2 = new Experience_Highlight__c(
      Experience__c = exp.Id,
      Name = 'Architecture Review',
      Description__c = 'Led architecture reviews',
      Persona_Tag__c = 'Developer',
      Sort_Order__c = 2
    );
    insert h2;
  }

  @IsTest
  static void testGetResumeDataDefaultPersona() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/resume/');

    Test.startTest();
    SAPI_Resume.getResumeData();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('Architect'),
      'Response should contain highlights when no persona filter'
    );
    System.assert(
      responseJson.contains('Led CI/CD'),
      'Response should contain highlight description'
    );
  }

  @IsTest
  static void testGetResumeDataSpecificPersona() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/resume/',
      new Map<String, String>{ 'persona' => 'Architect' }
    );

    Test.startTest();
    SAPI_Resume.getResumeData();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('Architect'),
      'Response should contain requested persona'
    );
  }

  @IsTest
  static void testGetResumeDataInvalidPersona() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/resume/',
      new Map<String, String>{ 'persona' => 'InvalidPersona' }
    );

    Test.startTest();
    SAPI_Resume.getResumeData();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('Invalid persona'),
      'Response should contain validation error'
    );
  }
}

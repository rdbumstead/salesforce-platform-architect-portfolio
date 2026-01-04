/**
 * @description       : Unit tests for PAPI_Resume REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class PAPI_ResumeTest {
  @TestSetup
  static void setup() {
    Contact c = new Contact(
      FirstName = 'Test',
      LastName = 'User',
      Email = 'test@test.com',
      Is_Portfolio_Owner__c = true,
      Title = 'Architect'
    );
    insert c;

    Account employer = new Account(Name = 'Employer Inc');
    insert employer;

    Experience__c exp = new Experience__c(
      Employer__c = employer.Id,
      Position_Title__c = 'Developer',
      Start_Date__c = Date.today().addYears(-1),
      End_Date__c = Date.today(),
      Is_Current_Role__c = false,
      Sort_Order__c = 1,
      Contact__c = c.Id
    );
    insert exp;

    Experience_Highlight__c h = new Experience_Highlight__c(
      Experience__c = exp.Id,
      Name = 'Highlight 1',
      Description__c = 'Did great things',
      Persona_Tag__c = 'Architect',
      Sort_Order__c = 1
    );
    insert h;

    Skill__c skill = new Skill__c(
      Name = 'Apex',
      Category__c = 'Backend',
      Proficiency__c = 5
    );
    insert skill;

    Account sfAccount = new Account(Name = 'Salesforce');
    insert sfAccount;

    Certification__c cert = new Certification__c(
      Name = 'Platform Developer I',
      Issuer__c = sfAccount.Id,
      Contact__c = c.Id,
      Earned_Date__c = Date.today().addMonths(-6)
    );
    insert cert;

    Account uniAccount = new Account(Name = 'Test University');
    insert uniAccount;

    Education__c edu = new Education__c(
      Issuer__c = uniAccount.Id,
      Contact__c = c.Id,
      Degree__c = 'B.S.',
      Field_of_Study__c = 'Computer Science',
      Graduation_Date__c = Date.today().addYears(-5)
    );
    insert edu;
  }

  @IsTest
  static void testGenerateResumeDefaultPersona() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.params = new Map<String, String>();

    req.requestURI = '/services/apexrest/papi/v1/resume/generate';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    Test.startTest();
    PAPI_Resume.getResume();
    Test.stopTest();

    System.assertEquals(200, res.statusCode, 'Should return 200 OK');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('generatedText'),
      'Response should contain generatedText'
    );
    System.assert(
      responseJson.contains('EXPERIENCE'),
      'Response should contain EXPERIENCE section'
    );
  }

  @IsTest
  static void testGenerateResumeWithPersona() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params.put('persona', 'Architect');

    req.requestURI = '/services/apexrest/papi/v1/resume/generate';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    Test.startTest();
    PAPI_Resume.getResume();
    Test.stopTest();

    System.assertEquals(200, res.statusCode, 'Should return 200 OK');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('"persona":"Architect"'),
      'Response should contain Architect persona'
    );
  }

  @IsTest
  static void testGenerateResumeInvalidPersona() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params.put('persona', 'InvalidPersona');

    req.requestURI = '/services/apexrest/papi/v1/resume/generate';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    Test.startTest();
    PAPI_Resume.getResume();
    Test.stopTest();

    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
  }

  @IsTest
  static void testGenerateResumeInvalidEndpoint() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.params = new Map<String, String>();

    req.requestURI = '/services/apexrest/papi/v1/resume/invalid';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    Test.startTest();
    PAPI_Resume.getResume();
    Test.stopTest();

    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
  }
}

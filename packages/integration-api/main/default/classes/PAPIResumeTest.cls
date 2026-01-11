/**
 * @description       : Unit tests for PAPIResume REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class PAPIResumeTest {
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
      Name = 'Developer',
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
      Name = 'B.S.',
      Field_of_Study__c = 'Computer Science',
      Graduation_Date__c = Date.today().addYears(-5)
    );
    insert edu;
  }

  @IsTest
  static void testGenerateResumeDefaultPersona() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/generate');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
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
    RestTestUtil.initGet(
      '/services/apexrest/papi/v1/resume/generate',
      new Map<String, String>{ 'persona' => 'Architect' }
    );

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('"persona":"Architect"'),
      'Response should contain Architect persona'
    );
  }

  @IsTest
  static void testGenerateResumeInvalidPersona() {
    RestTestUtil.initGet(
      '/services/apexrest/papi/v1/resume/generate',
      new Map<String, String>{ 'persona' => 'InvalidPersona' }
    );

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
  }

  @IsTest
  static void testGenerateResumeInvalidEndpoint() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/resume/invalid');

    Test.startTest();
    PAPIResume.getResume();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
  }
}

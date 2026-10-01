/**
 * @description       : Unit tests for SAPIExperience REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class SAPIExperienceTest {
  @TestSetup
  static void setup() {
    Account employer = new Account(Name = 'Salesforce');
    insert employer;

    // UPDATED: Replaced Position_Title__c with Name
    Experience__c exp = new Experience__c(
      Employer__c = employer.Id,
      Name = 'Technical Architect',
      Start_Date__c = Date.today().addYears(-1),
      Is_Current_Role__c = true,
      Sort_Order__c = 1
    );
    insert exp;
  }

  @IsTest
  static void testGetExperiencesSuccess() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/experience/');

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    System.assertNotEquals(
      null,
      res.responseBody,
      'Response body should not be null'
    );

    String responseJson = res.responseBody.toString();
    // This assertion works because we mapped Name to the 'name' JSON property in the main class
    System.assert(
      responseJson.contains('Technical Architect'),
      'Response should contain role name'
    );
    System.assertEquals(
      'no-store, no-cache',
      res.headers.get('Cache-Control'),
      'Experience is no-store per the spec header reference'
    );
    System.assertEquals('1', res.headers.get('X-Total-Count'), 'Total count');
  }

  @IsTest
  static void testGetExperiencesFilterCurrentlyEmployed() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/experience/',
      new Map<String, String>{ 'currentlyEmployed' => 'true' }
    );

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    // Optional: Add assertion to verify record count > 0 since our setup data matches this filter
  }

  @IsTest
  static void testGetExperiencesInvalidOffset() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/experience/',
      new Map<String, String>{ 'offset' => '-5' }
    );

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
  }

  @IsTest
  static void testGetExperiencesInvalidLimit() {
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/experience/',
      new Map<String, String>{ 'limit' => '500' }
    );

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(
      400,
      res.statusCode,
      'Should return 400 for high limit'
    );
  }

  @IsTest
  static void testGetExperiencesInternalError() {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/experience/');
    RestResponse res = RestTestUtil.getResponse();

    SAPIExperience.throwException = true;

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    System.assertEquals(
      500,
      res.statusCode,
      'Should return 500 on internal error'
    );
  }

  @IsTest
  static void testGetExperiencesEmployerFilterWithHighlights() {
    Experience__c exp = [SELECT Id FROM Experience__c LIMIT 1];
    exp.Is_Current_Role__c = false;
    exp.End_Date__c = Date.today();
    update exp;
    insert new Experience_Highlight__c(
      Experience__c = exp.Id,
      Name = 'Highlight',
      Description__c = 'Delivered the platform',
      Persona_Tag__c = 'Architect',
      Sort_Order__c = 1
    );
    RestTestUtil.initGet(
      '/services/apexrest/sapi/v1/experience/',
      new Map<String, String>{ 'employerName' => 'Salesforce' }
    );

    Test.startTest();
    SAPIExperience.getExperiences();
    Test.stopTest();

    RestResponse res = RestTestUtil.getResponse();
    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('Delivered the platform'),
      'Response should contain the highlight'
    );
    System.assert(
      responseJson.contains('endDate'),
      'Response should contain the end date'
    );
  }
}

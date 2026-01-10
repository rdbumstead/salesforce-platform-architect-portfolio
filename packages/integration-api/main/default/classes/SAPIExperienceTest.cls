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

    Experience__c exp = new Experience__c(
      Employer__c = employer.Id,
      Position_Title__c = 'Technical Architect',
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
    System.assert(
      responseJson.contains('Technical Architect'),
      'Response should contain role'
    );
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
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.requestURI = null;
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

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
}

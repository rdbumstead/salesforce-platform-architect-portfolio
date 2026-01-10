/**
 * @description       : Unit tests for SAPI_Skill REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class SAPISkillTest {
  @TestSetup
  static void setup() {
    Skill__c s = new Skill__c(
      Name = 'Apex',
      Category__c = 'Backend',
      Proficiency__c = 5
    );
    insert s;
  }

  @IsTest
  static void testGetSkillsSuccess() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.params = new Map<String, String>();

    req.requestURI = '/services/apexrest/sapi/v1/skills/';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPI_Skill.getSkills();
      Test.stopTest();

      System.assertEquals(200, res.statusCode, 'Should return 200 OK');
      System.assertNotEquals(
        null,
        res.responseBody,
        'Response body should not be null'
      );

      String responseJson = res.responseBody.toString();
      System.assert(
        responseJson.contains('Apex'),
        'Response should contain skill name'
      );
    }
  }

  @IsTest
  static void testGetSkillsWithCategoryFilter() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params.put('category', 'Backend Development');

    req.requestURI = '/services/apexrest/sapi/v1/skills/';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPI_Skill.getSkills();
      Test.stopTest();

      System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    }
  }

  @IsTest
  static void testGetSkillsInvalidLimit() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    req.params.put('limit', '300');

    req.requestURI = '/services/apexrest/sapi/v1/skills/';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    System.runAs(new User(Id = UserInfo.getUserId())) {
      Test.startTest();
      SAPI_Skill.getSkills();
      Test.stopTest();

      System.assertEquals(400, res.statusCode, 'Should return 400 Bad Request');
    }
  }
  @IsTest
  static void testGetSkillsInternalError() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.requestURI = null;
    RestContext.request = req;
    RestContext.response = res;

    SAPI_Skill.throwException = true;

    Test.startTest();
    SAPI_Skill.getSkills();
    Test.stopTest();

    System.assertEquals(
      500,
      res.statusCode,
      'Should return 500 on internal error'
    );
  }
}

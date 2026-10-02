/**
 * @description       : Unit tests for PAPIProjects REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/02/2026
 **/
@IsTest
private class PAPIProjectsTest {
  @TestSetup
  static void setup() {
    Project__c proj = new Project__c(
      Name = 'Featured Project',
      Status__c = 'Live – In Production',
      Is_Featured__c = true,
      Sort_Order__c = 1,
      Challenge__c = 'Test challenge',
      Solution__c = 'Test solution'
    );
    insert proj;

    Project__c nonFeatured = new Project__c(
      Name = 'Regular Project',
      Status__c = 'Live – Demo / Reference',
      Is_Featured__c = false,
      Sort_Order__c = 2
    );
    insert nonFeatured;

    Skill__c skill = new Skill__c(Name = 'LWC', Proficiency__c = 5);
    insert skill;

    Project_Skill__c ps = new Project_Skill__c(
      Project__c = proj.Id,
      Skill__c = skill.Id
    );
    insert ps;
  }

  @IsTest
  static void testGetFeaturedProjectsSuccess() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.params = new Map<String, String>();

    req.requestURI = '/services/apexrest/papi/v1/projects/featured';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    Test.startTest();
    PAPIProjects.getProjects();
    Test.stopTest();

    System.assertEquals(200, res.statusCode, 'Should return 200 OK');

    String responseJson = res.responseBody.toString();
    System.assert(
      responseJson.contains('Featured Project'),
      'Response should contain featured project'
    );
    System.assertEquals(
      'max-age=300, public',
      res.headers.get('Cache-Control'),
      'Featured projects are public'
    );
    System.assertEquals('1', res.headers.get('X-Total-Count'), 'One featured');
  }

  @IsTest
  static void testGetAllProjectsSuccess() {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();
    // req.params = new Map<String, String>();

    req.requestURI = '/services/apexrest/papi/v1/projects/all';
    req.httpMethod = 'GET';
    RestContext.request = req;
    RestContext.response = res;

    Test.startTest();
    PAPIProjects.getProjects();
    Test.stopTest();

    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
  }

  @IsTest
  static void testGetProjectsInternalError() {
    RestTestUtil.initGet('/services/apexrest/papi/v1/projects/featured');
    RestResponse res = RestTestUtil.getResponse();
    PAPIProjects.throwException = true;

    Test.startTest();
    PAPIProjects.getProjects();
    Test.stopTest();

    System.assertEquals(
      500,
      res.statusCode,
      'Should catch exception and return 500'
    );
    System.assert(
      res.responseBody.toString().contains('INTERNAL_SERVER_ERROR'),
      'Should return correct error code'
    );
  }

  @IsTest
  static void testGetFeaturedProjectsWithAssets() {
    Project__c proj = [
      SELECT Id
      FROM Project__c
      WHERE Is_Featured__c = TRUE
      LIMIT 1
    ];
    insert new Project_Asset__c(
      Project__c = proj.Id,
      Name = 'Screenshot',
      Type__c = 'Image',
      Alt_Text__c = 'Architecture diagram'
    );
    RestTestUtil.initGet('/services/apexrest/papi/v1/projects/featured');
    RestResponse res = RestTestUtil.getResponse();

    Test.startTest();
    PAPIProjects.getProjects();
    Test.stopTest();

    System.assertEquals(200, res.statusCode, 'Should return 200 OK');
    System.assert(
      res.responseBody.toString().contains('Architecture diagram'),
      'Asset caption should be included'
    );
  }
}

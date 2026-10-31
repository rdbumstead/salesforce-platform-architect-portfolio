/**
 * @description       : Tests SAPIRouter (ADR-040): every SAPI resource reached through its
 *                      versionless URL answers as the old /v1/ handler does, a trailing id
 *                      reaches the handler, and an unknown route is 404 in the error envelope.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 **/
@IsTest
private class SAPIRouterTest {
  private static final String BASE = '/services/apexrest/sapi/';

  @TestSetup
  static void setup() {
    SapiTestData.createGraph();
  }

  private static void viaRouter(String path) {
    RestTestUtil.initGet(BASE + path);
    SAPIRouter.doGet();
  }

  private static String body() {
    return RestContext.response.responseBody.toString();
  }

  private static Map<String, Object> bodyMap() {
    return (Map<String, Object>) JSON.deserializeUntyped(body());
  }

  // Calls the handler on the old /v1/ URL, the way it was reached before the router.
  private static void direct(String resource) {
    RestTestUtil.initGet('/services/apexrest/sapi/v1/' + resource);
    if (resource == 'accounts') {
      SAPIAccount.getAccounts();
    } else if (resource == 'certification-skills') {
      SAPICertificationSkill.getCertificationSkills();
    } else if (resource == 'certifications') {
      SAPICertification.getCertifications();
    } else if (resource == 'contacts') {
      SAPIContact.getContacts();
    } else if (resource == 'education') {
      SAPIEducation.getEducation();
    } else if (resource == 'experience-highlights') {
      SAPIExperienceHighlight.getExperienceHighlights();
    } else if (resource == 'experience-skills') {
      SAPIExperienceSkill.getExperienceSkills();
    } else if (resource == 'experience') {
      SAPIExperience.getExperiences();
    } else if (resource == 'portfolio-config') {
      SAPIPortfolioConfig.getPortfolioConfig();
    } else if (resource == 'project-assets') {
      SAPIProjectAsset.getProjectAssets();
    } else if (resource == 'project-skills') {
      SAPIProjectSkill.getProjectSkills();
    } else if (resource == 'projects') {
      SAPIProject.getProjects();
    } else if (resource == 'skills') {
      SAPISkill.getSkills();
    } else if (resource == 'testimonials') {
      SAPITestimonial.getTestimonials();
    } else {
      SAPIHealth.getHealth();
    }
  }

  // Each resource is called on the old URL and through the router and the two must agree. The
  // resources are split over two tests to stay inside the query limit of one transaction.
  private static void compareWithHandler(List<String> resources) {
    Test.startTest();
    for (String resource : resources) {
      direct(resource);
      Integer expectedStatus = RestContext.response.statusCode;
      String expectedCache = RestContext.response.headers.get('Cache-Control');
      String expectedTotal = RestContext.response.headers.get('X-Total-Count');
      String expectedBody = body();

      viaRouter(resource);
      Assert.areEqual(200, expectedStatus, resource + ' handler status');
      Assert.areEqual(
        expectedStatus,
        RestContext.response.statusCode,
        resource + ' status'
      );
      Assert.areEqual(
        expectedCache,
        RestContext.response.headers.get('Cache-Control'),
        resource + ' Cache-Control'
      );
      Assert.areEqual(
        expectedTotal,
        RestContext.response.headers.get('X-Total-Count'),
        resource + ' X-Total-Count'
      );
      Assert.areEqual(expectedBody, body(), resource + ' body');
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldAnswerTheFirstHalfOfTheResourcesAsTheirHandlersDo() {
    compareWithHandler(
      new List<String>{
        'accounts',
        'certification-skills',
        'certifications',
        'contacts',
        'education',
        'experience-highlights',
        'experience-skills'
      }
    );
  }

  @IsTest
  static void shouldAnswerTheSecondHalfOfTheResourcesAsTheirHandlersDo() {
    compareWithHandler(
      new List<String>{
        'experience',
        'portfolio-config',
        'project-assets',
        'project-skills',
        'projects',
        'skills',
        'testimonials'
      }
    );
  }

  @IsTest
  static void shouldAnswer404WithTheOldUrlForEveryResourceWhileSwitchedOff() {
    PortfolioSettings.overrides.put(
      ApiRoutes.SETTING,
      new Portfolio_Setting__mdt(
        DeveloperName = ApiRoutes.SETTING,
        Text_Value__c = 'Off'
      )
    );
    for (
      String path : new List<String>{
        'health',
        'accounts',
        'certification-skills',
        'certifications',
        'contacts',
        'education',
        'experience-highlights',
        'experience-skills',
        'experience',
        'portfolio-config',
        'project-assets',
        'project-skills',
        'projects',
        'projects/prj_abc',
        'skills',
        'testimonials'
      }
    ) {
      viaRouter(path);
      Assert.areEqual(404, RestContext.response.statusCode, path);
      Map<String, Object> error = bodyMap();
      Assert.areEqual('NOT_FOUND', error.get('errorCode'), path);
      Assert.areEqual(
        'Versionless URLs are switched off. Use /services/apexrest/sapi/v1/' +
          path +
          '.',
        error.get('message'),
        path
      );
    }
    viaRouter('nothing');
    Assert.areEqual(
      ApiMessages.routeNotFound('GET', '/sapi/nothing'),
      bodyMap().get('message'),
      'An unknown route is the plain 404'
    );
  }

  @IsTest
  static void shouldAnswerHealth() {
    Test.startTest();
    viaRouter('health');
    Test.stopTest();

    Assert.areEqual(200, RestContext.response.statusCode, 'Served');
    Assert.isNotNull(bodyMap().get('status'), 'SAPIHealth answered');
    Assert.areEqual(
      'no-store, no-cache',
      RestContext.response.headers.get('Cache-Control')
    );
  }

  @IsTest
  static void shouldPassATrailingIdToTheHandler() {
    Test.startTest();
    viaRouter('projects/prj_doesnotexist');
    Test.stopTest();

    Assert.areEqual(404, RestContext.response.statusCode, 'No such project');
    Assert.areEqual(
      ApiMessages.projectNotFound('prj_doesnotexist', false),
      bodyMap().get('message'),
      'SAPIProject, not the router, answered: ' + body()
    );
  }

  @IsTest
  static void shouldAnswerAnUnknownRouteWith404InTheErrorEnvelope() {
    for (
      String path : new List<String>{
        'nothing',
        'health/extra',
        'v1/nothing',
        'v1',
        ''
      }
    ) {
      viaRouter(path);
      Assert.areEqual(404, RestContext.response.statusCode, path);
      Map<String, Object> error = bodyMap();
      Assert.areEqual(
        new Set<String>{
          'httpStatus',
          'errorCode',
          'message',
          'correlationId',
          'retryable',
          'help'
        },
        error.keySet(),
        'The existing error envelope for ' + path
      );
      Assert.areEqual('NOT_FOUND', error.get('errorCode'), path);
      Assert.areEqual(404, error.get('httpStatus'), path);
    }
  }

  @IsTest
  static void shouldAnswerTheGuest401OnEverySapiRoute() {
    ApiSite.siteBaseOverride = 'https://example.my.site.com';
    SAPIRouter.guestOverride = true;
    List<String> paths = new List<String>{
      'health',
      'accounts',
      'certification-skills',
      'certifications',
      'contacts',
      'education',
      'experience-highlights',
      'experience-skills',
      'experience',
      'portfolio-config',
      'project-assets',
      'project-skills',
      'projects',
      'projects/prj_abc',
      'skills',
      'testimonials'
    };
    for (String path : paths) {
      viaRouter(path);
      Assert.areEqual(401, RestContext.response.statusCode, path);
      Map<String, Object> error = bodyMap();
      Assert.areEqual('UNAUTHORIZED', error.get('errorCode'), path);
      Assert.areEqual(false, error.get('retryable'), path);
      Assert.areEqual(
        ApiMessages.needsToken(
          '/sapi/' + path,
          'https://example.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token'
        ),
        error.get('message'),
        path
      );
      Assert.areEqual(
        'Bearer',
        RestContext.response.headers.get('WWW-Authenticate'),
        path
      );
      Assert.isFalse(
        body().contains('"data"') || body().contains('Skill'),
        'The guest reaches no data on ' + path
      );
    }
    viaRouter('nothing');
    Assert.areEqual(404, RestContext.response.statusCode, 'Unknown stays 404');
  }

  @IsTest
  static void shouldGrantTheRoutersToTheGuestPermissionSet() {
    List<PermissionSet> sets = [
      SELECT Id
      FROM PermissionSet
      WHERE Name = 'Portfolio_Guest'
    ];
    if (sets.isEmpty()) {
      // The permission set ships in another package and may not be in the org under test.
      return;
    }
    Set<String> granted = new Set<String>();
    for (SetupEntityAccess access : [
      SELECT SetupEntityId
      FROM SetupEntityAccess
      WHERE ParentId = :sets[0].Id AND SetupEntityType = 'ApexClass'
    ]) {
      granted.add(access.SetupEntityId);
    }
    for (ApexClass cls : [
      SELECT Id, Name
      FROM ApexClass
      WHERE Name IN ('SAPIRouter', 'PAPIRouter', 'PAPIAuthToken')
    ]) {
      Assert.isTrue(
        granted.contains(cls.Id),
        'Portfolio_Guest grants ' + cls.Name
      );
    }
  }
}

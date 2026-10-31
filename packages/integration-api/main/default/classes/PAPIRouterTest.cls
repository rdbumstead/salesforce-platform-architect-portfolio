/**
 * @description       : Tests PAPIRouter (ADR-040): every route reached through its versionless
 *                      URL lands on the same handler as the old /v1/ URL, POST token and AI
 *                      generate included, an unknown route is 404 in the error envelope, a verb
 *                      a route lacks is 405 in the same envelope, the guest is answered 401 and the
 *                      integration user 403 where the old classes gave them no access.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 **/
@IsTest
private class PAPIRouterTest {
  private static final String BASE = '/services/apexrest/papi/';

  @TestSetup
  static void setup() {
    SapiTestData.createGraph();
  }

  private class CredentialMock implements HttpCalloutMock {
    public HttpResponse respond(HttpRequest req) {
      HttpResponse res = new HttpResponse();
      res.setStatusCode(200);
      res.setBody('{"status":"UP"}');
      return res;
    }
  }

  private static void send(String verb, String uri, String body) {
    RestTestUtil.initGet(uri);
    RestContext.request.httpMethod = verb;
    RestContext.request.requestBody = body == null ? null : Blob.valueOf(body);
  }

  private static void route(String verb, String path, String body) {
    send(verb, BASE + path, body);
    if (verb == 'POST') {
      PAPIRouter.doPost();
    } else {
      PAPIRouter.doGet();
    }
  }

  private static Map<String, Object> bodyMap() {
    return (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
  }

  private static String header(String name) {
    return RestContext.response.headers.get(name);
  }

  private static void switchOff() {
    PortfolioSettings.overrides.put(
      ApiRoutes.SETTING,
      new Portfolio_Setting__mdt(
        DeveloperName = ApiRoutes.SETTING,
        Text_Value__c = 'Off'
      )
    );
  }

  @IsTest
  static void shouldAnswer404WithTheOldUrlForEveryRouteWhileSwitchedOff() {
    switchOff();
    for (
      String path : new List<String>{
        'health',
        'profile/full',
        'projects',
        'projects/featured',
        'resume/generate',
        'testimonials/feed'
      }
    ) {
      route('GET', path, null);
      Assert.areEqual(404, RestContext.response.statusCode, path);
      Map<String, Object> error = bodyMap();
      Assert.areEqual('NOT_FOUND', error.get('errorCode'), path);
      Assert.areEqual(
        'Versionless URLs are switched off. Use /services/apexrest/papi/v1/' +
          path +
          '.',
        error.get('message'),
        path
      );
      Assert.areEqual(
        new Set<String>{
          'httpStatus',
          'errorCode',
          'message',
          'correlationId',
          'retryable'
        },
        error.keySet(),
        'The usual envelope'
      );
    }
    for (String path : new List<String>{ 'auth/token', 'ai/generate' }) {
      route('POST', path, null);
      Assert.areEqual(404, RestContext.response.statusCode, path);
      Assert.isTrue(
        ((String) bodyMap().get('message')).endsWith('/papi/v1/' + path + '.'),
        path
      );
    }
    route('POST', 'projects', null);
    Assert.areEqual(404, RestContext.response.statusCode, 'No 405 while Off');
  }

  @IsTest
  static void shouldTellTheGuestToGetATokenWithTheOldUrlWhileSwitchedOff() {
    switchOff();
    ApiSite.siteBaseOverride = 'https://example.my.site.com';
    PAPIRouter.guestOverride = true;

    route('GET', 'projects', null);
    Assert.areEqual(401, RestContext.response.statusCode, 'Hidden route');
    Assert.areEqual(
      ApiMessages.needsToken(
        '/papi/projects',
        'https://example.my.site.com/portfoliovforcesite/services/apexrest/papi/v1/auth/token'
      ),
      bodyMap().get('message'),
      'The guest is sent to the token URL in the form the switch selects'
    );

    route('POST', 'auth/token', null);
    Assert.areEqual(404, RestContext.response.statusCode, 'Token route');
    Assert.isTrue(
      ((String) bodyMap().get('message')).endsWith('/papi/v1/auth/token.'),
      'The guest is told where the token route is'
    );
  }

  @IsTest
  static void shouldStillAnswerAnUnknownRouteWithThePlain404WhileSwitchedOff() {
    switchOff();
    route('GET', 'nothing', null);
    Assert.areEqual(404, RestContext.response.statusCode);
    Assert.isTrue(
      ((String) bodyMap().get('message')).startsWith('No route matches')
    );
  }

  @IsTest
  static void shouldReachHealthThroughTheVersionlessUrl() {
    Test.setMock(HttpCalloutMock.class, new CredentialMock());

    Test.startTest();
    route('GET', 'health', null);
    Test.stopTest();

    Assert.areEqual(200, RestContext.response.statusCode, 'Served');
    Assert.areEqual('DEEP', bodyMap().get('checkType'), 'PAPIHealth answered');
    Assert.areEqual('no-store, no-cache', header('Cache-Control'), 'Cache');
  }

  @IsTest
  static void shouldReachProfileEndpointsWithTheirTrailingSegment() {
    Test.startTest();
    route('GET', 'profile/full', null);
    Assert.areEqual(200, RestContext.response.statusCode, 'full served');
    Assert.areEqual(
      'no-store, no-cache',
      header('Cache-Control'),
      'full is the no-store endpoint, so the segment reached PAPIProfile'
    );

    route('GET', 'profile/summary', null);
    Test.stopTest();

    Assert.areEqual(200, RestContext.response.statusCode, 'summary served');
    Assert.areEqual(
      'max-age=300, private',
      header('Cache-Control'),
      'summary has its own policy, so the trailing segment is read'
    );
  }

  @IsTest
  static void shouldReachProjectsAndFeaturedProjects() {
    Test.startTest();
    route('GET', 'projects', null);
    Assert.areEqual(200, RestContext.response.statusCode, 'projects served');
    Assert.isNotNull(header('X-Data-Integrity'), 'PAPIProjects answered');

    route('GET', 'projects/featured', null);
    Test.stopTest();

    Assert.areEqual(200, RestContext.response.statusCode, 'featured served');
    Assert.isNotNull(header('X-Data-Integrity'), 'PAPIProjects answered');
  }

  @IsTest
  static void shouldReachResumeGenerateAndRejectABareResume() {
    Test.startTest();
    route('GET', 'resume/generate', null);
    Assert.areEqual(200, RestContext.response.statusCode, 'generate served');
    Assert.isNotNull(bodyMap().get('generatedText'), 'PAPIResume answered');

    route('GET', 'resume', null);
    Test.stopTest();

    Assert.areEqual(400, RestContext.response.statusCode, 'Bare resume');
    Assert.isTrue(
      ((String) bodyMap().get('message')).contains('Use /resume/generate'),
      'The handler, not the router, answered'
    );
  }

  @IsTest
  static void shouldReachTheTestimonialFeed() {
    Test.startTest();
    route('GET', 'testimonials/feed', null);
    Test.stopTest();

    Assert.areEqual(200, RestContext.response.statusCode, 'feed served');
    Assert.areEqual('max-age=60, private', header('Cache-Control'), 'Feed');
  }

  @IsTest
  static void shouldReachTokenAndAiGenerateByPost() {
    Test.startTest();
    route('POST', 'auth/token', null);
    Assert.areEqual(400, RestContext.response.statusCode, 'Token: no body');
    Assert.areEqual(
      'no-store, no-cache',
      header('Cache-Control'),
      'PAPIAuthToken answered'
    );

    route('POST', 'ai/generate', null);
    Test.stopTest();

    Assert.areEqual(400, RestContext.response.statusCode, 'AI: no body');
    Assert.isTrue(
      ((String) bodyMap().get('message')).contains('Request body is required'),
      'PAPIAiGenerate answered'
    );
  }

  @IsTest
  static void shouldAnswerAnUnknownRouteWith404InTheErrorEnvelope() {
    for (
      String path : new List<String>{
        'nothing',
        'health/extra',
        'ai/generate/extra',
        'auth/token/extra',
        'testimonials',
        'testimonials/feed/extra',
        'v1/nothing',
        ''
      }
    ) {
      route('GET', path, null);
      Assert.areEqual(404, RestContext.response.statusCode, path);
      Map<String, Object> error = bodyMap();
      Assert.areEqual(
        new Set<String>{
          'httpStatus',
          'errorCode',
          'message',
          'correlationId',
          'retryable'
        },
        error.keySet(),
        'The existing error envelope for ' + path
      );
      Assert.areEqual('NOT_FOUND', error.get('errorCode'), path);
      Assert.areEqual(false, error.get('retryable'), path);
      Assert.areEqual('v1', header('X-API-Version'), 'Headers still sent');
    }
    route('POST', 'nothing', null);
    Assert.areEqual(404, RestContext.response.statusCode, 'POST unknown');
  }

  @IsTest
  static void shouldAnswer405InTheErrorEnvelopeForAVerbARouteLacks() {
    route('POST', 'projects', null);
    Assert.areEqual(405, RestContext.response.statusCode, 'POST projects');
    Assert.areEqual('GET,HEAD', header('Allow'), 'Allow');
    Map<String, Object> error = bodyMap();
    Assert.areEqual(
      new Set<String>{
        'httpStatus',
        'errorCode',
        'message',
        'correlationId',
        'retryable'
      },
      error.keySet(),
      'The usual envelope'
    );
    Assert.areEqual('METHOD_NOT_ALLOWED', error.get('errorCode'), 'Code');
    Assert.areEqual(405, error.get('httpStatus'), 'httpStatus');
    Assert.areEqual(false, error.get('retryable'), 'retryable');
    Assert.areEqual(
      ApiMessages.methodNotAllowed(
        '/papi/projects',
        'GET,HEAD',
        'POST',
        PAPIRouter.ROUTE_PROJECTS
      ),
      error.get('message'),
      'Message'
    );
    Assert.areEqual('v1', header('X-API-Version'), 'The usual headers');
    Assert.isNotNull(header('X-RateLimit-Limit'), 'The usual headers');

    for (String path : new List<String>{ 'auth/token', 'ai/generate' }) {
      route('GET', path, null);
      Assert.areEqual(405, RestContext.response.statusCode, 'GET ' + path);
      Assert.areEqual('POST', header('Allow'), 'Allow for ' + path);
    }
    Assert.isTrue(
      ((String) bodyMap().get('message')).contains('API reference'),
      'The AI route points at the reference'
    );
    route('GET', 'auth/token', null);
    Assert.isTrue(
      ((String) bodyMap().get('message'))
        .contains(ApiMessages.TOKEN_BODY_SAMPLE),
      'The token route shows its body'
    );
    route('POST', 'health', null);
    Assert.areEqual(405, RestContext.response.statusCode, 'POST health');
  }

  @IsTest
  static void shouldAnswerTheGuest401OnEveryRouteButTheTokenRoute() {
    ApiSite.siteBaseOverride = 'https://example.my.site.com';
    PAPIRouter.guestOverride = true;
    String tokenUrl = 'https://example.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token';

    for (
      String path : new List<String>{
        'health',
        'profile/full',
        'profile/summary',
        'projects',
        'projects/featured',
        'resume/generate',
        'testimonials/feed'
      }
    ) {
      route('GET', path, null);
      Assert.areEqual(401, RestContext.response.statusCode, 'Guest: ' + path);
      Map<String, Object> error = bodyMap();
      Assert.areEqual('UNAUTHORIZED', error.get('errorCode'), path);
      Assert.areEqual(false, error.get('retryable'), path);
      Assert.areEqual(
        ApiMessages.needsToken('/papi/' + path, tokenUrl),
        error.get('message'),
        path
      );
      Assert.areEqual('Bearer', header('WWW-Authenticate'), path);
      Assert.isFalse(
        ((String) error.get('message')).contains('ryanbumstead.com'),
        'The token URL is the site, not the redirecting domain'
      );
    }
    route('POST', 'ai/generate', null);
    Assert.areEqual(401, RestContext.response.statusCode, 'Guest: AI');
    Assert.areEqual('Bearer', header('WWW-Authenticate'), 'AI');

    route('GET', 'nothing', null);
    Assert.areEqual(404, RestContext.response.statusCode, 'Unknown stays 404');
    Assert.isNull(header('WWW-Authenticate'), 'No challenge on a 404');

    route('POST', 'auth/token', null);
    Assert.areEqual(400, RestContext.response.statusCode, 'Guest: token');
    Assert.areEqual(
      'no-store, no-cache',
      header('Cache-Control'),
      'The token handler answered the guest'
    );
    route('GET', 'auth/token', null);
    Assert.areEqual(405, RestContext.response.statusCode, 'Guest: GET token');
  }

  @IsTest
  static void shouldAnswerTheIntegrationUser403OnTheTokenRoute() {
    ApiSite.siteBaseOverride = 'https://example.my.site.com';
    PAPIRouter.guestOverride = false;
    PAPIRouter.integrationUserOverride = true;

    route('POST', 'auth/token', null);
    Assert.areEqual(403, RestContext.response.statusCode, 'No token route');
    Map<String, Object> error = bodyMap();
    Assert.areEqual('FORBIDDEN', error.get('errorCode'), 'Code');
    Assert.areEqual(false, error.get('retryable'), 'retryable');
    Assert.areEqual(
      ApiMessages.tokensNotHere(
        'https://example.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token'
      ),
      error.get('message'),
      'Message'
    );
    route('GET', 'projects', null);
    Assert.areEqual(200, RestContext.response.statusCode, 'Projects served');
    route('POST', 'ai/generate', null);
    Assert.areEqual(400, RestContext.response.statusCode, 'AI reached');
  }

  @IsTest
  static void shouldLetAnAdministratorReachTheTokenRoute() {
    // No override: the real user type and profile are read.
    route('POST', 'auth/token', null);
    Assert.areEqual(400, RestContext.response.statusCode, 'Handler reached');
    Assert.isFalse(
      ((String) bodyMap().get('message')).startsWith('No route'),
      'Not the router\'s 404'
    );
  }

  @IsTest
  static void shouldNameTheRouteForEachUri() {
    Assert.areEqual(
      PAPIRouter.ROUTE_HEALTH,
      PAPIRouter.routeOf('/services/apexrest/papi/health')
    );
    Assert.areEqual(
      PAPIRouter.ROUTE_PROJECTS,
      PAPIRouter.routeOf('/services/apexrest/papi/projects/a/b')
    );
    Assert.areEqual(
      PAPIRouter.ROUTE_AI_GENERATE,
      PAPIRouter.routeOf(
        '/portfoliovforcesite/services/apexrest/papi/AI/Generate'
      )
    );
    Assert.isNull(PAPIRouter.routeOf('/services/apexrest/papi/v1/projects'));
    Assert.isNull(PAPIRouter.routeOf(null));
  }
}

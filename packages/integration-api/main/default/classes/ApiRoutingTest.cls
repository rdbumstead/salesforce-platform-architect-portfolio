/**
 * @description       : Tests ApiRouting (ADR-040): the route segments after the API root for a
 *                      versionless URL, its old /v1/ alias and odd input, and the two answers a
 *                      router gives itself.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 **/
@IsTest
private class ApiRoutingTest {
  @IsTest
  static void shouldSplitTheSegmentsAfterTheRoot() {
    Assert.areEqual(
      new List<String>{ 'projects', 'featured' },
      ApiRouting.routeParts('/services/apexrest/papi/projects/featured')
    );
    Assert.areEqual(
      new List<String>{ 'auth', 'token' },
      ApiRouting.routeParts(
        '/portfoliovforcesite/services/apexrest/PAPI/Auth/Token/?x=1'
      )
    );
    Assert.areEqual(
      new List<String>{ 'skills' },
      ApiRouting.routeParts('/services/apexrest/sapi/skills/')
    );
  }

  @IsTest
  static void shouldReturnNoSegmentsForAnOldUrlABareRootOrNothing() {
    Assert.isTrue(
      ApiRouting.routeParts('/services/apexrest/papi/v1/projects').isEmpty(),
      'The old spelling belongs to the existing classes'
    );
    Assert.isTrue(ApiRouting.routeParts('/services/apexrest/papi').isEmpty());
    Assert.isTrue(ApiRouting.routeParts('').isEmpty());
    Assert.isTrue(ApiRouting.routeParts(null).isEmpty());
  }

  @IsTest
  static void shouldWrite405InTheErrorEnvelope() {
    RestTestUtil.initGet('/services/apexrest/papi/projects');

    ApiRouting.methodNotAllowed('DELETE', 'GET,HEAD', 'projects');

    Assert.areEqual(405, RestContext.response.statusCode, 'Status');
    Assert.areEqual('GET,HEAD', RestContext.response.headers.get('Allow'));
    Map<String, Object> error = RestTestUtil.getBodyAsMap();
    Assert.areEqual('METHOD_NOT_ALLOWED', error.get('errorCode'), 'Code');
    Assert.isTrue(((String) error.get('message')).contains('DELETE'), 'Verb');
  }

  @IsTest
  static void shouldWrite401WithAChallenge() {
    ApiSite.siteBaseOverride = 'https://example.my.site.com';
    RestTestUtil.initGet('/services/apexrest/sapi/skills');

    ApiRouting.unauthorized();

    Assert.areEqual(401, RestContext.response.statusCode, 'Status');
    Assert.areEqual(
      'Bearer',
      RestContext.response.headers.get('WWW-Authenticate')
    );
    Assert.areEqual(
      'UNAUTHORIZED',
      RestTestUtil.getBodyAsMap().get('errorCode')
    );
  }

  @IsTest
  static void shouldWrite403() {
    ApiSite.siteBaseOverride = 'https://example.my.site.com';
    RestTestUtil.initGet('/services/apexrest/papi/auth/token');

    ApiRouting.forbidden();

    Assert.areEqual(403, RestContext.response.statusCode, 'Status');
    Assert.areEqual('FORBIDDEN', RestTestUtil.getBodyAsMap().get('errorCode'));
  }
}

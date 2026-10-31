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
  static void shouldWriteThePlatformsOwn405() {
    RestTestUtil.initGet('/services/apexrest/papi/projects');

    ApiRouting.methodNotAllowed('DELETE', 'GET,HEAD');

    Assert.areEqual(405, RestContext.response.statusCode, 'Status');
    Assert.areEqual('GET,HEAD', RestContext.response.headers.get('Allow'));
    Assert.isTrue(
      RestContext.response.responseBody.toString().contains('DELETE'),
      'Names the verb'
    );
  }
}

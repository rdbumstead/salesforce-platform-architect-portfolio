/**
 * @description       : Tests for OpenApiDocument: the default and named specs come back
 *                      as the generated OpenAPI JSON with a public cache header, an unknown spec
 *                      is a 400 in the specs' Error shape, and the site guest can read it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/23/2026
 **/
@IsTest
private class OpenApiDocumentTest {
  private static RestResponse call(String spec) {
    return call(spec, null);
  }

  private static RestResponse call(String spec, String version) {
    RestRequest request = new RestRequest();
    request.requestURI = '/services/apexrest/openapi.json';
    request.httpMethod = 'GET';
    if (spec != null) {
      request.addParameter('spec', spec);
    }
    if (version != null) {
      request.addParameter('version', version);
    }
    RestContext.request = request;
    RestContext.response = new RestResponse();
    OpenApiDocument.getDocument();
    return RestContext.response;
  }

  private static Map<String, Object> bodyOf(RestResponse response) {
    return (Map<String, Object>) JSON.deserializeUntyped(
      response.responseBody.toString()
    );
  }

  @IsTest
  static void shouldReturnPapiWhenNoSpecIsGiven() {
    Test.startTest();
    RestResponse response = call(null);
    Test.stopTest();

    Assert.areEqual(200, response.statusCode, 'OK');
    Map<String, Object> doc = bodyOf(response);
    Assert.isTrue(
      String.valueOf(doc.get('openapi')).startsWith('3.'),
      'An OpenAPI 3 document'
    );
    Map<String, Object> paths = (Map<String, Object>) doc.get('paths');
    Assert.isTrue(paths.containsKey('/resume/generate'), 'The PAPI paths');
    Assert.areEqual(
      OpenApiDocument.CACHE_CONTROL,
      response.headers.get('Cache-Control'),
      'Cacheable'
    );
    Assert.areEqual(
      'application/json',
      response.headers.get('Content-Type'),
      'JSON'
    );
  }

  @IsTest
  static void shouldReturnSapiWhenAsked() {
    Test.startTest();
    RestResponse response = call(' SAPI ');
    Test.stopTest();

    Assert.areEqual(200, response.statusCode, 'OK');
    Map<String, Object> paths = (Map<String, Object>) bodyOf(response)
      .get('paths');
    Assert.isTrue(paths.containsKey('/skills'), 'The SAPI paths');
  }

  @IsTest
  static void shouldServeV2WhenNoVersionIsGiven() {
    Test.startTest();
    RestResponse defaulted = call('sapi');
    RestResponse explicit = call('sapi', ' V2 ');
    Test.stopTest();

    Assert.areEqual(200, defaulted.statusCode, 'OK');
    Assert.areEqual(
      explicit.responseBody.toString(),
      defaulted.responseBody.toString(),
      'No version is v2'
    );
    Assert.isFalse(
      defaulted.responseBody.toString().contains('"accomplishments"'),
      'v2 holds no accomplishments'
    );
  }

  @IsTest
  static void shouldServeV1WhenAsked() {
    Test.startTest();
    RestResponse v1 = call('sapi', 'v1');
    Test.stopTest();

    Assert.areEqual(200, v1.statusCode, 'OK');
    Assert.isTrue(
      v1.responseBody.toString().contains('"accomplishments"'),
      'v1 still holds the deprecated field'
    );
  }

  @IsTest
  static void shouldReturn400WhenVersionIsUnknown() {
    Test.startTest();
    RestResponse response = call('papi', 'v3');
    Test.stopTest();

    Assert.areEqual(400, response.statusCode, 'Bad request');
    Map<String, Object> error = bodyOf(response);
    Assert.areEqual('BAD_REQUEST', error.get('errorCode'), 'Error code');
    Assert.areEqual(400, error.get('httpStatus'), 'Status in the body');
    Assert.areEqual(false, error.get('retryable'), 'Not retryable');
  }

  @IsTest
  static void shouldReturn503WhenV2ResourceIsMissing() {
    OpenApiDocument.RESOURCE_BY_SPEC_V2.put('papi', 'No_Such_OpenAPI_V2');

    Test.startTest();
    RestResponse response = call('papi', 'v2');
    Test.stopTest();

    Assert.areEqual(503, response.statusCode, 'Unavailable');
  }

  @IsTest
  static void shouldReturn400WhenSpecIsUnknown() {
    Test.startTest();
    RestResponse response = call('graphql');
    Test.stopTest();

    Assert.areEqual(400, response.statusCode, 'Bad request');
    Map<String, Object> error = bodyOf(response);
    Assert.areEqual('BAD_REQUEST', error.get('errorCode'), 'Error code');
    Assert.areEqual(400, error.get('httpStatus'), 'Status in the body');
    Assert.isNotNull(error.get('correlationId'), 'Correlation id');
    Assert.areEqual(false, error.get('retryable'), 'Not retryable');
    Assert.areEqual(
      'no-store',
      response.headers.get('Cache-Control'),
      'Errors are not cached'
    );
  }

  @IsTest
  static void shouldReturn503WhenResourceIsMissing() {
    OpenApiDocument.RESOURCE_BY_SPEC.put('gone', 'No_Such_OpenAPI_Resource');

    Test.startTest();
    RestResponse response = call('gone');
    Test.stopTest();

    Assert.areEqual(503, response.statusCode, 'Unavailable');
    Assert.areEqual(true, bodyOf(response).get('retryable'), 'Retryable');
  }

  @IsTest
  static void shouldServeTheGuest() {
    User guest = SiteGuestTestSupport.preparedGuest();

    RestResponse response;
    Test.startTest();
    System.runAs(guest) {
      response = call('papi');
    }
    Test.stopTest();

    Assert.areEqual(200, response.statusCode, 'The guest reads the spec');
  }
}

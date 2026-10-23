/**
 * @description       : Tests for OpenApiDocument (audit B4): the default and named specs come back
 *                      as the generated OpenAPI JSON with a public cache header, an unknown spec
 *                      is a 400 in the specs' Error shape, and the site guest can read it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
@IsTest
private class OpenApiDocumentTest {
  private static RestResponse call(String spec) {
    RestRequest request = new RestRequest();
    request.requestURI = '/services/apexrest/openapi.json';
    request.httpMethod = 'GET';
    if (spec != null) {
      request.addParameter('spec', spec);
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

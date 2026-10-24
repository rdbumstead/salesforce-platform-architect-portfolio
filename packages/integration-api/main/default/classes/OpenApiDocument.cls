/**
 * @description       : Serves the machine readable API specs at
 *                      /services/apexrest/openapi.json. ?spec=papi (the default) returns the
 *                      Experience API, ?spec=sapi the System API. The body is the PAPI_OpenAPI or
 *                      SAPI_OpenAPI static resource, which scripts/sync-specs.js generates from
 *                      packages/integration-api/specs, so it always matches the API reference.
 *                      Open to the site guest, read only, no DML and no callout.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 * @Test Class        : [OpenApiDocumentTest]
 **/
// Salesforce reads a .json suffix as the response format, so /openapi.json and /openapi
// both reach this mapping.
@RestResource(urlMapping='/openapi')
global with sharing class OpenApiDocument {
  public static final String DEFAULT_SPEC = 'papi';
  public static final String CACHE_CONTROL = 'public, max-age=3600';

  /** Query value to static resource name. */
  public static final Map<String, String> RESOURCE_BY_SPEC = new Map<String, String>{
    'papi' => 'PAPI_OpenAPI',
    'sapi' => 'SAPI_OpenAPI'
  };

  /**
   * @description GET /openapi.json?spec=papi|sapi. 200 with the OpenAPI document, 400 for an
   *              unknown spec, 503 when the resource is missing.
   */
  @HttpGet
  global static void getDocument() {
    RestRequest request = RestContext.request;
    RestResponse response = RestContext.response;
    String spec = request?.params?.get('spec');
    spec = String.isBlank(spec) ? DEFAULT_SPEC : spec.trim().toLowerCase();
    response.addHeader('Content-Type', 'application/json');

    if (!RESOURCE_BY_SPEC.containsKey(spec)) {
      writeError(
        response,
        400,
        'BAD_REQUEST',
        'Unknown spec. Use spec=papi or spec=sapi.'
      );
      return;
    }
    Blob body = resourceBody(RESOURCE_BY_SPEC.get(spec));
    if (body == null) {
      writeError(
        response,
        503,
        'SERVICE_UNAVAILABLE',
        'The OpenAPI document is not available.'
      );
      return;
    }
    response.statusCode = 200;
    response.addHeader('Cache-Control', CACHE_CONTROL);
    response.responseBody = body;
  }

  private static Blob resourceBody(String name) {
    List<StaticResource> rows = [
      SELECT Body
      FROM StaticResource
      WHERE Name = :name
      WITH SYSTEM_MODE
      LIMIT 1
    ];
    return rows.isEmpty() ? null : rows[0].Body;
  }

  /** Same fields as the specs' Error schema. */
  private static void writeError(
    RestResponse response,
    Integer status,
    String errorCode,
    String message
  ) {
    response.statusCode = status;
    response.addHeader('Cache-Control', 'no-store');
    response.responseBody = Blob.valueOf(
      JSON.serialize(
        new Map<String, Object>{
          'httpStatus' => status,
          'errorCode' => errorCode,
          'message' => message,
          'correlationId' => UUID.randomUUID().toString(),
          'retryable' => status == 503
        }
      )
    );
  }
}

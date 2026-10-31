/**
 * @description       : Serves the machine readable API specs at
 *                      /services/apexrest/openapi.json. ?spec=papi (the default) returns the
 *                      Experience API, ?spec=sapi the System API. ?version=v2 (the default)
 *                      returns the v2 document, ?version=v1 the deprecated v1 one. The body is
 *                      the PAPI_OpenAPI_V2, SAPI_OpenAPI_V2, PAPI_OpenAPI or SAPI_OpenAPI static
 *                      resource, which scripts/sync-specs.js generates from
 *                      packages/integration-api/specs, so it always matches the API reference.
 *                      Open to the site guest, read only, no DML and no callout.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/23/2026
 * @Test Class        : [OpenApiDocumentTest]
 **/
// Salesforce reads a .json suffix as the response format, so /openapi.json and /openapi
// both reach this mapping.
@RestResource(urlMapping='/openapi')
global with sharing class OpenApiDocument {
  public static final String DEFAULT_SPEC = 'papi';
  public static final String DEFAULT_VERSION = 'v2';
  public static final String CACHE_CONTROL = 'public, max-age=3600';
  public static final String PAGES_BASE = 'https://rdbumstead.github.io/salesforce-platform-architect-portfolio/api/oas/';

  /** Query value to static resource name. */
  public static final Map<String, String> RESOURCE_BY_SPEC = new Map<String, String>{
    'papi' => 'PAPI_OpenAPI',
    'sapi' => 'SAPI_OpenAPI'
  };

  /** Query value to the v2 static resource name. */
  public static final Map<String, String> RESOURCE_BY_SPEC_V2 = new Map<String, String>{
    'papi' => 'PAPI_OpenAPI_V2',
    'sapi' => 'SAPI_OpenAPI_V2'
  };

  /**
   * @description GET /openapi.json?spec=papi|sapi&version=v1|v2. 200 with the OpenAPI
   *              document, 400 for an unknown spec or version, 503 when the resource is
   *              missing. The version defaults to v2.
   */
  @HttpGet
  global static void getDocument() {
    RestRequest request = RestContext.request;
    RestResponse response = RestContext.response;
    String spec = request?.params?.get('spec');
    spec = String.isBlank(spec) ? DEFAULT_SPEC : spec.trim().toLowerCase();
    String version = request?.params?.get('version');
    version = String.isBlank(version)
      ? DEFAULT_VERSION
      : version.trim().toLowerCase();
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
    if (version != 'v1' && version != 'v2') {
      writeError(
        response,
        400,
        'BAD_REQUEST',
        'Unknown version. Use version=v1 or version=v2.'
      );
      return;
    }
    String resourceName = version == 'v2'
      ? RESOURCE_BY_SPEC_V2.get(spec)
      : RESOURCE_BY_SPEC.get(spec);
    Blob body = resourceBody(resourceName);
    if (body == null) {
      writeError(
        response,
        503,
        'SERVICE_UNAVAILABLE',
        ApiMessages.openApiMissing(pagesUrl(spec, version))
      );
      return;
    }
    response.statusCode = 200;
    response.addHeader('Cache-Control', CACHE_CONTROL);
    response.responseBody = body;
  }

  // The same description on GitHub Pages, for example
  // https://rdbumstead.github.io/salesforce-platform-architect-portfolio/api/oas/portfolio-papi-v2.
  @TestVisible
  private static String pagesUrl(String spec, String version) {
    return PAGES_BASE +
      ('papi'.equals(spec) ? 'portfolio-papi' : 'salesforce-sapi') +
      ('v2'.equals(version) ? '-v2' : '');
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
    if (status == 503) {
      response.addHeader(
        'Retry-After',
        String.valueOf(ApiRequestContext.DEFAULT_RETRY_AFTER_SECONDS)
      );
    }
    response.responseBody = Blob.valueOf(
      JSON.serialize(
        new Map<String, Object>{
          'httpStatus' => status,
          'errorCode' => errorCode,
          'message' => message,
          'correlationId' => UUID.randomUUID().toString(),
          'retryable' => status == 503,
          'help' => ApiMessages.helpUrl(errorCode, 'papi')
        }
      )
    );
  }
}

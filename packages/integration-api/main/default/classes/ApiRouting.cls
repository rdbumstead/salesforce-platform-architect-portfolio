/**
 * @description       : Shared parts of PAPIRouter and SAPIRouter (ADR-040). Splits a request
 *                      URI into the route segments after sapi or papi, the same for a
 *                      versionless URL and its old /v1/ alias, and writes the two answers
 *                      a router can give itself: the 404 for a route it does not know,
 *                      in the standard error envelope, and the 405 for a verb a route does
 *                      not have, worded as the platform words it for a class without that
 *                      verb. Holds no data access.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 * @Test Class        : [ApiRoutingTest]
 **/
public with sharing class ApiRouting {
  /**
   * @description The route segments after the API root, lower case. For
   *              /services/apexrest/papi/projects/featured that is projects, featured.
   *              Empty for a URI with no route after the root. Also empty for an old /v1/
   *              URL: the existing classes still own those URLs, so one that reaches a
   *              router matched none of them and is an unknown route.
   * @param uri The request URI.
   * @return List<String> The segments.
   */
  public static List<String> routeParts(String uri) {
    List<String> parts = new List<String>();
    if (ApiRequestContext.isLegacyPath(uri)) {
      return parts;
    }
    String canonical = ApiRequestContext.canonicalPath(uri);
    if (canonical == null) {
      return parts;
    }
    Boolean root = true;
    for (String part : canonical.split('/')) {
      if (String.isBlank(part)) {
        continue;
      }
      if (root) {
        // The first segment is sapi or papi.
        root = false;
        continue;
      }
      parts.add(part);
    }
    return parts;
  }

  /**
   * @description Answers a route the router does not know with 404 in the standard error
   *              envelope. The request goes through the same header, version and rate limit
   *              rules as any other, so it carries the same headers.
   */
  public static void notFound() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }
    ctx.error(
      404,
      'NOT_FOUND',
      'No route matches ' +
      ApiRequestContext.canonicalPath(RestContext.request?.requestURI)
    );
  }

  /**
   * @description Answers a verb the route does not have as the platform answers it for a
   *              class without that verb: 405, an Allow header, and the platform's own body.
   *              Like the platform it runs no header or rate limit rules.
   * @param verb The verb that was sent.
   * @param allowed The verbs the route has, in the platform's order, for example GET,HEAD.
   */
  public static void methodNotAllowed(String verb, String allowed) {
    RestResponse res = RestContext.response;
    res.statusCode = 405;
    res.addHeader('Content-Type', 'application/json');
    res.addHeader('Allow', allowed);
    res.responseBody = Blob.valueOf(
      JSON.serialize(
        new List<Object>{
          new Map<String, Object>{
            'errorCode' => 'METHOD_NOT_ALLOWED',
            'message' => 'HTTP Method \'' +
            verb +
            '\' not allowed. Allowed are ' +
            allowed
          }
        }
      )
    );
  }
}

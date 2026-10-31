/**
 * @description       : Shared parts of PAPIRouter and SAPIRouter (ADR-040). Splits a request
 *                      URI into the route segments after sapi or papi, the same for a
 *                      versionless URL and its old /v1/ alias, and writes the two answers
 *                      a router can give itself: the 404 for a route it does not know,
 *                      in the standard error envelope, the 401 for a caller with no token,
 *                      the 403 for a token holder asking for a token, and the 405 for a verb
 *                      a route does not have, all in the same envelope. Holds no data access.
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
   * @description Answers a known route with 404 while the Api_Versionless_Urls switch is Off,
   *              in the standard error envelope, with a message that names the /v1/ URL for
   *              the same path. It runs the normal header and rate limit rules first.
   */
  public static void switchedOff() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }
    ctx.error(
      404,
      'NOT_FOUND',
      'Versionless URLs are switched off. Use ' +
        ApiRoutes.forCanonical(
          ApiRequestContext.canonicalPath(RestContext.request?.requestURI),
          false
        ) +
        '.'
    );
  }

  /**
   * @description Answers a caller with no token on a route that needs one: 401
   *              UNAUTHORIZED with WWW-Authenticate: Bearer and a message that says where to
   *              get a token. It runs the normal header and rate limit rules first.
   */
  public static void unauthorized() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }
    ctx.header('WWW-Authenticate', 'Bearer');
    ctx.error(
      401,
      'UNAUTHORIZED',
      ApiMessages.needsToken(
        ApiRequestContext.canonicalPath(RestContext.request?.requestURI),
        ApiSite.tokenUrl()
      )
    );
  }

  /**
   * @description Answers a token holder who asks for a token on the instance address: 403
   *              FORBIDDEN and a message that gives the site's token URL.
   */
  public static void forbidden() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }
    ctx.error(403, 'FORBIDDEN', ApiMessages.tokensNotHere(ApiSite.tokenUrl()));
  }

  /**
   * @description Answers a verb the route does not have: 405 METHOD_NOT_ALLOWED in the standard
   *              error envelope with the usual headers and an Allow header. It runs the
   *              normal header and rate limit rules first.
   * @param verb The verb that was sent.
   * @param allowed The verbs the route has, for example GET,HEAD.
   * @param route The route name after the API root, for example auth/token.
   */
  public static void methodNotAllowed(
    String verb,
    String allowed,
    String route
  ) {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }
    ctx.header('Allow', allowed);
    ctx.error(
      405,
      'METHOD_NOT_ALLOWED',
      ApiMessages.methodNotAllowed(
        ApiRequestContext.canonicalPath(RestContext.request?.requestURI),
        allowed,
        verb,
        route
      )
    );
  }
}

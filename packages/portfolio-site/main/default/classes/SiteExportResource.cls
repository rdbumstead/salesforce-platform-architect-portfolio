/**
 * @description       : The static site's build time read (/site/export). GET with no call lists
 *                      the allowlist. GET ?call=Class.method&params=<JSON> runs one allowlisted
 *                      site controller method and returns its result as the component would
 *                      receive it, with null fields left out. Only a user holding the
 *                      Site_Build_Export custom permission may call it, and the site guest never
 *                      does. One call per request keeps each response inside the synchronous
 *                      limits. Performs no DML.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 * @Test Class        : [SiteExportResourceTest]
 **/
@RestResource(urlMapping='/site/export/*')
global with sharing class SiteExportResource {
  /** The custom permission that lets a user read the export. */
  public static final String PERMISSION = 'Site_Build_Export';

  @TestVisible
  private static Boolean throwException = false;

  /**
   * @description Lists the allowlist, or runs one allowlisted call.
   * @example
   * GET /services/apexrest/site/export?call=ResumeController.getHeader
   */
  @HttpGet
  global static void doGet() {
    RestRequest req = RestContext.request;
    RestResponse res = RestContext.response;
    res.addHeader('Content-Type', 'application/json');
    res.addHeader('Cache-Control', 'no-store');
    if (!FeatureManagement.checkPermission(PERMISSION)) {
      respond(
        res,
        403,
        error('FORBIDDEN', 'The export needs the Site_Build_Export permission.')
      );
      return;
    }
    String call = req.params.get('call');
    if (String.isBlank(call)) {
      respond(
        res,
        200,
        JSON.serialize(
          new Map<String, Object>{ 'calls' => SiteExportCalls.describe() }
        )
      );
      return;
    }
    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }
      Object result = SiteExportCalls.run(
        call,
        parseParams(req.params.get('params'))
      );
      respond(
        res,
        200,
        '{"call":' +
          JSON.serialize(call) +
          ',"result":' +
          serialize(result) +
          '}'
      );
    } catch (SiteExportCalls.NotAllowedException e) {
      respond(res, 400, error('NOT_ALLOWED', e.getMessage()));
    } catch (JSONException e) {
      respond(res, 400, error('NOT_ALLOWED', 'params must be a JSON object.'));
    } catch (Exception e) {
      respond(
        res,
        500,
        error('CALL_FAILED', 'The call failed: ' + e.getTypeName())
      );
    }
  }

  /**
   * @description The result as JSON with null fields left out, the way a component receives it.
   * @param result a controller method's result
   * @return the JSON text
   */
  public static String serialize(Object result) {
    return JSON.serialize(result, true);
  }

  private static Map<String, Object> parseParams(String raw) {
    if (String.isBlank(raw)) {
      return new Map<String, Object>();
    }
    Object parsed = JSON.deserializeUntyped(raw);
    if (!(parsed instanceof Map<String, Object>)) {
      throw new SiteExportCalls.NotAllowedException(
        'params must be a JSON object.'
      );
    }
    return (Map<String, Object>) parsed;
  }

  private static String error(String code, String message) {
    return JSON.serialize(
      new Map<String, String>{ 'error' => code, 'message' => message }
    );
  }

  private static void respond(RestResponse res, Integer status, String body) {
    res.statusCode = status;
    res.responseBody = Blob.valueOf(body);
  }
}

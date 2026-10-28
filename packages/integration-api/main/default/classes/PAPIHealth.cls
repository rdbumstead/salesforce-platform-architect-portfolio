/**
 * @description       : PAPI health check (/papi/v1/health). Reports per-dependency states:
 *                      SAPI (in-process), the Portfolio_API credential (one GET
 *                      through callout:Portfolio_API to /sapi/v1/health, the only check that
 *                      exercises the credential), and presence of the Jira, GitHub and Gemini
 *                      Named Credentials (no callouts). Performs no DML.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/05/2025
 * @Test Class        : [PAPIHealthTest]
 **/
@RestResource(urlMapping='/papi/v1/health')
global with sharing class PAPIHealth {
  public static final String STATE_UP = 'UP';
  public static final String STATE_DOWN = 'DOWN';
  public static final String STATE_DEGRADED = 'DEGRADED';
  public static final String STATE_CONFIGURED = 'CONFIGURED';
  public static final String STATE_MISSING = 'MISSING';
  public static final String STATE_UNKNOWN = 'UNKNOWN';

  @TestVisible
  private static final String CREDENTIAL_ENDPOINT = 'callout:Portfolio_API/services/apexrest/sapi/v1/health';
  // Code default. The Health_Credential_Timeout_Ms setting gives the value in force.
  @TestVisible
  private static final Integer CREDENTIAL_TIMEOUT_MS = 10000;

  // Dependency key in the payload => Named Credential DeveloperName.
  private static final Map<String, String> NAMED_CREDENTIALS = new Map<String, String>{
    'jira' => 'Jira_API',
    'github' => 'GitHub_API',
    'gemini' => 'Gemini_API'
  };

  /**
   * @description GET method returning the HealthStatus payload with dependency states.
   *              Always 200; the overall state is in "status".
   */
  @HttpGet
  global static void getHealth() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    if (ctx.isRejected()) {
      return;
    }

    Map<String, Object> details = new Map<String, Object>();
    Map<String, Object> dependencies = new Map<String, Object>();
    dependencies.put('sapi', checkSapi(details));
    dependencies.put('credential', checkCredential(details));
    dependencies.putAll(checkNamedCredentials());

    Map<String, Object> healthStatus = new Map<String, Object>{
      'status' => overallStatus(dependencies),
      'checkType' => 'DEEP',
      'timestamp' => Datetime.now().formatGmt('yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
      'dependencies' => dependencies,
      'details' => details
    };

    ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);
    ctx.ok(healthStatus);
  }

  /**
   * @description SAPI health read in-process through SAPIHealth.buildPayload (never its handler).
   */
  private static String checkSapi(Map<String, Object> details) {
    try {
      PAPITransformer.guardSection('sapi');
      Object status = SAPIHealth.buildPayload().get('status');
      return STATE_UP.equals(status) ? STATE_UP : STATE_DOWN;
    } catch (Exception e) {
      details.put('sapi', e.getTypeName());
      return STATE_DOWN;
    }
  }

  /**
   * @description GET /sapi/v1/health through callout:Portfolio_API. UP only on HTTP 200;
   *              any other status or a callout failure is DOWN (Maintenance Guide 1.2,
   *              "dependencies.credential: UP").
   */
  // Milliseconds the credential callout waits: the Health_Credential_Timeout_Ms setting,
  // else CREDENTIAL_TIMEOUT_MS.
  @TestVisible
  private static Integer credentialTimeoutMs() {
    return PortfolioSettings.getInteger(
      'Health_Credential_Timeout_Ms',
      CREDENTIAL_TIMEOUT_MS
    );
  }

  private static String checkCredential(Map<String, Object> details) {
    HttpRequest req = new HttpRequest();
    req.setEndpoint(CREDENTIAL_ENDPOINT);
    req.setMethod('GET');
    req.setTimeout(credentialTimeoutMs());
    req.setHeader('X-Request-Id', UUID.randomUUID().toString());
    req.setHeader('X-API-Version', ApiRequestContext.SUPPORTED_VERSION);
    req.setHeader('Accept', 'application/json');
    try {
      HttpResponse res = new Http().send(req);
      details.put('credential', 'HTTP ' + res.getStatusCode());
      return res.getStatusCode() == 200 ? STATE_UP : STATE_DOWN;
    } catch (Exception e) {
      details.put('credential', e.getTypeName());
      return STATE_DOWN;
    }
  }

  /**
   * @description Presence of each outbound Named Credential, by DeveloperName. No callouts.
   */
  private static Map<String, Object> checkNamedCredentials() {
    Map<String, Object> states = new Map<String, Object>();
    Set<String> present = new Set<String>();
    Boolean readable = true;
    try {
      PAPITransformer.guardSection('named-credentials');
      Set<String> names = new Set<String>(NAMED_CREDENTIALS.values());
      for (NamedCredential nc : [
        SELECT DeveloperName
        FROM NamedCredential
        WHERE DeveloperName IN :names
      ]) {
        present.add(nc.DeveloperName);
      }
    } catch (Exception e) {
      readable = false;
    }
    for (String key : NAMED_CREDENTIALS.keySet()) {
      String state = present.contains(NAMED_CREDENTIALS.get(key))
        ? STATE_CONFIGURED
        : STATE_MISSING;
      states.put(key, readable ? state : STATE_UNKNOWN);
    }
    return states;
  }

  /**
   * @description DOWN when SAPI is down; DEGRADED when the credential is down or any Named
   *              Credential is not CONFIGURED; otherwise UP.
   */
  @TestVisible
  private static String overallStatus(Map<String, Object> dependencies) {
    if (!STATE_UP.equals(dependencies.get('sapi'))) {
      return STATE_DOWN;
    }
    if (!STATE_UP.equals(dependencies.get('credential'))) {
      return STATE_DEGRADED;
    }
    for (String key : NAMED_CREDENTIALS.keySet()) {
      if (!STATE_CONFIGURED.equals(dependencies.get(key))) {
        return STATE_DEGRADED;
      }
    }
    return STATE_UP;
  }
}

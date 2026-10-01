/**
 * @description       : Per-request context shared by every SAPI and PAPI REST resource.
 *                      Owns tracing and version headers, pagination, error payloads,
 *                      cache directives and rate-limit headers. Authentication is not
 *                      handled here: the platform rejects unauthenticated callers before
 *                      Apex runs (ADR-027).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/01/2026
 * @Test Class        : [ApiRequestContextTest]
 **/
public with sharing class ApiRequestContext {
  /**
   * @description Cache directives a resource may emit.
   */
  public enum CachePolicy {
    PUBLIC_300,
    PRIVATE_300,
    NO_STORE
  }

  private enum ApiFamily {
    SAPI,
    PAPI,
    UNKNOWN
  }

  public static final String SUPPORTED_VERSION = 'v1';
  public static final Integer DEFAULT_LIMIT = 50;
  public static final Integer MAX_LIMIT = 200;
  public static final Integer DEFAULT_OFFSET = 0;
  public static final Integer SAPI_LIMIT_PER_MINUTE = 120;
  public static final Integer PAPI_LIMIT_PER_MINUTE = 15;
  public static final Integer PAPI_AI_LIMIT_PER_MINUTE = 10;

  private static final String HEADER_REQUEST_ID = 'X-Request-Id';
  private static final String HEADER_API_VERSION = 'X-API-Version';
  private static final Pattern UUID_PATTERN = Pattern.compile(
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );
  private static final Map<CachePolicy, String> CACHE_DIRECTIVES = new Map<CachePolicy, String>{
    CachePolicy.PUBLIC_300 => 'max-age=300, public',
    CachePolicy.PRIVATE_300 => 'max-age=300, private',
    CachePolicy.NO_STORE => 'no-store, no-cache'
  };

  @TestVisible
  private static ApiRateLimiter limiterOverride;

  private final RestRequest req;
  private final RestResponse res;
  private String correlationId;
  private Boolean rejected = false;
  private Integer pageLimit = DEFAULT_LIMIT;

  /**
   * @description Outcome of a rate-limit check and the values for the rate-limit headers.
   */
  public class RateDecision {
    public final Boolean allowed;
    public final Integer limitPerMinute;
    public final Integer remaining;
    public final Integer retryAfterSeconds;

    /**
     * @description Creates a decision.
     * @param allowed True when the request may proceed.
     * @param limitPerMinute Value for X-RateLimit-Limit.
     * @param remaining Value for X-RateLimit-Remaining.
     * @param retryAfterSeconds Value for Retry-After when the request is refused.
     */
    public RateDecision(
      Boolean allowed,
      Integer limitPerMinute,
      Integer remaining,
      Integer retryAfterSeconds
    ) {
      this.allowed = allowed;
      this.limitPerMinute = limitPerMinute;
      this.remaining = remaining;
      this.retryAfterSeconds = retryAfterSeconds;
    }
  }

  private ApiRequestContext(RestRequest req, RestResponse res) {
    this.req = req;
    this.res = res;
  }

  /**
   * @description Builds the context for the current REST request and applies the header,
   *              version and rate-limit rules. Runs no SOQL. Callers must return immediately
   *              when isRejected() is true.
   * @return ApiRequestContext The context for this request.
   */
  public static ApiRequestContext begin() {
    ApiRequestContext ctx = new ApiRequestContext(
      RestContext.request,
      RestContext.response
    );
    ctx.applyRequestRules();
    return ctx;
  }

  /**
   * @description True when the request has already been answered with an error.
   * @return Boolean True when the caller must stop processing.
   */
  public Boolean isRejected() {
    return rejected;
  }

  /**
   * @description The caller-supplied X-Request-Id, or a generated UUID when PAPI allowed it
   *              to be omitted or the supplied value was rejected.
   * @return String The correlation id echoed in headers and error bodies.
   */
  public String correlationId() {
    return correlationId;
  }

  /**
   * @description Reads the limit query parameter (1 to 200, default 50). Rejects with 400 when invalid.
   * @return Integer The limit, or null when the request was rejected.
   */
  public Integer limitParam() {
    if (rejected) {
      return null;
    }
    Integer value = parseInteger('limit', DEFAULT_LIMIT);
    if (value == null || value < 1 || value > MAX_LIMIT) {
      error(400, 'BAD_REQUEST', 'Limit must be an integer between 1 and 200.');
      return null;
    }
    pageLimit = value;
    return value;
  }

  /**
   * @description Reads the offset query parameter (>= 0, default 0). Rejects with 400 when invalid.
   * @return Integer The offset, or null when the request was rejected.
   */
  public Integer offsetParam() {
    if (rejected) {
      return null;
    }
    Integer value = parseInteger('offset', DEFAULT_OFFSET);
    if (value == null) {
      error(400, 'BAD_REQUEST', 'Offset must be a non-negative integer.');
      return null;
    }
    if (value < 0) {
      error(400, 'BAD_REQUEST', 'Offset cannot be negative.');
      return null;
    }
    return value;
  }

  /**
   * @description Reads a boolean query parameter.
   * @param name Parameter name.
   * @return Boolean Null when absent, otherwise Boolean.valueOf of the value.
   */
  public Boolean boolParam(String name) {
    String value = stringParam(name);
    return String.isBlank(value) ? null : Boolean.valueOf(value.trim());
  }

  /**
   * @description Reads a string query parameter.
   * @param name Parameter name.
   * @return String The raw value, or null when absent.
   */
  public String stringParam(String name) {
    if (req == null || req.params == null) {
      return null;
    }
    return req.params.get(name);
  }

  /**
   * @description Emits X-Total-Count and X-Has-More. X-Has-More is true when a full page was returned.
   * @param totalCount Total matching records.
   * @param returnedCount Records in this page.
   */
  public void paginate(Integer totalCount, Integer returnedCount) {
    header('X-Total-Count', String.valueOf(totalCount));
    header('X-Has-More', String.valueOf(returnedCount == pageLimit));
  }

  /**
   * @description Emits the Cache-Control directive for a policy.
   * @param policy The cache policy.
   */
  public void cache(CachePolicy policy) {
    header('Cache-Control', CACHE_DIRECTIVES.get(policy));
  }

  /**
   * @description Adds a response header.
   * @param name Header name.
   * @param value Header value.
   */
  public void header(String name, String value) {
    res.addHeader(name, value);
  }

  /**
   * @description Writes a 200 response with a JSON body.
   * @param body Object to serialise.
   */
  public void ok(Object body) {
    res.statusCode = 200;
    res.responseBody = Blob.valueOf(JSON.serialize(body));
  }

  /**
   * @description Writes the standard Error payload and marks the request rejected.
   * @param status HTTP status code.
   * @param errorCode Code from the SAPI Error enum.
   * @param message Human-readable message.
   */
  public void error(Integer status, String errorCode, String message) {
    rejected = true;
    res.statusCode = status;
    res.responseBody = Blob.valueOf(
      JSON.serialize(
        new Map<String, Object>{
          'httpStatus' => status,
          'errorCode' => errorCode,
          'message' => message,
          'correlationId' => correlationId,
          'retryable' => (status >= 500 ||
          status == 429)
        }
      )
    );
  }

  /**
   * @description Last non-empty path segment after the mapped resource prefix
   *              (/sapi|papi/v1/{resource}/...). Null when the URI has nothing after the resource.
   * @return String The trailing segment, e.g. "full" for /papi/v1/profile/full.
   */
  public String endpointSegment() {
    String uri = req?.requestURI;
    if (String.isBlank(uri)) {
      return null;
    }
    List<String> parts = new List<String>();
    for (String part : uri.split('/')) {
      if (String.isNotBlank(part)) {
        parts.add(part);
      }
    }
    Integer root = -1;
    for (Integer i = 0; i < parts.size(); i++) {
      if (parts[i] == 'sapi' || parts[i] == 'papi') {
        root = i;
        break;
      }
    }
    // root, version, resource: the endpoint segment starts after these three.
    if (root == -1 || parts.size() <= root + 3) {
      return null;
    }
    return parts[parts.size() - 1];
  }

  private void applyRequestRules() {
    String uri = req?.requestURI;
    ApiFamily family = familyOf(uri);

    header('Content-Type', 'application/json');

    String suppliedId = headerValue(HEADER_REQUEST_ID);
    Boolean idMissing = String.isBlank(suppliedId);
    Boolean idValid =
      !idMissing && UUID_PATTERN.matcher(suppliedId.trim()).matches();
    correlationId = idValid ? suppliedId.trim() : UUID.randomUUID().toString();
    header(HEADER_REQUEST_ID, correlationId);
    header(HEADER_API_VERSION, SUPPORTED_VERSION);

    System.debug(
      LoggingLevel.FINE,
      'ApiRequestContext platformRequestId=' +
        RequestUtil.getRequestId() +
        ' correlationId=' +
        correlationId
    );

    RateDecision decision = limiter()
      .check(tierKeyOf(family, uri), tierLimitOf(family, uri));
    header('X-RateLimit-Limit', String.valueOf(decision.limitPerMinute));
    header(
      'X-RateLimit-Remaining',
      String.valueOf(Math.max(0, decision.remaining))
    );
    if (!decision.allowed) {
      header('Retry-After', String.valueOf(decision.retryAfterSeconds));
      error(
        429,
        'RATE_LIMIT_EXCEEDED',
        'Rate limit exceeded. Retry after ' +
          decision.retryAfterSeconds +
          ' seconds.'
      );
      return;
    }

    if (idMissing && family != ApiFamily.PAPI) {
      error(400, 'BAD_REQUEST', 'X-Request-Id header is required.');
      return;
    }
    if (!idMissing && !idValid) {
      error(400, 'BAD_REQUEST', 'X-Request-Id must be a UUID.');
      return;
    }

    String version = headerValue(HEADER_API_VERSION);
    if (
      String.isNotBlank(version) && !SUPPORTED_VERSION.equals(version.trim())
    ) {
      error(400, 'BAD_REQUEST', 'Unsupported X-API-Version');
    }
  }

  private String headerValue(String name) {
    if (req == null || req.headers == null) {
      return null;
    }
    if (req.headers.containsKey(name)) {
      return req.headers.get(name);
    }
    // Header names are case-insensitive on the wire (HTTP/2 sends them lower-case).
    for (String key : req.headers.keySet()) {
      if (key != null && key.equalsIgnoreCase(name)) {
        return req.headers.get(key);
      }
    }
    return null;
  }

  private Integer parseInteger(String name, Integer defaultValue) {
    String raw = stringParam(name);
    if (String.isBlank(raw)) {
      return defaultValue;
    }
    try {
      return Integer.valueOf(raw.trim());
    } catch (TypeException e) {
      return null;
    }
  }

  private static ApiRateLimiter limiter() {
    return limiterOverride != null
      ? limiterOverride
      : new HeadersOnlyRateLimiter();
  }

  private static ApiFamily familyOf(String uri) {
    String path = String.isBlank(uri) ? '' : uri.toLowerCase();
    if (path.contains('/sapi/')) {
      return ApiFamily.SAPI;
    }
    if (path.contains('/papi/')) {
      return ApiFamily.PAPI;
    }
    return ApiFamily.UNKNOWN;
  }

  private static Boolean isAiPath(String uri) {
    return String.isNotBlank(uri) && uri.toLowerCase().contains('/papi/v1/ai/');
  }

  private static String tierKeyOf(ApiFamily family, String uri) {
    if (family == ApiFamily.SAPI) {
      return 'sapi';
    }
    return isAiPath(uri) ? 'papi-ai' : 'papi';
  }

  private static Integer tierLimitOf(ApiFamily family, String uri) {
    if (family == ApiFamily.SAPI) {
      return SAPI_LIMIT_PER_MINUTE;
    }
    return isAiPath(uri) ? PAPI_AI_LIMIT_PER_MINUTE : PAPI_LIMIT_PER_MINUTE;
  }
}

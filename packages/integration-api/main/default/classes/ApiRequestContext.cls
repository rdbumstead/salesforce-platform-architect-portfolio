/**
 * @description       : Per-request context shared by every SAPI and PAPI REST resource.
 *                      Owns tracing and version headers, pagination, error payloads,
 *                      cache directives and rate-limit headers. Reads X-API-Version
 *                      (v1 or v2, missing means v1), shapes v2 bodies to public keys only
 *                      and marks v1 as deprecated, then gone after its sunset date, from
 *                      two Portfolio_Setting__mdt records. Authentication is not
 *                      handled here: the platform rejects unauthenticated callers before
 *                      Apex runs (ADR-027). Writes one log line per request through
 *                      RequestUtil and PortfolioLog once the response is written.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
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
    PRIVATE_60,
    NO_STORE
  }

  private enum ApiFamily {
    SAPI,
    PAPI,
    UNKNOWN
  }

  public static final String SUPPORTED_VERSION = 'v1';
  public static final String VERSION_2 = 'v2';
  public static final String V2_REFERENCE_URL = 'https://ryanbumstead.com/api-lab/reference?version=v2';
  // Portfolio_Setting__mdt records holding a date as text, yyyy-MM-dd, read as 00:00 UTC.
  // Both ship blank. Blank deprecation date: no Deprecation header. Blank sunset date: no
  // Sunset header and no 410.
  public static final String V1_DEPRECATION_SETTING = 'Api_V1_Deprecation_Date';
  public static final String V1_SUNSET_SETTING = 'Api_V1_Sunset_Date';
  // The page sizes and the three tier limits are code defaults. The values in force come
  // from Portfolio_Setting__mdt through the accessors below.
  public static final Integer DEFAULT_LIMIT = 50;
  public static final Integer MAX_LIMIT = 200;
  public static final Integer DEFAULT_OFFSET = 0;
  public static final Integer SAPI_LIMIT_PER_MINUTE = 120;
  public static final Integer PAPI_LIMIT_PER_MINUTE = 15;
  public static final Integer PAPI_AI_LIMIT_PER_MINUTE = 10;

  // Paths a v1 caller can still reach after the sunset date, so a client with no version
  // header can get a token and see whether the API is up. They keep their deprecation
  // headers and are answered 200, never 410. Matched on the end of the path.
  @TestVisible
  private static final Set<String> SUNSET_EXEMPT_PATHS = new Set<String>{
    '/papi/v1/auth/token',
    '/sapi/v1/health',
    '/papi/v1/health'
  };

  // Paths whose body is not a list of records, so v2 leaves it as the resource wrote it.
  // Every other path returns records and has `id`, `xId` and `accomplishments` removed in v2.
  // A future field with those names on one of these paths would survive, on purpose.
  @TestVisible
  private static final Set<String> UNSHAPED_PATHS = new Set<String>{
    '/papi/v1/auth/token',
    '/sapi/v1/health',
    '/papi/v1/health',
    '/papi/v1/ai/generate',
    '/papi/v1/resume/generate',
    '/sapi/v1/portfolio-config'
  };

  private static final String HEADER_REQUEST_ID = 'X-Request-Id';
  private static final String HEADER_API_VERSION = 'X-API-Version';
  private static final Pattern UUID_PATTERN = Pattern.compile(
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  );
  // The id the platform injects on My Domain when the caller sends none.
  private static final Pattern PLATFORM_ID_PATTERN = Pattern.compile(
    '^[0-9a-fA-F]{32}$'
  );
  private static final Map<CachePolicy, String> CACHE_DIRECTIVES = new Map<CachePolicy, String>{
    CachePolicy.PUBLIC_300 => 'max-age=300, public',
    CachePolicy.PRIVATE_300 => 'max-age=300, private',
    CachePolicy.PRIVATE_60 => 'max-age=60, private',
    CachePolicy.NO_STORE => 'no-store, no-cache'
  };

  @TestVisible
  private static ApiRateLimiter limiterOverride;

  private final RestRequest req;
  private final RestResponse res;
  private String correlationId;
  private Boolean rejected = false;
  private Integer pageLimit = defaultPageSize();
  private final Long startedAt = System.currentTimeMillis();
  private Boolean logged = false;
  private String servedVersion = SUPPORTED_VERSION;
  private Boolean shapesRecords = true;

  // Tests set the clock here to cross the sunset date.
  @TestVisible
  private static Datetime nowOverride;

  // Off while tests run, so the v1 dates read as blank and no test depends on the dates set in
  // the org, or starts failing once the real sunset passes. A test of the dates turns it on.
  @TestVisible
  private static Boolean readConfiguredDates = !Test.isRunningTest();

  private static final List<String> WEEKDAYS = new List<String>{
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat'
  };
  private static final List<String> MONTHS = new List<String>{
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  };

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
   *              version and rate-limit rules. Runs no SOQL on data objects and no DML:
   *              the only query is the rate limiter's read of its own window row. Callers
   *              must return immediately when isRejected() is true.
   * @return ApiRequestContext The context for this request.
   */
  public static ApiRequestContext begin() {
    ApiRequestContext ctx = new ApiRequestContext(
      RestContext.request,
      RestContext.response
    );
    ctx.shapesRecords = !pathIn(
      UNSHAPED_PATHS,
      RestContext.request?.requestURI
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
   * @description The API version this request is served: v1 when the header is missing,
   *              otherwise the header's value. An unsupported value is answered 400 and
   *              reports v1.
   * @return String v1 or v2.
   */
  public String version() {
    return servedVersion;
  }

  /**
   * @description True when the request is served as v2 (public keys only).
   * @return Boolean True for v2.
   */
  public Boolean isV2() {
    return VERSION_2.equals(servedVersion);
  }

  // True when the path ends with one of the given paths, ignoring case and a trailing slash.
  private static Boolean pathIn(Set<String> paths, String uri) {
    if (String.isBlank(uri)) {
      return false;
    }
    String path = uri.toLowerCase().removeEnd('/');
    for (String candidate : paths) {
      if (path.endsWith(candidate)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @description The v1 deprecation date from the Api_V1_Deprecation_Date setting.
   * @return Date The date, or null when blank or not a yyyy-MM-dd date.
   */
  public static Date v1DeprecationDate() {
    return settingDate(V1_DEPRECATION_SETTING);
  }

  /**
   * @description The v1 sunset date from the Api_V1_Sunset_Date setting.
   * @return Date The date, or null when blank or not a yyyy-MM-dd date.
   */
  public static Date v1SunsetDate() {
    return settingDate(V1_SUNSET_SETTING);
  }

  /**
   * @description True when v1 has reached its sunset date (00:00 UTC), so every v1 call
   *              is answered 410. Always false while the setting is blank.
   * @return Boolean True when v1 is gone.
   */
  public static Boolean isV1Gone() {
    return isGone(v1SunsetDate());
  }

  private static Boolean isGone(Date sunset) {
    if (sunset == null) {
      return false;
    }
    Datetime now = nowOverride != null ? nowOverride : System.now();
    return now >= Datetime.newInstanceGmt(sunset, Time.newInstance(0, 0, 0, 0));
  }

  private static Date settingDate(String developerName) {
    if (!readConfiguredDates) {
      return null;
    }
    String raw = PortfolioSettings.getText(developerName, null);
    if (String.isBlank(raw)) {
      return null;
    }
    try {
      return Date.valueOf(raw.trim());
    } catch (TypeException e) {
      return null;
    }
  }

  /**
   * @description Adds Deprecation, Sunset and Link to a v1 response. Deprecation is a
   *              structured field date, @ and unix seconds (RFC 9745). Sunset is an HTTP
   *              date (RFC 8594). Link always names the v2 reference as successor-version,
   *              and as deprecation and sunset when those dates are set.
   */
  private void addDeprecationHeaders(Date deprecation, Date sunset) {
    List<String> links = new List<String>{
      '<' +
      V2_REFERENCE_URL +
      '>; rel="successor-version"'
    };
    if (deprecation != null) {
      Long seconds =
        Datetime.newInstanceGmt(deprecation, Time.newInstance(0, 0, 0, 0))
          .getTime() / 1000;
      header('Deprecation', '@' + seconds);
      links.add('<' + V2_REFERENCE_URL + '>; rel="deprecation"');
    }
    if (sunset != null) {
      header('Sunset', httpDate(sunset));
      links.add('<' + V2_REFERENCE_URL + '>; rel="sunset"');
    }
    appendHeader('Link', String.join(links, ', '));
  }

  // IMF-fixdate, for example Sun, 06 Nov 1994 00:00:00 GMT. Names are spelled here so the
  // running user's locale cannot change them. 1900-01-07 was a Sunday.
  private static String httpDate(Date value) {
    Integer weekday = Math.mod(
      Date.newInstance(1900, 1, 7).daysBetween(value),
      7
    );
    return WEEKDAYS[weekday] +
      ', ' +
      String.valueOf(value.day()).leftPad(2, '0') +
      ' ' +
      MONTHS[value.month() - 1] +
      ' ' +
      value.year() +
      ' 00:00:00 GMT';
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
   * @description Reads the limit query parameter (1 to maxPageSize(), default
   *              defaultPageSize(), today 200 and 50). Rejects with 400 when invalid.
   * @return Integer The limit, or null when the request was rejected.
   */
  public Integer limitParam() {
    if (rejected) {
      return null;
    }
    Integer maxSize = maxPageSize();
    Integer value = parseInteger('limit', defaultPageSize());
    if (value == null || value < 1 || value > maxSize) {
      error(
        400,
        'BAD_REQUEST',
        'Limit must be an integer between 1 and ' + maxSize + '.'
      );
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
   * @description Adds a value to a header that may already hold one, joined with a comma,
   *              instead of replacing it. A value already present is not added twice.
   * @param name Header name.
   * @param value Value to add.
   */
  public void appendHeader(String name, String value) {
    String existing = res.headers.get(name);
    if (String.isBlank(existing)) {
      res.addHeader(name, value);
    } else if (!existing.contains(value)) {
      res.addHeader(name, existing + ', ' + value);
    }
  }

  /**
   * @description Writes a 200 response with a JSON body. Also writes the rate-limit count
   *              recorded at begin(); this is the first DML the context performs, so any
   *              callout a resource makes must happen before ok() or error().
   *              A v2 request to a record path has its body shaped to public keys only first.
   *              Paths in UNSHAPED_PATHS return their body as written.
   * @param body Object to serialise.
   */
  public void ok(Object body) {
    commitRateCounts();
    res.statusCode = 200;
    res.responseBody = Blob.valueOf(
      JSON.serialize(
        isV2() && shapesRecords ? SAPITransformer.toV2(body) : body
      )
    );
    logRequest();
  }

  /**
   * @description Writes the standard Error payload and marks the request rejected.
   * @param status HTTP status code.
   * @param errorCode Code from the SAPI Error enum.
   * @param message Human-readable message.
   */
  public void error(Integer status, String errorCode, String message) {
    commitRateCounts();
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
    logRequest();
  }

  /**
   * @description Writes the one log line for this request (path, status, correlation id,
   *              elapsed ms) through RequestUtil and PortfolioLog. Runs once, after the
   *              response is written, so it never precedes a resource's callouts.
   */
  private void logRequest() {
    if (logged) {
      return;
    }
    logged = true;
    RequestUtil.logRequest(
      req?.requestURI,
      res?.statusCode,
      correlationId,
      System.currentTimeMillis() - startedAt
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
    // On PAPI the platform's own 32-hex id means the caller sent none.
    Boolean platformId =
      family == ApiFamily.PAPI &&
      String.isNotBlank(suppliedId) &&
      PLATFORM_ID_PATTERN.matcher(suppliedId.trim()).matches();
    Boolean idMissing = String.isBlank(suppliedId) || platformId;
    Boolean idValid =
      !idMissing && UUID_PATTERN.matcher(suppliedId.trim()).matches();
    correlationId = idValid ? suppliedId.trim() : UUID.randomUUID().toString();
    // The platform echoes whatever X-Request-Id the request carries on every response,
    // the id it injected included. So Apex sets the header only when it
    // generated the id and the request carried none, or the response gets two (id;id).
    if (!idValid && !platformId) {
      header(HEADER_REQUEST_ID, correlationId);
    }
    // The version and sunset checks come before the rate limiter, so a request refused for
    // them spends none of the shared quota.
    String requested = headerValue(HEADER_API_VERSION)?.trim().toLowerCase();
    Boolean versionKnown =
      String.isBlank(requested) ||
      SUPPORTED_VERSION.equals(requested) ||
      VERSION_2.equals(requested);
    if (versionKnown && String.isNotBlank(requested)) {
      servedVersion = requested;
    }
    header(HEADER_API_VERSION, servedVersion);
    // The body differs by version, so a shared cache must key on the header.
    appendHeader('Vary', HEADER_API_VERSION);
    if (!versionKnown) {
      error(400, 'BAD_REQUEST', 'Unsupported X-API-Version');
      return;
    }
    if (!isV2()) {
      // Each date is read and parsed once for this request.
      Date deprecation = v1DeprecationDate();
      Date sunset = v1SunsetDate();
      addDeprecationHeaders(deprecation, sunset);
      if (isGone(sunset) && !pathIn(SUNSET_EXEMPT_PATHS, uri)) {
        error(
          410,
          'GONE',
          'API v1 has been retired. Send X-API-Version: v2. See ' +
          V2_REFERENCE_URL
        );
        return;
      }
    }

    System.debug(
      LoggingLevel.FINE,
      'ApiRequestContext platformRequestId=' +
        RequestUtil.getRequestId() +
        ' correlationId=' +
        correlationId
    );

    RateDecision decision = rateLimiter()
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

  /**
   * @description Writes the rate-limit counts recorded in this transaction and not yet saved.
   *              ok() and error() call it; a caller with no REST response (an Aura method
   *              that used rateLimiter().checkKey) calls it itself, after its last callout.
   *              No-op when nothing is pending or the active limiter keeps no state.
   */
  public static void commitRateCounts() {
    RateWindowLimiter.commitPending();
  }

  /**
   * @description The rate limiter in force: the test override when set, else the default store.
   *              Callers with their own key (e.g. the token endpoint) use checkKey on it.
   * @return ApiRateLimiter The limiter.
   */
  public static ApiRateLimiter rateLimiter() {
    return limiterOverride != null ? limiterOverride : new RateWindowLimiter();
  }

  /**
   * @description Largest limit a caller may ask for: the Api_Max_Page_Size setting, else
   *              MAX_LIMIT.
   * @return Integer The largest page size.
   */
  public static Integer maxPageSize() {
    return PortfolioSettings.getInteger('Api_Max_Page_Size', MAX_LIMIT);
  }

  /**
   * @description Page size when the caller sends no limit: the Api_Default_Page_Size
   *              setting, else DEFAULT_LIMIT. Never more than maxPageSize(), so a caller
   *              who sends no limit is never refused.
   * @return Integer The default page size.
   */
  public static Integer defaultPageSize() {
    Integer value = PortfolioSettings.getInteger(
      'Api_Default_Page_Size',
      DEFAULT_LIMIT
    );
    return Math.min(value, maxPageSize());
  }

  /**
   * @description Requests per minute for one SAPI caller: the Api_Sapi_Rate_Per_Minute
   *              setting, else SAPI_LIMIT_PER_MINUTE.
   * @return Integer The SAPI tier limit.
   */
  public static Integer sapiLimitPerMinute() {
    return PortfolioSettings.getInteger(
      'Api_Sapi_Rate_Per_Minute',
      SAPI_LIMIT_PER_MINUTE
    );
  }

  /**
   * @description Requests per minute for one PAPI caller: the Api_Papi_Rate_Per_Minute
   *              setting, else PAPI_LIMIT_PER_MINUTE.
   * @return Integer The PAPI tier limit.
   */
  public static Integer papiLimitPerMinute() {
    return PortfolioSettings.getInteger(
      'Api_Papi_Rate_Per_Minute',
      PAPI_LIMIT_PER_MINUTE
    );
  }

  /**
   * @description AI generation requests per minute for one caller: the
   *              Api_Ai_Rate_Per_Minute setting, else PAPI_AI_LIMIT_PER_MINUTE.
   * @return Integer The AI tier limit.
   */
  public static Integer aiLimitPerMinute() {
    return PortfolioSettings.getInteger(
      'Api_Ai_Rate_Per_Minute',
      PAPI_AI_LIMIT_PER_MINUTE
    );
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
      return sapiLimitPerMinute();
    }
    return isAiPath(uri) ? aiLimitPerMinute() : papiLimitPerMinute();
  }
}

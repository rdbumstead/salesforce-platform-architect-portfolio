/**
 * @description       : Per-request context shared by every SAPI and PAPI REST resource.
 *                      Owns tracing and version headers, pagination, error payloads,
 *                      cache directives and rate-limit headers. Reads X-API-Version
 *                      (v1 or v2, missing means v1), shapes v2 bodies to public keys only
 *                      and marks v1 as deprecated, then gone after its sunset date, from
 *                      two Portfolio_Setting__mdt records. Turns any request URI into one
 *                      canonical versionless path (canonicalPath), so /papi/v1/health and
 *                      /papi/health are treated alike, and marks the old /v1/ spellings as
 *                      aliases with their own retirement dates (ADR-040). Authentication is not
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
  private static final String APEX_REST_PREFIX = '/services/apexrest';
  // The version segment the old URL spelling carried.
  private static final String LEGACY_SEGMENT = 'v1';
  public static final String V2_REFERENCE_URL = 'https://ryanbumstead.com/api-lab/reference?version=v2';
  // Portfolio_Setting__mdt records holding a date as text, yyyy-MM-dd, read as 00:00 UTC.
  // Both ship blank. Blank deprecation date: no Deprecation header. Blank sunset date: no
  // Sunset header and no 410.
  public static final String V1_DEPRECATION_SETTING = 'Api_V1_Deprecation_Date';
  public static final String V1_SUNSET_SETTING = 'Api_V1_Sunset_Date';
  // The same two settings for the old /v1/ URL spelling (ADR-040), independent of the version
  // settings above. Both ship blank. Blank changes nothing.
  public static final String V1_PATH_DEPRECATION_SETTING = 'Api_V1_Path_Deprecation_Date';
  public static final String V1_PATH_SUNSET_SETTING = 'Api_V1_Path_Sunset_Date';
  // The page sizes and the three tier limits are code defaults. The values in force come
  // from Portfolio_Setting__mdt through the accessors below.
  public static final Integer DEFAULT_LIMIT = 50;
  public static final Integer MAX_LIMIT = 200;
  public static final Integer DEFAULT_OFFSET = 0;
  // The platform allows no SOQL OFFSET above 2000, so a larger value is refused with a 400
  // instead of reaching the query and coming back as a 500.
  public static final Integer MAX_OFFSET = 2000;
  // Seconds a caller is told to wait after a 503 that can recover.
  public static final Integer DEFAULT_RETRY_AFTER_SECONDS = 60;
  public static final Integer SAPI_LIMIT_PER_MINUTE = 120;
  public static final Integer PAPI_LIMIT_PER_MINUTE = 15;
  public static final Integer PAPI_AI_LIMIT_PER_MINUTE = 10;

  // Canonical paths (see canonicalPath) a caller can still reach after the version sunset or
  // the path sunset, so a client with no version header, or one still on a /v1/ URL, can get
  // a token and see whether the API is up. They keep their deprecation headers and are
  // answered 200, never 410. The old /v1/ spelling of each is the same path.
  @TestVisible
  private static final Set<String> SUNSET_EXEMPT_PATHS = new Set<String>{
    '/papi/auth/token',
    '/sapi/health',
    '/papi/health'
  };

  // Paths whose body is not a list of records, so v2 leaves it as the resource wrote it.
  // Every other path returns records and has `id`, `xId` and `accomplishments` removed in v2.
  // A future field with those names on one of these paths would survive, on purpose.
  // Canonical paths, so the /v1/ spelling of each is unshaped too.
  @TestVisible
  private static final Set<String> UNSHAPED_PATHS = new Set<String>{
    '/papi/auth/token',
    '/sapi/health',
    '/papi/health',
    '/papi/ai/generate',
    '/papi/resume/generate',
    '/sapi/portfolio-config'
  };

  // REMOVE WITH THE SWITCH. The request handling as it was before the versionless URLs
  // (ADR-040), taken from main 1c7a577d. While Api_Versionless_Urls is Off every decision below
  // goes through it, so Off behaves as that build did. Cleanup condition: after the v1 sunset on
  // 2026-11-29, once the versionless URLs have run cleanly, remove the switch, this block, the
  // legacy* methods and their tests in one change.
  @TestVisible
  private static final Set<String> LEGACY_SUNSET_EXEMPT_PATHS = new Set<String>{
    '/papi/v1/auth/token',
    '/sapi/v1/health',
    '/papi/v1/health'
  };

  @TestVisible
  private static final Set<String> LEGACY_UNSHAPED_PATHS = new Set<String>{
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
  private String canonical;
  private String rawUri;
  // REMOVE WITH THE SWITCH. True while Api_Versionless_Urls is not Off. False sends every path
  // decision through the legacy logic.
  private Boolean modern = true;
  private Boolean legacyPath = false;

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
    // True when the decision is a refusal because the counter row stayed locked, not because
    // the caller used up the limit.
    public Boolean busy = false;

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
    String uri = RestContext.request?.requestURI;
    ctx.canonical = canonicalPath(uri);
    ctx.rawUri = uri;
    // The one place the switch is read for the shared path handling. Off, the /v1/ URLs are the
    // only URLs, so none is an alias (no canonical Link, no path dates, no path 410) and every
    // path decision below uses the legacy logic (ADR-040).
    ctx.modern = ApiRoutes.isVersionless();
    ctx.legacyPath = isLegacyPath(uri) && ctx.modern;
    ctx.shapesRecords = !ctx.isUnshaped();
    try {
      ctx.applyRequestRules();
    } catch (Exception e) {
      // A failure while the rules run (the rate window row, for one) must not reach the
      // platform, which would answer with the exception type and stack lines.
      ctx.serverError(e);
    }
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

  /**
   * @description Turns a request URI into its canonical path: the API root (sapi or papi),
   *              then the resource, with any version segment right after the root removed,
   *              lower case, no query and no trailing slash. /services/apexrest/papi/v1/health
   *              and /services/apexrest/papi/health both give /papi/health. A URI with no
   *              sapi or papi segment is lower cased and trimmed only.
   * @param uri A request URI, for example RestRequest.requestURI.
   * @return String The canonical path, or null when the URI is blank.
   */
  public static String canonicalPath(String uri) {
    List<String> parts = uriSegments(uri, true);
    if (parts.isEmpty()) {
      return null;
    }
    Integer root = rootIndex(parts);
    List<String> kept = new List<String>();
    for (Integer i = Math.max(root, 0); i < parts.size(); i++) {
      if (!(root != -1 && i == root + 1 && LEGACY_SEGMENT == parts[i])) {
        kept.add(parts[i]);
      }
    }
    return '/' + String.join(kept, '/');
  }

  /**
   * @description True when the URI is an old /v1/ spelling: the segment right after sapi
   *              or papi is v1, in any letter case.
   * @param uri A request URI.
   * @return Boolean True for an old URL, false for a versionless one or a blank URI.
   */
  public static Boolean isLegacyPath(String uri) {
    List<String> parts = uriSegments(uri, true);
    Integer root = rootIndex(parts);
    return root != -1 &&
      root + 1 < parts.size() &&
      LEGACY_SEGMENT == parts[root + 1];
  }

  /**
   * @description The versionless spelling of a request URI: the same URI with the v1
   *              segment after sapi or papi removed, the prefix and letter case kept.
   *              A URI that is already versionless comes back without a trailing slash.
   * @param uri A request URI.
   * @return String For example /services/apexrest/papi/projects, or null when blank.
   */
  public static String versionlessUri(String uri) {
    List<String> parts = uriSegments(uri, false);
    if (parts.isEmpty()) {
      return null;
    }
    Integer root = rootIndex(parts);
    if (
      root != -1 &&
      root + 1 < parts.size() &&
      LEGACY_SEGMENT == parts[root + 1].toLowerCase()
    ) {
      parts.remove(root + 1);
    }
    return '/' + String.join(parts, '/');
  }

  // On the platform RestRequest.requestURI starts after /services/apexrest (for example
  // /sapi/v1/skills), so a link built from it would not be a working URL. This puts the prefix
  // back, with the site's path prefix when the call came through the Experience Cloud site.
  // A URI that already carries it (a test sets one that does) is left alone.
  private static String withPlatformPrefix(String path) {
    if (path == null || path.toLowerCase().contains(APEX_REST_PREFIX)) {
      return path;
    }
    return (Site.getPathPrefix() ?? '') + APEX_REST_PREFIX + path;
  }

  private static List<String> uriSegments(String uri, Boolean lowerCase) {
    List<String> parts = new List<String>();
    if (String.isBlank(uri)) {
      return parts;
    }
    for (String part : uri.substringBefore('?').split('/')) {
      if (String.isNotBlank(part)) {
        parts.add(lowerCase ? part.trim().toLowerCase() : part.trim());
      }
    }
    return parts;
  }

  private static Integer rootIndex(List<String> parts) {
    for (Integer i = 0; i < parts.size(); i++) {
      String part = parts[i].toLowerCase();
      if (part == 'sapi' || part == 'papi') {
        return i;
      }
    }
    return -1;
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

  /**
   * @description The path deprecation date from the Api_V1_Path_Deprecation_Date setting.
   * @return Date The date, or null when blank or not a yyyy-MM-dd date.
   */
  public static Date v1PathDeprecationDate() {
    return settingDate(V1_PATH_DEPRECATION_SETTING);
  }

  /**
   * @description The path sunset date from the Api_V1_Path_Sunset_Date setting.
   * @return Date The date, or null when blank or not a yyyy-MM-dd date.
   */
  public static Date v1PathSunsetDate() {
    return settingDate(V1_PATH_SUNSET_SETTING);
  }

  /**
   * @description True when the old /v1/ URL spelling has reached its sunset date (00:00 UTC),
   *              so a call on it is answered 410. Always false while the setting is blank.
   * @return Boolean True when the /v1/ URLs are gone.
   */
  public static Boolean isV1PathGone() {
    return isGone(v1PathSunsetDate());
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
   * @description Adds Deprecation, Sunset and Link to a response that is retiring something.
   *              Two things can retire: API v1 (a v1 version header or none, ADR-039) and the
   *              old /v1/ URL spelling (ADR-040). Each has its own dates. Deprecation is a
   *              structured field date, @ and unix seconds (RFC 9745). Sunset is an HTTP date
   *              (RFC 8594). When both apply the response carries the earlier date of each,
   *              because that is the day this exact request first stops working. Link names
   *              the v2 reference as successor-version (and as deprecation and sunset when
   *              those version dates are set) when the version applies, and the versionless
   *              URL as canonical (RFC 6596) when the old spelling was used.
   */
  private void addRetirementHeaders(
    Boolean versionApplies,
    Date versionDeprecation,
    Date versionSunset,
    Date pathDeprecation,
    Date pathSunset
  ) {
    List<String> links = new List<String>();
    if (versionApplies) {
      links.add('<' + V2_REFERENCE_URL + '>; rel="successor-version"');
      if (versionDeprecation != null) {
        links.add('<' + V2_REFERENCE_URL + '>; rel="deprecation"');
      }
      if (versionSunset != null) {
        links.add('<' + V2_REFERENCE_URL + '>; rel="sunset"');
      }
    }
    if (legacyPath) {
      links.add('<' + versionlessTarget() + '>; rel="canonical"');
    }
    Date deprecation = earlier(
      versionApplies ? versionDeprecation : null,
      legacyPath ? pathDeprecation : null
    );
    Date sunset = earlier(
      versionApplies ? versionSunset : null,
      legacyPath ? pathSunset : null
    );
    if (deprecation != null) {
      Long seconds =
        Datetime.newInstanceGmt(deprecation, Time.newInstance(0, 0, 0, 0))
          .getTime() / 1000;
      header('Deprecation', '@' + seconds);
    }
    if (sunset != null) {
      header('Sunset', httpDate(sunset));
    }
    if (!links.isEmpty()) {
      appendHeader('Link', String.join(links, ', '));
    }
  }

  private static Date earlier(Date first, Date second) {
    if (first == null || second == null) {
      return first != null ? first : second;
    }
    return first < second ? first : second;
  }

  /**
   * @description The same request on the versionless URL: the path with the v1 segment
   *              removed, and for a GET the query string rebuilt from the parameters, keys
   *              in order. Only a GET carries its query, because a POST's parameters can
   *              come from a form body.
   */
  private String versionlessTarget() {
    String target = withPlatformPrefix(versionlessUri(req?.requestURI));
    if (
      target == null ||
      req == null ||
      req.params == null ||
      req.params.isEmpty() ||
      req.httpMethod != 'GET'
    ) {
      return target;
    }
    List<String> names = new List<String>(req.params.keySet());
    names.sort();
    List<String> pairs = new List<String>();
    for (String name : names) {
      String value = req.params.get(name);
      pairs.add(
        EncodingUtil.urlEncode(name, 'UTF-8') +
          '=' +
          EncodingUtil.urlEncode(value == null ? '' : value, 'UTF-8')
      );
    }
    return target + '?' + String.join(pairs, '&');
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
      error(400, 'BAD_REQUEST', ApiMessages.limitInvalid(maxSize));
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
    if (value == null || value < 0 || value > MAX_OFFSET) {
      error(400, 'BAD_REQUEST', ApiMessages.offsetInvalid(MAX_OFFSET));
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
    commitCountsSafely();
    res.statusCode = 200;
    res.responseBody = Blob.valueOf(
      JSON.serialize(
        isV2() && shapesRecords ? SAPITransformer.toV2(body) : body
      )
    );
    logRequest();
  }

  /**
   * @description Writes the standard Error payload and marks the request rejected. The
   *              error is retryable when it is a 429 or a 5xx.
   * @param status HTTP status code.
   * @param errorCode Code from the Error schema's errorCode enum.
   * @param message Human-readable message.
   */
  public void error(Integer status, String errorCode, String message) {
    error(status, errorCode, message, status >= 500 || status == 429);
  }

  /**
   * @description Writes the standard Error payload, with a help link to the code's entry on
   *              the API reference, and marks the request rejected. A 503 that is retryable
   *              and has no Retry-After yet gets one of 60 seconds.
   * @param status HTTP status code.
   * @param errorCode Code from the SAPI Error enum.
   * @param message Human-readable message.
   * @param retryable True only when the same request can succeed later with no change.
   */
  public void error(
    Integer status,
    String errorCode,
    String message,
    Boolean retryable
  ) {
    commitCountsSafely();
    rejected = true;
    res.statusCode = status;
    if (
      status == 503 &&
      retryable &&
      res.headers != null &&
      !res.headers.containsKey('Retry-After')
    ) {
      header('Retry-After', String.valueOf(DEFAULT_RETRY_AFTER_SECONDS));
    }
    res.responseBody = Blob.valueOf(
      JSON.serialize(
        new Map<String, Object>{
          'httpStatus' => status,
          'errorCode' => errorCode,
          'message' => message,
          'correlationId' => correlationId,
          'retryable' => retryable,
          'help' => ApiMessages.helpUrl(
            errorCode,
            familyOf(req?.requestURI) == ApiFamily.SAPI ? 'sapi' : 'papi'
          )
        }
      )
    );
    logRequest();
  }

  /**
   * @description Answers an exception nobody planned for with 500. The caller gets a fixed
   *              message and the correlation id, never the exception's text. The exception
   *              type and message are logged under that id.
   * @param e The exception.
   */
  public void serverError(Exception e) {
    if (correlationId == null) {
      correlationId = UUID.randomUUID().toString();
    }
    PortfolioLog.info(
      'api error correlationId=' +
        correlationId +
        ' type=' +
        e.getTypeName() +
        ' message=' +
        String.valueOf(e.getMessage()).left(200)
    );
    error(500, 'INTERNAL_SERVER_ERROR', ApiMessages.serverError(correlationId));
  }

  // The rate counts are bookkeeping. A failure to save them must not turn an answer into an
  // escaped exception.
  private static void commitCountsSafely() {
    try {
      commitRateCounts();
    } catch (Exception e) {
      PortfolioLog.info('api rate count not saved type=' + e.getTypeName());
    }
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
      logPath(),
      res?.statusCode,
      correlationId,
      System.currentTimeMillis() - startedAt,
      legacyPath
    );
  }

  /**
   * @description Last non-empty path segment after the resource
   *              (/sapi|papi/{resource}/...), the same for the versionless URL and its /v1/
   *              alias, letter case kept. Null when the URI has nothing after the resource.
   * @return String The trailing segment, e.g. "full" for /papi/profile/full.
   */
  public String endpointSegment() {
    if (!modern) {
      return legacyEndpointSegment();
    }
    List<String> parts = uriSegments(versionlessUri(req?.requestURI), false);
    Integer root = rootIndex(parts);
    // root, resource: the endpoint segment starts after these two.
    if (root == -1 || parts.size() <= root + 2) {
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
      error(400, 'BAD_REQUEST', ApiMessages.VERSION_UNSUPPORTED);
      return;
    }
    Boolean versionApplies = !isV2();
    if (versionApplies || legacyPath) {
      // Each date is read and parsed once for this request. The version dates apply to a v1
      // call and the path dates to an old /v1/ URL. A call can be both.
      Date versionDeprecation = versionApplies ? v1DeprecationDate() : null;
      Date versionSunset = versionApplies ? v1SunsetDate() : null;
      Date pathDeprecation = legacyPath ? v1PathDeprecationDate() : null;
      Date pathSunset = legacyPath ? v1PathSunsetDate() : null;
      addRetirementHeaders(
        versionApplies,
        versionDeprecation,
        versionSunset,
        pathDeprecation,
        pathSunset
      );
      Boolean versionGone = isGone(versionSunset);
      Boolean pathGone = isGone(pathSunset);
      if ((versionGone || pathGone) && !isSunsetExempt()) {
        error(
          410,
          'GONE',
          goneMessage(
            versionGone ? versionSunset : null,
            pathGone ? pathSunset : null
          )
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
      .check(tierKeyOf(family, isAi()), tierLimitOf(family, isAi()));
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
        decision.busy
          ? ApiMessages.LOCK_BUSY
          : ApiMessages.tierLimit(
              tierLabelOf(family, isAi()),
              decision.limitPerMinute,
              decision.retryAfterSeconds
            )
      );
      return;
    }

    if (idMissing && family != ApiFamily.PAPI) {
      error(400, 'BAD_REQUEST', ApiMessages.REQUEST_ID_MISSING);
      return;
    }
    if (!idMissing && !idValid) {
      error(400, 'BAD_REQUEST', ApiMessages.REQUEST_ID_INVALID);
      return;
    }
  }

  // Each message names its retirement date. The path message names the versionless URL
  // without its query, so no parameter value is echoed back. A date is null when that
  // retirement does not apply to this request.
  private String goneMessage(Date versionSunset, Date pathSunset) {
    List<String> parts = new List<String>();
    if (versionSunset != null) {
      parts.add(ApiMessages.versionGone(versionSunset));
    }
    if (pathSunset != null) {
      parts.add(
        ApiMessages.pathGone(
          pathSunset,
          withPlatformPrefix(versionlessUri(req?.requestURI))
        )
      );
    }
    return String.join(parts, ' ');
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

  private static String tierLabelOf(ApiFamily family, Boolean ai) {
    if (family == ApiFamily.SAPI) {
      return 'SAPI';
    }
    return ai ? 'AI' : 'PAPI';
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

  // The path decisions. Each one picks the new logic (canonical paths) or the legacy logic from
  // the one flag set in begin(). Delete the legacy branch of each with the switch.
  private Boolean isUnshaped() {
    return modern
      ? UNSHAPED_PATHS.contains(canonical)
      : legacyPathIn(LEGACY_UNSHAPED_PATHS, rawUri);
  }

  private Boolean isSunsetExempt() {
    return modern
      ? SUNSET_EXEMPT_PATHS.contains(canonical)
      : legacyPathIn(LEGACY_SUNSET_EXEMPT_PATHS, rawUri);
  }

  private Boolean isAi() {
    return modern
      ? isAiPath(canonical)
      : String.isNotBlank(rawUri) &&
        rawUri.toLowerCase().contains('/papi/v1/ai/');
  }

  private String logPath() {
    return modern ? canonical : rawUri;
  }

  private static Boolean isAiPath(String canonicalUri) {
    return canonicalUri != null && canonicalUri.startsWith('/papi/ai/');
  }

  private static String tierKeyOf(ApiFamily family, Boolean ai) {
    if (family == ApiFamily.SAPI) {
      return 'sapi';
    }
    return ai ? 'papi-ai' : 'papi';
  }

  private static Integer tierLimitOf(ApiFamily family, Boolean ai) {
    if (family == ApiFamily.SAPI) {
      return sapiLimitPerMinute();
    }
    return ai ? aiLimitPerMinute() : papiLimitPerMinute();
  }

  // REMOVE WITH THE SWITCH. True when the path ends with one of the given paths, ignoring case
  // and a trailing slash. As main 1c7a577d had it.
  private static Boolean legacyPathIn(Set<String> paths, String uri) {
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

  // REMOVE WITH THE SWITCH. The endpoint segment as main 1c7a577d had it: root, version,
  // resource, then the segment.
  private String legacyEndpointSegment() {
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
    if (root == -1 || parts.size() <= root + 3) {
      return null;
    }
    return parts[parts.size() - 1];
  }
}

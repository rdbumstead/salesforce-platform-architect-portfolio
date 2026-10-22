/**
 * @description       : Apex proxy for the site's API Lab (ADR-027). invoke() calls an
 *                      allowlisted SAPI/PAPI GET path through the Portfolio_API Named
 *                      Credential and returns status, latency, tracing and paging headers and
 *                      the body. requestEvaluatorToken() vends a token through the same
 *                      TokenExchangeService path as POST /papi/v1/auth/token.
 *                      generateCoverLetter() is the site's cover letter path (PD-D3 b): it posts
 *                      to /papi/v1/ai/generate through the same Named Credential, so the letter
 *                      is written by the integration user under the API's validation and its
 *                      10 per minute ai tier, and the guest needs no AI grant.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [ApiLabControllerTest]
 **/
public with sharing class ApiLabController {
  public static final String NAMED_CREDENTIAL = 'Portfolio_API';
  public static final String API_VERSION = 'v1';

  /** GET paths in salesforce-sapi.yaml and portfolio-papi.yaml. */
  public static final Set<String> ALLOWED_PATHS = new Set<String>{
    '/sapi/v1/health',
    '/sapi/v1/contacts',
    '/sapi/v1/experience',
    '/sapi/v1/experience-highlights',
    '/sapi/v1/projects',
    '/sapi/v1/project-assets',
    '/sapi/v1/testimonials',
    '/sapi/v1/portfolio-config',
    '/sapi/v1/accounts',
    '/sapi/v1/skills',
    '/sapi/v1/certifications',
    '/sapi/v1/education',
    '/sapi/v1/project-skills',
    '/sapi/v1/experience-skills',
    '/sapi/v1/certification-skills',
    '/papi/v1/health',
    '/papi/v1/profile/full',
    '/papi/v1/profile/summary',
    '/papi/v1/resume/generate',
    '/papi/v1/projects/featured',
    '/papi/v1/testimonials/feed'
  };

  /** Response headers returned to the API Lab. */
  public static final List<String> RETURNED_HEADERS = new List<String>{
    'X-Request-Id',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'Cache-Control',
    'X-Total-Count',
    'X-Has-More'
  };

  /** The one POST path generateCoverLetter() calls. Not part of the GET allowlist. */
  public static final String AI_GENERATE_PATH = '/papi/v1/ai/generate';

  /**
   * Proxy callout timeout, 90 s. It must outlast the Gemini callout timeout (60 s) plus the
   * PAPI overhead, so a slow model falls through to the local template inside PAPI and the
   * page still gets a letter, instead of this callout failing first. Apex allows 120 s.
   */
  public static final Integer AI_TIMEOUT_MS = 90000;

  /** Cover letter length asked of the API, the spec maximum. */
  public static final Integer COVER_LETTER_MAX_LENGTH = 1000;
  public static final Integer MAX_COMPANY_LENGTH = 120;
  public static final Integer MAX_TITLE_LENGTH = 120;
  public static final Integer MAX_DESCRIPTION_LENGTH = 4000;

  private static final String APEX_REST_PATH = '/services/apexrest';
  private static final Pattern PARAM_NAME = Pattern.compile(
    '^[A-Za-z][A-Za-z0-9_]{0,39}$'
  );
  private static final Integer MAX_PARAMS = 10;
  private static final Integer MAX_PARAM_VALUE_LENGTH = 200;

  /**
   * @description Result of one proxied call.
   */
  public class InvokeResult {
    @AuraEnabled
    public Integer statusCode;
    @AuraEnabled
    public Long latencyMs;
    @AuraEnabled
    public Map<String, String> headers;
    @AuraEnabled
    public String body;
    @AuraEnabled
    public String namedCredential;
    @AuraEnabled
    public String requestId;
    @AuraEnabled
    public String path;
  }

  /**
   * @description Result of an evaluator token request from the API Lab.
   */
  public class TokenResult {
    @AuraEnabled
    public Integer statusCode;
    @AuraEnabled
    public String errorCode;
    @AuraEnabled
    public String message;
    @AuraEnabled
    public Integer retryAfterSeconds;
    @AuraEnabled
    public Map<String, Object> token;
    @AuraEnabled
    public String correlationId;
  }

  /**
   * @description One provider attempt reported by /papi/v1/ai/generate.
   */
  public class AttemptView {
    @AuraEnabled
    public String provider;
    @AuraEnabled
    public String outcome;
    @AuraEnabled
    public Long ms;
  }

  /**
   * @description A cover letter from /papi/v1/ai/generate, with what the show-your-work
   *              panel needs. Every value is read from the API response.
   */
  public class CoverLetterResult {
    @AuraEnabled
    public String content;
    @AuraEnabled
    public String provider;
    @AuraEnabled
    public String model;
    @AuraEnabled
    public Boolean fallbackOccurred;
    /** Round trip measured here, API call included. */
    @AuraEnabled
    public Long latencyMs;
    /** Dispatch time reported by the API. */
    @AuraEnabled
    public Long generationMs;
    @AuraEnabled
    public List<AttemptView> attempts;
    @AuraEnabled
    public String promptShown;
    @AuraEnabled
    public String requestId;
  }

  /**
   * @description Calls an allowlisted GET path through Portfolio_API with a fresh
   *              X-Request-Id and X-API-Version v1.
   * @param path API path, e.g. /sapi/v1/skills.
   * @param params Query parameters (at most 10; names alphanumeric).
   * @return InvokeResult Status, latency, headers, body and the Named Credential name.
   * @throws AuraHandledException When the path or a parameter is not allowed, or the callout fails.
   */
  @AuraEnabled
  public static InvokeResult invoke(String path, Map<String, String> params) {
    String normalised = String.isBlank(path) ? '' : path.trim().toLowerCase();
    if (!ALLOWED_PATHS.contains(normalised)) {
      throw auraError('Path is not available in the API Lab: ' + path);
    }
    String query = buildQuery(params);
    String requestId = UUID.randomUUID().toString();

    HttpRequest req = new HttpRequest();
    req.setEndpoint(
      'callout:' + NAMED_CREDENTIAL + APEX_REST_PATH + normalised + query
    );
    req.setMethod('GET');
    req.setTimeout(20000);
    req.setHeader('X-Request-Id', requestId);
    req.setHeader('X-API-Version', API_VERSION);
    req.setHeader('Accept', 'application/json');

    Long started = System.currentTimeMillis();
    HttpResponse res;
    try {
      res = new Http().send(req);
    } catch (CalloutException e) {
      throw auraError('The API could not be reached: ' + e.getMessage());
    }

    InvokeResult result = new InvokeResult();
    result.latencyMs = System.currentTimeMillis() - started;
    result.statusCode = res.getStatusCode();
    result.body = res.getBody();
    result.namedCredential = NAMED_CREDENTIAL;
    result.requestId = requestId;
    result.path = normalised;
    result.headers = new Map<String, String>();
    for (String name : RETURNED_HEADERS) {
      String value = res.getHeader(name);
      if (value != null) {
        result.headers.put(name, value);
      }
    }
    return result;
  }

  /**
   * @description Writes a cover letter through POST /papi/v1/ai/generate as the integration
   *              user. Writes nothing and checks no limiter here: the API counts the request
   *              against its ai tier in its own transaction (contracts C2 and C4).
   * @param companyName Company the letter is for, at most 120 characters.
   * @param jobTitle Job title, at most 120 characters.
   * @param jobDescription Job description, optional, at most 4000 characters.
   * @return CoverLetterResult Content, provider, model, fallback, latency, attempts, prompt.
   * @throws AuraHandledException On invalid input, a 4xx or 5xx answer, or a callout failure.
   */
  @AuraEnabled
  public static CoverLetterResult generateCoverLetter(
    String companyName,
    String jobTitle,
    String jobDescription
  ) {
    String company = requireText(
      companyName,
      'Company name',
      MAX_COMPANY_LENGTH
    );
    String title = requireText(jobTitle, 'Job title', MAX_TITLE_LENGTH);
    String description = String.isBlank(jobDescription)
      ? null
      : jobDescription.trim();
    if (description != null && description.length() > MAX_DESCRIPTION_LENGTH) {
      throw auraError(
        'Job description can be at most ' +
          MAX_DESCRIPTION_LENGTH +
          ' characters.'
      );
    }

    Map<String, Object> context = new Map<String, Object>{
      'companyName' => company,
      'role' => title
    };
    if (description != null) {
      context.put('jobDescription', description);
    }
    String requestId = UUID.randomUUID().toString();
    HttpRequest req = new HttpRequest();
    req.setEndpoint(
      'callout:' + NAMED_CREDENTIAL + APEX_REST_PATH + AI_GENERATE_PATH
    );
    req.setMethod('POST');
    req.setTimeout(AI_TIMEOUT_MS);
    req.setHeader('X-Request-Id', requestId);
    req.setHeader('X-API-Version', API_VERSION);
    req.setHeader('Accept', 'application/json');
    req.setHeader('Content-Type', 'application/json');
    req.setBody(
      JSON.serialize(
        new Map<String, Object>{
          'type' => 'CoverLetter',
          'tone' => 'Professional',
          'maxLength' => COVER_LETTER_MAX_LENGTH,
          'context' => context
        }
      )
    );

    Long started = System.currentTimeMillis();
    HttpResponse res;
    try {
      res = new Http().send(req);
    } catch (CalloutException e) {
      throw auraError(
        'The cover letter service could not be reached: ' + e.getMessage()
      );
    }
    Long latencyMs = System.currentTimeMillis() - started;

    Integer status = res.getStatusCode();
    if (status != 200) {
      throw auraError(coverLetterError(status, res.getBody()));
    }
    CoverLetterResult result = toCoverLetterResult(res.getBody());
    result.latencyMs = latencyMs;
    result.requestId = requestId;
    return result;
  }

  /**
   * @description Requests an evaluator token through the same validation, rate limit,
   *              daily cap, exchange and audit path as POST /papi/v1/auth/token.
   * @param email Evaluator email.
   * @param purpose Reason for the request.
   * @return TokenResult statusCode 200 with the token body, or the error status and code.
   */
  @AuraEnabled
  public static TokenResult requestEvaluatorToken(
    String email,
    String purpose
  ) {
    String correlationId = UUID.randomUUID().toString();
    TokenExchangeService.Result result = TokenExchangeService.requestToken(
      new TokenExchangeService.Attempt(
        email,
        purpose,
        auraSourceIp(),
        correlationId,
        TokenExchangeService.CHANNEL_AURA
      )
    );
    // An Aura call has no REST response, so ok()/error() never write the email+IP count.
    // Write it here, after the token callout and the audit row (contracts C2 and C4).
    ApiRequestContext.commitRateCounts();
    TokenResult tokenResult = new TokenResult();
    tokenResult.correlationId = correlationId;
    tokenResult.statusCode = result.statusCode;
    tokenResult.errorCode = result.errorCode;
    tokenResult.message = result.message;
    tokenResult.retryAfterSeconds = result.retryAfterSeconds;
    if (result.isIssued()) {
      tokenResult.token = result.toTokenBody();
    }
    return tokenResult;
  }

  /**
   * @description Source IP for an Aura call. An Aura request has no RestContext; the only
   *              documented source is the current session's SourceIp attribute
   *              (Auth.SessionManagement.getCurrentSession). When that is unavailable the
   *              key falls back to TokenExchangeService.IP_UNAVAILABLE, which makes the
   *              Aura limit effectively per email. Open decision; see the WS3 report.
   * @return String The source IP or IP_UNAVAILABLE.
   */
  @TestVisible
  private static String auraSourceIp() {
    Map<String, String> session;
    try {
      // getCurrentSession() raises an uncatchable "Current session unavailable" in tests.
      session = Test.isRunningTest()
        ? sessionOverride
        : Auth.SessionManagement.getCurrentSession();
    } catch (Exception e) {
      session = null;
    }
    String ip = session?.get('SourceIp');
    return String.isBlank(ip) ? TokenExchangeService.IP_UNAVAILABLE : ip;
  }

  @TestVisible
  private static Map<String, String> sessionOverride;

  private static String requireText(
    String value,
    String label,
    Integer maxLength
  ) {
    if (String.isBlank(value)) {
      throw auraError(label + ' is required.');
    }
    String trimmed = value.trim();
    if (trimmed.length() > maxLength) {
      throw auraError(label + ' can be at most ' + maxLength + ' characters.');
    }
    return trimmed;
  }

  @TestVisible
  private static String coverLetterError(Integer status, String body) {
    if (status == 429) {
      return 'Too many cover letters were requested in the last minute. Try again in a minute.';
    }
    if (status == 503) {
      return 'No AI provider is available right now. Try again later.';
    }
    if (status >= 400 && status < 500) {
      String detail = errorMessage(body);
      return 'The cover letter request was refused (status ' +
        status +
        ')' +
        (String.isBlank(detail) ? '.' : ': ' + detail);
    }
    return 'The cover letter service failed (status ' +
      status +
      '). Try again later.';
  }

  private static String errorMessage(String body) {
    Map<String, Object> parsed = parseObject(body);
    Object message = parsed?.get('message');
    return message instanceof String ? (String) message : null;
  }

  private static CoverLetterResult toCoverLetterResult(String body) {
    Map<String, Object> parsed = parseObject(body);
    if (parsed == null || !(parsed.get('content') instanceof String)) {
      throw auraError(
        'The cover letter service returned a response that could not be read.'
      );
    }
    CoverLetterResult result = new CoverLetterResult();
    result.content = (String) parsed.get('content');
    result.provider = stringOf(parsed.get('provider'));
    result.model = stringOf(parsed.get('model'));
    result.fallbackOccurred = booleanOf(parsed.get('fallbackOccurred'));
    result.generationMs = longOf(parsed.get('latencyMs'));
    result.promptShown = stringOf(parsed.get('promptShown'));
    result.attempts = new List<AttemptView>();
    Object attempts = parsed.get('attempts');
    if (attempts instanceof List<Object>) {
      for (Object item : (List<Object>) attempts) {
        if (item instanceof Map<String, Object>) {
          Map<String, Object> row = (Map<String, Object>) item;
          AttemptView view = new AttemptView();
          view.provider = stringOf(row.get('provider'));
          view.outcome = stringOf(row.get('outcome'));
          view.ms = longOf(row.get('ms'));
          result.attempts.add(view);
        }
      }
    }
    return result;
  }

  private static Map<String, Object> parseObject(String body) {
    if (String.isBlank(body)) {
      return null;
    }
    try {
      Object parsed = JSON.deserializeUntyped(body);
      return parsed instanceof Map<String, Object>
        ? (Map<String, Object>) parsed
        : null;
    } catch (JSONException e) {
      return null;
    }
  }

  private static Boolean booleanOf(Object value) {
    return value instanceof Boolean ? (Boolean) value : false;
  }

  private static String stringOf(Object value) {
    return value instanceof String ? (String) value : null;
  }

  private static Long longOf(Object value) {
    if (value instanceof Decimal) {
      return ((Decimal) value).longValue();
    }
    if (value instanceof Long) {
      return (Long) value;
    }
    if (value instanceof Integer) {
      return Long.valueOf(String.valueOf(value));
    }
    return null;
  }

  private static String buildQuery(Map<String, String> params) {
    if (params == null || params.isEmpty()) {
      return '';
    }
    if (params.size() > MAX_PARAMS) {
      throw auraError('Too many query parameters.');
    }
    List<String> names = new List<String>(params.keySet());
    names.sort();
    List<String> pairs = new List<String>();
    for (String name : names) {
      String value = params.get(name);
      if (name == null || !PARAM_NAME.matcher(name).matches()) {
        throw auraError('Invalid query parameter name: ' + name);
      }
      if (value == null || value.length() > MAX_PARAM_VALUE_LENGTH) {
        throw auraError('Invalid value for query parameter ' + name);
      }
      pairs.add(name + '=' + EncodingUtil.urlEncode(value, 'UTF-8'));
    }
    return '?' + String.join(pairs, '&');
  }

  private static AuraHandledException auraError(String message) {
    AuraHandledException e = new AuraHandledException(message);
    e.setMessage(message);
    return e;
  }
}

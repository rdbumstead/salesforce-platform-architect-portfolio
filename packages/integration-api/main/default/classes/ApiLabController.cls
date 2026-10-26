/**
 * @description       : Apex proxy for the site's API Lab (ADR-027). invoke() calls an
 *                      allowlisted SAPI/PAPI GET path through the Portfolio_API Named
 *                      Credential and returns status, latency, tracing and paging headers and
 *                      the body. requestEvaluatorToken() vends a token through the same
 *                      TokenExchangeService path as POST /papi/v1/auth/token.
 *                      generateCoverLetter() is the site's cover letter path. It runs
 *                      ContentGenerationController.dispatch in process as the site
 *                      guest, under the AI tier limit on the papi-ai key prefix. It makes no
 *                      call into this org's own API, because a request that arrives as a callout
 *                      from the same org cannot call out to Gemini ("Callout loop not allowed").
 *                      invoke() and generateCoverLetter() each add one to a daily counter
 *                      (UsageCounterWriter) as their last step. A counter failure is swallowed
 *                      and never reaches the visitor.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [ApiLabControllerTest]
 **/
public with sharing class ApiLabController {
  public static final String NAMED_CREDENTIAL = 'Portfolio_API';
  public static final String API_VERSION = 'v1';

  /**
   * The static resource that lists the Lab's paths. scripts/sync-specs.js builds it from the
   * GET operations of salesforce-sapi.yaml and portfolio-papi.yaml, less the paths it
   * excludes on purpose, so a new spec path needs no change here.
   */
  public static final String CATALOG_RESOURCE = 'API_Lab_Catalog';

  // Read once per transaction.
  private static String catalogBody;
  private static Set<String> allowedPaths;

  @TestVisible
  private static String catalogOverride;

  /** Response headers returned to the API Lab. */
  public static final List<String> RETURNED_HEADERS = new List<String>{
    'X-Request-Id',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'Cache-Control',
    'X-Total-Count',
    'X-Has-More'
  };

  /**
   * Rate key of the site cover letter: the papi-ai prefix that /papi/v1/ai/ counts on, so
   * the footer's AI requests today counts both. One shared bucket for every site visitor.
   */
  public static final String AI_RATE_KEY = 'papi-ai:site-cover-letter';

  /** Where the request log line says the cover letter came from. */
  public static final String COVER_LETTER_LOG_PATH = 'aura:ApiLabController.generateCoverLetter';

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
   * @description One provider attempt of the dispatch.
   */
  public class AttemptView {
    @AuraEnabled
    public String provider;
    @AuraEnabled
    public String outcome;
    @AuraEnabled
    public Long ms;
    /** HTTP status or exception and a short message, when the dispatch reports one. */
    @AuraEnabled
    public String detail;
  }

  /**
   * @description A cover letter from the dispatch, with what the show-your-work panel needs.
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
    /** Time measured here, limit check and dispatch included. */
    @AuraEnabled
    public Long latencyMs;
    /** Dispatch time reported by ContentGenerationController. */
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
   * @description The Lab's catalog as the API_Lab_Catalog resource holds it: each GET path,
   *              its query parameters and the top level keys of its JSON responses.
   * @return String The catalog JSON.
   * @throws AuraHandledException When the resource is missing.
   */
  @AuraEnabled(cacheable=true)
  public static String getCatalog() {
    String body = catalog();
    if (body == null) {
      throw auraError('The API Lab catalog is not available.');
    }
    return body;
  }

  /**
   * @description The paths invoke() accepts: every path in the catalog, lower case. Empty
   *              when the catalog is missing or unreadable, so the Lab then refuses every
   *              path rather than guess.
   * @return Set<String> For example /sapi/v1/skills.
   */
  public static Set<String> allowedPaths() {
    if (allowedPaths != null) {
      return allowedPaths;
    }
    allowedPaths = new Set<String>();
    String body = catalog();
    if (body == null) {
      return allowedPaths;
    }
    try {
      Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(
        body
      );
      for (Object entry : (List<Object>) root.get('paths')) {
        Object entryPath = ((Map<String, Object>) entry).get('path');
        if (entryPath instanceof String) {
          allowedPaths.add(((String) entryPath).trim().toLowerCase());
        }
      }
    } catch (Exception e) {
      // Recovered on purpose: a broken catalog fails closed, with every path refused.
      PortfolioLog.info(
        'ApiLabController catalog unreadable: ' + e.getTypeName()
      );
      allowedPaths.clear();
    }
    return allowedPaths;
  }

  private static String catalog() {
    if (catalogOverride != null) {
      return String.isBlank(catalogOverride) ? null : catalogOverride;
    }
    if (catalogBody == null) {
      List<StaticResource> rows = [
        SELECT Body
        FROM StaticResource
        WHERE Name = :CATALOG_RESOURCE
        WITH SYSTEM_MODE
        LIMIT 1
      ];
      catalogBody = rows.isEmpty() ? null : rows[0].Body.toString();
    }
    return catalogBody;
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
    if (!allowedPaths().contains(normalised)) {
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
    // Last of all: the response is in hand and the callout is done. Never throws.
    UsageCounterWriter.record(UsageCounterWriter.KIND_API_LAB_REQUEST);
    return result;
  }

  /**
   * @description Writes a cover letter in process as the caller (the site guest on the page).
   *              Order, so no DML comes before a callout: validate, check the AI tier limit (a read, no
   *              DML), dispatch (Agentforce only when it may serve, never for a guest, then
   *              Gemini, then the local template), then write the rate count. A refused or
   *              failed request throws, and the thrown error rolls back its count.
   * @param companyName Company the letter is for, at most 120 characters.
   * @param jobTitle Job title, at most 120 characters.
   * @param jobDescription Job description, optional, at most 4000 characters.
   * @return CoverLetterResult Content, provider, model, fallback, latency, attempts, prompt.
   * @throws AuraHandledException On invalid input, the AI tier limit, or no provider serving.
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

    String requestId = UUID.randomUUID().toString();
    Long started = System.currentTimeMillis();
    ApiRequestContext.RateDecision decision = ApiRequestContext.rateLimiter()
      .checkKey(AI_RATE_KEY, ApiRequestContext.aiLimitPerMinute());
    if (!decision.allowed) {
      logCoverLetter(429, requestId, started);
      throw auraError(
        'Too many cover letters were requested in the last minute. Try again in a minute.'
      );
    }

    ContentGenerationController.GenerationResult generated;
    try {
      generated = ContentGenerationController.dispatch(
        new ContentGenerationController.GenerationRequest(
          coverLetterPrompt(company, title, description),
          providerContext(company, title, description),
          true
        )
      );
    } catch (ContentGenerationController.ContentGenerationException e) {
      ApiRequestContext.commitRateCounts();
      logCoverLetter(503, requestId, started);
      throw auraError(
        'No AI provider is available right now. Try again later.'
      );
    }
    // The count is written after the provider callouts, so no DML comes before a callout.
    ApiRequestContext.commitRateCounts();

    CoverLetterResult result = toCoverLetterResult(generated);
    result.latencyMs = System.currentTimeMillis() - started;
    result.requestId = requestId;
    logCoverLetter(200, requestId, started);
    // Last of all: the letter, from any provider, is in hand. Never throws.
    UsageCounterWriter.record(UsageCounterWriter.KIND_COVER_LETTER);
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
    // Write it here, after the token callout and the audit row.
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
   *              Aura limit effectively per email.
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

  /**
   * @description The cover letter prompt. ContentGenerationController.coverLetterPrompt
   *              builds it, so this page and that controller send the same text.
   * @param company Company name, trimmed.
   * @param title Job title, trimmed.
   * @param description Job description, or null.
   * @return String The prompt.
   */
  @TestVisible
  private static String coverLetterPrompt(
    String company,
    String title,
    String description
  ) {
    return ContentGenerationController.coverLetterPrompt(
      company,
      title,
      description
    );
  }

  private static Map<String, Object> providerContext(
    String company,
    String title,
    String description
  ) {
    Map<String, Object> context = new Map<String, Object>{
      'companyName' => company,
      'role' => title,
      'jobTitle' => title,
      'tone' => 'Professional'
    };
    if (description != null) {
      context.put('jobDescription', description);
    }
    return context;
  }

  private static CoverLetterResult toCoverLetterResult(
    ContentGenerationController.GenerationResult generated
  ) {
    CoverLetterResult result = new CoverLetterResult();
    // The whole letter. Its length is asked for in words in the prompt, never cut here.
    result.content = generated.content;
    result.provider = generated.provider;
    result.model = generated.model;
    result.fallbackOccurred = generated.fallbackOccurred == true;
    result.generationMs = generated.latencyMs;
    result.promptShown = generated.promptShown;
    result.attempts = new List<AttemptView>();
    List<ContentGenerationController.Attempt> attempts = generated.attempts ??
      new List<ContentGenerationController.Attempt>();
    for (ContentGenerationController.Attempt attempt : attempts) {
      result.attempts.add(toAttemptView(attempt));
    }
    return result;
  }

  // detail is read by name from the serialized attempt, so this class compiles whether
  // or not the dispatch reports it yet.
  private static AttemptView toAttemptView(
    ContentGenerationController.Attempt attempt
  ) {
    AttemptView view = new AttemptView();
    view.provider = attempt.provider;
    view.outcome = attempt.outcome;
    view.ms = attempt.ms;
    Map<String, Object> fields = (Map<String, Object>) JSON.deserializeUntyped(
      JSON.serialize(attempt)
    );
    Object detail = fields.get('detail');
    view.detail = detail instanceof String ? (String) detail : null;
    return view;
  }

  private static void logCoverLetter(
    Integer status,
    String requestId,
    Long started
  ) {
    RequestUtil.logRequest(
      COVER_LETTER_LOG_PATH,
      status,
      requestId,
      System.currentTimeMillis() - started
    );
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

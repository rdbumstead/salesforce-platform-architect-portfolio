/**
 * @description       : Apex proxy for the site's API Lab (ADR-027). invoke() calls an
 *                      allowlisted SAPI/PAPI GET path through the Portfolio_API Named
 *                      Credential and returns status, latency, tracing, paging and version headers and
 *                      the body. invokeVersioned() does the same for the API version the visitor
 *                      chose (v1 or v2, blank is v2) and invoke() stays as the v1 call. requestEvaluatorToken() vends a token through the same
 *                      TokenExchangeService path as POST /papi/auth/token.
 *                      generateCoverLetter() is the site's cover letter path, under the AI
 *                      tier limit on the papi-ai key prefix. While the Agentforce switch is on
 *                      and its breaker is closed, it first posts the letter to
 *                      POST /papi/ai/generate with provider Agentforce through
 *                      Portfolio_API, so Agentforce runs as the integration user (a guest may
 *                      not run generative AI). A 200 is the letter. Anything else runs
 *                      ContentGenerationController.dispatch in process as the site guest from
 *                      Gemini on, then the template, with the Agentforce attempt first in the
 *                      attempts list. Gemini is never asked through the API, because a request
 *                      that arrives as a callout from the same org cannot call out again
 *                      ("Callout loop not allowed").
 *                      invoke() and generateCoverLetter() each add one to a daily counter
 *                      (UsageCounterWriter) as their last step. A counter failure is swallowed
 *                      and never reaches the visitor.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [ApiLabControllerTest]
 **/
public with sharing class ApiLabController {
  public static final String NAMED_CREDENTIAL = 'Portfolio_API';
  public static final String API_VERSION = 'v1';
  public static final String API_VERSION_2 = 'v2';
  /** The Portfolio_Setting__mdt record that holds the Run in Postman link. */
  public static final String POSTMAN_RUN_URL_SETTING = 'Postman_Run_Url';

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
    'X-Has-More',
    'X-API-Version',
    'Deprecation',
    'Sunset',
    'Link'
  };

  /**
   * Rate key of the site cover letter: the papi-ai prefix that /papi/ai/ counts on, so
   * the footer's AI requests today counts both. One shared bucket for every site visitor.
   */
  public static final String AI_RATE_KEY = 'papi-ai:site-cover-letter';

  /**
   * Rate key that marks a letter the API counted on its own papi-ai key. One is added for each
   * Agentforce call the API answered with its rate headers, so FooterController can take them
   * off its AI requests today and a letter that went through the API counts once. It is not a
   * papi-ai key, so it limits nothing and is not counted itself.
   */
  public static final String PROXIED_RATE_KEY = 'site-ai-proxied:cover-letter';
  private static final Integer PROXIED_MARKER_LIMIT = 1000000;

  /** Where the request log line says the cover letter came from. */
  public static final String COVER_LETTER_LOG_PATH = 'aura:ApiLabController.generateCoverLetter';

  /** The API path the Agentforce letter is posted to. */
  public static final String AI_GENERATE_PATH = '/papi/ai/generate';

  /**
   * Apex allows 120 s of callouts in one transaction. The Agentforce call gets what Gemini's
   * timeout leaves of it, less this margin.
   */
  public static final Integer CALLOUT_BUDGET_MS = 120000;
  public static final Integer CALLOUT_MARGIN_MS = 2000;
  public static final Integer GEMINI_DEFAULT_TIMEOUT_MS = 60000;
  private static final Integer MIN_PROXY_TIMEOUT_MS = 1000;
  private static final String PAPI_COVER_LETTER = 'CoverLetter';

  public static final Integer MAX_COMPANY_LENGTH = 120;
  public static final Integer MAX_TITLE_LENGTH = 120;
  // The cover letter page and PortfolioGroundingService.MAX_JOB_TEXT_CHARS hold the same limit.
  public static final Integer MAX_DESCRIPTION_LENGTH = 12000;

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
      throw auraError(ApiMessages.LAB_CATALOG_MISSING);
    }
    return body;
  }

  /**
   * @description The Run in Postman link the API Lab and the API reference page show, from
   *              Portfolio_Setting.Postman_Run_Url. Blank when the record is missing or
   *              empty, which keeps the button hidden. It never throws to the page: a failed
   *              read also gives blank.
   * @return String The link, or an empty string.
   */
  @AuraEnabled(cacheable=true)
  public static String getPostmanRunUrl() {
    try {
      return PortfolioSettings.getText(POSTMAN_RUN_URL_SETTING, '');
    } catch (Exception e) {
      return '';
    }
  }

  /**
   * @description Whether the Lab shows the versionless URLs: false only while the
   *              Api_Versionless_Urls setting is Off. It never throws to the page: a failed
   *              read gives true.
   * @return Boolean False when the switch is Off.
   */
  @AuraEnabled(cacheable=true)
  public static Boolean getVersionlessUrls() {
    try {
      return ApiRoutes.isVersionless();
    } catch (Exception e) {
      return true;
    }
  }

  /**
   * @description The paths invoke() accepts: every path in the catalog, lower case. Empty
   *              when the catalog is missing or unreadable, so the Lab then refuses every
   *              path rather than guess.
   * @return Set<String> For example /sapi/skills.
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
          // A catalog that still spells a path with /v1/ is read as the versionless path.
          String canonical = ApiRequestContext.canonicalPath(
            ((String) entryPath).trim()
          );
          if (canonical != null) {
            allowedPaths.add(canonical);
          }
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
   * @description Calls an allowlisted GET path as API v1, the version before the Lab could
   *              choose. Kept so a caller built before invokeVersioned keeps working.
   * @param path API path, e.g. /sapi/skills.
   * @param params Query parameters (at most 10; names alphanumeric).
   * @return InvokeResult Status, latency, headers, body and the Named Credential name.
   * @throws AuraHandledException When the path or a parameter is not allowed, or the callout fails.
   */
  @AuraEnabled
  public static InvokeResult invoke(String path, Map<String, String> params) {
    return call(path, params, API_VERSION);
  }

  /**
   * @description Calls an allowlisted GET path through Portfolio_API with a fresh
   *              X-Request-Id and the X-API-Version the visitor chose. The path is
   *              versionless for both versions, because the version is a header. An old
   *              /v1/ spelling is accepted and called as the versionless path (ADR-040).
   * @param path API path, e.g. /sapi/skills.
   * @param params Query parameters (at most 10; names alphanumeric).
   * @param apiVersion v1 or v2. Blank means v2.
   * @return InvokeResult Status, latency, headers (version and deprecation headers
   *         included when present), body and the Named Credential name.
   * @throws AuraHandledException When the version, path or a parameter is not allowed, or
   *         the callout fails.
   */
  @AuraEnabled
  public static InvokeResult invokeVersioned(
    String path,
    Map<String, String> params,
    String apiVersion
  ) {
    String chosen = String.isBlank(apiVersion)
      ? API_VERSION_2
      : apiVersion.trim();
    if (chosen != API_VERSION && chosen != API_VERSION_2) {
      throw auraError(ApiMessages.LAB_VERSION_NOT_ALLOWED);
    }
    return call(path, params, chosen);
  }

  private static InvokeResult call(
    String path,
    Map<String, String> params,
    String apiVersion
  ) {
    // A path with a query is refused, as it was when it never matched the catalog.
    String normalised = String.isBlank(path) || path.contains('?')
      ? ''
      : ApiRequestContext.canonicalPath(path.trim());
    if (normalised == null || !allowedPaths().contains(normalised)) {
      throw auraError(ApiMessages.LAB_PATH_NOT_ALLOWED);
    }
    String query = buildQuery(params);
    String requestId = UUID.randomUUID().toString();

    HttpRequest req = new HttpRequest();
    req.setEndpoint(
      'callout:' + NAMED_CREDENTIAL + ApiRoutes.forCanonical(normalised) + query
    );
    req.setMethod('GET');
    req.setTimeout(20000);
    req.setHeader('X-Request-Id', requestId);
    req.setHeader('X-API-Version', apiVersion);
    req.setHeader('Accept', 'application/json');

    Long started = System.currentTimeMillis();
    HttpResponse res;
    try {
      res = new Http().send(req);
    } catch (CalloutException e) {
      // The detail is logged. The visitor reads a plain sentence.
      PortfolioLog.info(
        'api lab call failed path=' + normalised + ' type=' + e.getTypeName()
      );
      throw auraError(ApiMessages.LAB_API_UNREACHABLE);
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
   * @description Writes a cover letter for the caller (the site guest on the page).
   *              Order, so no DML comes before a callout: validate, check the AI tier limit (a
   *              read, no DML), read the Agentforce breaker (a read), post to the API for
   *              Agentforce when its switch is on and its breaker closed, and when that does
   *              not return a letter dispatch in process from Gemini on (then the local
   *              template). Then the writes: the Agentforce breaker failure the API could not
   *              record, the rate counts (with the PROXIED_RATE_KEY marker when the API
   *              counted the call), the request log line and the usage counter. A refused
   *              or failed request throws, and the thrown error rolls back its count.
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

    AgentforceOutcome agentforce = tryAgentforce(company, title, description);
    CoverLetterResult result = agentforce.result;
    if (result == null) {
      ContentGenerationController.GenerationResult generated;
      try {
        generated = ContentGenerationController.dispatch(
          inProcessRequest(company, title, description, agentforce)
        );
      } catch (ContentGenerationController.ContentGenerationException e) {
        recordAgentforceBreaker(agentforce);
        ApiRequestContext.commitRateCounts();
        logCoverLetter(503, requestId, started);
        throw auraError(
          'No AI provider is available right now. Try again later.'
        );
      }
      result = toCoverLetterResult(generated);
      addAgentforceAttempt(result, agentforce);
    }
    // Every write comes after the provider callouts, so no DML comes before a callout.
    recordAgentforceBreaker(agentforce);
    ApiRequestContext.commitRateCounts();

    result.latencyMs = System.currentTimeMillis() - started;
    result.requestId = requestId;
    logCoverLetter(200, requestId, started);
    // Last of all: the letter, from any provider, is in hand. Never throws.
    UsageCounterWriter.record(UsageCounterWriter.KIND_COVER_LETTER);
    return result;
  }

  /**
   * @description What the Agentforce step of a site letter produced: the letter when the API
   *              served one, else the attempt to show (null when the switch is off), and
   *              whether this transaction must record a breaker failure itself.
   */
  @TestVisible
  private class AgentforceOutcome {
    public CoverLetterResult result;
    public ContentGenerationController.Attempt attempt;
    public Boolean recordFailure = false;
    /** True when the API's answer carried its rate headers, so it counted the request. */
    public Boolean countedByApi = false;
  }

  /**
   * @description Posts the letter to POST /papi/ai/generate with provider Agentforce, when
   *              the Agentforce switch is on and its breaker is closed. The API runs as the
   *              integration user and records its own breaker result whenever it reached
   *              Agentforce. Any other HTTP answer (the rate limiter's 429, a refused session,
   *              a bad request) is not Agentforce failing, so it is never a breaker failure.
   *              Only a call that got no answer (a timeout or a callout failure) or a 200 with
   *              no letter is recorded here. A 503 that says the hourly budget is used is shown
   *              as budget_exhausted.
   * @param company Company name, trimmed.
   * @param title Job title, trimmed.
   * @param description Job description, or null.
   * @return AgentforceOutcome The letter, or the attempt to show.
   */
  @TestVisible
  private static AgentforceOutcome tryAgentforce(
    String company,
    String title,
    String description
  ) {
    AgentforceOutcome outcome = new AgentforceOutcome();
    if (!AgentforceService.isEnabled()) {
      return outcome;
    }
    if (CircuitBreaker.isOpen(CircuitBreaker.KEY_AGENTFORCE)) {
      outcome.attempt = new ContentGenerationController.Attempt(
        ContentGenerationController.PROVIDER_AGENTFORCE,
        ContentGenerationController.OUTCOME_SKIPPED_OPEN_CIRCUIT,
        0L
      );
      return outcome;
    }
    Long started = System.currentTimeMillis();
    HttpResponse res;
    try {
      res = new Http().send(agentforceRequest(company, title, description));
    } catch (Exception e) {
      outcome.attempt = failedAgentforce(started, e.getTypeName());
      outcome.recordFailure = true;
      return outcome;
    }
    outcome.countedByApi = res.getHeader('X-RateLimit-Limit') != null;
    Integer status = res.getStatusCode();
    if (status == 200) {
      outcome.result = fromApiBody(res.getBody());
      if (outcome.result != null) {
        return outcome;
      }
    }
    if (status == 503 && isBudgetAnswer(res.getBody())) {
      outcome.attempt = new ContentGenerationController.Attempt(
        ContentGenerationController.PROVIDER_AGENTFORCE,
        ContentGenerationController.OUTCOME_BUDGET_EXHAUSTED,
        System.currentTimeMillis() - started
      );
      return outcome;
    }
    outcome.attempt = failedAgentforce(started, 'HTTP ' + status);
    outcome.recordFailure = status == 200;
    return outcome;
  }

  private static Boolean isBudgetAnswer(String body) {
    try {
      Object parsed = JSON.deserializeUntyped(body);
      return parsed instanceof Map<String, Object> &&
        ((Map<String, Object>) parsed).get('message') ==
        PAPIAiGenerate.MESSAGE_AGENTFORCE_BUDGET;
    } catch (Exception e) {
      // Recovered on purpose: an unreadable 503 is an ordinary failed attempt.
      return false;
    }
  }

  private static ContentGenerationController.Attempt failedAgentforce(
    Long started,
    String detail
  ) {
    return new ContentGenerationController.Attempt(
      ContentGenerationController.PROVIDER_AGENTFORCE,
      ContentGenerationController.OUTCOME_FAILED,
      System.currentTimeMillis() - started,
      detail
    );
  }

  private static HttpRequest agentforceRequest(
    String company,
    String title,
    String description
  ) {
    Map<String, Object> context = new Map<String, Object>{
      'companyName' => company,
      'role' => title
    };
    if (description != null) {
      context.put('jobDescription', description);
    }
    HttpRequest req = new HttpRequest();
    req.setEndpoint(
      'callout:' + NAMED_CREDENTIAL + ApiRoutes.forCanonical(AI_GENERATE_PATH)
    );
    req.setMethod('POST');
    req.setTimeout(agentforceTimeoutMs());
    req.setHeader('X-Request-Id', UUID.randomUUID().toString());
    // The site's own call moves to v2 first, so v1's sunset cannot reach it.
    req.setHeader('X-API-Version', API_VERSION_2);
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('Accept', 'application/json');
    req.setBody(
      JSON.serialize(
        new Map<String, Object>{
          'type' => PAPI_COVER_LETTER,
          'provider' => ContentGenerationController.PROVIDER_AGENTFORCE,
          'context' => context
        }
      )
    );
    return req;
  }

  /**
   * @description The Agentforce call's timeout: the Agentforce record's, capped so that it and
   *              Gemini's timeout fit in the 120 s a transaction may spend on callouts.
   * @return Integer Milliseconds, at least 1000.
   */
  @TestVisible
  private static Integer agentforceTimeoutMs() {
    Decimal gemini = AI_Provider_Config__mdt.getInstance('Gemini')
      ?.Timeout_Ms__c;
    Integer geminiMs = gemini == null ||
      gemini <= 0
      ? GEMINI_DEFAULT_TIMEOUT_MS
      : gemini.intValue();
    Integer budget = CALLOUT_BUDGET_MS - geminiMs - CALLOUT_MARGIN_MS;
    return Math.max(
      MIN_PROXY_TIMEOUT_MS,
      Math.min(AgentforceService.timeoutMs(), budget)
    );
  }

  /**
   * @description The site's view of a 200 from the API. Null when the body holds no
   *              content, which then counts as a failed attempt.
   * @param body The response body.
   * @return CoverLetterResult The letter, or null.
   */
  @TestVisible
  private static CoverLetterResult fromApiBody(String body) {
    Object parsed;
    try {
      parsed = JSON.deserializeUntyped(body);
    } catch (Exception e) {
      // Recovered on purpose: an unreadable 200 is a failed Agentforce attempt.
      return null;
    }
    Map<String, Object> root = parsed instanceof Map<String, Object>
      ? (Map<String, Object>) parsed
      : new Map<String, Object>();
    String content = textOf(root.get('content'));
    if (String.isBlank(content)) {
      return null;
    }
    CoverLetterResult result = new CoverLetterResult();
    result.content = content;
    result.provider = textOf(root.get('provider'));
    result.model = textOf(root.get('model'));
    result.fallbackOccurred = root.get('fallbackOccurred') == true;
    result.generationMs = longOf(root.get('latencyMs'));
    result.promptShown = textOf(root.get('promptShown'));
    result.attempts = new List<AttemptView>();
    Object attempts = root.get('attempts');
    if (attempts instanceof List<Object>) {
      for (Object item : (List<Object>) attempts) {
        if (item instanceof Map<String, Object>) {
          result.attempts.add(attemptFromApi((Map<String, Object>) item));
        }
      }
    }
    return result;
  }

  private static AttemptView attemptFromApi(Map<String, Object> item) {
    AttemptView view = new AttemptView();
    view.provider = textOf(item.get('provider'));
    view.outcome = textOf(item.get('outcome'));
    view.ms = longOf(item.get('ms'));
    return view;
  }

  private static String textOf(Object value) {
    return value instanceof String ? (String) value : null;
  }

  private static Long longOf(Object value) {
    return value instanceof Integer || value instanceof Long
      ? Long.valueOf(String.valueOf(value))
      : null;
  }

  private static ContentGenerationController.GenerationRequest inProcessRequest(
    String company,
    String title,
    String description,
    AgentforceOutcome agentforce
  ) {
    ContentGenerationController.GenerationRequest request = new ContentGenerationController.GenerationRequest(
      coverLetterPrompt(company, title, description),
      providerContext(company, title, description),
      true
    );
    // The API already tried Agentforce, so the guest's own chain starts at Gemini and the
    // Agentforce attempt is shown from agentforce.attempt. With the switch off there is no
    // attempt, and the chain records Agentforce as skipped_off as before.
    request.skipAgentforce = agentforce.attempt != null;
    return request;
  }

  private static void addAgentforceAttempt(
    CoverLetterResult result,
    AgentforceOutcome agentforce
  ) {
    if (agentforce.attempt == null) {
      return;
    }
    result.attempts.add(0, toAttemptView(agentforce.attempt));
    if (
      agentforce.attempt.outcome == ContentGenerationController.OUTCOME_FAILED
    ) {
      result.fallbackOccurred = true;
    }
  }

  private static void recordAgentforceBreaker(AgentforceOutcome agentforce) {
    if (agentforce.recordFailure) {
      CircuitBreaker.recordFailure(CircuitBreaker.KEY_AGENTFORCE);
      agentforce.recordFailure = false;
    }
    if (agentforce.countedByApi) {
      // A read and a pending count, written by commitRateCounts with the visitor's own.
      ApiRequestContext.rateLimiter()
        .checkKey(PROXIED_RATE_KEY, PROXIED_MARKER_LIMIT);
      agentforce.countedByApi = false;
    }
  }

  /**
   * @description Requests an evaluator token through the same validation, rate limit,
   *              daily cap, exchange and audit path as POST /papi/auth/token.
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
   *              Aura limit effectively per email. The site guest never asks for a session:
   *              it has none, and for a guest getCurrentSession() throws "Guest users must
   *              never have a session ID created", which no catch stops, so the API Lab
   *              token form failed for every visitor. A guest's key is IP_UNAVAILABLE.
   * @return String The source IP or IP_UNAVAILABLE.
   */
  @TestVisible
  private static String auraSourceIp() {
    if (UserInfo.getUserType() == 'Guest') {
      return TokenExchangeService.IP_UNAVAILABLE;
    }
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
      throw auraError(ApiMessages.labTooManyParams(MAX_PARAMS));
    }
    List<String> names = new List<String>(params.keySet());
    names.sort();
    List<String> pairs = new List<String>();
    for (String name : names) {
      String value = params.get(name);
      if (name == null || !PARAM_NAME.matcher(name).matches()) {
        throw auraError(ApiMessages.labParamName(name));
      }
      if (value == null || value.length() > MAX_PARAM_VALUE_LENGTH) {
        throw auraError(
          ApiMessages.labParamValue(name, MAX_PARAM_VALUE_LENGTH)
        );
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

/**
 * @description       : The single code path that vends evaluator access tokens (ADR-028).
 *                      Validates the request, applies the email+IP rate limit and the daily
 *                      issuance cap, exchanges client credentials for a token through the
 *                      Portfolio_API_Token Named Credential, and writes exactly one
 *                      API_Access_Request__c audit row per attempt. No DML runs before the
 *                      token callout (contract C2); the audit row is written after it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [TokenExchangeServiceTest]
 **/
public with sharing class TokenExchangeService {
  /**
   * @description Requests allowed per minute per email+IP key (decision 2026-10-20).
   *              Deliberately a literal, independent of the PAPI tier limit.
   */
  public static final Integer TOKEN_REQUESTS_PER_MINUTE = 15;
  public static final Integer DEFAULT_DAILY_CAP = 50;
  public static final Integer EMAIL_MAX_LENGTH = 254;
  public static final Integer PURPOSE_MAX_LENGTH = 280;
  /** Integration user profile session timeout (30 minutes); the token endpoint does not return one. */
  public static final Integer TOKEN_LIFETIME_SECONDS = 1800;
  public static final String NAMED_CREDENTIAL = 'Portfolio_API_Token';
  public static final String EXTERNAL_CREDENTIAL = 'Portfolio_API_Token_Auth';
  public static final String DOCS_URL = 'https://rdbumstead.github.io/salesforce-platform-architect-portfolio/api/oas/salesforce-sapi';
  public static final String RATE_KEY_PREFIX = 'papi-token:';
  public static final String CHANNEL_REST = 'REST';
  public static final String CHANNEL_AURA = 'Aura';
  public static final String IP_UNAVAILABLE = 'unavailable';

  private static final String CONFIG_RECORD = 'Ryan_Bumstead';
  private static final String TOKEN_PATH = '/services/oauth2/token';
  private static final Pattern EMAIL_PATTERN = Pattern.compile(
    '^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9](?:[A-Za-z0-9\\-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9\\-]*[A-Za-z0-9])?)*\\.[A-Za-z]{2,}$'
  );

  /**
   * @description Outcomes recorded on API_Access_Request__c.Outcome__c.
   */
  public enum Outcome {
    ISSUED,
    INVALID_REQUEST,
    RATE_LIMITED,
    CAP_REACHED,
    CREDENTIAL_MISSING,
    FAILED
  }

  private static final Map<Outcome, String> OUTCOME_VALUES = new Map<Outcome, String>{
    Outcome.ISSUED => 'Issued',
    Outcome.INVALID_REQUEST => 'Invalid_Request',
    Outcome.RATE_LIMITED => 'Rate_Limited',
    Outcome.CAP_REACHED => 'Cap_Reached',
    Outcome.CREDENTIAL_MISSING => 'Credential_Missing',
    Outcome.FAILED => 'Failed'
  };

  /**
   * @description Thrown when the token credential is absent, not granted to the running
   *              user, or holds no valid client id and secret. Callers answer 503.
   */
  public class CredentialNotConfiguredException extends Exception {
  }

  /**
   * @description Thrown when the token endpoint fails for any other reason. Callers answer 503.
   */
  public class TokenExchangeException extends Exception {
  }

  private class BodyException extends Exception {
  }

  /**
   * @description Token returned by the client-credentials exchange.
   */
  public class TokenGrant {
    public String accessToken;
    public String tokenType;
    public Integer expiresIn;
    public String instanceUrl;
  }

  /**
   * @description One token request as received from a channel.
   */
  public class Attempt {
    public String email;
    public String purpose;
    public String sourceIp;
    public String correlationId;
    public String channel;
    /** Set when the request body could not be read; the attempt is then rejected with 400. */
    public String parseError;

    /**
     * @description Creates an attempt.
     * @param email Submitted email.
     * @param purpose Submitted purpose.
     * @param sourceIp Caller IP, or IP_UNAVAILABLE.
     * @param correlationId Request correlation id.
     * @param channel CHANNEL_REST or CHANNEL_AURA.
     */
    public Attempt(
      String email,
      String purpose,
      String sourceIp,
      String correlationId,
      String channel
    ) {
      this.email = email == null ? null : email.trim();
      this.purpose = purpose == null ? null : purpose.trim();
      this.sourceIp = String.isBlank(sourceIp) ? IP_UNAVAILABLE : sourceIp;
      this.correlationId = correlationId;
      this.channel = channel;
    }
  }

  /**
   * @description Result of an attempt, mapped by each channel to its own response.
   */
  public class Result {
    public Integer statusCode;
    public String errorCode;
    public String message;
    public Integer retryAfterSeconds;
    public ApiRequestContext.RateDecision rateDecision;
    public TokenGrant grant;
    public Outcome outcome;

    /**
     * @description True when a token was issued.
     * @return Boolean True on 200.
     */
    public Boolean isIssued() {
      return statusCode == 200;
    }

    /**
     * @description The /auth/token 200 body: access_token, token_type, expires_in,
     *              instance_url and docs.
     * @return Map<String, Object> The response body.
     */
    public Map<String, Object> toTokenBody() {
      return new Map<String, Object>{
        'access_token' => grant.accessToken,
        'token_type' => grant.tokenType,
        'expires_in' => grant.expiresIn,
        'instance_url' => grant.instanceUrl,
        'docs' => DOCS_URL
      };
    }
  }

  /**
   * @description Builds an attempt from a REST request body ({"email","purpose"}).
   * @param req The REST request.
   * @param correlationId Correlation id from ApiRequestContext.
   * @return Attempt The attempt; parseError is set when the body is not a JSON object of strings.
   */
  public static Attempt attemptFromRest(RestRequest req, String correlationId) {
    Attempt attempt = new Attempt(
      null,
      null,
      req?.remoteAddress,
      correlationId,
      CHANNEL_REST
    );
    String raw = req?.requestBody == null ? null : req.requestBody.toString();
    if (String.isBlank(raw)) {
      attempt.parseError = 'Request body must be a JSON object with email and purpose.';
      return attempt;
    }
    try {
      Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(
        raw
      );
      attempt.email = stringValue(body.get('email'));
      attempt.purpose = stringValue(body.get('purpose'));
    } catch (JSONException e) {
      attempt.parseError = 'Request body must be valid JSON.';
    } catch (TypeException e) {
      attempt.parseError = 'Request body must be a JSON object with string email and purpose.';
    } catch (BodyException e) {
      attempt.parseError = 'Request body must be a JSON object with string email and purpose.';
    }
    return attempt;
  }

  /**
   * @description Runs validation, the email+IP limit, the daily cap and the token exchange,
   *              and writes one audit row. Never writes to the REST response.
   * @param attempt The attempt.
   * @return Result The outcome for the channel to render.
   */
  public static Result requestToken(Attempt attempt) {
    Result result = validate(attempt);
    if (result == null) {
      result = checkRateLimit(attempt);
    }
    if (result == null) {
      result = checkDailyCap();
    }
    if (result == null) {
      result = exchange();
    }
    recordAttempt(attempt, result.outcome);
    return result;
  }

  /**
   * @description Records an attempt that ApiRequestContext rejected before this service ran
   *              (tier rate limit or a bad header), so every attempt leaves one audit row.
   * @param attempt The attempt as far as it could be read.
   * @param statusCode The status ApiRequestContext answered with.
   */
  public static void recordRejected(Attempt attempt, Integer statusCode) {
    recordAttempt(
      attempt,
      statusCode == 429 ? Outcome.RATE_LIMITED : Outcome.INVALID_REQUEST
    );
  }

  /**
   * @description The one callout that obtains a token: client credentials against this
   *              org's token endpoint through the Portfolio_API_Token Named Credential. The
   *              client id and secret are merged into the body by the platform from the
   *              Portfolio_API_Token_Auth principal and never reach Apex.
   * @return TokenGrant The issued token.
   * @throws CredentialNotConfiguredException When the credential is absent or holds no valid client.
   * @throws TokenExchangeException When the exchange fails for any other reason.
   */
  public static TokenGrant exchangeToken() {
    HttpRequest req = new HttpRequest();
    req.setEndpoint('callout:' + NAMED_CREDENTIAL + TOKEN_PATH);
    req.setMethod('POST');
    req.setTimeout(20000);
    req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
    req.setBody(
      'grant_type=client_credentials' +
        '&client_id={!$Credential.' +
        EXTERNAL_CREDENTIAL +
        '.Client_Id}' +
        '&client_secret={!$Credential.' +
        EXTERNAL_CREDENTIAL +
        '.Client_Secret}'
    );

    HttpResponse res;
    try {
      res = new Http().send(req);
    } catch (CalloutException e) {
      if (isCredentialError(e.getMessage())) {
        throw new CredentialNotConfiguredException(
          'Token credential is not configured.',
          e
        );
      }
      throw new TokenExchangeException('Token endpoint unreachable.', e);
    }
    return parseGrant(res);
  }

  private static TokenGrant parseGrant(HttpResponse res) {
    Map<String, Object> body;
    try {
      body = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
    } catch (Exception e) {
      throw new TokenExchangeException(
        'Token endpoint returned HTTP ' +
          res.getStatusCode() +
          ' without JSON.',
        e
      );
    }
    if (res.getStatusCode() != 200) {
      String error = stringValue(body.get('error'));
      if (error == 'invalid_client_id' || error == 'invalid_client') {
        throw new CredentialNotConfiguredException(
          'Token credential holds no valid client (' + error + ').'
        );
      }
      throw new TokenExchangeException(
        'Token endpoint returned HTTP ' +
          res.getStatusCode() +
          ' ' +
          error +
          '.'
      );
    }
    TokenGrant grant = new TokenGrant();
    grant.accessToken = stringValue(body.get('access_token'));
    grant.tokenType = 'Bearer';
    grant.expiresIn = TOKEN_LIFETIME_SECONDS;
    grant.instanceUrl = stringValue(body.get('instance_url'));
    if (String.isBlank(grant.accessToken)) {
      throw new TokenExchangeException(
        'Token endpoint returned no access_token.'
      );
    }
    return grant;
  }

  /**
   * @description The daily issuance cap from Portfolio_Config__mdt.Token_Daily_Cap__c,
   *              DEFAULT_DAILY_CAP when the record or the value is missing.
   * @return Integer The cap.
   */
  public static Integer dailyCap() {
    Portfolio_Config__mdt config = configOverride != null
      ? configOverride
      : Portfolio_Config__mdt.getInstance(CONFIG_RECORD);
    Decimal cap = config?.Token_Daily_Cap__c;
    return cap == null ? DEFAULT_DAILY_CAP : cap.intValue();
  }

  /**
   * @description Rate key for an email and source IP:
   *              papi-token:{SHA-256 hex of lowercase(email) + '|' + sourceIp}.
   * @param email Submitted email.
   * @param sourceIp Caller IP.
   * @return String The key passed to ApiRateLimiter.checkKey.
   */
  public static String rateKey(String email, String sourceIp) {
    String material = email.toLowerCase() + '|' + sourceIp;
    return RATE_KEY_PREFIX +
      EncodingUtil.convertToHex(
        Crypto.generateDigest('SHA-256', Blob.valueOf(material))
      );
  }

  @TestVisible
  private static Portfolio_Config__mdt configOverride;

  private static Result validate(Attempt attempt) {
    if (attempt.parseError != null) {
      return reject(
        400,
        'BAD_REQUEST',
        attempt.parseError,
        Outcome.INVALID_REQUEST
      );
    }
    if (
      String.isBlank(attempt.email) ||
      attempt.email.length() > EMAIL_MAX_LENGTH ||
      !EMAIL_PATTERN.matcher(attempt.email).matches()
    ) {
      return reject(
        400,
        'BAD_REQUEST',
        'email must be a valid address of at most ' +
          EMAIL_MAX_LENGTH +
          ' characters.',
        Outcome.INVALID_REQUEST
      );
    }
    if (
      String.isBlank(attempt.purpose) ||
      attempt.purpose.length() > PURPOSE_MAX_LENGTH
    ) {
      return reject(
        400,
        'BAD_REQUEST',
        'purpose is required and must be at most ' +
          PURPOSE_MAX_LENGTH +
          ' characters.',
        Outcome.INVALID_REQUEST
      );
    }
    return null;
  }

  private static Result checkRateLimit(Attempt attempt) {
    ApiRequestContext.RateDecision decision = ApiRequestContext.rateLimiter()
      .checkKey(
        rateKey(attempt.email, attempt.sourceIp),
        TOKEN_REQUESTS_PER_MINUTE
      );
    if (decision.allowed) {
      return null;
    }
    Result result = reject(
      429,
      'RATE_LIMIT_EXCEEDED',
      'Rate limit exceeded. Retry after ' +
        decision.retryAfterSeconds +
        ' seconds.',
      Outcome.RATE_LIMITED
    );
    result.retryAfterSeconds = decision.retryAfterSeconds;
    result.rateDecision = decision;
    return result;
  }

  private static Result checkDailyCap() {
    if (new AuditStore().issuedToday() < dailyCap()) {
      return null;
    }
    Result result = reject(
      503,
      'SERVICE_UNAVAILABLE',
      'Daily token issuance cap reached. Try again tomorrow.',
      Outcome.CAP_REACHED
    );
    result.retryAfterSeconds = secondsUntilTomorrow();
    return result;
  }

  private static Result exchange() {
    try {
      Result result = new Result();
      result.statusCode = 200;
      result.outcome = Outcome.ISSUED;
      result.grant = exchangeToken();
      return result;
    } catch (CredentialNotConfiguredException e) {
      return reject(
        503,
        'SERVICE_UNAVAILABLE',
        'Token issuance is not configured.',
        Outcome.CREDENTIAL_MISSING
      );
    } catch (TokenExchangeException e) {
      return reject(
        503,
        'SERVICE_UNAVAILABLE',
        'Token issuance is temporarily unavailable.',
        Outcome.FAILED
      );
    }
  }

  private static Result reject(
    Integer statusCode,
    String errorCode,
    String message,
    Outcome outcome
  ) {
    Result result = new Result();
    result.statusCode = statusCode;
    result.errorCode = errorCode;
    result.message = message;
    result.outcome = outcome;
    return result;
  }

  private static void recordAttempt(Attempt attempt, Outcome outcome) {
    new AuditStore()
      .insertRow(
        new API_Access_Request__c(
          Email__c = attempt.email?.left(EMAIL_MAX_LENGTH),
          Purpose__c = attempt.purpose?.left(1000),
          Source_IP__c = attempt.sourceIp?.left(64),
          Correlation_Id__c = attempt.correlationId?.left(36),
          Channel__c = attempt.channel,
          Outcome__c = OUTCOME_VALUES.get(outcome)
        )
      );
  }

  private static Boolean isCredentialError(String message) {
    if (String.isBlank(message)) {
      return false;
    }
    String lower = message.toLowerCase();
    // A principal without the Client_Id/Client_Secret parameters fails the merge with
    // "Field Portfolio_API_Token_Auth.Client_Id does not exist."
    Boolean missingParameter =
      lower.contains(EXTERNAL_CREDENTIAL.toLowerCase() + '.') &&
      lower.contains('does not exist');
    return lower.contains('credential') || missingParameter;
  }

  private static Integer secondsUntilTomorrow() {
    Datetime midnight = Datetime.newInstance(
      Date.today().addDays(1),
      Time.newInstance(0, 0, 0, 0)
    );
    return Integer.valueOf(
      (midnight.getTime() - Datetime.now().getTime()) / 1000
    );
  }

  private static String stringValue(Object value) {
    if (value == null) {
      return null;
    }
    if (!(value instanceof String)) {
      throw new BodyException('Expected a string.');
    }
    return (String) value;
  }

  /**
   * @description Reads and writes API_Access_Request__c. Without sharing because the site
   *              guest user calls /auth/token: the guest has no access to the audit object
   *              (admin-only by design, ADR-028), yet every attempt must be recorded and the
   *              daily cap must count every issued row, including rows owned by other users.
   *              Nothing else runs in this context.
   */
  private without sharing class AuditStore {
    private Integer issuedToday() {
      return [
        SELECT COUNT()
        FROM API_Access_Request__c
        WHERE Outcome__c = 'Issued' AND CreatedDate = TODAY
      ];
    }

    private void insertRow(API_Access_Request__c row) {
      insert row;
    }
  }
}

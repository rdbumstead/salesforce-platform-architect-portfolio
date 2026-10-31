/**
 * @description       : Every sentence the API sends a person, in one place. Each message is a
 *                      constant or a small builder, so a test asserts the constant and not a
 *                      copy of the text. A message says what happened, what the person needs
 *                      and how to get it, in plain second person English with a closing period,
 *                      and never holds an exception type, a stack line or a class name. Also
 *                      builds the help link every error carries, which points at the error's
 *                      entry on the API reference page. Holds no data access.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 * @Test Class        : [ApiMessagesTest]
 **/
public with sharing class ApiMessages {
  /** The API reference page, without a spec, version or anchor. */
  public static final String REFERENCE_PAGE = 'https://ryanbumstead.com/api-lab/reference';
  /** The sample request id the header messages show. */
  public static final String SAMPLE_REQUEST_ID = '3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a';
  /** The token body sample, reused by every message that shows the shape. */
  public static final String TOKEN_BODY_SAMPLE = '{"email":"you@example.com","purpose":"Evaluating the API"}';
  /** The AI body sample. */
  public static final String AI_BODY_SAMPLE = '{"type":"CoverLetter","context":{"companyName":"Acme","role":"Solution Architect"}}';

  // ---------- A. Rules every call shares

  public static final String VERSION_UNSUPPORTED = 'X-API-Version must be v1 or v2. Send X-API-Version: v2 for the current version.';
  public static final String LOCK_BUSY = 'The API is busy for a moment. Wait 1 second and send the request again.';
  public static final String REQUEST_ID_MISSING =
    'Send an X-Request-Id header holding a UUID, for example X-Request-Id: ' +
    SAMPLE_REQUEST_ID +
    '. It lets a request be traced in the logs.';
  public static final String REQUEST_ID_INVALID =
    'X-Request-Id must be a UUID like ' +
    SAMPLE_REQUEST_ID +
    '. On /papi routes you can leave it out and one is made for you.';
  public static final String SOQL_OFFSET_NOTE = 'The X-Total-Count header says how many records there are.';

  /**
   * @description A number of seconds as words, with the singular for one.
   * @param count The number of seconds.
   * @return String For example 1 second or 30 seconds.
   */
  public static String seconds(Integer count) {
    return count + (count == 1 ? ' second' : ' seconds');
  }

  /**
   * @description A number of hours as words, with the singular for one.
   * @param count The number of hours.
   * @return String For example 1 hour or 5 hours.
   */
  public static String hours(Integer count) {
    return count + (count == 1 ? ' hour' : ' hours');
  }

  /**
   * @description The 410 for API v1 after its sunset date.
   * @param sunset The sunset date.
   * @return String The message.
   */
  public static String versionGone(Date sunset) {
    return 'API v1 was retired on ' +
      isoDate(sunset) +
      '. Send the header X-API-Version: v2 and call the same URL again.';
  }

  /**
   * @description The 410 for the old /v1/ URL spelling after its sunset date.
   * @param sunset The path sunset date.
   * @param versionlessUrl The same call without /v1/.
   * @return String The message.
   */
  public static String pathGone(Date sunset, String versionlessUrl) {
    return 'URLs with /v1/ were retired on ' +
      isoDate(sunset) +
      '. Call ' +
      versionlessUrl +
      ' instead. Nothing else about the request changes.';
  }

  /**
   * @description The 429 when the shared tier limit is used up.
   * @param tier PAPI, SAPI or AI.
   * @param limitPerMinute Requests allowed a minute on the tier.
   * @param waitSeconds Seconds until the next minute.
   * @return String The message.
   */
  public static String tierLimit(
    String tier,
    Integer limitPerMinute,
    Integer waitSeconds
  ) {
    return 'This API allows ' +
      limitPerMinute +
      ' requests a minute on ' +
      tier +
      ' routes, shared by every evaluator. Wait ' +
      seconds(waitSeconds) +
      ' and send the request again.';
  }

  /**
   * @description The 429 when one email asks for too many tokens.
   * @param waitSeconds Seconds until the next minute.
   * @return String The message.
   */
  public static String tokenLimit(Integer waitSeconds) {
    return 'Too many token requests for this email in the last minute. Wait ' +
      seconds(waitSeconds) +
      ' and try again.';
  }

  /**
   * @description The 400 for a limit the API cannot read.
   * @param maxSize The largest page size.
   * @return String The message.
   */
  public static String limitInvalid(Integer maxSize) {
    return 'limit must be a whole number from 1 to ' +
      maxSize +
      '. Leave it out to get the default page size.';
  }

  /**
   * @description The 400 for an offset the API cannot read or will not run.
   * @param maxOffset The largest offset.
   * @return String The message.
   */
  public static String offsetInvalid(Integer maxOffset) {
    return 'offset must be a whole number from 0 to ' +
      maxOffset +
      '. ' +
      SOQL_OFFSET_NOTE;
  }

  // ---------- B. Routing

  /**
   * @description The 404 for a route the API does not have.
   * @param method The HTTP method sent.
   * @param path The canonical path.
   * @return String The message.
   */
  public static String routeNotFound(String method, String path) {
    return 'There is no ' +
      method +
      ' ' +
      path +
      ' in this API. The routes are listed in the API reference.';
  }

  /**
   * @description The 401 for a caller with no token on a route that needs one.
   * @param path The route called, for example /papi/projects.
   * @param tokenUrl The site's token URL, see ApiSite.tokenUrl.
   * @return String The message.
   */
  public static String needsToken(String path, String tokenUrl) {
    return 'This route needs an evaluator token. Get one with POST ' +
      tokenUrl +
      ' and a JSON body with your email and a purpose. Then call ' +
      path +
      ' on the instance_url from that answer, with the header Authorization: Bearer <access_token>.';
  }

  /**
   * @description The 403 for a token holder who asks the instance address for a token.
   * @param tokenUrl The site's token URL.
   * @return String The message.
   */
  public static String tokensNotHere(String tokenUrl) {
    return 'This address does not issue tokens. Send POST ' +
      tokenUrl +
      ' without an Authorization header to get one.';
  }

  /**
   * @description The 405 message for a route called with a verb it does not have.
   * @param path The route called.
   * @param allowed The verbs it has, for example GET,HEAD.
   * @param verb The verb sent.
   * @param route The route name after the API root, to add the sentence about its body.
   * @return String The message.
   */
  public static String methodNotAllowed(
    String path,
    String allowed,
    String verb,
    String route
  ) {
    String message =
      path +
      ' takes ' +
      String.join(allowed.split(','), ' or ') +
      ', not ' +
      verb +
      '.';
    if (route == PAPIRouter.ROUTE_AUTH_TOKEN) {
      message += ' Send a JSON body like ' + TOKEN_BODY_SAMPLE + '.';
    } else if (route == PAPIRouter.ROUTE_AI_GENERATE) {
      message += ' See the request body in the API reference.';
    }
    return message;
  }

  // ---------- C. SAPI routes

  /**
   * @description The 400 for a v2 call that still uses the old filter name.
   * @param keyName The v2 name, for example projectKey.
   * @param idName The v1 name, for example projectId.
   * @return String The message.
   */
  public static String keyRenamed(String keyName, String idName) {
    return 'In v2 this filter is called ' +
      keyName +
      ', and it takes a public key. Rename ' +
      idName +
      ' to ' +
      keyName +
      '.';
  }

  /**
   * @description The 400 for a v2 filter value that is not a public key.
   * @param keyName For example projectKey.
   * @param listPath The route that lists the records, for example /sapi/projects.
   * @return String The message.
   */
  public static String keyInvalid(String keyName, String listPath) {
    return keyName +
      ' must be a public key, the key field of a record from GET ' +
      listPath +
      '. A Salesforce Id does not work in v2.';
  }

  /**
   * @description The 400 for a v1 filter value that is neither an Id nor a public key.
   * @param idName For example projectId.
   * @param listPath The route that lists the records, for example /sapi/projects.
   * @return String The message.
   */
  public static String idInvalid(String idName, String listPath) {
    return idName +
      ' must be the id or key field of a record from GET ' +
      listPath +
      '.';
  }

  /** The 400 for a persona list that holds an unknown value. */
  public static final String PERSONA_LIST_INVALID = 'persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.';
  /** The 400 for a single persona that is not one of the three. */
  public static final String PERSONA_INVALID = 'persona must be Admin, Developer or Architect.';

  /**
   * @description The 404 for a project path segment that matches no project.
   * @param segment What the caller sent.
   * @param isV2 True for v2, where only a key is read.
   * @return String The message.
   */
  public static String projectNotFound(String segment, Boolean isV2) {
    if (isV2) {
      return 'No project has the key ' +
        segment +
        '. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.';
    }
    return 'No project has the id or key ' +
      segment +
      '. GET /sapi/projects lists every project with its key.';
  }

  // ---------- D. PAPI routes

  public static final String PROFILE_ENDPOINT_INVALID = '/papi/profile needs full or summary after it. Call /papi/profile/full or /papi/profile/summary.';
  public static final String RESUME_ENDPOINT_INVALID = '/papi/resume needs generate after it. Call /papi/resume/generate.';
  public static final String MODE_INVALID = 'mode must be professional or casual.';

  /**
   * @description The 500 message. It holds the correlation id so the owner can find the
   *              logged detail, and no part of the exception.
   * @param correlationId The request's correlation id.
   * @return String The message.
   */
  public static String serverError(String correlationId) {
    return 'Something went wrong on our side, and it has been logged as ' +
      correlationId +
      '. Try again in a minute. If it keeps happening, send that id through ryanbumstead.com/contact.';
  }

  /**
   * @description The note on a partial 200.
   * @param sections The sections that could not be read.
   * @return String The message.
   */
  public static String partial(List<String> sections) {
    return 'Some sections could not be read this time: ' +
      String.join(sections, ', ') +
      '. Everything else is complete. Try again in a minute for the full result.';
  }

  public static final String HEALTH_NOT_REACHED = 'could not connect';
  public static final String HEALTH_NOT_SET_UP = 'not set up';

  /**
   * @description The health detail for a dependency that answered.
   * @param status The HTTP status.
   * @return String For example answered HTTP 503.
   */
  public static String healthAnswered(Integer status) {
    return 'answered HTTP ' + status;
  }

  // ---------- E. POST /papi/ai/generate

  public static final String AI_BODY_MISSING =
    'Send a JSON body, for example ' +
    AI_BODY_SAMPLE +
    '.';
  public static final String AI_BODY_NOT_JSON = 'The body is not valid JSON. Check the quotes and commas, and send Content-Type: application/json.';
  public static final String AI_BODY_NOT_OBJECT = 'The body must be one JSON object in braces, not a list or a single value.';
  public static final String AI_ALL_UNAVAILABLE = 'No AI provider could write this right now. Wait a few minutes and send it again.';
  public static final String AI_AGENTFORCE_BUDGET = 'Agentforce has used its requests for this hour. Leave out provider to let another provider answer, or try again after the hour.';
  public static final String AI_AGENTFORCE_DOWN = 'Agentforce did not answer. Leave out provider to let another provider answer, or try again in a few minutes.';
  /** Seconds the caller waits when every AI provider failed. */
  public static final Integer AI_RETRY_AFTER_SECONDS = 300;

  /**
   * @description The 400 for a missing enum field.
   * @param field The field name.
   * @param allowed The allowed values.
   * @return String The message.
   */
  public static String fieldMissing(String field, List<String> allowed) {
    return 'Add ' + field + ', one of ' + String.join(allowed, ', ') + '.';
  }

  /**
   * @description The 400 for an enum field with a value that is not allowed.
   * @param field The field name.
   * @param allowed The allowed values.
   * @return String The message.
   */
  public static String fieldInvalid(String field, List<String> allowed) {
    return field + ' must be one of ' + String.join(allowed, ', ') + '.';
  }

  // ---------- F. POST /papi/auth/token and the Lab token form

  public static final String TOKEN_BODY_NOT_JSON =
    'The body is not valid JSON. Send ' +
    TOKEN_BODY_SAMPLE +
    ' with Content-Type: application/json.';
  public static final String TOKEN_BODY_WRONG_SHAPE =
    'Send a JSON object with two text fields, email and purpose, for example ' +
    TOKEN_BODY_SAMPLE +
    '.';
  public static final String TOKEN_EMAIL_INVALID = 'Enter a working email address like name@example.com. It is only used to count tokens.';
  public static final String TOKEN_UNAVAILABLE = 'The token service did not answer. Wait a minute and try again.';

  /**
   * @description The 400 for a missing or too long purpose.
   * @param maxLength The longest purpose.
   * @return String The message.
   */
  public static String tokenPurposeInvalid(Integer maxLength) {
    return 'Add a purpose of up to ' +
      maxLength +
      ' characters, a few words on what you are evaluating.';
  }

  /**
   * @description The 503 when the day's tokens are all issued.
   * @param cap The daily cap.
   * @param hoursLeft Hours until new tokens are available.
   * @return String The message.
   */
  public static String tokenCapReached(Integer cap, Integer hoursLeft) {
    return 'Today\'s ' +
      cap +
      ' evaluator tokens are used up. New tokens are available again in about ' +
      hours(hoursLeft) +
      '. The API Lab on the site still works meanwhile.';
  }

  /**
   * @description The 503 when the token credential is not set up.
   * @param correlationId The request's correlation id.
   * @return String The message.
   */
  public static String tokenNotConfigured(String correlationId) {
    return 'Tokens cannot be issued right now because of a setup problem on our side. The API Lab on the site still works, and this has been logged as ' +
      correlationId +
      '.';
  }

  // ---------- G. /openapi

  /**
   * @description The 503 when the OpenAPI document is missing from the org.
   * @param pagesUrl The address of the same description on GitHub Pages.
   * @return String The message.
   */
  public static String openApiMissing(String pagesUrl) {
    return 'The API description is missing on the site right now. The same description is on GitHub at ' +
      pagesUrl +
      '.';
  }

  // ---------- H. API Lab

  public static final String LAB_CATALOG_MISSING = 'The list of API routes did not load. Reload the page. The API reference lists the same routes.';
  public static final String LAB_PATH_NOT_ALLOWED = 'The API Lab can call only the GET routes in its Endpoint list. Pick one there.';
  public static final String LAB_API_UNREACHABLE = 'The API Lab could not reach the API just now. Wait a minute and try again.';
  public static final String LAB_VERSION_NOT_ALLOWED = 'The API Lab can call version v1 or v2. Pick one of them.';

  /**
   * @description The Lab message for too many query parameters.
   * @param maxParams The most it accepts.
   * @return String The message.
   */
  public static String labTooManyParams(Integer maxParams) {
    return 'Use at most ' + maxParams + ' query parameters.';
  }

  /**
   * @description The Lab message for a parameter name the proxy will not send.
   * @param name The name, cut to a short length.
   * @return String The message.
   */
  public static String labParamName(String name) {
    return (name == null ? 'An empty name' : name.left(40)) +
      ' is not a valid parameter name. Start with a letter and use letters, numbers and underscores only.';
  }

  /**
   * @description The Lab message for a parameter value that is missing or too long.
   * @param name The parameter name.
   * @param maxLength The longest value.
   * @return String The message.
   */
  public static String labParamValue(String name, Integer maxLength) {
    return 'The value for ' +
      name +
      ' is missing or too long. Keep it to ' +
      maxLength +
      ' characters or fewer.';
  }

  // ---------- The help link

  /**
   * @description The anchor of an error code's entry on the API reference page, for example
   *              error-bad-request for BAD_REQUEST.
   * @param errorCode The error code.
   * @return String The anchor without the hash.
   */
  public static String helpAnchor(String errorCode) {
    return 'error-' +
      (String.isBlank(errorCode)
        ? 'unknown'
        : errorCode.toLowerCase().replace('_', '-'));
  }

  /**
   * @description The link to an error's entry on the API reference page, on the spec of the
   *              API the call was made to. A browser follows it with a GET.
   * @param errorCode The error code.
   * @param spec sapi or papi.
   * @return String For example https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request.
   */
  public static String helpUrl(String errorCode, String spec) {
    return REFERENCE_PAGE +
      '?spec=' +
      ('sapi'.equals(spec) ? 'sapi' : 'papi') +
      '&version=v2#' +
      helpAnchor(errorCode);
  }

  private static String isoDate(Date value) {
    return value == null ? '' : String.valueOf(value);
  }
}

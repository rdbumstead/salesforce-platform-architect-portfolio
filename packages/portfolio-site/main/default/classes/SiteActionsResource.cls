/**
 * @description       : The static site's request time actions (/site/actions/<action>). The
 *                      site's Pages Functions call it with the edge user's client credentials
 *                      token, one action per call, and each action delegates to the controller
 *                      method the Lightning component calls today, so the answer and the
 *                      refusal text are the same. Seven actions: contact, testimonial,
 *                      cover-letter, lab-invoke and lab-token (POST), glass-box and
 *                      pipeline-status (GET). Only a user holding the Site_Edge_Actions custom
 *                      permission may call it. The body is checked for shape before any
 *                      controller runs. The visitor's IP hash in X-Client-Ip-Hash is read by
 *                      SiteEdgeContext, never here. Success is 200 {"result": ...} with null
 *                      fields left out. Failure is {"error": CODE, "message": text}.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 * @Test Class        : [SiteActionsResourceTest]
 **/
@RestResource(urlMapping='/site/actions/*')
global with sharing class SiteActionsResource {
  public static final String ACTION_CONTACT = 'contact';
  public static final String ACTION_TESTIMONIAL = 'testimonial';
  public static final String ACTION_COVER_LETTER = 'cover-letter';
  public static final String ACTION_LAB_INVOKE = 'lab-invoke';
  public static final String ACTION_LAB_TOKEN = 'lab-token';
  public static final String ACTION_GLASS_BOX = 'glass-box';
  public static final String ACTION_PIPELINE_STATUS = 'pipeline-status';

  /** Set to 1 by the build when it replays a lab call, so no usage counter row is written. */
  public static final String RECORDING_HEADER = 'X-Site-Recording';
  public static final String REQUEST_ID_HEADER = 'X-Request-Id';
  private static final Integer MAX_BODY_BYTES = 100000;
  private static final Pattern REQUEST_ID_PATTERN = Pattern.compile(
    '[A-Za-z0-9-]{1,64}'
  );

  private static final Set<String> POST_ACTIONS = new Set<String>{
    ACTION_CONTACT,
    ACTION_TESTIMONIAL,
    ACTION_COVER_LETTER,
    ACTION_LAB_INVOKE,
    ACTION_LAB_TOKEN
  };
  private static final Set<String> GET_ACTIONS = new Set<String>{
    ACTION_GLASS_BOX,
    ACTION_PIPELINE_STATUS
  };
  private static final Set<String> CONTACT_FIELDS = new Set<String>{
    'firstName',
    'lastName',
    'email',
    'company',
    'message',
    'website',
    'elapsedMs'
  };
  private static final Set<String> TESTIMONIAL_COMMON = new Set<String>{
    'mode',
    'authorName',
    'authorTitle',
    'relationship',
    'vibeMode',
    'website',
    'elapsedMs'
  };
  private static final Set<String> FRAGMENT_FIELDS = new Set<String>{
    'strengthId',
    'outcomeId',
    'note'
  };
  private static final Set<String> OWN_FIELDS = new Set<String>{ 'ownWords' };
  private static final Set<String> COVER_LETTER_FIELDS = new Set<String>{
    'companyName',
    'jobTitle',
    'jobDescription'
  };
  private static final Set<String> LAB_INVOKE_FIELDS = new Set<String>{
    'path',
    'params',
    'apiVersion'
  };
  private static final Set<String> LAB_TOKEN_FIELDS = new Set<String>{
    'email',
    'purpose'
  };

  /** Raised when the request is not shaped as the action needs. */
  public class BadRequestException extends Exception {
  }

  @TestVisible
  private static Boolean throwException = false;

  /**
   * @description Runs a GET action: glass-box or pipeline-status.
   * @example
   * GET /services/apexrest/site/actions/glass-box
   */
  @HttpGet
  global static void doGet() {
    handle('GET');
  }

  /**
   * @description Runs a POST action: contact, testimonial, cover-letter, lab-invoke or
   *              lab-token.
   * @example
   * POST /services/apexrest/site/actions/lab-token
   */
  @HttpPost
  global static void doPost() {
    handle('POST');
  }

  private static void handle(String method) {
    RestRequest req = RestContext.request;
    RestResponse res = RestContext.response;
    res.addHeader('Content-Type', 'application/json');
    res.addHeader('Cache-Control', 'no-store');
    String requestId = req.headers.get(REQUEST_ID_HEADER);
    if (requestId != null && REQUEST_ID_PATTERN.matcher(requestId).matches()) {
      res.addHeader(REQUEST_ID_HEADER, requestId);
    }
    if (!SiteEdgeContext.isEdgeCaller()) {
      respond(
        res,
        403,
        error(
          'FORBIDDEN',
          'The site actions need the Site_Edge_Actions permission.'
        )
      );
      return;
    }
    try {
      if (Test.isRunningTest() && throwException) {
        throw new CalloutException('Forced Exception');
      }
      String action = actionOf(req);
      checkMethod(action, method);
      Object result = run(action, req);
      respond(
        res,
        200,
        '{"result":' + SiteExportResource.serialize(result) + '}'
      );
    } catch (BadRequestException e) {
      respond(res, 400, error('BAD_REQUEST', e.getMessage()));
    } catch (SiteActionException e) {
      refuse(res, method, e.getMessage());
    } catch (Exception e) {
      respond(
        res,
        500,
        error('CALL_FAILED', 'The call failed: ' + e.getTypeName())
      );
    }
  }

  private static String actionOf(RestRequest req) {
    String uri = req.requestURI == null
      ? ''
      : req.requestURI.substringBefore('?');
    return uri.removeEnd('/').substringAfterLast('/');
  }

  private static void checkMethod(String action, String method) {
    Boolean known =
      POST_ACTIONS.contains(action) || GET_ACTIONS.contains(action);
    if (!known) {
      throw new BadRequestException('Unknown action.');
    }
    if (
      (method == 'POST' && !POST_ACTIONS.contains(action)) ||
      (method == 'GET' && !GET_ACTIONS.contains(action))
    ) {
      throw new BadRequestException(
        'This action does not take ' + method + '.'
      );
    }
  }

  private static Object run(String action, RestRequest req) {
    if (action == ACTION_GLASS_BOX) {
      return FooterController.getSystemSnapshot();
    }
    if (action == ACTION_PIPELINE_STATUS) {
      return GovernanceController.getPipelineStatus();
    }
    Map<String, Object> body = parseBody(req);
    switch on action {
      when 'contact' {
        return runContact(body);
      }
      when 'testimonial' {
        return runTestimonial(body);
      }
      when 'cover-letter' {
        return runCoverLetter(body);
      }
      when 'lab-invoke' {
        return runLabInvoke(body, req);
      }
      when else {
        return runLabToken(body);
      }
    }
  }

  private static Object runContact(Map<String, Object> body) {
    onlyKeys(body, CONTACT_FIELDS);
    return ContactFormController.submitContact(
      text(body, 'firstName'),
      text(body, 'lastName'),
      text(body, 'email'),
      text(body, 'company'),
      text(body, 'message'),
      text(body, 'website'),
      whole(body, 'elapsedMs')
    );
  }

  private static Object runTestimonial(Map<String, Object> body) {
    String mode = text(body, 'mode');
    if (mode != 'fragments' && mode != 'own') {
      throw new BadRequestException('mode must be fragments or own.');
    }
    Set<String> allowed = new Set<String>(TESTIMONIAL_COMMON);
    allowed.addAll(mode == 'own' ? OWN_FIELDS : FRAGMENT_FIELDS);
    onlyKeys(body, allowed);
    if (mode == 'own') {
      return TestimonialController.submitOwnTestimonial(
        text(body, 'authorName'),
        text(body, 'authorTitle'),
        text(body, 'relationship'),
        text(body, 'vibeMode'),
        text(body, 'ownWords'),
        text(body, 'website'),
        whole(body, 'elapsedMs')
      );
    }
    return TestimonialController.submitTestimonial(
      text(body, 'authorName'),
      text(body, 'authorTitle'),
      text(body, 'relationship'),
      text(body, 'vibeMode'),
      text(body, 'strengthId'),
      text(body, 'outcomeId'),
      text(body, 'note'),
      text(body, 'website'),
      whole(body, 'elapsedMs')
    );
  }

  private static Object runCoverLetter(Map<String, Object> body) {
    onlyKeys(body, COVER_LETTER_FIELDS);
    return ApiLabController.generateCoverLetter(
      text(body, 'companyName'),
      text(body, 'jobTitle'),
      text(body, 'jobDescription')
    );
  }

  private static Object runLabInvoke(
    Map<String, Object> body,
    RestRequest req
  ) {
    onlyKeys(body, LAB_INVOKE_FIELDS);
    Map<String, String> params = textMap(body, 'params');
    String path = text(body, 'path');
    String apiVersion = text(body, 'apiVersion');
    ApiLabController.suppressUsageCount =
      headerValue(req, RECORDING_HEADER) == '1';
    try {
      return ApiLabController.invokeVersioned(path, params, apiVersion);
    } finally {
      ApiLabController.suppressUsageCount = false;
    }
  }

  /**
   * @description A request header by name in any letter case. HTTP header names are not
   *              case sensitive, and a client may send them in lower case, so an exact map
   *              lookup would miss them. SiteEdgeContext reads the IP hash the same way.
   * @param req The REST request.
   * @param name The header name.
   * @return String The value, or null when the header is absent.
   */
  private static String headerValue(RestRequest req, String name) {
    if (req == null || req.headers == null) {
      return null;
    }
    for (String key : req.headers.keySet()) {
      if (key != null && key.equalsIgnoreCase(name)) {
        return req.headers.get(key);
      }
    }
    return null;
  }

  private static Object runLabToken(Map<String, Object> body) {
    onlyKeys(body, LAB_TOKEN_FIELDS);
    return ApiLabController.requestEvaluatorToken(
      text(body, 'email'),
      text(body, 'purpose')
    );
  }

  private static Map<String, Object> parseBody(RestRequest req) {
    Blob raw = req.requestBody;
    if (raw == null || raw.size() == 0) {
      throw new BadRequestException('A JSON body is required.');
    }
    if (raw.size() > MAX_BODY_BYTES) {
      throw new BadRequestException('The body is too large.');
    }
    Object parsed;
    try {
      parsed = JSON.deserializeUntyped(raw.toString());
    } catch (JSONException e) {
      throw new BadRequestException('The body must be JSON.');
    }
    if (!(parsed instanceof Map<String, Object>)) {
      throw new BadRequestException('The body must be a JSON object.');
    }
    return (Map<String, Object>) parsed;
  }

  private static void onlyKeys(Map<String, Object> body, Set<String> allowed) {
    for (String key : body.keySet()) {
      if (!allowed.contains(key)) {
        throw new BadRequestException('Unknown field ' + key + '.');
      }
    }
  }

  private static String text(Map<String, Object> body, String key) {
    Object value = body.get(key);
    if (value == null) {
      return null;
    }
    if (!(value instanceof String)) {
      throw new BadRequestException(key + ' must be text.');
    }
    return (String) value;
  }

  private static Integer whole(Map<String, Object> body, String key) {
    Object value = body.get(key);
    if (value == null) {
      return null;
    }
    if (
      !(value instanceof Integer || value instanceof Long) &&
      !(value instanceof Decimal && ((Decimal) value).scale() == 0)
    ) {
      throw new BadRequestException(key + ' must be a whole number.');
    }
    Long wholeValue = Long.valueOf(String.valueOf(value));
    if (wholeValue < 0 || wholeValue > 2147483647L) {
      throw new BadRequestException(key + ' is out of range.');
    }
    return Integer.valueOf(wholeValue);
  }

  private static Map<String, String> textMap(
    Map<String, Object> body,
    String key
  ) {
    Object value = body.get(key);
    if (value == null) {
      return null;
    }
    if (!(value instanceof Map<String, Object>)) {
      throw new BadRequestException(key + ' must be an object.');
    }
    Map<String, String> result = new Map<String, String>();
    Map<String, Object> raw = (Map<String, Object>) value;
    for (String name : raw.keySet()) {
      Object item = raw.get(name);
      if (!(item instanceof String)) {
        throw new BadRequestException(key + '.' + name + ' must be text.');
      }
      result.put(name, (String) item);
    }
    return result;
  }

  /**
   * Maps a controller's refusal to a status. The text is kept, because it is the same text
   * the component shows today. Most are the visitor's input (400). The rate limit texts are
   * 429, the texts that say a provider or the API cannot be reached are 503, and a failed
   * save is 500. A GET action has no input, so any refusal there is 503.
   */
  private static void refuse(RestResponse res, String method, String message) {
    if (method == 'GET') {
      respond(res, 503, error('UNAVAILABLE', message));
    } else if (
      message == SubmissionGuard.HASH_RATE_MESSAGE ||
      message == ContactFormController.RATE_LIMITED_MESSAGE ||
      message == TestimonialController.RATE_LIMITED_MESSAGE ||
      message == ApiLabController.COVER_LETTER_RATE_MESSAGE
    ) {
      res.addHeader('Retry-After', '60');
      respond(res, 429, error('RATE_LIMITED', message));
    } else if (
      message == ApiLabController.NO_PROVIDER_MESSAGE ||
      message == ApiMessages.LAB_API_UNREACHABLE
    ) {
      respond(res, 503, error('UNAVAILABLE', message));
    } else if (
      message == ContactFormController.SAVE_FAILED_MESSAGE ||
      message == TestimonialController.SAVE_FAILED_MESSAGE
    ) {
      respond(res, 500, error('CALL_FAILED', message));
    } else {
      respond(res, 400, error('BAD_REQUEST', message));
    }
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

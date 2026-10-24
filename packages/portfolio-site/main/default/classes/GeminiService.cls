/**
 * @description       : Gemini implementation of the AI Generation Service. The model id and
 *                      the callout timeout come from the Gemini record of
 *                      AI_Provider_Config__mdt, so a model switch is a record change. A
 *                      thinking model returns its reasoning as parts marked thought, ahead of
 *                      the answer. Only the answer parts are returned. A response with no answer
 *                      text comes back empty, which the dispatch treats as a failed attempt.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [GeminiServiceTest]
 **/
public with sharing class GeminiService implements IAIGenerationService {
  /**
   * @description Model used when the Gemini record names none (gemini-2.0-flash was shut
   *              down on 2026-06-01). Gemma rejects systemInstruction, so the body carries
   *              contents/parts only.
   */
  public static final String MODEL = 'gemma-4-31b-it';

  /**
   * Callout timeout when the Gemini config record sets none: 60 s (owner decision
   * 2026-10-21, replacing an earlier 20 s). Gemma 4 always reasons before it answers, and the
   * owner measured 28.7 s for a trivial prompt.
   */
  public static final Integer DEFAULT_TIMEOUT_MS = 60000;

  /** DeveloperName of this provider's AI_Provider_Config__mdt record. */
  public static final String CONFIG_NAME = 'Gemini';

  private static final Integer MAX_TIMEOUT_MS = 120000;
  private static final String ENDPOINT_PREFIX = 'callout:Gemini_API/v1beta/models/';
  private static final String ENDPOINT_SUFFIX = ':generateContent';
  /** A model id is one path segment: letters, digits, dot, dash, underscore. */
  private static final Pattern MODEL_ID = Pattern.compile(
    '^[A-Za-z0-9._-]{1,100}$'
  );

  @TestVisible
  private static Boolean configOverridden = false;
  @TestVisible
  private static AI_Provider_Config__mdt configOverride;

  // --- 1. Interface Implementation (Instance Method) ---
  // This allows the Controller to treat this class as an IAIGenerationService
  public String generateContent(String prompt, Map<String, Object> context) {
    return GeminiService.generateContentStatic(prompt);
  }

  public Boolean isAvailable() {
    return true;
  }

  // --- 2. Static Utility Method (Kept for LWC/Tests) ---
  /**
   * @description Calls the configured model and returns the answer text.
   * @param prompt Prompt text.
   * @return String The answer, an empty string when the response holds no answer, or text
   *                starting "Error: Unable to generate content." or "Exception: " on failure.
   */
  public static String generateContentStatic(String prompt) {
    failureDetail = null;
    try {
      HttpResponse res = callGemini(prompt);
      if (res.getStatusCode() == 200) {
        String answer = parseResponse(res.getBody());
        if (String.isBlank(answer)) {
          failureDetail = 'HTTP 200 with no answer text';
        }
        return answer;
      }
      failureDetail = 'HTTP ' + res.getStatusCode();
      return 'Error: Unable to generate content. (Status: ' +
        res.getStatusCode() +
        ')';
    } catch (Exception e) {
      failureDetail = shortDetail(e.getTypeName() + ': ' + e.getMessage());
      return 'Exception: ' + e.getMessage();
    }
  }

  /**
   * @description What went wrong in the last call of this transaction, for the dispatch's
   *              Attempt.detail: "HTTP 503", "HTTP 200 with no answer
   *              text", or the exception type and a short message. The API key travels in
   *              a header merged by the Named Credential and never reaches Apex, and any URL
   *              or key=value pair in a message is replaced before it is kept.
   * @return String The detail, or null when the last call served an answer.
   */
  public static String lastFailureDetail() {
    return failureDetail;
  }

  private static String failureDetail;

  private static final Integer DETAIL_MAX_LENGTH = 120;

  @TestVisible
  private static String shortDetail(String text) {
    if (text == null) {
      return null;
    }
    String cleaned = text.replaceAll('(?i)https?://\\S+', '[url]')
      .replaceAll(
        '(?i)(api[_-]?key|key|token|secret|password|authorization)\\s*[=:]\\s*\\S+',
        '$1=[redacted]'
      )
      .normalizeSpace();
    return cleaned.length() > DETAIL_MAX_LENGTH
      ? cleaned.substring(0, DETAIL_MAX_LENGTH)
      : cleaned;
  }

  /**
   * @description Model id in use: Model_Or_Template__c of the Gemini record when it is a
   *              valid id, else MODEL. The endpoint and the reported model both use it.
   * @return String The model id.
   */
  public static String model() {
    String configured = config()?.Model_Or_Template__c;
    if (String.isBlank(configured)) {
      return MODEL;
    }
    String trimmed = configured.trim();
    return MODEL_ID.matcher(trimmed).matches() ? trimmed : MODEL;
  }

  /**
   * @description The generateContent endpoint for the model in use.
   * @return String Callout URL through the Gemini_API Named Credential.
   */
  public static String endpoint() {
    return ENDPOINT_PREFIX + model() + ENDPOINT_SUFFIX;
  }

  // --- Helpers ---
  private static HttpResponse callGemini(String prompt) {
    RequestWrapper payload = new RequestWrapper(prompt);
    HttpRequest req = new HttpRequest();
    req.setEndpoint(endpoint());
    req.setMethod('POST');
    req.setHeader('Content-Type', 'application/json');
    req.setTimeout(timeoutMs());
    req.setBody(JSON.serialize(payload));
    return new Http().send(req);
  }

  private static AI_Provider_Config__mdt config() {
    if (configOverridden) {
      return configOverride;
    }
    return AI_Provider_Config__mdt.getInstance(CONFIG_NAME);
  }

  /**
   * @description Callout timeout: Timeout_Ms__c of the Gemini config record, else 60 s. A
   *              thinking model often needs more than the 10 s platform default.
   * @return Integer Timeout in milliseconds, between 1 and 120000.
   */
  @TestVisible
  private static Integer timeoutMs() {
    Decimal configured = config()?.Timeout_Ms__c;
    if (configured == null || configured <= 0) {
      return DEFAULT_TIMEOUT_MS;
    }
    return Math.min(configured.intValue(), MAX_TIMEOUT_MS);
  }

  /**
   * @description Joins, in order, the text of every part of the first candidate that is not
   *              marked thought. Reasoning is never returned.
   * @param jsonBody Response body of a 200.
   * @return String The answer, or an empty string when there is none.
   */
  @TestVisible
  private static String parseResponse(String jsonBody) {
    Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(
      jsonBody
    );
    List<Object> candidates = (List<Object>) root.get('candidates');
    if (candidates == null || candidates.isEmpty()) {
      return '';
    }
    Map<String, Object> firstCandidate = (Map<String, Object>) candidates[0];
    Map<String, Object> content = (Map<String, Object>) firstCandidate.get(
      'content'
    );
    List<Object> parts = (List<Object>) content?.get('parts');
    if (parts == null) {
      return '';
    }
    List<String> answer = new List<String>();
    for (Object item : parts) {
      Map<String, Object> part = (Map<String, Object>) item;
      Object thought = part.get('thought');
      Object text = part.get('text');
      if (thought instanceof Boolean && (Boolean) thought) {
        continue;
      }
      if (text instanceof String) {
        answer.add((String) text);
      }
    }
    return String.join(answer, '');
  }

  // --- Wrappers ---
  public class RequestWrapper {
    public List<Content> contents;
    public RequestWrapper(String text) {
      this.contents = new List<Content>{ new Content(text) };
    }
  }
  public class Content {
    public List<Part> parts;
    public Content(String text) {
      this.parts = new List<Part>{ new Part(text) };
    }
  }
  public class Part {
    public String text;
    public Part(String text) {
      this.text = text;
    }
  }
}

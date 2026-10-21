/**
 * @description       : Gemini implementation of the AI Generation Service.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [GeminiServiceTest]
 **/
public with sharing class GeminiService implements IAIGenerationService {
  /**
   * @description Model served through the Gemini API (gemini-2.0-flash was shut down on
   *              2026-06-01). Gemma rejects systemInstruction, so the body carries
   *              contents/parts only.
   */
  public static final String MODEL = 'gemma-4-31b-it';

  /** Callout timeout when the Gemini config record sets none (PD-D11, 20 s). */
  public static final Integer DEFAULT_TIMEOUT_MS = 20000;

  /** DeveloperName of this provider's AI_Provider_Config__mdt record. */
  public static final String CONFIG_NAME = 'Gemini';

  private static final Integer MAX_TIMEOUT_MS = 120000;

  @TestVisible
  private static final String ENDPOINT =
    'callout:Gemini_API/v1beta/models/' +
    MODEL +
    ':generateContent';

  // --- 1. Interface Implementation (Instance Method) ---
  // This allows the Controller to treat this class as an IAIGenerationService
  public String generateContent(String prompt, Map<String, Object> context) {
    return GeminiService.generateContentStatic(prompt);
  }

  public Boolean isAvailable() {
    return true;
  }

  // --- 2. Static Utility Method (Kept for LWC/Tests) ---
  public static String generateContentStatic(String prompt) {
    try {
      HttpResponse res = callGemini(prompt);
      if (res.getStatusCode() == 200) {
        return parseResponse(res.getBody());
      }
      System.debug('Gemini Error: ' + res.getBody());
      return 'Error: Unable to generate content. (Status: ' +
        res.getStatusCode() +
        ')';
    } catch (Exception e) {
      return 'Exception: ' + e.getMessage();
    }
  }

  // --- Helpers ---
  private static HttpResponse callGemini(String prompt) {
    RequestWrapper payload = new RequestWrapper(prompt);
    HttpRequest req = new HttpRequest();
    req.setEndpoint(ENDPOINT);
    req.setMethod('POST');
    req.setHeader('Content-Type', 'application/json');
    req.setTimeout(timeoutMs());
    req.setBody(JSON.serialize(payload));
    return new Http().send(req);
  }

  /**
   * @description Callout timeout: Timeout_Ms__c of the Gemini config record, else 20 s. A
   *              thinking model often needs more than the 10 s platform default (PD-D11).
   * @return Integer Timeout in milliseconds, between 1 and 120000.
   */
  @TestVisible
  private static Integer timeoutMs() {
    Decimal configured = AI_Provider_Config__mdt.getInstance(CONFIG_NAME)
      ?.Timeout_Ms__c;
    if (configured == null || configured <= 0) {
      return DEFAULT_TIMEOUT_MS;
    }
    return Math.min(configured.intValue(), MAX_TIMEOUT_MS);
  }

  private static String parseResponse(String jsonBody) {
    Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(
      jsonBody
    );
    List<Object> candidates = (List<Object>) root.get('candidates');
    if (candidates != null && !candidates.isEmpty()) {
      Map<String, Object> firstCandidate = (Map<String, Object>) candidates[0];
      Map<String, Object> content = (Map<String, Object>) firstCandidate.get(
        'content'
      );
      List<Object> parts = (List<Object>) content.get('parts');
      if (parts != null && !parts.isEmpty()) {
        Map<String, Object> firstPart = (Map<String, Object>) parts[0];
        return (String) firstPart.get('text');
      }
    }
    return '';
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

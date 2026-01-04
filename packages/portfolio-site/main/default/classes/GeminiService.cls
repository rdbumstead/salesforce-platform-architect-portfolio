/**
 * @description       : Gemini implementation of the AI Generation Service.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [GeminiServiceTest]
 **/
public with sharing class GeminiService implements IAIGenerationService {
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
    req.setEndpoint(
      'callout:Gemini_API/v1beta/models/gemini-2.0-flash:generateContent'
    );
    req.setMethod('POST');
    req.setHeader('Content-Type', 'application/json');
    req.setBody(JSON.serialize(payload));
    return new Http().send(req);
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

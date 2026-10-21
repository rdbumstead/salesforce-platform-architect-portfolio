/**
 * @description       : Controller for LWC components requiring content generation.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 * @Test Class        : [ContentGenerationControllerTest]
 **/
public with sharing class ContentGenerationController {
  /**
   * @description Custom exception for content generation failures.
   */
  public class ContentGenerationException extends Exception {
  }

  @TestVisible
  private static IAIGenerationService mockAgentforceService;
  @TestVisible
  private static IAIGenerationService mockGeminiService;
  @TestVisible
  private static IAIGenerationService mockLocalService;

  /**
   * @description Generates a cover letter using the best available service.
   * @param companyName Name of the target company.
   * @param jobTitle Title of the job.
   * @param jobDescription Description of the job.
   * @return String The generated cover letter text.
   * @throws AuraHandledException If all services fail.
   */
  @AuraEnabled
  public static String generateCoverLetter(
    String companyName,
    String jobTitle,
    String jobDescription
  ) {
    // Input validation
    if (String.isBlank(companyName)) {
      throw new AuraHandledException('Company name is required.');
    }
    if (String.isBlank(jobTitle)) {
      throw new AuraHandledException('Job title is required.');
    }

    Map<String, Object> context = new Map<String, Object>{
      'companyName' => companyName,
      'jobTitle' => jobTitle,
      'jobDescription' => jobDescription
    };

    String prompt =
      'Write a cover letter for ' +
      jobTitle +
      ' at ' +
      companyName;

    List<String> errorMessages = new List<String>();
    IAIGenerationService service;

    // 1. Try Agentforce (Gold Path)
    // Use test mock if set, otherwise instantiate regular service
    service = (mockAgentforceService != null)
      ? mockAgentforceService
      : new AgentforceService();

    if (service.isAvailable()) {
      try {
        return service.generateContent(prompt, context);
      } catch (CalloutException e) {
        errorMessages.add('Agentforce: ' + e.getMessage());
      } catch (Exception e) {
        errorMessages.add('Agentforce: Unexpected error - ' + e.getMessage());
      }
    }

    // 2. Try Gemini (Silver Path)
    service = (mockGeminiService != null)
      ? mockGeminiService
      : new GeminiService();

    if (service.isAvailable()) {
      try {
        return service.generateContent(prompt, context);
      } catch (CalloutException e) {
        errorMessages.add('Gemini: ' + e.getMessage());
      } catch (Exception e) {
        errorMessages.add('Gemini: Unexpected error - ' + e.getMessage());
      }
    }

    // 3. Fallback to Local Templates (Bronze Path - Always Available)
    try {
      service = (mockLocalService != null)
        ? mockLocalService
        : new LocalTemplateService();
      return service.generateContent(prompt, context);
    } catch (Exception e) {
      errorMessages.add('LocalTemplate: ' + e.getMessage());

      // All fallbacks failed
      throw new AuraHandledException(
        'Content generation failed. Errors: ' + String.join(errorMessages, '; ')
      );
    }
  }

  // --- API dispatch (PAPI /ai/generate) ---

  public static final String PROVIDER_GEMINI = 'Gemini';
  public static final String PROVIDER_LOCAL = 'Local';
  public static final String MODEL_GEMINI = 'gemini-2.0-flash';
  public static final String MODEL_LOCAL = 'local-template';

  // GeminiService.generateContent reports failure by returning text with these prefixes
  // instead of throwing, so the dispatch treats such text as a failed attempt.
  private static final List<String> GEMINI_FAILURE_PREFIXES = new List<String>{
    'Error: Unable to generate content.',
    'Exception: '
  };

  /**
   * @description Outcome of an API dispatch: the text and which provider produced it.
   */
  public class GenerationResult {
    public final String content;
    public final String provider;
    public final String model;
    public final Boolean fallbackOccurred;

    /**
     * @description Creates a result.
     * @param content Generated text.
     * @param provider PROVIDER_GEMINI or PROVIDER_LOCAL.
     * @param model Model identifier.
     * @param fallbackOccurred True when the primary provider did not serve the request.
     */
    public GenerationResult(
      String content,
      String provider,
      String model,
      Boolean fallbackOccurred
    ) {
      this.content = content;
      this.provider = provider;
      this.model = model;
      this.fallbackOccurred = fallbackOccurred;
    }
  }

  /**
   * @description Dispatch for the REST API: Gemini first, then the local template. Agentforce
   *              is never consulted, because it is deferred and AgentforceService is a mock
   *              (build plan P5). generateCoverLetter keeps its own chain unchanged.
   * @param prompt Prompt text for the model.
   * @param context Values for the providers (companyName, jobTitle, jobDescription, ...).
   * @param localAllowed True when the local template can serve this request type.
   * @return GenerationResult The content and the provider that served it.
   * @throws ContentGenerationException When no provider produced usable content.
   */
  public static GenerationResult generateWithoutAgentforce(
    String prompt,
    Map<String, Object> context,
    Boolean localAllowed
  ) {
    List<String> errorMessages = new List<String>();

    IAIGenerationService gemini = (mockGeminiService != null)
      ? mockGeminiService
      : new GeminiService();
    if (gemini.isAvailable()) {
      try {
        String text = gemini.generateContent(prompt, context);
        if (isUsable(text)) {
          return new GenerationResult(
            text,
            PROVIDER_GEMINI,
            MODEL_GEMINI,
            false
          );
        }
        errorMessages.add('Gemini: no usable content');
      } catch (Exception e) {
        errorMessages.add('Gemini: ' + e.getMessage());
      }
    } else {
      errorMessages.add('Gemini: unavailable');
    }

    if (localAllowed == true) {
      IAIGenerationService local = (mockLocalService != null)
        ? mockLocalService
        : new LocalTemplateService();
      try {
        String text = local.generateContent(prompt, context);
        if (String.isNotBlank(text)) {
          return new GenerationResult(text, PROVIDER_LOCAL, MODEL_LOCAL, true);
        }
        errorMessages.add('LocalTemplate: no content');
      } catch (Exception e) {
        errorMessages.add('LocalTemplate: ' + e.getMessage());
      }
    }

    throw new ContentGenerationException(
      'Content generation failed. Errors: ' + String.join(errorMessages, '; ')
    );
  }

  private static Boolean isUsable(String text) {
    if (String.isBlank(text)) {
      return false;
    }
    for (String prefix : GEMINI_FAILURE_PREFIXES) {
      if (text.startsWith(prefix)) {
        return false;
      }
    }
    return true;
  }
}

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
    service = new AgentforceService();
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
    service = new GeminiService();
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
      service = new LocalTemplateService();
      return service.generateContent(prompt, context);
    } catch (Exception e) {
      errorMessages.add('LocalTemplate: ' + e.getMessage());

      // All fallbacks failed
      throw new AuraHandledException(
        'Content generation failed. Errors: ' + String.join(errorMessages, '; ')
      );
    }
  }
}

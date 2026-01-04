/**
 * @description       : Local implementation of the AI Generation Service using templates.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [LocalTemplateServiceTest]
 **/
public with sharing class LocalTemplateService implements IAIGenerationService {
  /**
   * @description Generates content using local deterministic templates.
   * @param prompt The prompt to send.
   * @param context Additional context map.
   * @return String Generated content.
   */
  public String generateContent(String prompt, Map<String, Object> context) {
    // Deterministic Fallback
    String jobTitle = (String) context.get('jobTitle');
    String company = (String) context.get('companyName');

    return 'Dear Hiring Manager at ' +
      company +
      ',\n\nI am interested in the ' +
      jobTitle +
      ' role. My experience as a Salesforce Architect makes me a great fit.\n\nSincerely,\nRyan Bumstead';
  }

  public Boolean isAvailable() {
    return true; // Always available
  }
}

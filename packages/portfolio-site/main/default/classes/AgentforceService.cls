/**
 * @description       : Agentforce provider for the content generation dispatch. generateContent()
 *                      runs the Prompt Builder template named on the AI_Provider_Config__mdt
 *                      record Agentforce (Model_Or_Template__c, else Portfolio_Cover_Letter),
 *                      passing the whole prompt as its one input, Input:Prompt. The template adds
 *                      nothing of its own, so the prompt the dispatch builds is the prompt the
 *                      model reads. The call goes through PromptTemplateClient, which tests stub.
 *                      It runs as the context user, who needs Prompt Template User.
 *                      isAvailable() is the switch (Enabled__c) and is false for a site guest,
 *                      who reaches Agentforce only through ApiLabController's call to
 *                      POST /papi/ai/generate, which runs as the integration user.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/12/2025
 * @Test Class        : [AgentforceServiceTest]
 **/
public with sharing class AgentforceService implements IAIGenerationService {
  /** DeveloperName of this provider's AI_Provider_Config__mdt record. */
  public static final String CONFIG_NAME = 'Agentforce';

  /** Model reported when the record names no model or template. */
  public static final String DEFAULT_MODEL = 'agentforce';

  /** The prompt template run when the record names none. */
  public static final String TEMPLATE_NAME = 'Portfolio_Cover_Letter';

  /** The template's one input, which carries the whole prompt. */
  public static final String PROMPT_INPUT = 'Input:Prompt';

  /**
   * True now that generateContent() calls a real template. providerStatus() reports "on"
   * while this is true and the switch is on.
   */
  public static final Boolean IMPLEMENTED = true;

  @TestVisible
  private static PromptTemplateClient clientOverride;

  @TestVisible
  private static Boolean configOverridden = false;
  @TestVisible
  private static AI_Provider_Config__mdt configOverride;
  @TestVisible
  private static Boolean guestOverride;

  /**
   * @description Runs the prompt template with the whole prompt as Input:Prompt. A failure
   *              throws, and the dispatch records it as a failed attempt.
   * @param prompt The prompt to send.
   * @param context Additional context map. The template reads only the prompt.
   * @return String The generated text.
   * @throws Exception When the template call fails or returns no text.
   */
  public String generateContent(String prompt, Map<String, Object> context) {
    return client()
      .generate(
        templateName(),
        new Map<String, String>{ PROMPT_INPUT => prompt }
      );
  }

  /**
   * @description The prompt template to run.
   * @return String Model_Or_Template__c of the record, or TEMPLATE_NAME when blank.
   */
  public static String templateName() {
    String configured = config()?.Model_Or_Template__c;
    return String.isBlank(configured) ? TEMPLATE_NAME : configured;
  }

  /**
   * @description How long a caller should wait for this provider.
   * @return Integer Timeout_Ms__c of the record, or DEFAULT_TIMEOUT_MS when blank.
   */
  public static Integer timeoutMs() {
    Decimal configured = config()?.Timeout_Ms__c;
    return configured == null ||
      configured <= 0
      ? DEFAULT_TIMEOUT_MS
      : configured.intValue();
  }

  /** Timeout used when the record sets none. */
  public static final Integer DEFAULT_TIMEOUT_MS = 30000;

  /** Calls per clock hour when the record sets none, under the Developer Edition's 150. */
  public static final Integer DEFAULT_HOURLY_BUDGET = 120;

  /**
   * @description Agentforce calls allowed per clock hour.
   * @return Integer Hourly_Budget__c of the record, or DEFAULT_HOURLY_BUDGET when blank.
   */
  public static Integer hourlyBudget() {
    Decimal configured = config()?.Hourly_Budget__c;
    return configured == null ||
      configured < 0
      ? DEFAULT_HOURLY_BUDGET
      : configured.intValue();
  }

  private static PromptTemplateClient client() {
    return clientOverride ?? new EinsteinPromptTemplateClient();
  }

  /**
   * @description True only when the Agentforce record exists with Enabled__c true and the
   *              running user is not a site guest. No document allows a guest to be the
   *              running user for generative AI.
   * @return Boolean Whether the dispatch may consult Agentforce.
   */
  public Boolean isAvailable() {
    if (isGuest()) {
      return false;
    }
    return isEnabled();
  }

  /**
   * @description Whether the switch is on, ignoring who is running.
   * @return Boolean Enabled__c of the Agentforce record, false when there is no record.
   */
  public static Boolean isEnabled() {
    AI_Provider_Config__mdt config = config();
    return config != null && config.Enabled__c == true;
  }

  /**
   * @description Model or template name to report when this provider serves.
   * @return String Model_Or_Template__c, or DEFAULT_MODEL when blank.
   */
  public static String model() {
    String configured = config()?.Model_Or_Template__c;
    return String.isBlank(configured) ? DEFAULT_MODEL : configured;
  }

  /**
   * @description The Agentforce configuration record.
   * @return AI_Provider_Config__mdt The record, or null when none exists.
   */
  public static AI_Provider_Config__mdt config() {
    if (configOverridden) {
      return configOverride;
    }
    return AI_Provider_Config__mdt.getInstance(CONFIG_NAME);
  }

  private static Boolean isGuest() {
    if (guestOverride != null) {
      return guestOverride;
    }
    return Auth.CommunitiesUtil.isGuestUser();
  }
}

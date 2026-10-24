/**
 * @description       : Agentforce provider for the content generation dispatch. Not built yet:
 *                      isAvailable() is the switch in AI_Provider_Config__mdt (record
 *                      Agentforce, Enabled__c, shipped false) and generateContent() throws, so
 *                      no response can ever carry text from this class. The dispatch records
 *                      the throw as a failed attempt and moves on to Gemini.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/12/2025
 * @Test Class        : [AgentforceServiceTest]
 **/
public with sharing class AgentforceService implements IAIGenerationService {
  /** DeveloperName of this provider's AI_Provider_Config__mdt record. */
  public static final String CONFIG_NAME = 'Agentforce';

  /** Model reported when the record names no model or template. */
  public static final String DEFAULT_MODEL = 'agentforce';

  /**
   * False until a real provider replaces generateContent(). providerStatus() reports
   * "not built" while it is false and the switch is on.
   */
  public static final Boolean IMPLEMENTED = false;

  /**
   * @description Thrown by generateContent() until the real provider exists.
   */
  public class AgentforceNotImplementedException extends Exception {
  }

  @TestVisible
  private static Boolean configOverridden = false;
  @TestVisible
  private static AI_Provider_Config__mdt configOverride;
  @TestVisible
  private static Boolean guestOverride;

  /**
   * @description Always throws. A switched-on flag can never serve mock text.
   * @param prompt The prompt to send.
   * @param context Additional context map.
   * @return String Never returns.
   * @throws AgentforceNotImplementedException Always.
   */
  public String generateContent(String prompt, Map<String, Object> context) {
    throw new AgentforceNotImplementedException(
      'Agentforce generation is not implemented.'
    );
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

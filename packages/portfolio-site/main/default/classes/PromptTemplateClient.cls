/**
 * @description       : Runs a Prompt Builder template and returns the text it generated. The
 *                      platform documents no test hook for the Einstein generative API, so
 *                      AgentforceService calls a template only through this interface and tests
 *                      stand in a stub for it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 * @Test Class        : [EinsteinPromptTemplateClientTest]
 **/
public interface PromptTemplateClient {
  /**
   * @description Runs the template with the given inputs as the running user.
   * @param templateName DeveloperName of the prompt template.
   * @param inputs Input values by reference name, for example Input:Prompt.
   * @return String The first generation's text.
   * @throws Exception When the template cannot run or returns no generation.
   */
  String generate(String templateName, Map<String, String> inputs);
}

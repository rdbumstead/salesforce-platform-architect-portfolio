/**
 * @description       : The real PromptTemplateClient. Calls
 *                      ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate, which runs as
 *                      the context user (Connect in Apex does not support runAs), so that user
 *                      needs the Prompt Template User permission set. Each input goes in as a
 *                      plain text WrappedValue keyed by its reference name, and the request names
 *                      the application PromptTemplateGenerationsInvocable, without which the
 *                      call fails. It never runs inside an Apex test: there it throws, so a test
 *                      that forgets its stub fails instead of reaching the model.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 * @Test Class        : [EinsteinPromptTemplateClientTest]
 **/
public with sharing class EinsteinPromptTemplateClient implements PromptTemplateClient {
  /** The application name the generations call requires. */
  public static final String APPLICATION_NAME = 'PromptTemplateGenerationsInvocable';

  /**
   * @description Thrown when the template returns no usable generation, or when the call is
   *              made from a test.
   */
  public class PromptTemplateException extends Exception {
  }

  /**
   * @description Runs the template once, not as a preview.
   * @param templateName DeveloperName of the prompt template.
   * @param inputs Input values by reference name, for example Input:Prompt.
   * @return String The first generation's text.
   * @throws PromptTemplateException When there is no generation, or inside a test.
   * @example
   * String text = new EinsteinPromptTemplateClient().generate(
   *   'Portfolio_Cover_Letter',
   *   new Map<String, String>{ 'Input:Prompt' => prompt }
   * );
   */
  public String generate(String templateName, Map<String, String> inputs) {
    ConnectApi.EinsteinPromptTemplateGenerationsInput request = buildInput(
      inputs
    );
    if (Test.isRunningTest()) {
      throw new PromptTemplateException(
        'A test must stub PromptTemplateClient.'
      );
    }
    return textOf(run(templateName, request));
  }

  // The one call to the model, kept apart so that the lines a test cannot reach stay few.
  private static ConnectApi.EinsteinPromptTemplateGenerationsRepresentation run(
    String dev,
    ConnectApi.EinsteinPromptTemplateGenerationsInput req
  ) {
    return ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(dev, req);
  }

  /**
   * @description The generations input: every value as a plain text WrappedValue, the
   *              application name, and isPreview false.
   * @param inputs Input values by reference name.
   * @return ConnectApi.EinsteinPromptTemplateGenerationsInput The input.
   */
  @TestVisible
  private static ConnectApi.EinsteinPromptTemplateGenerationsInput buildInput(
    Map<String, String> inputs
  ) {
    ConnectApi.EinsteinPromptTemplateGenerationsInput request = new ConnectApi.EinsteinPromptTemplateGenerationsInput();
    request.inputParams = new Map<String, ConnectApi.WrappedValue>();
    Map<String, String> values = inputs ?? new Map<String, String>();
    for (String name : values.keySet()) {
      ConnectApi.WrappedValue wrapped = new ConnectApi.WrappedValue();
      wrapped.value = values.get(name);
      request.inputParams.put(name, wrapped);
    }
    request.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
    request.additionalConfig.applicationName = APPLICATION_NAME;
    request.isPreview = false;
    return request;
  }

  /**
   * @description The first generation's text.
   * @param response The generations response.
   * @return String The text.
   * @throws PromptTemplateException When the response holds no text.
   */
  @TestVisible
  private static String textOf(
    ConnectApi.EinsteinPromptTemplateGenerationsRepresentation response
  ) {
    List<ConnectApi.EinsteinLLMGenerationItemOutput> generations = response
      ?.generations;
    if (generations == null || generations.isEmpty()) {
      throw new PromptTemplateException('The template returned no generation.');
    }
    String text = generations[0].text;
    if (String.isBlank(text)) {
      throw new PromptTemplateException('The template returned no text.');
    }
    return text;
  }
}

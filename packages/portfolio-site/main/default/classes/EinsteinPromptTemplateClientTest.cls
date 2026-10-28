/**
 * @description       : Unit tests for EinsteinPromptTemplateClient: the generations input it
 *                      builds, the text it reads from a response, and its refusal to reach the
 *                      model inside a test. No test calls the Einstein generative API.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
@IsTest
private class EinsteinPromptTemplateClientTest {
  private static ConnectApi.EinsteinPromptTemplateGenerationsRepresentation responseWith(
    String text
  ) {
    ConnectApi.EinsteinLLMGenerationItemOutput item = new ConnectApi.EinsteinLLMGenerationItemOutput();
    item.text = text;
    ConnectApi.EinsteinPromptTemplateGenerationsRepresentation response = new ConnectApi.EinsteinPromptTemplateGenerationsRepresentation();
    response.generations = new List<ConnectApi.EinsteinLLMGenerationItemOutput>{
      item
    };
    return response;
  }

  @IsTest
  static void buildInputWrapsEveryValueAsPlainText() {
    Test.startTest();
    ConnectApi.EinsteinPromptTemplateGenerationsInput input = EinsteinPromptTemplateClient.buildInput(
      new Map<String, String>{ 'Input:Prompt' => 'the prompt' }
    );
    Test.stopTest();

    Assert.areEqual(1, input.inputParams.size(), 'One input');
    Assert.areEqual(
      'the prompt',
      input.inputParams.get('Input:Prompt').value,
      'The prompt is the value'
    );
    Assert.isFalse(input.isPreview, 'A real generation, not a preview');
  }

  @IsTest
  static void buildInputNamesTheRequiredApplication() {
    Test.startTest();
    ConnectApi.EinsteinPromptTemplateGenerationsInput input = EinsteinPromptTemplateClient.buildInput(
      new Map<String, String>()
    );
    Test.stopTest();

    Assert.areEqual(
      EinsteinPromptTemplateClient.APPLICATION_NAME,
      input.additionalConfig.applicationName,
      'Without the application name the call fails'
    );
  }

  @IsTest
  static void buildInputAcceptsNoInputs() {
    Test.startTest();
    ConnectApi.EinsteinPromptTemplateGenerationsInput input = EinsteinPromptTemplateClient.buildInput(
      null
    );
    Test.stopTest();

    Assert.isTrue(input.inputParams.isEmpty(), 'An empty map, never null');
  }

  @IsTest
  static void textOfReturnsTheFirstGeneration() {
    Test.startTest();
    String text = EinsteinPromptTemplateClient.textOf(responseWith('A letter'));
    Test.stopTest();

    Assert.areEqual('A letter', text, 'First generation text');
  }

  @IsTest
  static void textOfRefusesAResponseWithNoGeneration() {
    ConnectApi.EinsteinPromptTemplateGenerationsRepresentation empty = new ConnectApi.EinsteinPromptTemplateGenerationsRepresentation();

    Test.startTest();
    try {
      EinsteinPromptTemplateClient.textOf(empty);
      Assert.fail('Expected PromptTemplateException');
    } catch (EinsteinPromptTemplateClient.PromptTemplateException e) {
      Assert.isTrue(e.getMessage().contains('no generation'), e.getMessage());
    }
    Test.stopTest();
  }

  @IsTest
  static void textOfRefusesBlankText() {
    Test.startTest();
    try {
      EinsteinPromptTemplateClient.textOf(responseWith('  '));
      Assert.fail('Expected PromptTemplateException');
    } catch (EinsteinPromptTemplateClient.PromptTemplateException e) {
      Assert.isTrue(e.getMessage().contains('no text'), e.getMessage());
    }
    Test.stopTest();
  }

  @IsTest
  static void textOfRefusesANullResponse() {
    Test.startTest();
    try {
      EinsteinPromptTemplateClient.textOf(null);
      Assert.fail('Expected PromptTemplateException');
    } catch (EinsteinPromptTemplateClient.PromptTemplateException e) {
      Assert.isTrue(e.getMessage().contains('no generation'), e.getMessage());
    }
    Test.stopTest();
  }

  @IsTest
  static void generateRefusesToReachTheModelInATest() {
    Test.startTest();
    try {
      new EinsteinPromptTemplateClient()
        .generate(
          'Portfolio_Cover_Letter',
          new Map<String, String>{ 'Input:Prompt' => 'prompt' }
        );
      Assert.fail('Expected PromptTemplateException');
    } catch (EinsteinPromptTemplateClient.PromptTemplateException e) {
      Assert.isTrue(e.getMessage().contains('stub'), e.getMessage());
    }
    Test.stopTest();
  }
}

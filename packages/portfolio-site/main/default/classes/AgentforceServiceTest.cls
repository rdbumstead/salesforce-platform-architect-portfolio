/**
 * @description       : Unit tests for AgentforceService: the switch, the guest rule, the
 *                      template call through a stubbed PromptTemplateClient, the template name
 *                      and the timeout. The switch is set in memory.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/03/2026
 **/
@IsTest
private class AgentforceServiceTest {
  private static AI_Provider_Config__mdt record(Boolean enabled, String model) {
    Map<String, Object> fields = new Map<String, Object>{
      'DeveloperName' => 'Agentforce',
      'Enabled__c' => enabled
    };
    if (model != null) {
      fields.put('Model_Or_Template__c', model);
    }
    return (AI_Provider_Config__mdt) JSON.deserialize(
      JSON.serialize(fields),
      AI_Provider_Config__mdt.class
    );
  }

  /** Records what it was asked and answers with fixed text, or throws. */
  private class ClientStub implements PromptTemplateClient {
    private final String text;
    private final Boolean fails;
    public String templateName;
    public Map<String, String> inputs;

    ClientStub(String text, Boolean fails) {
      this.text = text;
      this.fails = fails;
    }

    public String generate(String templateName, Map<String, String> inputs) {
      this.templateName = templateName;
      this.inputs = inputs;
      if (fails) {
        throw new CalloutException('Stubbed template failure');
      }
      return text;
    }
  }

  private static void useRecord(AI_Provider_Config__mdt config) {
    AgentforceService.configOverridden = true;
    AgentforceService.configOverride = config;
    AgentforceService.guestOverride = false;
  }

  @IsTest
  static void generateContentRunsTheTemplateWithTheWholePrompt() {
    useRecord(record(true, null));
    ClientStub stub = new ClientStub('A letter', false);
    AgentforceService.clientOverride = stub;

    Test.startTest();
    String text = new AgentforceService()
      .generateContent('the whole prompt', null);
    Test.stopTest();

    Assert.areEqual('A letter', text, 'The template text comes back');
    Assert.areEqual(
      AgentforceService.TEMPLATE_NAME,
      stub.templateName,
      'Default template'
    );
    Assert.areEqual(
      new Map<String, String>{ 'Input:Prompt' => 'the whole prompt' },
      stub.inputs,
      'One input, the prompt'
    );
  }

  @IsTest
  static void generateContentRunsTheTemplateNamedOnTheRecord() {
    useRecord(record(true, 'Other_Template'));
    ClientStub stub = new ClientStub('A letter', false);
    AgentforceService.clientOverride = stub;

    Test.startTest();
    new AgentforceService().generateContent('prompt', null);
    Test.stopTest();

    Assert.areEqual('Other_Template', stub.templateName, 'Configured');
  }

  @IsTest
  static void generateContentPassesATemplateFailureOn() {
    useRecord(record(true, null));
    AgentforceService.clientOverride = new ClientStub(null, true);

    Test.startTest();
    try {
      new AgentforceService().generateContent('prompt', null);
      Assert.fail('Expected the stub failure');
    } catch (CalloutException e) {
      Assert.areEqual('Stubbed template failure', e.getMessage(), 'Message');
    }
    Test.stopTest();
  }

  @IsTest
  static void generateContentWithNoStubNeverReachesTheModelInATest() {
    useRecord(record(true, null));

    Test.startTest();
    try {
      new AgentforceService().generateContent('prompt', null);
      Assert.fail('Expected the real client to refuse in a test');
    } catch (EinsteinPromptTemplateClient.PromptTemplateException e) {
      Assert.isTrue(e.getMessage().contains('stub'), e.getMessage());
    }
    Test.stopTest();
  }

  @IsTest
  static void hourlyBudgetComesFromTheRecordOrTheDefault() {
    useRecord(
      (AI_Provider_Config__mdt) JSON.deserialize(
        '{"DeveloperName":"Agentforce","Hourly_Budget__c":40}',
        AI_Provider_Config__mdt.class
      )
    );
    Integer configured = AgentforceService.hourlyBudget();
    useRecord(record(true, null));
    Integer fallback = AgentforceService.hourlyBudget();

    Assert.areEqual(40, configured, 'Configured budget');
    Assert.areEqual(
      AgentforceService.DEFAULT_HOURLY_BUDGET,
      fallback,
      'Default budget'
    );
  }

  @IsTest
  static void theShippedBudgetIs120() {
    Assert.areEqual(120, AgentforceService.hourlyBudget(), 'Under 150');
  }

  @IsTest
  static void timeoutComesFromTheRecordOrTheDefault() {
    useRecord(
      (AI_Provider_Config__mdt) JSON.deserialize(
        '{"DeveloperName":"Agentforce","Timeout_Ms__c":45000}',
        AI_Provider_Config__mdt.class
      )
    );
    Integer configured = AgentforceService.timeoutMs();
    useRecord(record(true, null));
    Integer fallback = AgentforceService.timeoutMs();

    Assert.areEqual(45000, configured, 'Configured timeout');
    Assert.areEqual(
      AgentforceService.DEFAULT_TIMEOUT_MS,
      fallback,
      'Default timeout'
    );
  }

  @IsTest
  static void isAvailableWhenSwitchedOnForAnInternalUser() {
    useRecord(record(true, null));

    Test.startTest();
    Boolean available = new AgentforceService().isAvailable();
    Test.stopTest();

    Assert.isTrue(available, 'Switch on, not a guest');
  }

  @IsTest
  static void isUnavailableWhenSwitchedOff() {
    useRecord(record(false, null));

    Test.startTest();
    Boolean available = new AgentforceService().isAvailable();
    Test.stopTest();

    Assert.isFalse(available, 'Switch off');
  }

  @IsTest
  static void isUnavailableWhenNoRecordExists() {
    useRecord(null);

    Test.startTest();
    Boolean available = new AgentforceService().isAvailable();
    Test.stopTest();

    Assert.isFalse(available, 'No record reads as off');
    Assert.isFalse(AgentforceService.isEnabled(), 'Not enabled');
  }

  @IsTest
  static void isUnavailableToAGuestEvenWhenSwitchedOn() {
    useRecord(record(true, null));
    AgentforceService.guestOverride = true;

    Test.startTest();
    Boolean available = new AgentforceService().isAvailable();
    Test.stopTest();

    Assert.isFalse(available, 'Guests never run generative AI');
    Assert.isTrue(AgentforceService.isEnabled(), 'The switch itself is on');
  }

  @IsTest
  static void modelComesFromTheRecordOrTheDefault() {
    useRecord(record(true, 'Portfolio_Template'));
    String configured = AgentforceService.model();
    useRecord(record(true, null));
    String fallback = AgentforceService.model();

    Assert.areEqual('Portfolio_Template', configured, 'Configured model');
    Assert.areEqual(AgentforceService.DEFAULT_MODEL, fallback, 'Default');
  }

  @IsTest
  static void shippedRecordSwitchesAgentforceOnForTheCoverLetterTemplate() {
    // Reads the record deployed from source. It ships switched on.
    AI_Provider_Config__mdt shipped = AgentforceService.config();

    Assert.isNotNull(shipped, 'The Agentforce record is in source');
    Assert.isTrue(shipped.Enabled__c, 'Shipped switched on');
    Assert.isTrue(AgentforceService.IMPLEMENTED, 'Built');
    Assert.areEqual(
      AgentforceService.TEMPLATE_NAME,
      AgentforceService.templateName(),
      'The shipped record names the cover letter template'
    );
  }

  @IsTest
  static void realGuestCheckRunsForAnInternalUser() {
    AgentforceService.configOverridden = true;
    AgentforceService.configOverride = record(true, null);

    Test.startTest();
    Boolean available = new AgentforceService().isAvailable();
    Test.stopTest();

    Assert.isTrue(available, 'The running test user is not a guest');
  }
}

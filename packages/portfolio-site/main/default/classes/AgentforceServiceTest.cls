/**
 * @description       : Unit tests for AgentforceService: the switch, the guest rule and the
 *                      throwing generateContent. The switch is set in memory.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
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

  private static void useRecord(AI_Provider_Config__mdt config) {
    AgentforceService.configOverridden = true;
    AgentforceService.configOverride = config;
    AgentforceService.guestOverride = false;
  }

  @IsTest
  static void generateContentAlwaysThrowsNotImplemented() {
    useRecord(record(true, null));

    Test.startTest();
    try {
      new AgentforceService().generateContent('prompt', null);
      Assert.fail('Expected AgentforceNotImplementedException');
    } catch (AgentforceService.AgentforceNotImplementedException e) {
      Assert.areEqual(
        'Agentforce generation is not implemented.',
        e.getMessage(),
        'Message'
      );
    }
    Test.stopTest();
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
  static void shippedRecordKeepsAgentforceSwitchedOff() {
    // Reads the record deployed from source. It must ship disabled (PD-D2 b).
    AI_Provider_Config__mdt shipped = AgentforceService.config();

    Assert.isNotNull(shipped, 'The Agentforce record is in source');
    Assert.isFalse(shipped.Enabled__c, 'Shipped switched off');
    Assert.isFalse(AgentforceService.IMPLEMENTED, 'Not built yet');
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

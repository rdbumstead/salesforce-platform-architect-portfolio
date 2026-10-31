/**
 * @description       : Tests ApiRoutes (ADR-040): how the Api_Versionless_Urls switch reads (only
 *                      Off turns it off), the URL each builder returns in both states, and the
 *                      URL each caller we own builds from it in both states.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/01/2026
 **/
@IsTest
private class ApiRoutesTest {
  private static void setSwitch(String text) {
    PortfolioSettings.overrides.put(
      ApiRoutes.SETTING,
      new Portfolio_Setting__mdt(
        DeveloperName = ApiRoutes.SETTING,
        Text_Value__c = text
      )
    );
  }

  private class CredentialMock implements HttpCalloutMock {
    public HttpRequest received;
    public HttpResponse respond(HttpRequest req) {
      received = req;
      HttpResponse res = new HttpResponse();
      res.setStatusCode(200);
      res.setBody('{"status":"UP"}');
      return res;
    }
  }

  @IsTest
  static void shouldShipOn() {
    // The record in source, with no override.
    Assert.isTrue(ApiRoutes.isVersionless(), 'The shipped record is On');
    Assert.isTrue(ApiLabController.getVersionlessUrls(), 'The Lab read');
  }

  @IsTest
  static void shouldReadOnlyOffAsOff() {
    for (String off : new List<String>{ 'Off', 'off', 'OFF', '  Off  ' }) {
      setSwitch(off);
      Assert.isFalse(ApiRoutes.isVersionless(), '"' + off + '" is Off');
      Assert.isFalse(ApiLabController.getVersionlessUrls(), 'Lab: ' + off);
    }
  }

  @IsTest
  static void shouldReadBlankTypoAndMissingAsOn() {
    for (
      String onValue : new List<String>{
        'On',
        '',
        '   ',
        null,
        'Of',
        'Offf',
        'false',
        'no',
        'disabled',
        '0'
      }
    ) {
      setSwitch(onValue);
      Assert.isTrue(ApiRoutes.isVersionless(), 'Reads as On: ' + onValue);
    }
    // A missing record: the override map holds a record with no name match.
    PortfolioSettings.overrides.remove(ApiRoutes.SETTING);
    Assert.isTrue(ApiRoutes.isVersionless(), 'Shipped record or missing: On');
  }

  @IsTest
  static void shouldBuildTheUrlForEachState() {
    setSwitch('On');
    Assert.areEqual(
      '/services/apexrest/papi/projects',
      ApiRoutes.papi('projects')
    );
    Assert.areEqual(
      '/services/apexrest/sapi/health',
      ApiRoutes.sapi('/health')
    );
    Assert.areEqual(
      '/services/apexrest/papi/projects/featured',
      ApiRoutes.forCanonical('/papi/projects/featured')
    );
    Assert.areEqual('/services/apexrest/sapi', ApiRoutes.sapi(null));

    setSwitch('Off');
    Assert.areEqual(
      '/services/apexrest/papi/v1/projects',
      ApiRoutes.papi('projects')
    );
    Assert.areEqual(
      '/services/apexrest/sapi/v1/health',
      ApiRoutes.sapi('/health')
    );
    Assert.areEqual(
      '/services/apexrest/papi/v1/projects/featured',
      ApiRoutes.forCanonical('/papi/projects/featured')
    );
    Assert.areEqual(
      '/services/apexrest/sapi/skills',
      ApiRoutes.forCanonical('/sapi/skills', true),
      'An explicit form ignores the switch'
    );
  }

  // A callout cannot follow DML in one transaction, so each state is its own test.
  private static void assertLabPath(String state) {
    setSwitch(state);
    PortfolioApiCalloutMock mock = new PortfolioApiCalloutMock()
      .withRestResponse(200, '[]', new Map<String, String>());
    Test.setMock(HttpCalloutMock.class, mock);
    ApiLabController.invoke('/sapi/skills', null);
    Assert.areEqual(
      'callout:Portfolio_API/services/apexrest/sapi/' +
        (state == 'Off' ? 'v1/' : '') +
        'skills',
      mock.requests[0].getEndpoint(),
      'Lab call, ' + state
    );
  }

  @IsTest
  static void shouldCallTheLabPathWhenOn() {
    assertLabPath('On');
  }

  @IsTest
  static void shouldCallTheOldLabPathWhenOff() {
    assertLabPath('Off');
  }

  @IsTest
  static void shouldCallTheLabWithAnOldSpellingWhenOff() {
    setSwitch('Off');
    PortfolioApiCalloutMock mock = new PortfolioApiCalloutMock()
      .withRestResponse(200, '[]', new Map<String, String>());
    Test.setMock(HttpCalloutMock.class, mock);
    ApiLabController.invoke('/sapi/v1/skills', null);
    Assert.isTrue(
      mock.requests[0].getEndpoint().endsWith('/sapi/v1/skills'),
      mock.requests[0].getEndpoint()
    );
  }

  private static void assertCredentialPath(String state) {
    setSwitch(state);
    CredentialMock mock = new CredentialMock();
    Test.setMock(HttpCalloutMock.class, mock);
    RestTestUtil.initGet('/services/apexrest/papi/health');
    PAPIHealth.getHealth();
    Assert.areEqual(
      'callout:Portfolio_API/services/apexrest/sapi/' +
        (state == 'Off' ? 'v1/' : '') +
        'health',
      mock.received.getEndpoint(),
      'PAPIHealth credential check, ' + state
    );
  }

  @IsTest
  static void shouldCallTheCredentialCheckWhenOn() {
    assertCredentialPath('On');
  }

  @IsTest
  static void shouldCallTheOldCredentialCheckWhenOff() {
    assertCredentialPath('Off');
  }

  @IsTest
  static void shouldNameTheAgentforcePathInEachState() {
    setSwitch('On');
    Assert.areEqual(
      '/services/apexrest/papi/ai/generate',
      ApiRoutes.forCanonical(ApiLabController.AI_GENERATE_PATH)
    );
    setSwitch('Off');
    Assert.areEqual(
      '/services/apexrest/papi/v1/ai/generate',
      ApiRoutes.forCanonical(ApiLabController.AI_GENERATE_PATH)
    );
  }
}

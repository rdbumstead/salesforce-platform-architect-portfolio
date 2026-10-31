/**
 * @description       : Unit tests for SAPIPortfolioConfig REST resource. Records are injected
 *                      through configOverride so results do not depend on the org's metadata.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class SAPIPortfolioConfigTest {
  private static final String RESOURCE = 'portfolio-config';

  @IsTest
  static void shouldReturnSpecObjectWhenRecordExists() {
    SAPIPortfolioConfig.configOverride = new List<Portfolio_Config__mdt>{
      new Portfolio_Config__mdt(
        Owner_Email__c = 'owner@example.com',
        Owner_Phone__c = '+1 555-0199',
        LinkedIn_URL__c = 'https://linkedin.com/in/example',
        GitHub_Profile_URL__c = 'https://github.com/example',
        Calendly_URL__c = 'https://calendly.com/example',
        Trailblazer_Profile_URL__c = 'https://trailblazer.me/id/example',
        Personal_Website_URL__c = 'https://example.com',
        Career_Objective__c = 'Principal Architect roles.',
        Jira_Project_Key__c = 'SPAP',
        GitHub_Repo_Path__c = 'example/repo'
      )
    };
    SapiTestData.get(RESOURCE, null);

    Test.startTest();
    SAPIPortfolioConfig.getPortfolioConfig();
    Test.stopTest();

    assertOk();
    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.areEqual(
      SapiTestData.PORTFOLIO_CONFIG_KEYS,
      body.keySet(),
      'Keys must equal the PortfolioConfig schema keys'
    );
    Assert.isFalse(body.containsKey('ownerEmail'), 'No owner email');
    Assert.isFalse(body.containsKey('ownerPhone'), 'No owner phone');
    String raw = RestTestUtil.getResponse().responseBody.toString();
    Assert.isFalse(raw.contains('owner@example.com'), 'Email never leaks');
    Assert.isFalse(raw.contains('555-0199'), 'Phone never leaks');
    Assert.areEqual('SPAP', body.get('jiraProjectKey'), 'jiraProjectKey');
    SapiTestData.assertCache('max-age=300, private');
  }

  @IsTest
  static void shouldReturnEmptyObjectWhenNoRecord() {
    SAPIPortfolioConfig.configOverride = new List<Portfolio_Config__mdt>();
    SapiTestData.get(RESOURCE, null);

    Test.startTest();
    SAPIPortfolioConfig.getPortfolioConfig();
    Test.stopTest();

    assertOk();
    Assert.isTrue(
      RestTestUtil.getBodyAsMap().isEmpty(),
      'No record yields an empty object'
    );
    SapiTestData.assertCache('max-age=300, private');
  }

  @IsTest
  static void shouldReadOrgMetadataWhenNoOverride() {
    // Runs the real query. The org may or may not hold a record, so assert the shape only.
    SapiTestData.get(RESOURCE, null);

    Test.startTest();
    SAPIPortfolioConfig.getPortfolioConfig();
    Test.stopTest();

    assertOk();
    Map<String, Object> body = RestTestUtil.getBodyAsMap();
    Assert.isTrue(
      body.isEmpty() ||
      body.keySet().equals(SapiTestData.PORTFOLIO_CONFIG_KEYS),
      'Body is empty or carries exactly the schema keys'
    );
    Assert.isNull(
      RestContext.response.headers.get('X-Total-Count'),
      'Not pageable: no X-Total-Count'
    );
  }

  @IsTest
  static void shouldReturn400WhenApiVersionUnsupported() {
    RestTestUtil.initGetRaw(
      '/services/apexrest/sapi/v1/portfolio-config/',
      new Map<String, String>{
        'X-Request-Id' => UUID.randomUUID().toString(),
        'X-API-Version' => 'v3'
      },
      null
    );

    Test.startTest();
    SAPIPortfolioConfig.getPortfolioConfig();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn500WhenUnexpectedFailure() {
    SapiTestData.get(RESOURCE, null);
    SAPIPortfolioConfig.throwException = true;

    Test.startTest();
    SAPIPortfolioConfig.getPortfolioConfig();
    Test.stopTest();

    SapiTestData.assertError(500, 'INTERNAL_SERVER_ERROR');
    RestTestUtil.assertServerError();
  }

  private static void assertOk() {
    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
  }
}

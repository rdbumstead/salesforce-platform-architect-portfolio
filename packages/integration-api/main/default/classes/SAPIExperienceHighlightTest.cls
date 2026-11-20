/**
 * @description       : Unit tests for SAPIExperienceHighlight REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class SAPIExperienceHighlightTest {
  private static final String RESOURCE = 'experience-highlights';

  @TestSetup
  static void setup() {
    SapiTestData.createGraph();
  }

  @IsTest
  static void shouldReturnSpecRowsWhenNoFilter() {
    SapiTestData.get(RESOURCE, null);

    Test.startTest();
    SAPIExperienceHighlight.getExperienceHighlights();
    Test.stopTest();

    assertOk();
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(3, rows.size(), 'Every highlight is returned');
    SapiTestData.assertRowKeys(SapiTestData.EXPERIENCE_HIGHLIGHT_KEYS, rows);
    SapiTestData.assertCache('no-store, no-cache');
    SapiTestData.assertPaging(3, false);
  }

  @IsTest
  static void shouldFilterRowsWhenExperienceId() {
    String experienceId = [
      SELECT Id
      FROM Experience__c
      WHERE Name = :SapiTestData.EXPERIENCE_ONE
    ]
    .Id;
    SapiTestData.get(
      RESOURCE,
      new Map<String, String>{ 'experienceId' => experienceId }
    );

    Test.startTest();
    SAPIExperienceHighlight.getExperienceHighlights();
    Test.stopTest();

    assertOk();
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(2, rows.size(), 'experienceId narrows the result');
    SapiTestData.assertEveryRow(
      rows,
      'experienceName',
      SapiTestData.EXPERIENCE_ONE
    );
    SapiTestData.assertPaging(2, false);
  }

  @IsTest
  static void shouldFilterRowsWhenSinglePersona() {
    SapiTestData.get(
      RESOURCE,
      new Map<String, String>{ 'persona' => 'Architect' }
    );

    Test.startTest();
    SAPIExperienceHighlight.getExperienceHighlights();
    Test.stopTest();

    assertOk();
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(2, rows.size(), 'Two highlights carry Architect');
    for (Map<String, Object> row : rows) {
      Assert.isTrue(
        ((String) row.get('personaTag')).split(';').contains('Architect'),
        'Every row includes the Architect persona'
      );
    }
    SapiTestData.assertPaging(2, false);
  }

  @IsTest
  static void shouldMatchAnyPersonaWhenCommaSeparated() {
    SapiTestData.get(
      RESOURCE,
      new Map<String, String>{ 'persona' => 'admin, Engineer' }
    );

    Test.startTest();
    SAPIExperienceHighlight.getExperienceHighlights();
    Test.stopTest();

    assertOk();
    Assert.areEqual(
      2,
      SapiTestData.bodyAsList().size(),
      'Admin or Engineer matches two highlights, case-insensitively'
    );
  }

  private static List<Map<String, Object>> rowsFor(
    String version,
    String persona
  ) {
    RestTestUtil.initGetRaw(
      '/services/apexrest/sapi/' + RESOURCE + '/',
      new Map<String, String>{
        'X-Request-Id' => UUID.randomUUID().toString(),
        'X-API-Version' => version
      },
      new Map<String, String>{ 'persona' => persona }
    );
    SAPIExperienceHighlight.getExperienceHighlights();
    assertOk();
    return SapiTestData.bodyAsList();
  }

  @IsTest
  static void shouldAcceptEachPersonaOnBothVersions() {
    Map<String, Integer> counts = new Map<String, Integer>{
      'Engineer' => 1,
      'engineer' => 1,
      'ARCHITECT' => 2,
      'Consultant' => 1,
      'Admin' => 1,
      'admin' => 1
    };

    Test.startTest();
    for (String version : new List<String>{ 'v1', 'v2' }) {
      for (String sent : counts.keySet()) {
        Assert.areEqual(
          counts.get(sent),
          rowsFor(version, sent).size(),
          version + ' ' + sent
        );
      }
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldReadDeveloperAsEngineer() {
    Test.startTest();
    for (String version : new List<String>{ 'v1', 'v2' }) {
      List<Map<String, Object>> alias = rowsFor(version, 'Developer');
      List<Map<String, Object>> engineer = rowsFor(version, 'Engineer');
      Assert.areEqual(engineer.size(), alias.size(), version + ' size');
      Assert.areEqual(1, alias.size(), version + ' one Engineer row');
      Assert.isTrue(
        ((String) alias[0].get('personaTag')).split(';').contains('Engineer'),
        version + ' row carries Engineer'
      );
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldReturn400WhenPersonaUnknown() {
    SapiTestData.get(
      RESOURCE,
      new Map<String, String>{ 'persona' => 'Admin,Recruiter' }
    );

    Test.startTest();
    SAPIExperienceHighlight.getExperienceHighlights();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn400ForUnknownPersonaOnBothVersions() {
    Test.startTest();
    for (String version : new List<String>{ 'v1', 'v2' }) {
      RestTestUtil.initGetRaw(
        '/services/apexrest/sapi/' + RESOURCE + '/',
        new Map<String, String>{
          'X-Request-Id' => UUID.randomUUID().toString(),
          'X-API-Version' => version
        },
        new Map<String, String>{ 'persona' => 'Bogus' }
      );
      SAPIExperienceHighlight.getExperienceHighlights();
      SapiTestData.assertError(400, 'BAD_REQUEST');
      Assert.isTrue(
        SapiTestData.bodyText().contains(ApiMessages.PERSONA_LIST_INVALID),
        version + ' names the accepted values'
      );
    }
    Test.stopTest();
  }

  @IsTest
  static void shouldReturn400WhenExperienceIdMalformed() {
    SapiTestData.get(
      RESOURCE,
      new Map<String, String>{ 'experienceId' => 'not-an-id' }
    );

    Test.startTest();
    SAPIExperienceHighlight.getExperienceHighlights();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldEmitPagingHeadersWhenLimitBelowTotal() {
    SapiTestData.get(RESOURCE, new Map<String, String>{ 'limit' => '1' });

    Test.startTest();
    SAPIExperienceHighlight.getExperienceHighlights();
    Test.stopTest();

    assertOk();
    Assert.areEqual(1, SapiTestData.bodyAsList().size(), 'One row per page');
    SapiTestData.assertPaging(3, true);
  }

  @IsTest
  static void shouldReturn400WhenLimitNotInteger() {
    SapiTestData.get(RESOURCE, new Map<String, String>{ 'limit' => 'abc' });

    Test.startTest();
    SAPIExperienceHighlight.getExperienceHighlights();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn500WhenUnexpectedFailure() {
    SapiTestData.get(RESOURCE, null);
    SAPIExperienceHighlight.throwException = true;

    Test.startTest();
    SAPIExperienceHighlight.getExperienceHighlights();
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

  @IsTest
  static void shouldStopWhenTheVersionIsNotSupported() {
    RestTestUtil.initGetRaw(
      '/services/apexrest/sapi/experience-highlights/',
      new Map<String, String>{
        'X-Request-Id' => UUID.randomUUID().toString(),
        'X-API-Version' => 'v3'
      },
      null
    );

    Test.startTest();
    SAPIExperienceHighlight.getExperienceHighlights();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }
}

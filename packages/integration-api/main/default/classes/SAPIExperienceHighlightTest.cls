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
      new Map<String, String>{ 'persona' => 'admin, Developer' }
    );

    Test.startTest();
    SAPIExperienceHighlight.getExperienceHighlights();
    Test.stopTest();

    assertOk();
    Assert.areEqual(
      2,
      SapiTestData.bodyAsList().size(),
      'Admin or Developer matches two highlights, case-insensitively'
    );
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
}

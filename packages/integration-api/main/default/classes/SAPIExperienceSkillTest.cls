/**
 * @description       : Unit tests for SAPIExperienceSkill REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class SAPIExperienceSkillTest {
  @TestSetup
  static void setup() {
    SapiTestData.createGraph();
  }

  @IsTest
  static void shouldReturnSpecRowsWhenNoFilter() {
    SapiTestData.get('experience-skills', null);

    Test.startTest();
    SAPIExperienceSkill.getExperienceSkills();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(3, rows.size(), 'Every matching record is returned');
    SapiTestData.assertRowKeys(SapiTestData.EXPERIENCE_SKILL_KEYS, rows);
    SapiTestData.assertCache('max-age=300, public');
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
      'experience-skills',
      new Map<String, String>{ 'experienceId' => experienceId }
    );

    Test.startTest();
    SAPIExperienceSkill.getExperienceSkills();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
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
  static void shouldEmitPagingHeadersWhenLimitBelowTotal() {
    SapiTestData.get(
      'experience-skills',
      new Map<String, String>{ 'limit' => '1' }
    );

    Test.startTest();
    SAPIExperienceSkill.getExperienceSkills();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    Assert.areEqual(1, SapiTestData.bodyAsList().size(), 'One row per page');
    SapiTestData.assertPaging(3, true);
  }

  @IsTest
  static void shouldReturn400WhenLimitNotInteger() {
    SapiTestData.get(
      'experience-skills',
      new Map<String, String>{ 'limit' => 'abc' }
    );

    Test.startTest();
    SAPIExperienceSkill.getExperienceSkills();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn400WhenExperienceIdMalformed() {
    SapiTestData.get(
      'experience-skills',
      new Map<String, String>{ 'experienceId' => 'not-an-id' }
    );

    Test.startTest();
    SAPIExperienceSkill.getExperienceSkills();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn500WhenUnexpectedFailure() {
    SapiTestData.get('experience-skills', null);
    SAPIExperienceSkill.throwException = true;

    Test.startTest();
    SAPIExperienceSkill.getExperienceSkills();
    Test.stopTest();

    SapiTestData.assertError(500, 'INTERNAL_SERVER_ERROR');
    RestTestUtil.assertServerError();
  }
}

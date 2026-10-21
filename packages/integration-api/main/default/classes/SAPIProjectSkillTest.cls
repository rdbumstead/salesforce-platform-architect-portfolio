/**
 * @description       : Unit tests for SAPIProjectSkill REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 **/
@IsTest
private class SAPIProjectSkillTest {
  @TestSetup
  static void setup() {
    SapiTestData.createGraph();
  }

  @IsTest
  static void shouldReturnSpecRowsWhenNoFilter() {
    SapiTestData.get('project-skills', null);

    Test.startTest();
    SAPIProjectSkill.getProjectSkills();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(3, rows.size(), 'Every matching record is returned');
    SapiTestData.assertRowKeys(SapiTestData.PROJECT_SKILL_KEYS, rows);
    SapiTestData.assertCache('max-age=300, public');
    SapiTestData.assertPaging(3, false);
  }

  @IsTest
  static void shouldFilterRowsWhenProjectId() {
    String projectId = [
      SELECT Id
      FROM Project__c
      WHERE Name = :SapiTestData.PROJECT_ONE
    ]
    .Id;
    SapiTestData.get(
      'project-skills',
      new Map<String, String>{ 'projectId' => projectId }
    );

    Test.startTest();
    SAPIProjectSkill.getProjectSkills();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(2, rows.size(), 'projectId narrows the result');
    SapiTestData.assertEveryRow(rows, 'projectName', SapiTestData.PROJECT_ONE);
    SapiTestData.assertPaging(2, false);
  }

  @IsTest
  static void shouldEmitPagingHeadersWhenLimitBelowTotal() {
    SapiTestData.get(
      'project-skills',
      new Map<String, String>{ 'limit' => '1' }
    );

    Test.startTest();
    SAPIProjectSkill.getProjectSkills();
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
      'project-skills',
      new Map<String, String>{ 'limit' => 'abc' }
    );

    Test.startTest();
    SAPIProjectSkill.getProjectSkills();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn400WhenProjectIdMalformed() {
    SapiTestData.get(
      'project-skills',
      new Map<String, String>{ 'projectId' => 'not-an-id' }
    );

    Test.startTest();
    SAPIProjectSkill.getProjectSkills();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn500WhenUnexpectedFailure() {
    SapiTestData.get('project-skills', null);
    SAPIProjectSkill.throwException = true;

    Test.startTest();
    SAPIProjectSkill.getProjectSkills();
    Test.stopTest();

    SapiTestData.assertError(500, 'INTERNAL_SERVER_ERROR');
  }
}

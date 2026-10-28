/**
 * @description       : Unit tests for SAPICertificationSkill REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class SAPICertificationSkillTest {
  @TestSetup
  static void setup() {
    SapiTestData.createGraph();
  }

  @IsTest
  static void shouldReturnSpecRowsWhenNoFilter() {
    SapiTestData.get('certification-skills', null);

    Test.startTest();
    SAPICertificationSkill.getCertificationSkills();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(3, rows.size(), 'Every matching record is returned');
    SapiTestData.assertRowKeys(SapiTestData.CERTIFICATION_SKILL_KEYS, rows);
    SapiTestData.assertCache('max-age=300, public');
    SapiTestData.assertPaging(3, false);
  }

  @IsTest
  static void shouldFilterRowsWhenCertificationId() {
    String certificationId = [
      SELECT Id
      FROM Certification__c
      WHERE Name = :SapiTestData.CERT_ONE
    ]
    .Id;
    SapiTestData.get(
      'certification-skills',
      new Map<String, String>{ 'certificationId' => certificationId }
    );

    Test.startTest();
    SAPICertificationSkill.getCertificationSkills();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(2, rows.size(), 'certificationId narrows the result');
    SapiTestData.assertEveryRow(
      rows,
      'certificationName',
      SapiTestData.CERT_ONE
    );
    SapiTestData.assertPaging(2, false);
  }

  @IsTest
  static void shouldEmitPagingHeadersWhenLimitBelowTotal() {
    SapiTestData.get(
      'certification-skills',
      new Map<String, String>{ 'limit' => '1' }
    );

    Test.startTest();
    SAPICertificationSkill.getCertificationSkills();
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
      'certification-skills',
      new Map<String, String>{ 'limit' => 'abc' }
    );

    Test.startTest();
    SAPICertificationSkill.getCertificationSkills();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn400WhenCertificationIdMalformed() {
    SapiTestData.get(
      'certification-skills',
      new Map<String, String>{ 'certificationId' => 'not-an-id' }
    );

    Test.startTest();
    SAPICertificationSkill.getCertificationSkills();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn500WhenUnexpectedFailure() {
    SapiTestData.get('certification-skills', null);
    SAPICertificationSkill.throwException = true;

    Test.startTest();
    SAPICertificationSkill.getCertificationSkills();
    Test.stopTest();

    SapiTestData.assertError(500, 'INTERNAL_SERVER_ERROR');
  }
}

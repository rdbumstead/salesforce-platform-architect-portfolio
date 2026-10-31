/**
 * @description       : Unit tests for SAPICertification REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class SAPICertificationTest {
  @TestSetup
  static void setup() {
    SapiTestData.createGraph();
  }

  @IsTest
  static void shouldReturnSpecRowsWhenNoFilter() {
    SapiTestData.get('certifications', null);

    Test.startTest();
    SAPICertification.getCertifications();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(2, rows.size(), 'Every matching record is returned');
    SapiTestData.assertRowKeys(SapiTestData.CERTIFICATION_KEYS, rows);
    SapiTestData.assertCache('max-age=300, public');
    SapiTestData.assertPaging(2, false);
  }

  @IsTest
  static void shouldFilterRowsWhenContactName() {
    SapiTestData.get(
      'certifications',
      new Map<String, String>{ 'contactName' => SapiTestData.OWNER_NAME }
    );

    Test.startTest();
    SAPICertification.getCertifications();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(1, rows.size(), 'contactName narrows the result');
    SapiTestData.assertEveryRow(rows, 'contactName', SapiTestData.OWNER_NAME);
    SapiTestData.assertPaging(1, false);
  }

  @IsTest
  static void shouldFilterRowsWhenIssuerName() {
    SapiTestData.get(
      'certifications',
      new Map<String, String>{ 'issuerName' => SapiTestData.UNIVERSITY_NAME }
    );

    Test.startTest();
    SAPICertification.getCertifications();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(1, rows.size(), 'issuerName narrows the result');
    SapiTestData.assertEveryRow(
      rows,
      'issuerName',
      SapiTestData.UNIVERSITY_NAME
    );
    SapiTestData.assertPaging(1, false);
  }

  @IsTest
  static void shouldFilterRowsWhenCertificationName() {
    SapiTestData.get(
      'certifications',
      new Map<String, String>{ 'certificationName' => SapiTestData.CERT_ONE }
    );

    Test.startTest();
    SAPICertification.getCertifications();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(1, rows.size(), 'certificationName narrows the result');
    SapiTestData.assertEveryRow(rows, 'name', SapiTestData.CERT_ONE);
    SapiTestData.assertPaging(1, false);
  }

  @IsTest
  static void shouldEmitPagingHeadersWhenLimitBelowTotal() {
    SapiTestData.get(
      'certifications',
      new Map<String, String>{ 'limit' => '1' }
    );

    Test.startTest();
    SAPICertification.getCertifications();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    Assert.areEqual(1, SapiTestData.bodyAsList().size(), 'One row per page');
    SapiTestData.assertPaging(2, true);
  }

  @IsTest
  static void shouldReturn400WhenLimitNotInteger() {
    SapiTestData.get(
      'certifications',
      new Map<String, String>{ 'limit' => 'abc' }
    );

    Test.startTest();
    SAPICertification.getCertifications();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn500WhenUnexpectedFailure() {
    SapiTestData.get('certifications', null);
    SAPICertification.throwException = true;

    Test.startTest();
    SAPICertification.getCertifications();
    Test.stopTest();

    SapiTestData.assertError(500, 'INTERNAL_SERVER_ERROR');
    RestTestUtil.assertServerError();
  }
}

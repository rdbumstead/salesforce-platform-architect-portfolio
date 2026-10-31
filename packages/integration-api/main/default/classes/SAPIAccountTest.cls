/**
 * @description       : Unit tests for SAPIAccount REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 **/
@IsTest
private class SAPIAccountTest {
  @TestSetup
  static void setup() {
    SapiTestData.createGraph();
  }

  @IsTest
  static void shouldReturnSpecRowsWhenNoFilter() {
    SapiTestData.get('accounts', null);

    Test.startTest();
    SAPIAccount.getAccounts();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(2, rows.size(), 'Every matching record is returned');
    SapiTestData.assertRowKeys(SapiTestData.ACCOUNT_KEYS, rows);
    SapiTestData.assertCache('max-age=300, public');
    SapiTestData.assertPaging(2, false);
  }

  @IsTest
  static void shouldFilterRowsWhenAccountName() {
    SapiTestData.get(
      'accounts',
      new Map<String, String>{ 'accountName' => SapiTestData.EMPLOYER_NAME }
    );

    Test.startTest();
    SAPIAccount.getAccounts();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(1, rows.size(), 'accountName narrows the result');
    SapiTestData.assertEveryRow(rows, 'name', SapiTestData.EMPLOYER_NAME);
    SapiTestData.assertPaging(1, false);
  }

  @IsTest
  static void shouldEmitPagingHeadersWhenLimitBelowTotal() {
    SapiTestData.get('accounts', new Map<String, String>{ 'limit' => '1' });

    Test.startTest();
    SAPIAccount.getAccounts();
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
    SapiTestData.get('accounts', new Map<String, String>{ 'limit' => 'abc' });

    Test.startTest();
    SAPIAccount.getAccounts();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn500WhenUnexpectedFailure() {
    SapiTestData.get('accounts', null);
    SAPIAccount.throwException = true;

    Test.startTest();
    SAPIAccount.getAccounts();
    Test.stopTest();

    SapiTestData.assertError(500, 'INTERNAL_SERVER_ERROR');
    RestTestUtil.assertServerError();
  }
}

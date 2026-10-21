/**
 * @description       : Unit tests for SAPIContact REST resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 **/
@IsTest
private class SAPIContactTest {
  @TestSetup
  static void setup() {
    SapiTestData.createGraph();
  }

  @IsTest
  static void shouldReturnSpecRowsWhenNoFilter() {
    SapiTestData.get('contacts', null);

    Test.startTest();
    SAPIContact.getContacts();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(1, rows.size(), 'Every matching record is returned');
    SapiTestData.assertRowKeys(SapiTestData.CONTACT_KEYS, rows);
    Assert.areEqual(
      SapiTestData.OWNER_NAME,
      rows[0].get('name'),
      'The owner is the only contact returned'
    );
    SapiTestData.assertCache('no-store, no-cache');
    SapiTestData.assertPaging(1, false);
  }

  @IsTest
  static void shouldFilterRowsWhenContactName() {
    SapiTestData.get(
      'contacts',
      new Map<String, String>{ 'contactName' => SapiTestData.OWNER_NAME }
    );

    Test.startTest();
    SAPIContact.getContacts();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    List<Map<String, Object>> rows = SapiTestData.bodyAsList();
    Assert.areEqual(1, rows.size(), 'contactName narrows the result');
    SapiTestData.assertEveryRow(rows, 'name', SapiTestData.OWNER_NAME);
    SapiTestData.assertPaging(1, false);
  }

  @IsTest
  static void shouldExcludeNonOwnersWhenNameMatchesOtherContact() {
    SapiTestData.get(
      'contacts',
      new Map<String, String>{ 'contactName' => SapiTestData.OTHER_NAME }
    );

    Test.startTest();
    SAPIContact.getContacts();
    Test.stopTest();

    Assert.areEqual(
      200,
      RestContext.response.statusCode,
      'Status. Body: ' + SapiTestData.bodyText()
    );
    Assert.areEqual(
      0,
      SapiTestData.bodyAsList().size(),
      'Only the portfolio owner is ever returned'
    );
    SapiTestData.assertPaging(0, false);
  }

  @IsTest
  static void shouldEmitPagingHeadersWhenLimitBelowTotal() {
    insert new Contact(
      FirstName = 'Second',
      LastName = 'Owner',
      Is_Portfolio_Owner__c = true
    );
    SapiTestData.get('contacts', new Map<String, String>{ 'limit' => '1' });

    Test.startTest();
    SAPIContact.getContacts();
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
    SapiTestData.get('contacts', new Map<String, String>{ 'limit' => 'abc' });

    Test.startTest();
    SAPIContact.getContacts();
    Test.stopTest();

    SapiTestData.assertError(400, 'BAD_REQUEST');
  }

  @IsTest
  static void shouldReturn500WhenUnexpectedFailure() {
    SapiTestData.get('contacts', null);
    SAPIContact.throwException = true;

    Test.startTest();
    SAPIContact.getContacts();
    Test.stopTest();

    SapiTestData.assertError(500, 'INTERNAL_SERVER_ERROR');
  }
}

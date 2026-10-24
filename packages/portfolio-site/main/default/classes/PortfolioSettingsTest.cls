/**
 * @description       : Tests for PortfolioSettings: a shipped record is read, a missing record,
 *                      an empty value and a value outside its range give the fallback, an
 *                      override wins over the record, and the records load once per
 *                      transaction. Also proves the site guest reads a setting with no
 *                      permission set assigned.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
@IsTest
private class PortfolioSettingsTest {
  private static final String TEST_KEY = 'Test_Only_Setting';
  private static final Integer FALLBACK = 7;

  private static void putRecord(
    Decimal value,
    Decimal minValue,
    Decimal maxValue,
    String text
  ) {
    PortfolioSettings.overrides.put(
      TEST_KEY,
      new Portfolio_Setting__mdt(
        DeveloperName = TEST_KEY,
        Number_Value__c = value,
        Min_Value__c = minValue,
        Max_Value__c = maxValue,
        Text_Value__c = text
      )
    );
  }

  @IsTest
  static void shippedRecordIsRead() {
    Portfolio_Setting__mdt shipped = Portfolio_Setting__mdt.getInstance(
      'Api_Max_Page_Size'
    );
    Assert.isNotNull(shipped, 'The Api_Max_Page_Size record ships with source');

    Test.startTest();
    Integer value = PortfolioSettings.getInteger('Api_Max_Page_Size', -1);
    Test.stopTest();

    Assert.areEqual(
      shipped.Number_Value__c.intValue(),
      value,
      'The record value is read, not the fallback'
    );
  }

  @IsTest
  static void missingRecordGivesFallback() {
    Test.startTest();
    Integer value = PortfolioSettings.getInteger(
      'No_Such_Setting_Anywhere',
      FALLBACK
    );
    Test.stopTest();

    Assert.areEqual(FALLBACK, value, 'A missing record gives the fallback');
  }

  @IsTest
  static void overrideMappedToNullReadsAsMissing() {
    PortfolioSettings.overrides.put('Api_Max_Page_Size', null);

    Test.startTest();
    Integer value = PortfolioSettings.getInteger('Api_Max_Page_Size', FALLBACK);
    Test.stopTest();

    Assert.areEqual(FALLBACK, value, 'A key mapped to null reads as missing');
  }

  @IsTest
  static void blankNameGivesFallback() {
    Test.startTest();
    Integer value = PortfolioSettings.getInteger(' ', FALLBACK);
    Test.stopTest();

    Assert.areEqual(FALLBACK, value, 'A blank name gives the fallback');
  }

  @IsTest
  static void nullValueGivesFallback() {
    putRecord(null, 1, 100, null);

    Test.startTest();
    Integer value = PortfolioSettings.getInteger(TEST_KEY, FALLBACK);
    Test.stopTest();

    Assert.areEqual(FALLBACK, value, 'An empty number gives the fallback');
  }

  @IsTest
  static void valueBelowMinimumGivesFallback() {
    putRecord(0, 1, 100, null);

    Test.startTest();
    Integer value = PortfolioSettings.getInteger(TEST_KEY, FALLBACK);
    Test.stopTest();

    Assert.areEqual(
      FALLBACK,
      value,
      'A value under the minimum gives the fallback'
    );
  }

  @IsTest
  static void valueAboveMaximumGivesFallback() {
    putRecord(101, 1, 100, null);

    Test.startTest();
    Integer value = PortfolioSettings.getInteger(TEST_KEY, FALLBACK);
    Test.stopTest();

    Assert.areEqual(
      FALLBACK,
      value,
      'A value over the maximum gives the fallback'
    );
  }

  @IsTest
  static void valuesOnTheBoundsAreKept() {
    putRecord(1, 1, 100, null);
    Integer atMin = PortfolioSettings.getInteger(TEST_KEY, FALLBACK);
    putRecord(100, 1, 100, null);

    Test.startTest();
    Integer atMax = PortfolioSettings.getInteger(TEST_KEY, FALLBACK);
    Test.stopTest();

    Assert.areEqual(1, atMin, 'The minimum itself is in range');
    Assert.areEqual(100, atMax, 'The maximum itself is in range');
  }

  @IsTest
  static void valueWithNoRangeIsKept() {
    putRecord(12345, null, null, null);

    Test.startTest();
    Integer value = PortfolioSettings.getInteger(TEST_KEY, FALLBACK);
    Test.stopTest();

    Assert.areEqual(12345, value, 'No range means no bound');
  }

  @IsTest
  static void numberTooLargeForAnIntegerGivesFallback() {
    putRecord(3000000000.0, null, null, null);

    Test.startTest();
    Integer value = PortfolioSettings.getInteger(TEST_KEY, FALLBACK);
    Decimal asDecimal = PortfolioSettings.getDecimal(TEST_KEY, 0);
    Test.stopTest();

    Assert.areEqual(
      FALLBACK,
      value,
      'Integer reads stay inside the Integer range'
    );
    Assert.areEqual(
      3000000000.0,
      asDecimal,
      'The decimal read keeps the value'
    );
  }

  @IsTest
  static void decimalIsCutToItsWholePart() {
    putRecord(2.75, 1, 10, null);

    Test.startTest();
    Integer value = PortfolioSettings.getInteger(TEST_KEY, FALLBACK);
    Test.stopTest();

    Assert.areEqual(2, value, 'An integer read cuts the decimal part');
  }

  @IsTest
  static void decimalReadAndItsFallback() {
    putRecord(2.75, 1, 10, null);
    Decimal inRange = PortfolioSettings.getDecimal(TEST_KEY, 0.5);
    putRecord(20.5, 1, 10, null);

    Test.startTest();
    Decimal outOfRange = PortfolioSettings.getDecimal(TEST_KEY, 0.5);
    Test.stopTest();

    Assert.areEqual(2.75, inRange, 'A decimal in range is read');
    Assert.areEqual(
      0.5,
      outOfRange,
      'A decimal out of range gives the fallback'
    );
  }

  @IsTest
  static void textReadAndItsFallback() {
    putRecord(null, null, null, 'hello');
    String readText = PortfolioSettings.getText(TEST_KEY, 'default');
    putRecord(null, null, null, '   ');

    Test.startTest();
    String blank = PortfolioSettings.getText(TEST_KEY, 'default');
    String missing = PortfolioSettings.getText(
      'No_Such_Setting_Anywhere',
      'default'
    );
    Test.stopTest();

    Assert.areEqual('hello', readText, 'The text value is read');
    Assert.areEqual('default', blank, 'Blank text gives the fallback');
    Assert.areEqual('default', missing, 'A missing record gives the fallback');
  }

  @IsTest
  static void overrideWinsOverTheShippedRecord() {
    PortfolioSettings.overrideNumber('Api_Max_Page_Size', 42);

    Test.startTest();
    Integer value = PortfolioSettings.getInteger('Api_Max_Page_Size', FALLBACK);
    Test.stopTest();

    Assert.areEqual(42, value, 'The override is read instead of the record');
  }

  @IsTest
  static void recordsLoadOncePerTransaction() {
    Test.startTest();
    Integer queriesBefore = Limits.getQueries();
    for (Integer i = 0; i < 25; i++) {
      PortfolioSettings.getInteger('Api_Max_Page_Size', FALLBACK);
      PortfolioSettings.getDecimal('Api_Default_Page_Size', FALLBACK);
      PortfolioSettings.getText('Api_Sapi_Rate_Per_Minute', 'x');
    }
    Integer queriesAfter = Limits.getQueries();
    Test.stopTest();

    Assert.areEqual(1, PortfolioSettings.loadCount, 'The records load once');
    Assert.areEqual(
      queriesBefore,
      queriesAfter,
      'Reading settings runs no SOQL'
    );
  }

  @IsTest
  static void siteGuestReadsASettingWithNoPermissionSet() {
    List<Site> sites = [
      SELECT GuestUserId
      FROM Site
      WHERE Name = :SiteGuestTestSupport.SITE_NAME
      LIMIT 1
    ];
    if (sites.isEmpty() || sites[0].GuestUserId == null) {
      Assert.fail('The Portfolio1 site and its guest user must be deployed');
    }
    User guest = new User(Id = sites[0].GuestUserId);
    Integer expected = Portfolio_Setting__mdt.getInstance('Api_Max_Page_Size')
      .Number_Value__c.intValue();

    Integer value;
    Test.startTest();
    System.runAs(guest) {
      value = PortfolioSettings.getInteger('Api_Max_Page_Size', -1);
    }
    Test.stopTest();

    Assert.areEqual(
      expected,
      value,
      'The guest reads the record, not the fallback'
    );
  }
}

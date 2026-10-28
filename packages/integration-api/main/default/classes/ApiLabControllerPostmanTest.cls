/**
 * @description       : Unit tests for ApiLabController.getPostmanRunUrl, the reader of the Run in
 *                      Postman link: the shipped record's value whatever it holds, the link
 *                      once it is set, and blank when the record is empty or missing.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/27/2026
 **/
@IsTest
private class ApiLabControllerPostmanTest {
  private static final String RUN_URL = 'https://god.gw.postman.com/run-collection/example';

  @IsTest
  static void returnsShippedRecordValue() {
    Portfolio_Setting__mdt shipped = Portfolio_Setting__mdt.getInstance(
      ApiLabController.POSTMAN_RUN_URL_SETTING
    );
    Assert.isNotNull(shipped, 'The Postman_Run_Url record ships with source');
    String expected = String.isBlank(shipped.Text_Value__c)
      ? ''
      : shipped.Text_Value__c;

    Test.startTest();
    String url = ApiLabController.getPostmanRunUrl();
    Test.stopTest();

    Assert.areEqual(
      expected,
      url,
      'The shipped record is returned as it is, or blank when it holds nothing'
    );
  }

  @IsTest
  static void returnsBlankWhenRecordIsEmpty() {
    PortfolioSettings.overrides.put(
      ApiLabController.POSTMAN_RUN_URL_SETTING,
      new Portfolio_Setting__mdt(
        DeveloperName = ApiLabController.POSTMAN_RUN_URL_SETTING,
        Text_Value__c = ' '
      )
    );

    Test.startTest();
    String url = ApiLabController.getPostmanRunUrl();
    Test.stopTest();

    Assert.areEqual('', url, 'An empty record reads as blank');
  }

  @IsTest
  static void returnsLinkWhenRecordHoldsOne() {
    PortfolioSettings.overrides.put(
      ApiLabController.POSTMAN_RUN_URL_SETTING,
      new Portfolio_Setting__mdt(
        DeveloperName = ApiLabController.POSTMAN_RUN_URL_SETTING,
        Text_Value__c = RUN_URL
      )
    );

    Test.startTest();
    String url = ApiLabController.getPostmanRunUrl();
    Test.stopTest();

    Assert.areEqual(RUN_URL, url, 'A set link is returned as it is');
  }

  @IsTest
  static void returnsBlankWhenRecordIsMissing() {
    PortfolioSettings.overrides.put(
      ApiLabController.POSTMAN_RUN_URL_SETTING,
      null
    );

    Test.startTest();
    String url = ApiLabController.getPostmanRunUrl();
    Test.stopTest();

    Assert.areEqual('', url, 'A missing record reads as blank');
  }
}

/**
 * @description       : Unit tests for ApiLabController.getPostmanRunUrl, the reader of the Run in
 *                      Postman link: blank as shipped, the link once it is set, and blank when
 *                      the record is missing.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/27/2026
 **/
@IsTest
private class ApiLabControllerPostmanTest {
  private static final String RUN_URL = 'https://god.gw.postman.com/run-collection/example';

  @IsTest
  static void shouldReturnBlank_WhenShippedRecordIsEmpty() {
    Portfolio_Setting__mdt shipped = Portfolio_Setting__mdt.getInstance(
      ApiLabController.POSTMAN_RUN_URL_SETTING
    );
    Assert.isNotNull(shipped, 'The Postman_Run_Url record ships with source');
    Assert.isTrue(
      String.isBlank(shipped.Text_Value__c),
      'The record ships empty, so the button starts hidden'
    );

    Test.startTest();
    String url = ApiLabController.getPostmanRunUrl();
    Test.stopTest();

    Assert.areEqual('', url, 'An empty record reads as blank');
  }

  @IsTest
  static void shouldReturnLink_WhenRecordHoldsOne() {
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
  static void shouldReturnBlank_WhenRecordIsMissing() {
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

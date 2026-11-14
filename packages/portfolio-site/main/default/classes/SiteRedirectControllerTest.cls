/**
 * @description       : Tests for SiteRedirectController: the shipped records read as on for
 *                      the production site host, a record set to 0 reads as off, a missing
 *                      record reads as off, and a blank target or host turns the switch off.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/13/2026
 **/
@IsTest
private class SiteRedirectControllerTest {
  private static void putRecord(String name, Decimal value, String text) {
    PortfolioSettings.overrides.put(
      name,
      new Portfolio_Setting__mdt(
        DeveloperName = name,
        Number_Value__c = value,
        Text_Value__c = text
      )
    );
  }

  private static void putAll(Decimal enabled, String target, String host) {
    putRecord(SiteRedirectController.ENABLED_SETTING, enabled, null);
    putRecord(SiteRedirectController.TARGET_SETTING, null, target);
    putRecord(SiteRedirectController.HOST_SETTING, null, host);
  }

  @IsTest
  static void shippedRecordsNameTheProductionHost() {
    Test.startTest();
    SiteRedirectController.RedirectConfig config = SiteRedirectController.getRedirect();
    Test.stopTest();

    Assert.isTrue(config.enabled, 'The shipped switch is on');
    Assert.areEqual('https://ryanbumstead.com', config.target);
    Assert.areEqual('ryan-bumstead-dev-ed.develop.my.site.com', config.host);
  }

  @IsTest
  static void switchOffReadsAsOff() {
    putAll(0, 'https://ryanbumstead.com', 'example.my.site.com');

    Test.startTest();
    SiteRedirectController.RedirectConfig config = SiteRedirectController.getRedirect();
    Test.stopTest();

    Assert.isFalse(config.enabled, 'A switch of 0 is off');
    Assert.areEqual('https://ryanbumstead.com', config.target);
    Assert.areEqual('example.my.site.com', config.host);
  }

  @IsTest
  static void missingRecordsReadAsOff() {
    PortfolioSettings.overrides.put(
      SiteRedirectController.ENABLED_SETTING,
      null
    );
    PortfolioSettings.overrides.put(
      SiteRedirectController.TARGET_SETTING,
      null
    );
    PortfolioSettings.overrides.put(SiteRedirectController.HOST_SETTING, null);

    Test.startTest();
    SiteRedirectController.RedirectConfig config = SiteRedirectController.getRedirect();
    Test.stopTest();

    Assert.isFalse(config.enabled, 'No records means off');
    Assert.areEqual('', config.target);
    Assert.areEqual('', config.host);
  }

  @IsTest
  static void blankTargetOrHostTurnsTheSwitchOff() {
    putAll(1, '', 'example.my.site.com');
    Assert.isFalse(
      SiteRedirectController.getRedirect().enabled,
      'A blank target is off'
    );

    putAll(1, 'https://ryanbumstead.com', ' ');
    Assert.isFalse(
      SiteRedirectController.getRedirect().enabled,
      'A blank host is off'
    );
  }

  @IsTest
  static void switchOfTwoReadsAsOff() {
    putAll(2, 'https://ryanbumstead.com', 'example.my.site.com');
    Assert.isFalse(
      SiteRedirectController.getRedirect().enabled,
      'Only 1 turns the switch on'
    );
  }
}

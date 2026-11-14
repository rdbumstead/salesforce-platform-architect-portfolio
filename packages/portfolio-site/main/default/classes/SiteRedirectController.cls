/**
 * @description       : Serves the returning visitor redirect's three settings to the site's
 *                      layout. The layout sends a visitor from the Salesforce site to the static
 *                      site only when enabled is true and the page's host equals host, so a
 *                      scratch site never redirects unless its own host is put in the record.
 *                      The records are Site_Redirect_Enabled (1 or 0), Site_Redirect_Target and
 *                      Site_Redirect_Host in Portfolio_Setting__mdt. A missing or blank record
 *                      reads as off, so a mistake never sends a visitor anywhere. Nothing else
 *                      in the settings leaves this class.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/13/2026
 * @Test Class        : [SiteRedirectControllerTest]
 **/
public with sharing class SiteRedirectController {
  @TestVisible
  private static final String ENABLED_SETTING = 'Site_Redirect_Enabled';
  @TestVisible
  private static final String TARGET_SETTING = 'Site_Redirect_Target';
  @TestVisible
  private static final String HOST_SETTING = 'Site_Redirect_Host';

  /**
   * @description The redirect's settings as the layout reads them.
   */
  public class RedirectConfig {
    @AuraEnabled
    public Boolean enabled;
    @AuraEnabled
    public String target;
    @AuraEnabled
    public String host;
  }

  /**
   * @description Reads the three settings. Cacheable, so the browser can reuse the answer
   *              for the same visit.
   * @return RedirectConfig The switch, the target and the one host the redirect may run on.
   *         enabled is false when the switch record is missing or not 1, and also when the
   *         target or the host is blank.
   */
  @AuraEnabled(cacheable=true)
  public static RedirectConfig getRedirect() {
    RedirectConfig config = new RedirectConfig();
    config.target = PortfolioSettings.getText(TARGET_SETTING, '');
    config.host = PortfolioSettings.getText(HOST_SETTING, '');
    config.enabled =
      PortfolioSettings.getInteger(ENABLED_SETTING, 0) == 1 &&
      String.isNotBlank(config.target) &&
      String.isNotBlank(config.host);
    return config;
  }
}

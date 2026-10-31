/**
 * @description       : The one place a URL of our own API is built, and the switch behind it
 *                      (ADR-040). The Api_Versionless_Urls setting holds On or Off. Anything
 *                      other than Off reads as On, so a blank, a typo or a missing record never
 *                      turns the versionless URLs off by accident. On, the API is called at
 *                      /services/apexrest/papi/projects. Off, the routers answer 404 and every
 *                      caller we own uses the old /services/apexrest/papi/v1/projects. Callers
 *                      build their URL here and nowhere else.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/01/2026
 * @Test Class        : [ApiRoutesTest]
 **/
public with sharing class ApiRoutes {
  public static final String SETTING = 'Api_Versionless_Urls';
  public static final String VALUE_OFF = 'Off';
  public static final String APEX_REST = '/services/apexrest';

  /**
   * @description True unless the Api_Versionless_Urls setting is Off (any letter case,
   *              surrounding spaces ignored). A blank value, a missing record and any other
   *              text read as On.
   * @return Boolean False only when the switch is Off.
   */
  public static Boolean isVersionless() {
    String value = PortfolioSettings.getText(SETTING, null);
    return value == null || !VALUE_OFF.equalsIgnoreCase(value.trim());
  }

  /**
   * @description The URL path of a PAPI route in the form the switch selects.
   * @param route The route after the API root, for example projects/featured.
   * @return String /services/apexrest/papi/projects/featured, or with /v1/ while Off.
   */
  public static String papi(String route) {
    return build('papi', route, isVersionless());
  }

  /**
   * @description The URL path of a SAPI route in the form the switch selects.
   * @param route The route after the API root, for example skills.
   * @return String /services/apexrest/sapi/skills, or with /v1/ while Off.
   */
  public static String sapi(String route) {
    return build('sapi', route, isVersionless());
  }

  /**
   * @description The URL path for a canonical path (see ApiRequestContext.canonicalPath) in
   *              the form the switch selects.
   * @param canonical For example /sapi/skills.
   * @return String The URL path, for example /services/apexrest/sapi/skills.
   */
  public static String forCanonical(String canonical) {
    return forCanonical(canonical, isVersionless());
  }

  /**
   * @description The URL path for a canonical path in the form asked for, whatever the switch.
   * @param canonical For example /sapi/skills.
   * @param versionless True for the versionless form, false for the /v1/ form.
   * @return String The URL path.
   */
  public static String forCanonical(String canonical, Boolean versionless) {
    String path = String.isBlank(canonical) ? '' : canonical;
    String root = path.startsWith('/papi') ? 'papi' : 'sapi';
    String rest = path.removeStart('/' + root).removeStart('/');
    return build(root, rest, versionless);
  }

  private static String build(String root, String route, Boolean versionless) {
    String tail = String.isBlank(route) ? '' : '/' + route.removeStart('/');
    return APEX_REST + '/' + root + (versionless ? '' : '/v1') + tail;
  }
}

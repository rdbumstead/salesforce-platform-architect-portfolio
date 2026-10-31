/**
 * @description       : The public address of the Experience Cloud site, worked out at run
 *                      time, and the site's token URL built from it (ADR-028). Inside a site
 *                      request it is the site's own base address. Anywhere else, such as a call
 *                      on the instance address, it is the org's My Domain host with
 *                      .my.salesforce.com swapped for .my.site.com, plus the site's path prefix.
 *                      It is never ryanbumstead.com, which redirects into the site, and a client
 *                      that follows a redirect can turn a POST into a GET.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/31/2026
 * @Test Class        : [ApiSiteTest]
 **/
public with sharing class ApiSite {
  /** The Portfolio site's URL path prefix, the same value as in the Network and Site metadata. */
  public static final String PATH_PREFIX = 'portfoliovforcesite';
  private static final String MY_DOMAIN_SUFFIX = '.my.salesforce.com';
  private static final String SITE_DOMAIN_SUFFIX = '.my.site.com';

  // Tests set these, because Site is empty outside a site request.
  @TestVisible
  private static String siteBaseOverride;
  @TestVisible
  private static String orgHostOverride;

  /**
   * @description The site's base address with its path prefix and no trailing slash, for
   *              example https://example.my.site.com/portfoliovforcesite. Null when no
   *              address can be worked out.
   * @return String The base address, or null.
   */
  public static String baseUrl() {
    String base = siteBaseOverride != null
      ? siteBaseOverride
      : Site.getBaseSecureUrl();
    if (String.isNotBlank(base)) {
      base = base.trim().removeEnd('/');
      return base.endsWith('/' + PATH_PREFIX) ? base : base + '/' + PATH_PREFIX;
    }
    String host = orgHostOverride != null
      ? orgHostOverride
      : URL.getOrgDomainUrl()?.getHost();
    if (String.isBlank(host) || !host.endsWith(MY_DOMAIN_SUFFIX)) {
      return null;
    }
    return 'https://' +
      host.removeEnd(MY_DOMAIN_SUFFIX) +
      SITE_DOMAIN_SUFFIX +
      '/' +
      PATH_PREFIX;
  }

  /**
   * @description The URL a person POSTs to for an evaluator token, in the form the
   *              Api_Versionless_Urls switch selects. When no site address can be worked out
   *              it is the path alone, which still names the route.
   * @return String For example https://example.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token.
   */
  public static String tokenUrl() {
    String base = baseUrl();
    String path = ApiRoutes.papi('auth/token');
    return base == null ? '/' + PATH_PREFIX + path : base + path;
  }
}

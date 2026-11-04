/**
 * @description       : Tells the rest of the org who is calling through the static site's edge
 *                      layer. The edge user holds the Site_Edge_Actions custom permission. Only
 *                      such a caller's X-Client-Ip-Hash header is believed: 64 lowercase hex
 *                      characters, the SHA-256 of the visitor's IP and a secret salt, made at
 *                      the edge. The raw IP never reaches Salesforce. For every other caller,
 *                      including the site guest, the header is ignored and the answer is null,
 *                      so the abuse guard and the rate limits behave as they always did.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 * @Test Class        : [SiteEdgeContextTest]
 **/
public with sharing class SiteEdgeContext {
  /** The custom permission only the site edge user holds. */
  public static final String PERMISSION = 'Site_Edge_Actions';
  public static final String HASH_HEADER = 'X-Client-Ip-Hash';
  private static final Pattern HASH_PATTERN = Pattern.compile('[0-9a-f]{64}');

  /**
   * @description The error a controller throws to refuse a request with a readable message.
   *              The Lightning components receive an AuraHandledException, as they always
   *              have. Creating one outside an Aura or Visualforce request raises an
   *              uncatchable LimitException, so a request that came in through Apex REST
   *              (the site actions) gets a SiteActionException with the same message.
   * @param message The text the visitor reads.
   * @return The exception to throw.
   */
  public static Exception refusal(String message) {
    if (RestContext.request != null) {
      return new SiteActionException(message);
    }
    AuraHandledException error = new AuraHandledException(message);
    error.setMessage(message);
    return error;
  }

  /**
   * @description Whether the running user may use the site actions.
   * @return True when the user holds Site_Edge_Actions.
   */
  public static Boolean isEdgeCaller() {
    return FeatureManagement.checkPermission(PERMISSION);
  }

  /**
   * @description The visitor's IP hash from the current REST request, or null.
   * @return 64 lowercase hex characters, or null when there is no REST request, the caller is
   *         not the edge user, or the header is missing or not in that form.
   */
  public static String trustedIpHash() {
    RestRequest req = RestContext.request;
    if (req == null || req.headers == null || !isEdgeCaller()) {
      return null;
    }
    for (String name : req.headers.keySet()) {
      if (name != null && name.equalsIgnoreCase(HASH_HEADER)) {
        String value = req.headers.get(name);
        return value != null && HASH_PATTERN.matcher(value).matches()
          ? value
          : null;
      }
    }
    return null;
  }
}

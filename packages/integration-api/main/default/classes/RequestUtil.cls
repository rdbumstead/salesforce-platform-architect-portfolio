/**
 * @description       : Utility class for safe Request context operations.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 * @Test Class        : [IntegrationUtilityTest]
 **/
public with sharing class RequestUtil {
  /**
   * @description Safely gets the current request ID with null safety for test context.
   * @return String The request ID or 'N/A' if unavailable.
   */
  public static String getRequestId() {
    try {
      String requestId = Request.getCurrent()?.getRequestId();
      return String.isBlank(requestId) ? 'N/A' : requestId;
    } catch (Exception e) {
      return 'N/A';
    }
  }
}

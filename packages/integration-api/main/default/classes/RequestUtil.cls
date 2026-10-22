/**
 * @description       : Utility class for safe Request context operations, and the one
 *                      request log line every API request writes through PortfolioLog.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 * @Test Class        : [IntegrationUtilityTest, RequestUtilTest]
 **/
public with sharing class RequestUtil {
  /**
   * @description Safely gets the current request ID with null safety for test context.
   * @return String The request ID or 'N/A' if unavailable.
   */
  public static String getRequestId() {
    String requestId = Request.getCurrent()?.getRequestId();
    return String.isBlank(requestId) ? 'N/A' : requestId;
  }

  /**
   * @description Builds the request log line: path, status, correlation id and elapsed time.
   *              The path loses any query string, so no parameter value is ever logged. No
   *              body, header value or token is accepted.
   * @param path Request path, for example /sapi/v1/skills.
   * @param status HTTP status of the response.
   * @param correlationId The request's correlation id.
   * @param elapsedMs Milliseconds from the start of the request to the response.
   * @return String The line.
   */
  public static String requestLine(
    String path,
    Integer status,
    String correlationId,
    Long elapsedMs
  ) {
    String cleanPath = String.isBlank(path)
      ? 'unknown'
      : path.substringBefore('?').trim();
    return 'api request path=' +
      cleanPath +
      ' status=' +
      status +
      ' correlationId=' +
      (String.isBlank(correlationId) ? 'none' : correlationId) +
      ' elapsedMs=' +
      elapsedMs;
  }

  /**
   * @description Writes the request log line through PortfolioLog (Nebula when installed,
   *              System.debug otherwise).
   * @param path Request path.
   * @param status HTTP status of the response.
   * @param correlationId The request's correlation id.
   * @param elapsedMs Milliseconds from the start of the request to the response.
   * @return String The line written.
   */
  public static String logRequest(
    String path,
    Integer status,
    String correlationId,
    Long elapsedMs
  ) {
    String line = requestLine(path, status, correlationId, elapsedMs);
    PortfolioLog.info(line);
    return line;
  }
}

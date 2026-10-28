/**
 * @description       : Reusable HttpCalloutMock for the Portfolio_API and Portfolio_API_Token
 *                      Named Credentials. Answers the OAuth token endpoint and Apex REST paths
 *                      separately, can throw a CalloutException instead, and records every
 *                      request it receives for assertions.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [TokenExchangeServiceTest, ApiLabControllerTest, PAPIAuthTokenTest]
 **/
@IsTest
public class PortfolioApiCalloutMock implements HttpCalloutMock {
  public static final String TOKEN_PATH = '/services/oauth2/token';
  public static final String APEX_REST_PATH = '/services/apexrest/';
  public static final String TEST_ACCESS_TOKEN = '00Dtest!mock.access.token';
  public static final String TEST_INSTANCE_URL = 'https://example.my.salesforce.com';

  /** Every request the mock answered, in order. */
  public final List<HttpRequest> requests = new List<HttpRequest>();

  private Integer tokenStatus = 200;
  private String tokenBody;
  private Integer restStatus = 200;
  private String restBody = '[]';
  private Map<String, String> restHeaders = new Map<String, String>();
  private String calloutExceptionMessage;

  /**
   * @description A mock whose token endpoint issues TEST_ACCESS_TOKEN and whose Apex REST
   *              paths return 200 with an empty JSON array.
   */
  public PortfolioApiCalloutMock() {
    this.tokenBody = JSON.serialize(
      new Map<String, Object>{
        'access_token' => TEST_ACCESS_TOKEN,
        'instance_url' => TEST_INSTANCE_URL,
        'token_type' => 'Bearer',
        'scope' => 'api',
        'issued_at' => String.valueOf(Datetime.now().getTime())
      }
    );
  }

  /**
   * @description Sets the token endpoint's response.
   * @param status HTTP status.
   * @param body Response body.
   * @return PortfolioApiCalloutMock This mock.
   */
  public PortfolioApiCalloutMock withTokenResponse(
    Integer status,
    String body
  ) {
    this.tokenStatus = status;
    this.tokenBody = body;
    return this;
  }

  /**
   * @description Sets the response for any Apex REST path.
   * @param status HTTP status.
   * @param body Response body.
   * @param headers Response headers.
   * @return PortfolioApiCalloutMock This mock.
   */
  public PortfolioApiCalloutMock withRestResponse(
    Integer status,
    String body,
    Map<String, String> headers
  ) {
    this.restStatus = status;
    this.restBody = body;
    this.restHeaders = headers == null ? new Map<String, String>() : headers;
    return this;
  }

  /**
   * @description Makes every callout throw a CalloutException with this message.
   * @param message Exception message.
   * @return PortfolioApiCalloutMock This mock.
   */
  public PortfolioApiCalloutMock throwing(String message) {
    this.calloutExceptionMessage = message;
    return this;
  }

  /**
   * @description Answers one request.
   * @param req The outgoing request.
   * @return HttpResponse The configured response.
   */
  public HttpResponse respond(HttpRequest req) {
    requests.add(req);
    if (calloutExceptionMessage != null) {
      throw new CalloutException(calloutExceptionMessage);
    }
    HttpResponse res = new HttpResponse();
    res.setHeader('Content-Type', 'application/json');
    if (req.getEndpoint().contains(TOKEN_PATH)) {
      res.setStatusCode(tokenStatus);
      res.setBody(tokenBody);
      return res;
    }
    if (req.getEndpoint().contains(APEX_REST_PATH)) {
      res.setStatusCode(restStatus);
      res.setBody(restBody);
      for (String name : restHeaders.keySet()) {
        res.setHeader(name, restHeaders.get(name));
      }
      return res;
    }
    res.setStatusCode(404);
    res.setBody('{"error":"not_mocked"}');
    return res;
  }
}

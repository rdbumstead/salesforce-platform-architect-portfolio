/**
 * @description       : Utility class for REST API test setup.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 * @Test Class        : [RestTestUtil]
 **/
@IsTest
public class RestTestUtil {
  /**
   * @description Initializes RestContext for GET requests with required headers.
   */
  public static void initGet(String uri, Map<String, String> params) {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();

    req.requestURI = uri;
    req.httpMethod = 'GET';
    req.addHeader('X-Request-Id', 'TEST-REQ-' + Crypto.getRandomInteger());
    req.addHeader('X-API-Version', 'v1');
    req.addHeader('Content-Type', 'application/json');

    if (params != null) {
      for (String key : params.keySet()) {
        req.params.put(key, params.get(key));
      }
    }

    RestContext.request = req;
    RestContext.response = res;
  }

  /**
   * @description Initializes RestContext for GET requests without params.
   */
  public static void initGet(String uri) {
    initGet(uri, null);
  }

  /**
   * @description Returns the current RestResponse for assertions.
   */
  public static RestResponse getResponse() {
    return RestContext.response;
  }
}

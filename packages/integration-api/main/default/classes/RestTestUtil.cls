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
   * @description Initializes RestContext for GET requests with valid tracing headers
   *              (a UUID X-Request-Id and X-API-Version v1).
   */
  public static void initGet(String uri, Map<String, String> params) {
    initGetRaw(
      uri,
      new Map<String, String>{
        'X-Request-Id' => UUID.randomUUID().toString(),
        'X-API-Version' => 'v1',
        'Content-Type' => 'application/json'
      },
      params
    );
  }

  /**
   * @description Initializes RestContext for GET requests without params.
   */
  public static void initGet(String uri) {
    initGet(uri, null);
  }

  /**
   * @description Initializes RestContext for GET requests with exactly the given headers,
   *              for tests that need a missing or malformed header.
   */
  public static void initGetRaw(
    String uri,
    Map<String, String> headers,
    Map<String, String> params
  ) {
    RestRequest req = new RestRequest();
    RestResponse res = new RestResponse();

    req.requestURI = uri;
    req.httpMethod = 'GET';

    if (headers != null) {
      for (String key : headers.keySet()) {
        req.addHeader(key, headers.get(key));
      }
    }

    if (params != null) {
      for (String key : params.keySet()) {
        req.params.put(key, params.get(key));
      }
    }

    RestContext.request = req;
    RestContext.response = res;
  }

  /**
   * @description Returns the current RestResponse for assertions.
   */
  public static RestResponse getResponse() {
    return RestContext.response;
  }

  /**
   * @description Parses the current response body as a JSON object.
   */
  public static Map<String, Object> getBodyAsMap() {
    return (Map<String, Object>) JSON.deserializeUntyped(
      RestContext.response.responseBody.toString()
    );
  }
}

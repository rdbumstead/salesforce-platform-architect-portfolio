/**
 * @description       : Shared setup for the site actions tests. Creates the edge user the way
 *                      production's is set up (the Portfolio API Integration profile with
 *                      Portfolio_Site_Edge and nothing else), and calls the actions as that
 *                      user, with a visitor IP hash and a request id.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 * @Test Class        : [SiteActionsResourceTest, SiteEdgeContextTest]
 **/
@isTest
public with sharing class SiteActionsTestSupport {
  public static final String EDGE_PROFILE = 'Portfolio API Integration';
  public static final String EDGE_USERNAME_PREFIX = 'site-edge-test.';
  public static final String HASH_A = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  public static final String HASH_B = 'b1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  public static final String REQUEST_ID = '3f2b9c1e-8a4d-4e6b-9c2f-1a2b3c4d5e6f';

  /**
   * @description Creates a user on the integration profile holding only the named permission
   *              sets. Setup DML runs in its own runAs block so tests can mix it with data.
   * @param permissionSets Names of the permission sets to assign
   * @param alias The user alias
   * @return the new user
   */
  public static User createUser(List<String> permissionSets, String alias) {
    User edge;
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Profile integrationProfile = [
        SELECT Id
        FROM Profile
        WHERE Name = :EDGE_PROFILE
        LIMIT 1
      ];
      edge = new User(
        Username = EDGE_USERNAME_PREFIX +
          Crypto.getRandomInteger() +
          '@example.com.portfolio',
        Email = 'site-edge-test@example.com',
        LastName = 'Site Edge',
        Alias = alias,
        ProfileId = integrationProfile.Id,
        TimeZoneSidKey = 'America/Edmonton',
        LocaleSidKey = 'en_US',
        EmailEncodingKey = 'UTF-8',
        LanguageLocaleKey = 'en_US'
      );
      insert edge;
      List<PermissionSetAssignment> assignments = new List<PermissionSetAssignment>();
      for (PermissionSet permissionSet : [
        SELECT Id
        FROM PermissionSet
        WHERE Name IN :permissionSets
      ]) {
        assignments.add(
          new PermissionSetAssignment(
            AssigneeId = edge.Id,
            PermissionSetId = permissionSet.Id
          )
        );
      }
      insert assignments;
    }
    return edge;
  }

  /**
   * @description Creates the edge user, the way production's is set up.
   * @return the new user
   */
  public static User createEdgeUser() {
    return createUser(new List<String>{ 'Portfolio_Site_Edge' }, 'siteedge');
  }

  /**
   * @description Creates a user like the edge user without the edge permission set.
   * @return the new user
   */
  public static User createUserWithoutEdgePermission() {
    return createUser(new List<String>(), 'noedge');
  }

  /**
   * @description Calls one action as the running user.
   * @param httpMethod GET or POST
   * @param action the action name
   * @param body the JSON body, or null
   * @param ipHash the X-Client-Ip-Hash value, or null for none
   * @param extraHeaders more request headers, or null
   * @return the response
   */
  public static RestResponse call(
    String httpMethod,
    String action,
    String body,
    String ipHash,
    Map<String, String> extraHeaders
  ) {
    RestRequest req = new RestRequest();
    req.requestURI = '/services/apexrest/site/actions/' + action;
    req.httpMethod = httpMethod;
    req.addHeader(SiteActionsResource.REQUEST_ID_HEADER, REQUEST_ID);
    if (ipHash != null) {
      req.addHeader(SiteEdgeContext.HASH_HEADER, ipHash);
    }
    if (extraHeaders != null) {
      for (String name : extraHeaders.keySet()) {
        req.addHeader(name, extraHeaders.get(name));
      }
    }
    if (body != null) {
      req.requestBody = Blob.valueOf(body);
    }
    RestContext.request = req;
    RestContext.response = new RestResponse();
    if (httpMethod == 'GET') {
      SiteActionsResource.doGet();
    } else {
      SiteActionsResource.doPost();
    }
    return RestContext.response;
  }
}

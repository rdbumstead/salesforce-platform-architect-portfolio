/**
 * @description       : Shared setup for the site export tests. Creates a build user the way
 *                      production's is set up (the Portfolio API Integration profile with
 *                      Portfolio_Guest and Portfolio_Site_Build), calls the export as that user,
 *                      and compares each result with what the real site guest reads.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 * @Test Class        : [SiteExportResourceTest]
 **/
@isTest
public with sharing class SiteExportTestSupport {
  public static final String BUILD_PROFILE = 'Portfolio API Integration';
  public static final String BUILD_USERNAME_PREFIX = 'site-build-test.';

  /**
   * Keys that measure the call itself, not any record: when it ran and how long the describe
   * took. They differ between any two calls, so the comparison masks them and nothing else.
   */
  private static final List<Pattern> VOLATILE = new List<Pattern>{
    Pattern.compile('"generatedAt":"[^"]*"'),
    Pattern.compile('"cpuMs":[0-9]+')
  };

  /**
   * @description Creates the build user in its own runAs block, so tests can mix it with data.
   * @return the new user
   */
  public static User createBuildUser() {
    User build;
    System.runAs(new User(Id = UserInfo.getUserId())) {
      Profile integrationProfile = [
        SELECT Id
        FROM Profile
        WHERE Name = :BUILD_PROFILE
        LIMIT 1
      ];
      build = new User(
        Username = BUILD_USERNAME_PREFIX +
          Crypto.getRandomInteger() +
          '@example.com.portfolio',
        Email = 'site-build-test@example.com',
        LastName = 'Site Build',
        Alias = 'sitebld',
        ProfileId = integrationProfile.Id,
        TimeZoneSidKey = 'America/Edmonton',
        LocaleSidKey = 'en_US',
        EmailEncodingKey = 'UTF-8',
        LanguageLocaleKey = 'en_US'
      );
      insert build;
      List<PermissionSetAssignment> assignments = new List<PermissionSetAssignment>();
      for (PermissionSet permissionSet : [
        SELECT Id
        FROM PermissionSet
        WHERE Name IN ('Portfolio_Guest', 'Portfolio_Site_Build')
      ]) {
        assignments.add(
          new PermissionSetAssignment(
            AssigneeId = build.Id,
            PermissionSetId = permissionSet.Id
          )
        );
      }
      insert assignments;
    }
    return build;
  }

  /**
   * @description Calls the export the way the build does.
   * @param call the call name, or null for the allowlist
   * @param params the JSON params text, or null
   * @return the response
   */
  public static RestResponse get(String call, String params) {
    RestRequest req = new RestRequest();
    req.requestURI = '/services/apexrest/site/export';
    req.httpMethod = 'GET';
    if (call != null) {
      req.params.put('call', call);
    }
    if (params != null) {
      req.params.put('params', params);
    }
    RestContext.request = req;
    RestContext.response = new RestResponse();
    SiteExportResource.doGet();
    return RestContext.response;
  }

  /**
   * @description The result text from an export body, exactly as the endpoint wrote it.
   * @param call the call name
   * @param res the response
   * @return the result JSON text
   */
  public static String resultText(String call, RestResponse res) {
    String body = res.responseBody.toString();
    String prefix = '{"call":' + JSON.serialize(call) + ',"result":';
    Assert.areEqual(
      200,
      res.statusCode,
      call + ' should answer 200, got ' + body
    );
    Assert.isTrue(
      body.startsWith(prefix),
      call + ' body should open with the call'
    );
    return body.substring(prefix.length(), body.length() - 1);
  }

  /**
   * @description Masks the keys that measure the call itself.
   * @param json the JSON text
   * @return the text with those values blanked
   */
  public static String masked(String json) {
    String result = json;
    for (Pattern volatileKey : VOLATILE) {
      result = volatileKey.matcher(result).replaceAll('"masked":0');
    }
    return result;
  }

  /**
   * @description Asserts the export, read as the build user, returns what the guest reads.
   * @param build the build user
   * @param call the call name
   * @param params the parameters
   */
  public static void assertSameAsGuest(
    User build,
    String call,
    Map<String, Object> params
  ) {
    User guest = SiteGuestTestSupport.preparedGuest();
    String guestJson;
    System.runAs(guest) {
      guestJson = SiteExportResource.serialize(
        SiteExportCalls.run(call, params)
      );
    }
    String exported;
    System.runAs(build) {
      exported = resultText(call, get(call, JSON.serialize(params)));
    }
    Assert.areEqual(
      masked(guestJson),
      masked(exported),
      call + ' ' + JSON.serialize(params) + ' differs from what the guest reads'
    );
    Assert.isFalse(
      exported.contains(SiteGuestTestSupport.OWNER_EMAIL),
      call + ' must not carry the owner email'
    );
    Assert.isFalse(
      exported.contains(SiteGuestTestSupport.OWNER_PHONE),
      call + ' must not carry the owner phone'
    );
  }
}

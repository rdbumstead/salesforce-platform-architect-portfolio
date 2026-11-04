/**
 * @description       : Tests for SiteEdgeContext. The visitor IP hash is believed only from a
 *                      caller holding Site_Edge_Actions, and only in its exact form.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/02/2026
 * @Test Class        : [SiteEdgeContextTest]
 **/
@isTest
private class SiteEdgeContextTest {
  @TestSetup
  static void setup() {
    SiteActionsTestSupport.createEdgeUser();
    SiteActionsTestSupport.createUserWithoutEdgePermission();
  }

  private static User userWithAlias(String alias) {
    return [
      SELECT Id
      FROM User
      WHERE
        Username LIKE :SiteActionsTestSupport.EDGE_USERNAME_PREFIX + '%'
        AND Alias = :alias
      LIMIT 1
    ];
  }

  private static void requestWithHeader(String name, String value) {
    RestRequest req = new RestRequest();
    req.addHeader(name, value);
    RestContext.request = req;
  }

  @isTest
  static void trustsAValidHashFromTheEdgeUser() {
    String hash;
    System.runAs(userWithAlias('siteedge')) {
      requestWithHeader(
        SiteEdgeContext.HASH_HEADER,
        SiteActionsTestSupport.HASH_A
      );
      hash = SiteEdgeContext.trustedIpHash();
    }
    Assert.areEqual(SiteActionsTestSupport.HASH_A, hash, 'The hash is trusted');
  }

  @isTest
  static void readsTheHeaderWhateverItsCase() {
    String hash;
    System.runAs(userWithAlias('siteedge')) {
      requestWithHeader('x-client-ip-hash', SiteActionsTestSupport.HASH_A);
      hash = SiteEdgeContext.trustedIpHash();
    }
    Assert.areEqual(
      SiteActionsTestSupport.HASH_A,
      hash,
      'Case does not matter'
    );
  }

  @isTest
  static void ignoresTheHashFromAnyoneElse() {
    String hash;
    System.runAs(userWithAlias('noedge')) {
      requestWithHeader(
        SiteEdgeContext.HASH_HEADER,
        SiteActionsTestSupport.HASH_A
      );
      hash = SiteEdgeContext.trustedIpHash();
    }
    Assert.isNull(hash, 'A caller without Site_Edge_Actions is not believed');
  }

  @isTest
  static void ignoresAHashInTheWrongForm() {
    List<String> bad = new List<String>{
      SiteActionsTestSupport.HASH_A.toUpperCase(),
      SiteActionsTestSupport.HASH_A.left(63),
      SiteActionsTestSupport.HASH_A + 'a',
      '203.0.113.9',
      ''
    };
    System.runAs(userWithAlias('siteedge')) {
      for (String value : bad) {
        requestWithHeader(SiteEdgeContext.HASH_HEADER, value);
        Assert.isNull(SiteEdgeContext.trustedIpHash(), 'Refused: ' + value);
      }
    }
  }

  @isTest
  static void answersNullWithNoRequestOrNoHeader() {
    System.runAs(userWithAlias('siteedge')) {
      RestContext.request = null;
      Assert.isNull(SiteEdgeContext.trustedIpHash(), 'No REST request');
      RestContext.request = new RestRequest();
      Assert.isNull(SiteEdgeContext.trustedIpHash(), 'No header');
    }
  }
}

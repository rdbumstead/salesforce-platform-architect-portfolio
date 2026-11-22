/**
 * @description       : A governance drill test that fails on purpose. It lives only on a drill branch and is never merged.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/21/2026
 **/
@IsTest
private class GovernanceDrillFailingTest {
  @IsTest
  static void failsOnPurpose() {
    Assert.fail('Governance drill: this test fails on purpose.');
  }
}

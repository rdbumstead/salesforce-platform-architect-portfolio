/**
 * @description       : Covers one branch of the drill class, so its coverage stays under 75 percent. Never merged.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/21/2026
 **/
@IsTest
private class GovernanceDrillLowCoverageTest {
  @IsTest
  static void coversTheFirstStepOnly() {
    Assert.areEqual(
      'one',
      GovernanceDrillLowCoverage.describe(1),
      'The first step is described.'
    );
  }
}

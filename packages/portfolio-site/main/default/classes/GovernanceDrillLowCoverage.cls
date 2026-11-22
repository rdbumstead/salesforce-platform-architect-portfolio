/**
 * @description       : A governance drill class that its test covers only in part. It lives only on a drill branch and is never merged.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/21/2026
 **/
public with sharing class GovernanceDrillLowCoverage {
  public static String describe(Integer step) {
    if (step == 1) {
      return 'one';
    }
    if (step == 2) {
      return 'two';
    }
    if (step == 3) {
      return 'three';
    }
    if (step == 4) {
      return 'four';
    }
    if (step == 5) {
      return 'five';
    }
    if (step == 6) {
      return 'six';
    }
    return 'other';
  }
}

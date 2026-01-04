/**
 * @description       : Utility class for query mode handling in test vs production context.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
public with sharing class QueryMode {
  /**
   * @description Returns true if USER_MODE should be used (production only, not in tests).
   *              WITH USER_MODE enforces FLS/object permissions which aren't available in test context.
   * @return Boolean True if USER_MODE should be applied, false in test context.
   */
  public static Boolean user() {
    return !Test.isRunningTest();
  }
}

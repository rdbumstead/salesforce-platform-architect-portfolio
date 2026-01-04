/**
 * @description       : Unit tests for shared integration utility classes.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
@IsTest
private class IntegrationUtilityTest {
  @IsTest
  static void testRequestUtil() {
    Test.startTest();
    String requestId = RequestUtil.getRequestId();
    Test.stopTest();
    System.assertNotEquals(null, requestId, 'Request ID should not be null');
  }

  @IsTest
  static void testQueryMode() {
    Test.startTest();
    Boolean isUserMode = QueryMode.user();
    Test.stopTest();
    // In test context, user() should return false (Test.isRunningTest() is true)
    System.assertEquals(false, isUserMode, 'Should be false in test context');
  }
}

/**
 * @description       : Unit tests for CommunitiesSelfRegController.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/03/2026
 **/
@IsTest
public with sharing class CommunitiesSelfRegControllerTest {
  @IsTest
  public static void testCommunitiesSelfRegController() {
    CommunitiesSelfRegController controller = new CommunitiesSelfRegController();
    controller.firstName = 'FirstName';
    controller.lastName = 'LastName';
    controller.email = 'test@force.com';
    controller.communityNickname = 'test';
    controller.password = 'abcd1234';
    controller.confirmPassword = 'abcd1234';

    // Test Success (with Mock)
    CommunitiesSelfRegController.testMockUserId = '005fakeuseridxx';
    System.assertEquals(
      null,
      controller.registerUser(),
      'Should return null or page ref'
    );
  }

  @IsTest
  public static void testCommunitiesSelfRegControllerValues() {
    CommunitiesSelfRegController controller = new CommunitiesSelfRegController();
    controller.firstName = 'FirstName';
    controller.lastName = 'LastName';
    controller.email = 'test@force.com';
    controller.communityNickname = 'test';
    controller.password = 'abcd1234';
    controller.confirmPassword = 'abcd12345'; // Mismatch

    // Test Password Mismatch
    System.assertEquals(
      null,
      controller.registerUser(),
      'Should return null on validation error'
    );
    Boolean hasError = false;
    for (ApexPages.Message msg : ApexPages.getMessages()) {
      if (msg.getSummary().contains(Label.site.passwords_dont_match)) {
        hasError = true;
      }
    }
    System.assert(hasError, 'Should have password mismatch error');
  }

  @IsTest
  public static void testCommunitiesSelfRegControllerInstantiation() {
    ApexPages.currentPage().getParameters().put('expid', 'testExpId');
    CommunitiesSelfRegController controller = new CommunitiesSelfRegController();
    System.assertNotEquals(null, controller);
  }

  @IsTest
  public static void testCommunitiesSelfRegControllerWithNoPassword() {
    CommunitiesSelfRegController controller = new CommunitiesSelfRegController();
    controller.firstName = 'FirstName';
    controller.lastName = 'LastName';
    controller.email = 'test@force.com';
    controller.communityNickname = 'test';
    controller.password = null;
    controller.confirmPassword = null;
    CommunitiesSelfRegController.testMockUserId = '005fakeuseridxx';

    PageReference next = controller.registerUser();

    System.assertNotEquals(
      null,
      next,
      'A user created with no password is sent to the confirmation page'
    );
    System.assert(
      next.getRedirect(),
      'The confirmation page is a redirect, not a render'
    );
  }

  @IsTest
  public static void testCommunitiesSelfRegControllerWhenTheUserIsNotCreated() {
    CommunitiesSelfRegController controller = new CommunitiesSelfRegController();
    controller.firstName = 'FirstName';
    controller.lastName = 'LastName';
    controller.email = 'test@force.com';
    controller.communityNickname = 'test';
    controller.password = 'abcd1234';
    controller.confirmPassword = 'abcd1234';
    CommunitiesSelfRegController.testMockUserId = null;

    PageReference next = controller.registerUser();

    System.assertEquals(null, next, 'No user, no page');
  }
}

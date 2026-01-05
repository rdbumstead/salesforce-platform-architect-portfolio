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
}

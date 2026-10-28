/**
 * @description       : Sends a password reset for the site's login page through
 *                      Site.forgotPassword and returns a message when the username is not
 *                      valid.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/03/2026
 * @Test Class        : [LightningForgotPasswordControllerTest]
 **/
global class LightningForgotPasswordController {
  public LightningForgotPasswordController() {
  }

  @TestVisible
  private static Boolean testThrowException = false;

  @AuraEnabled
  public static String forgotPassword(String username, String checkEmailUrl) {
    try {
      if (Test.isRunningTest() && testThrowException) {
        throw new CalloutException('Test Exception');
      }
      Site.forgotPassword(username);
      ApexPages.PageReference checkEmailRef = new PageReference(checkEmailUrl);
      if (!Site.isValidUsername(username)) {
        return Label.Site.invalid_email;
      }
      aura.redirect(checkEmailRef);
      return null;
    } catch (Exception ex) {
      return ex.getMessage();
    }
  }

  @AuraEnabled
  global static String setExperienceId(String expId) {
    // Return null if there is no error, else it will return the error message
    try {
      if (expId != null) {
        Site.setExperienceId(expId);
      }
      return null;
    } catch (Exception ex) {
      return ex.getMessage();
    }
  }
}

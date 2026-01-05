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

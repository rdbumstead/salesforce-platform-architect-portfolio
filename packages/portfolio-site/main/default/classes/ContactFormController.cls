/**
 * @description       : Takes a message from the portfolio contact form
 *                      (ADR-031). It validates the input and runs SubmissionGuard as the site
 *                      guest, then publishes one Contact_Form_Submission__e. A trigger saves the
 *                      Lead from that event as the Automated Process user, in system mode with
 *                      Database.DMLOptions, so the org's default assignment rule and
 *                      auto-response rule run as they would for Web-to-Lead. The hop is needed
 *                      because the auto-response rule fails in the guest's own context. The site
 *                      guest has no Lead permission at all. The auto-response is asked for only
 *                      on the first message from an address in 24 hours, so the form cannot be
 *                      used to send mail to someone else again and again.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 * @Test Class        : [ContactFormControllerTest]
 **/
public with sharing class ContactFormController {
  @TestVisible
  private static final Integer MAX_FIRST_NAME = 40;
  @TestVisible
  private static final Integer MAX_LAST_NAME = 80;
  @TestVisible
  private static final Integer MAX_EMAIL = 80;
  @TestVisible
  private static final Integer MAX_COMPANY = 255;
  @TestVisible
  private static final Integer MAX_MESSAGE = 2000;
  @TestVisible
  private static final String RATE_LIMITED_MESSAGE = 'The form has had a lot of messages today. Try again tomorrow, or reach Ryan on LinkedIn.';
  @TestVisible
  private static final String SAVE_FAILED_MESSAGE = 'Your message could not be sent. Try again later.';
  @TestVisible
  private static Boolean forceSaveFailure = false;
  private static final Pattern EMAIL_PATTERN = Pattern.compile(
    '^[A-Za-z0-9._%+\'-]+@[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+$'
  );

  /**
   * @description What the controller did with a message. The form shows the same thanks for
   *              sent and dropped, so a bot cannot tell them apart.
   */
  public class Result {
    @AuraEnabled
    public Boolean received = true;
  }

  /**
   * @description Checks a contact form message and hands it on to be saved as a Lead.
   * @param firstName Required, at most 40 characters. The auto-response greets by first name.
   * @param lastName Required, at most 80 characters.
   * @param email Required, a valid address of at most 80 characters.
   * @param company Optional, at most 255 characters.
   * @param message Required, at most 2000 characters.
   * @param website The honeypot. A person leaves it empty.
   * @param elapsedMs Milliseconds between the form appearing and the submit.
   * @return Result received is true for a saved message and for a silent drop alike.
   * @throws AuraHandledException With a readable message when the input is invalid, the daily
   *         cap is reached, or the message cannot be handed on.
   * @example
   * ContactFormController.submitContact('Ada', 'Lovelace', 'ada@example.com', null, 'Hello', null, 9000);
   */
  @AuraEnabled
  public static Result submitContact(
    String firstName,
    String lastName,
    String email,
    String company,
    String message,
    String website,
    Integer elapsedMs
  ) {
    String validationError = validate(
      firstName,
      lastName,
      email,
      company,
      message
    );
    if (validationError != null) {
      throw auraError(validationError);
    }
    String cleanEmail = email.trim().toLowerCase();

    SubmissionGuard.Request request = new SubmissionGuard.Request();
    request.formKey = SubmissionGuard.FORM_CONTACT;
    request.email = cleanEmail;
    request.message = String.join(
      new List<String>{
        firstName,
        lastName,
        String.isBlank(company) ? '' : company,
        message
      },
      ' '
    );
    request.honeypot = website;
    request.elapsedMs = elapsedMs;
    SubmissionGuard.Decision decision = SubmissionGuard.check(request);
    if (decision.silentDrop) {
      return new Result();
    }
    if (decision.rateLimited) {
      throw auraError(RATE_LIMITED_MESSAGE);
    }

    Contact_Form_Submission__e submission = new Contact_Form_Submission__e(
      First_Name__c = firstName.trim(),
      Last_Name__c = lastName.trim(),
      Email__c = cleanEmail,
      Company__c = String.isBlank(company) ? null : company.trim(),
      Message__c = message.trim(),
      Send_Auto_Response__c = !hasAutoResponseSince(
        cleanEmail,
        Datetime.now().addHours(-24)
      )
    );
    Database.SaveResult published = forceSaveFailure
      ? null
      : EventBus.publish(submission);
    if (published == null || !published.isSuccess()) {
      throw auraError(SAVE_FAILED_MESSAGE);
    }
    return new Result();
  }

  private static String validate(
    String firstName,
    String lastName,
    String email,
    String company,
    String message
  ) {
    if (String.isBlank(firstName)) {
      return 'Enter your first name.';
    }
    if (tooLong(firstName, MAX_FIRST_NAME)) {
      return 'Your first name can be at most ' +
        MAX_FIRST_NAME +
        ' characters.';
    }
    if (String.isBlank(lastName)) {
      return 'Enter your last name.';
    }
    if (tooLong(lastName, MAX_LAST_NAME)) {
      return 'Your last name can be at most ' + MAX_LAST_NAME + ' characters.';
    }
    if (String.isBlank(email)) {
      return 'Enter your email address.';
    }
    if (
      tooLong(email, MAX_EMAIL) ||
      !EMAIL_PATTERN.matcher(email.trim()).matches()
    ) {
      return 'Enter a valid email address, like name@example.com.';
    }
    if (tooLong(company, MAX_COMPANY)) {
      return 'Your company can be at most ' + MAX_COMPANY + ' characters.';
    }
    if (String.isBlank(message)) {
      return 'Enter a message.';
    }
    if (tooLong(message, MAX_MESSAGE)) {
      return 'Your message can be at most ' + MAX_MESSAGE + ' characters.';
    }
    return null;
  }

  private static Boolean tooLong(String value, Integer max) {
    return String.isNotBlank(value) && value.trim().length() > max;
  }

  private static AuraHandledException auraError(String message) {
    AuraHandledException error = new AuraHandledException(message);
    error.setMessage(message);
    return error;
  }

  /**
   * @description Reads earlier contact form Leads for the once a day auto-response rule.
   *              Without sharing because the site guest can see no Lead at all, and the
   *              answer is a single Boolean.
   */
  private without sharing class LeadHistory {
    private Boolean hasAutoResponse(String email, Datetime since) {
      return [
          SELECT COUNT()
          FROM Lead
          WHERE
            Email = :email
            AND LeadSource = :SubmissionGuard.LEAD_SOURCE
            AND Auto_Response_Requested__c = TRUE
            AND CreatedDate >= :since
        ] > 0;
    }
  }

  private static Boolean hasAutoResponseSince(String email, Datetime since) {
    return new LeadHistory().hasAutoResponse(email, since);
  }
}

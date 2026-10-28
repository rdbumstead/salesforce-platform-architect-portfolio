/**
 * @description       : Tests for ContactFormController, ContactFormLeadWriter and
 *                      ContactFormSubmissionTrigger (ADR-031). Guest tests run as
 *                      the real Portfolio1 site guest, then deliver the event so the trigger
 *                      saves the Lead as it does in the org.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/23/2026
 **/
@isTest
private class ContactFormControllerTest {
  private static final Integer HUMAN_MS = 9000;
  private static final String EMAIL = 'ada@example.com';

  private static ContactFormController.Result submitAsGuest(
    User guest,
    String email,
    String website,
    Integer elapsedMs
  ) {
    ContactFormController.Result result;
    System.runAs(guest) {
      result = ContactFormController.submitContact(
        ' Ada ',
        ' Lovelace ',
        email,
        null,
        ' Hello Ryan ',
        website,
        elapsedMs
      );
    }
    Test.getEventBus().deliver();
    return result;
  }

  private static List<Lead> contactLeads() {
    return [
      SELECT
        FirstName,
        LastName,
        Email,
        Company,
        Description,
        LeadSource,
        Auto_Response_Requested__c,
        Reply_Reminder_1_At__c,
        Reply_Reminder_2_At__c,
        CreatedDate
      FROM Lead
      WHERE LeadSource = :SubmissionGuard.LEAD_SOURCE
      ORDER BY CreatedDate, Id
    ];
  }

  @isTest
  static void guestSubmissionSavesALeadWithTheAutoResponse() {
    User guest = SiteGuestTestSupport.preparedGuest();

    Test.startTest();
    ContactFormController.Result result = submitAsGuest(
      guest,
      ' ADA@Example.com ',
      null,
      HUMAN_MS
    );
    Test.stopTest();

    Assert.isTrue(result.received, 'The visitor is thanked');
    List<Lead> leads = contactLeads();
    Assert.areEqual(1, leads.size(), 'One Lead');
    Lead saved = leads[0];
    Assert.areEqual('Ada', saved.FirstName, 'First name trimmed');
    Assert.areEqual('Lovelace', saved.LastName, 'Last name trimmed');
    Assert.areEqual(EMAIL, saved.Email, 'Email trimmed and lower case');
    Assert.areEqual(
      ContactFormLeadWriter.NO_COMPANY,
      saved.Company,
      'Company fallback'
    );
    Assert.areEqual('Hello Ryan', saved.Description, 'Message saved');
    Assert.isTrue(
      saved.Auto_Response_Requested__c,
      'First message asks for the auto-response'
    );
    Assert.isNotNull(saved.Reply_Reminder_1_At__c, 'Reminder 1 set');
    Assert.isTrue(
      saved.Reply_Reminder_2_At__c > saved.Reply_Reminder_1_At__c,
      'Reminder 2 comes after reminder 1'
    );
  }

  @isTest
  static void aRepeatFromTheSameAddressIsSavedWithoutAnAutoResponse() {
    User guest = SiteGuestTestSupport.preparedGuest();

    Test.startTest();
    submitAsGuest(guest, EMAIL, null, HUMAN_MS);
    submitAsGuest(guest, EMAIL, null, HUMAN_MS);
    Test.stopTest();

    List<Lead> leads = contactLeads();
    Assert.areEqual(2, leads.size(), 'The duplicate is allowed and saved');
    Integer asked = 0;
    for (Lead lead : leads) {
      asked += lead.Auto_Response_Requested__c ? 1 : 0;
    }
    Assert.areEqual(1, asked, 'Only one auto-response per address per day');
  }

  @isTest
  static void aBlockedSenderIsThankedAndNothingIsSaved() {
    insert new Submission_Block__c(Type__c = 'Email', Value__c = EMAIL);
    User guest = SiteGuestTestSupport.preparedGuest();

    Test.startTest();
    ContactFormController.Result result = submitAsGuest(
      guest,
      EMAIL,
      null,
      HUMAN_MS
    );
    Test.stopTest();

    Assert.isTrue(result.received, 'Same thanks as a real message');
    Assert.areEqual(0, contactLeads().size(), 'Nothing saved');
    Assert.areEqual(
      1,
      [SELECT Hit_Count__c FROM Submission_Block__c LIMIT 1].Hit_Count__c,
      'The block counts the hit'
    );
  }

  @isTest
  static void aFilledHoneypotIsThankedAndNothingIsSaved() {
    User guest = SiteGuestTestSupport.preparedGuest();

    Test.startTest();
    ContactFormController.Result result = submitAsGuest(
      guest,
      EMAIL,
      'https://spam.example',
      HUMAN_MS
    );
    Test.stopTest();

    Assert.isTrue(result.received, 'Same thanks as a real message');
    Assert.areEqual(0, contactLeads().size(), 'Nothing saved');
  }

  @isTest
  static void aTooFastSubmitIsThankedAndNothingIsSaved() {
    User guest = SiteGuestTestSupport.preparedGuest();

    Test.startTest();
    ContactFormController.Result result = submitAsGuest(
      guest,
      EMAIL,
      null,
      500
    );
    Test.stopTest();

    Assert.isTrue(result.received, 'Same thanks as a real message');
    Assert.areEqual(0, contactLeads().size(), 'Nothing saved');
  }

  @isTest
  static void theDailyCapTellsTheVisitor() {
    List<Lead> today = new List<Lead>();
    for (Integer i = 0; i < SubmissionGuard.CONTACT_DAILY_CAP; i++) {
      today.add(
        new Lead(
          LastName = 'Cap ' + i,
          Company = 'Cap',
          LeadSource = SubmissionGuard.LEAD_SOURCE
        )
      );
    }
    insert today;
    User guest = SiteGuestTestSupport.preparedGuest();

    Test.startTest();
    try {
      submitAsGuest(guest, EMAIL, null, HUMAN_MS);
      Assert.fail('Over the cap the visitor is told');
    } catch (AuraHandledException e) {
      Assert.areEqual(
        ContactFormController.RATE_LIMITED_MESSAGE,
        e.getMessage(),
        'Readable cap message'
      );
    }
    Test.stopTest();
    Assert.areEqual(
      SubmissionGuard.CONTACT_DAILY_CAP,
      contactLeads().size(),
      'No Lead added over the cap'
    );
  }

  @isTest
  static void theGuestHasNoLeadAccessOfItsOwn() {
    User guest = SiteGuestTestSupport.preparedGuest();
    Boolean canCreate;
    System.runAs(guest) {
      canCreate = Schema.SObjectType.Lead.isCreateable();
    }
    Assert.isFalse(canCreate, 'The guest gets no Lead permission');
  }

  @isTest
  static void invalidInputIsRefusedWithAReadableMessage() {
    Map<String, List<String>> cases = new Map<String, List<String>>{
      'Enter your first name.' => new List<String>{ ' ', 'L', EMAIL, 'Hi' },
      'Enter your last name.' => new List<String>{ 'F', null, EMAIL, 'Hi' },
      'Enter your email address.' => new List<String>{ 'F', 'L', ' ', 'Hi' },
      'Enter a valid email address, like name@example.com.' => new List<String>{
        'F',
        'L',
        'not-an-email',
        'Hi'
      },
      'Enter a message.' => new List<String>{ 'F', 'L', EMAIL, '' },
      'Your first name can be at most 40 characters.' => new List<String>{
        'x'.repeat(41),
        'L',
        EMAIL,
        'Hi'
      },
      'Your last name can be at most 80 characters.' => new List<String>{
        'F',
        'x'.repeat(81),
        EMAIL,
        'Hi'
      },
      'Your message can be at most 2000 characters.' => new List<String>{
        'F',
        'L',
        EMAIL,
        'x'.repeat(2001)
      }
    };
    for (String expected : cases.keySet()) {
      List<String> input = cases.get(expected);
      try {
        ContactFormController.submitContact(
          input[0],
          input[1],
          input[2],
          null,
          input[3],
          null,
          HUMAN_MS
        );
        Assert.fail('Expected: ' + expected);
      } catch (AuraHandledException e) {
        Assert.areEqual(expected, e.getMessage(), 'Validation message');
      }
    }
  }

  @isTest
  static void aLongCompanyIsRefused() {
    try {
      ContactFormController.submitContact(
        'F',
        'L',
        EMAIL,
        'x'.repeat(256),
        'Hi',
        null,
        HUMAN_MS
      );
      Assert.fail('Company over 255 is refused');
    } catch (AuraHandledException e) {
      Assert.areEqual(
        'Your company can be at most 255 characters.',
        e.getMessage(),
        'Company message'
      );
    }
  }

  @isTest
  static void aFailedHandOffShowsTheSaveMessage() {
    ContactFormController.forceSaveFailure = true;
    try {
      ContactFormController.submitContact(
        'F',
        'L',
        EMAIL,
        'Acme',
        'Hi',
        null,
        HUMAN_MS
      );
      Assert.fail('A failed publish is reported');
    } catch (AuraHandledException e) {
      Assert.areEqual(
        ContactFormController.SAVE_FAILED_MESSAGE,
        e.getMessage(),
        'Save message'
      );
    }
  }

  @isTest
  static void theWriterKeepsACompanyAndSetsTheDmlOptions() {
    Test.startTest();
    EventBus.publish(
      new Contact_Form_Submission__e(
        First_Name__c = 'Grace',
        Last_Name__c = 'Hopper',
        Email__c = 'grace@example.com',
        Company__c = 'Navy',
        Message__c = 'Hi',
        Send_Auto_Response__c = false
      )
    );
    Test.stopTest();

    Lead saved = contactLeads()[0];
    Assert.areEqual('Navy', saved.Company, 'Company kept');
    Assert.isFalse(saved.Auto_Response_Requested__c, 'No auto-response asked');

    Database.DMLOptions options = ContactFormLeadWriter.dmlOptions(true);
    Assert.isTrue(
      options.assignmentRuleHeader.useDefaultRule,
      'Default assignment rule'
    );
    Assert.isTrue(
      options.emailHeader.triggerAutoResponseEmail,
      'Auto-response asked'
    );
    Assert.isTrue(options.duplicateRuleHeader.allowSave, 'Duplicates allowed');
    Assert.isTrue(
      options.emailHeader.triggerUserEmail,
      'The new owner is emailed'
    );
  }

  @isTest
  static void theWriterIgnoresAnEmptyBatch() {
    ContactFormLeadWriter.insertLeads(new List<Contact_Form_Submission__e>());
    ContactFormLeadWriter.insertLeads(null);
    Assert.areEqual(0, contactLeads().size(), 'Nothing saved');
  }

  @isTest
  static void aFailedInsertIsRetriedThenKeptAsAFailureRow() {
    ContactFormLeadWriter.forceFailure = true;
    EventBus.publish(
      new Contact_Form_Submission__e(
        First_Name__c = 'Grace',
        Last_Name__c = 'Hopper',
        Email__c = 'grace@example.com',
        Company__c = 'Navy',
        Message__c = 'Hi'
      )
    );
    Integer deliveries = 0;
    for (Integer i = 0; i <= ContactFormLeadWriter.MAX_RETRIES; i++) {
      Test.getEventBus().deliver();
      deliveries++;
    }

    Assert.areEqual(
      ContactFormLeadWriter.MAX_RETRIES + 1,
      deliveries,
      'Delivered once and retried three times'
    );
    Assert.areEqual(0, contactLeads().size(), 'No Lead');
    Contact_Form_Failure__c kept = [
      SELECT
        First_Name__c,
        Last_Name__c,
        Email__c,
        Company__c,
        Message__c,
        Error__c
      FROM Contact_Form_Failure__c
    ];
    Assert.areEqual('grace@example.com', kept.Email__c, 'The message is kept');
    Assert.areEqual('Hi', kept.Message__c, 'Message kept');
    Assert.areEqual('Navy', kept.Company__c, 'Company kept');
    Assert.isTrue(kept.Error__c.contains('Forced'), 'The reason is kept');
  }
}

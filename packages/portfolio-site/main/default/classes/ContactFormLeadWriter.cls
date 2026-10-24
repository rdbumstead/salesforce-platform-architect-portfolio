/**
 * @description       : Saves portfolio contact form messages as Leads (ADR-031).
 *                      Called by ContactFormSubmissionTrigger, which runs as the Automated Process
 *                      user, so the Lead auto-response rule can send. Each Lead is inserted in
 *                      system mode with Database.DMLOptions: the default assignment rule, the
 *                      auto-response only when the event asks for it, and duplicates allowed so
 *                      a returning visitor is never refused. The reply reminder times are set on
 *                      the way in. A batch that still fails after three retries is kept as
 *                      Contact_Form_Failure__c rows and the Portfolio_Admin users get a custom
 *                      notification, so no message is lost and the visitor never sees an error.
 *                      Once the Leads are saved, each Lead's owner gets one email with the
 *                      visitor's name, company, email, full message and a link to the Lead, from
 *                      the Portfolio_Contact_New_Lead template. The assignment rule's own
 *                      notification is not sent from this context, so this is the only email.
 *                      It goes to a user Id, never to an address: the Lead's owner when that is
 *                      an active internal user, otherwise the Portfolio_Admin users.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 * @Test Class        : [ContactFormControllerTest, ContactFormLeadWriterTest]
 **/
public with sharing class ContactFormLeadWriter {
  @TestVisible
  private static final String NO_COMPANY = 'Not given';
  @TestVisible
  private static final Integer MAX_RETRIES = 3;
  @TestVisible
  private static Boolean forceFailure = false;
  @TestVisible
  private static Boolean forceEmailFailure = false;
  @TestVisible
  private static final String NEW_LEAD_TEMPLATE = 'Portfolio_Contact_New_Lead';
  @TestVisible
  private static List<Messaging.SingleEmailMessage> lastOwnerEmails = new List<Messaging.SingleEmailMessage>();
  private static final String NOTIFICATION_TYPE = 'Portfolio_Contact_Reminder';
  private static final String ADMIN_PERMISSION_SET = 'Portfolio_Admin';
  private static final String STANDARD_USER_TYPE = 'Standard';

  /**
   * @description Inserts one Lead per event. The whole batch is saved or none of it, so a
   *              retry never makes a duplicate. A failed batch is retried by the event bus up
   *              to three times, then kept as Contact_Form_Failure__c rows.
   * @param submissions The delivered events.
   * @throws EventBus.RetryableException When the insert fails and retries are left.
   */
  public static void insertLeads(List<Contact_Form_Submission__e> submissions) {
    if (submissions == null || submissions.isEmpty()) {
      return;
    }
    List<Lead> withReply = new List<Lead>();
    List<Lead> withoutReply = new List<Lead>();
    for (Contact_Form_Submission__e submission : submissions) {
      Lead lead = new Lead(
        FirstName = submission.First_Name__c,
        LastName = submission.Last_Name__c,
        Email = submission.Email__c,
        Company = String.isBlank(submission.Company__c)
          ? NO_COMPANY
          : submission.Company__c,
        Description = submission.Message__c,
        LeadSource = SubmissionGuard.LEAD_SOURCE,
        Auto_Response_Requested__c = submission.Send_Auto_Response__c == true
      );
      (lead.Auto_Response_Requested__c ? withReply : withoutReply).add(lead);
    }
    Datetime arrivedAt = Datetime.now();
    LeadReminderService.stampReminders(withReply, arrivedAt);
    LeadReminderService.stampReminders(withoutReply, arrivedAt);

    // The options go on the insert call itself. Options set on each record with setOptions
    // were ignored by this insert overload, and the duplicate rule refused a repeat visitor.
    Savepoint beforeInsert = Database.setSavepoint();
    try {
      if (forceFailure) {
        throw new DmlException('Forced insert failure for tests.');
      }
      if (!withReply.isEmpty()) {
        Database.insert(withReply, dmlOptions(true), AccessLevel.SYSTEM_MODE);
      }
      if (!withoutReply.isEmpty()) {
        Database.insert(
          withoutReply,
          dmlOptions(false),
          AccessLevel.SYSTEM_MODE
        );
      }
    } catch (DmlException e) {
      Database.rollback(beforeInsert);
      if (retries() < MAX_RETRIES) {
        throw new EventBus.RetryableException(e.getMessage());
      }
      keepFailures(submissions, e.getMessage());
      return;
    }
    List<Lead> saved = new List<Lead>(withReply);
    saved.addAll(withoutReply);
    emailOwners(saved);
  }

  /**
   * @description Sends each saved Lead's owner one email built from the
   *              Portfolio_Contact_New_Lead template. Sent to user Ids with
   *              setTargetObjectId, which the Apex limits page says does not count toward the
   *              daily single email limit. A failure here is ignored: the Lead is saved and the
   *              in app arrival notice still goes, so there is nothing to undo or retry.
   * @param leads The Leads just inserted.
   */
  @TestVisible
  private static void emailOwners(List<Lead> leads) {
    lastOwnerEmails = new List<Messaging.SingleEmailMessage>();
    try {
      if (forceEmailFailure) {
        throw new EmailException('Forced email failure for tests.');
      }
      List<EmailTemplate> templates = [
        SELECT Id
        FROM EmailTemplate
        WHERE DeveloperName = :NEW_LEAD_TEMPLATE
        WITH SYSTEM_MODE
        LIMIT 1
      ];
      if (templates.isEmpty() || leads.isEmpty()) {
        return;
      }
      Map<Id, Set<Id>> recipientsByLead = recipientsByLead(leads);
      for (Id leadId : recipientsByLead.keySet()) {
        Messaging.SingleEmailMessage rendered = Messaging.renderStoredEmailTemplate(
          templates[0].Id,
          leadId,
          null
        );
        for (Id userId : recipientsByLead.get(leadId)) {
          Messaging.SingleEmailMessage message = new Messaging.SingleEmailMessage();
          message.setTargetObjectId(userId);
          message.setSaveAsActivity(false);
          message.setSubject(rendered.getSubject());
          message.setPlainTextBody(rendered.getPlainTextBody());
          lastOwnerEmails.add(message);
        }
      }
      if (!lastOwnerEmails.isEmpty()) {
        Messaging.sendEmail(lastOwnerEmails, false);
      }
    } catch (Exception e) {
      // The Lead is saved and the in app arrival notice still reaches the owner.
      lastOwnerEmails = new List<Messaging.SingleEmailMessage>();
    }
  }

  // The owner set by the assignment rule when it is an active internal user. Otherwise, for
  // example while the rule leaves the Lead with the Automated Process user, the
  // Portfolio_Admin users.
  private static Map<Id, Set<Id>> recipientsByLead(List<Lead> leads) {
    Map<Id, Lead> owners = new Map<Id, Lead>(
      [
        SELECT Id, OwnerId
        FROM Lead
        WHERE Id IN :new Map<Id, Lead>(leads).keySet()
        WITH SYSTEM_MODE
      ]
    );
    Set<Id> ownerIds = new Set<Id>();
    for (Lead lead : owners.values()) {
      ownerIds.add(lead.OwnerId);
    }
    Set<Id> activeOwners = new Map<Id, User>(
        [
          SELECT Id
          FROM User
          WHERE
            Id IN :ownerIds
            AND IsActive = TRUE
            AND UserType = :STANDARD_USER_TYPE
          WITH SYSTEM_MODE
        ]
      )
      .keySet();
    Map<Id, Set<Id>> recipients = new Map<Id, Set<Id>>();
    Set<Id> admins;
    for (Lead lead : owners.values()) {
      if (activeOwners.contains(lead.OwnerId)) {
        recipients.put(lead.Id, new Set<Id>{ lead.OwnerId });
        continue;
      }
      if (admins == null) {
        admins = adminRecipients();
      }
      if (!admins.isEmpty()) {
        recipients.put(lead.Id, admins);
      }
    }
    return recipients;
  }

  private static void keepFailures(
    List<Contact_Form_Submission__e> submissions,
    String error
  ) {
    List<Contact_Form_Failure__c> failures = new List<Contact_Form_Failure__c>();
    for (Contact_Form_Submission__e submission : submissions) {
      failures.add(
        new Contact_Form_Failure__c(
          First_Name__c = submission.First_Name__c,
          Last_Name__c = submission.Last_Name__c,
          Email__c = submission.Email__c,
          Company__c = submission.Company__c,
          Message__c = submission.Message__c,
          Error__c = String.isBlank(error) ? null : error.left(255)
        )
      );
    }
    Database.insert(failures, true, AccessLevel.SYSTEM_MODE);
    notifyAdmins(failures);
  }

  private static void notifyAdmins(List<Contact_Form_Failure__c> failures) {
    List<CustomNotificationType> types = [
      SELECT Id
      FROM CustomNotificationType
      WHERE DeveloperName = :NOTIFICATION_TYPE
      WITH SYSTEM_MODE
      LIMIT 1
    ];
    Set<String> recipients = new Set<String>();
    for (Id adminId : adminRecipients()) {
      recipients.add(adminId);
    }
    if (types.isEmpty() || recipients.isEmpty()) {
      return;
    }
    Messaging.CustomNotification notification = new Messaging.CustomNotification();
    notification.setNotificationTypeId(types[0].Id);
    notification.setTitle('A contact form message could not be saved');
    notification.setBody(
      failures.size() +
      ' message(s) are kept in Contact Form Failures. Reply by hand.'
    );
    notification.setTargetId(failures[0].Id);
    notification.send(recipients);
  }

  private static Set<Id> adminRecipients() {
    Set<Id> admins = new Set<Id>();
    for (PermissionSetAssignment assignment : [
      SELECT AssigneeId
      FROM PermissionSetAssignment
      WHERE
        PermissionSet.Name = :ADMIN_PERMISSION_SET
        AND Assignee.IsActive = TRUE
      WITH SYSTEM_MODE
      LIMIT 50
    ]) {
      admins.add(assignment.AssigneeId);
    }
    return admins;
  }

  @TestVisible
  private static Database.DMLOptions dmlOptions(Boolean sendAutoResponse) {
    Database.DMLOptions options = new Database.DMLOptions();
    options.optAllOrNone = true;
    options.assignmentRuleHeader.useDefaultRule = true;
    options.emailHeader.triggerAutoResponseEmail = sendAutoResponse;
    // Asks for the assignment rule's notification as Web-to-Lead would. In this context the
    // org's email log shows none is sent even with a template on the rule entry, so
    // emailOwners sends the one email the owner gets.
    options.emailHeader.triggerUserEmail = true;
    options.duplicateRuleHeader.allowSave = true;
    return options;
  }

  private static Integer retries() {
    return EventBus.TriggerContext.currentContext()?.retries ?? 0;
  }
}

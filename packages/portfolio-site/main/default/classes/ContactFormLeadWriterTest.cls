/**
 * @description       : Tests for the owner email in ContactFormLeadWriter. Each test makes its
 *                      own users and grants, so nothing depends on what the org has assigned.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/24/2026
 **/
@isTest
private class ContactFormLeadWriterTest {
  private static final String MESSAGE = 'Line one of the message.\nLine two.';

  private static User newUser(String alias, String profileName) {
    User user = new User(
      Alias = alias,
      Email = alias + '@example.com',
      EmailEncodingKey = 'UTF-8',
      FirstName = 'Test',
      LastName = alias,
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = [SELECT Id FROM Profile WHERE Name = :profileName LIMIT 1]
      .Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      Username = alias + '.' + Crypto.getRandomInteger() + '@example.com.r10a'
    );
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert user;
    }
    return user;
  }

  private static void grantPortfolioAdmin(Id userId) {
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert new PermissionSetAssignment(
        AssigneeId = userId,
        PermissionSetId = [
          SELECT Id
          FROM PermissionSet
          WHERE Name = 'Portfolio_Admin'
          LIMIT 1
        ]
        .Id
      );
    }
  }

  private static Lead newLead(Id ownerId) {
    Lead lead = new Lead(
      FirstName = 'Ada',
      LastName = 'Lovelace',
      Company = 'Analytical Engines',
      Email = 'ada@example.com',
      Description = MESSAGE,
      LeadSource = SubmissionGuard.LEAD_SOURCE,
      OwnerId = ownerId
    );
    insert lead;
    return lead;
  }

  private static Set<Id> targetsOf(List<Messaging.SingleEmailMessage> emails) {
    Set<Id> targets = new Set<Id>();
    for (Messaging.SingleEmailMessage email : emails) {
      targets.add(email.getTargetObjectId());
    }
    return targets;
  }

  private static Set<Id> portfolioAdmins() {
    Set<Id> admins = new Set<Id>();
    for (PermissionSetAssignment assignment : [
      SELECT AssigneeId
      FROM PermissionSetAssignment
      WHERE PermissionSet.Name = 'Portfolio_Admin' AND Assignee.IsActive = TRUE
    ]) {
      admins.add(assignment.AssigneeId);
    }
    return admins;
  }

  @isTest
  static void theOwnerGetsOneEmailWithTheWholeMessage() {
    User owner = newUser('owner10a', 'Standard User');
    Lead lead = newLead(owner.Id);

    Test.startTest();
    ContactFormLeadWriter.emailOwners(new List<Lead>{ lead });
    Integer sends = Limits.getEmailInvocations();
    Test.stopTest();

    List<Messaging.SingleEmailMessage> emails = ContactFormLeadWriter.lastOwnerEmails;
    Assert.areEqual(1, emails.size(), 'One email');
    Assert.areEqual(1, sends, 'One send call');
    Assert.areEqual(
      1,
      ContactFormLeadWriter.lastSendResults.size(),
      'One result'
    );
    Assert.isTrue(
      ContactFormLeadWriter.lastSendResults[0].isSuccess(),
      'Accepted for sending'
    );
    Messaging.SingleEmailMessage email = emails[0];
    Assert.areEqual(owner.Id, email.getTargetObjectId(), 'To the owner');
    Assert.isNull(email.getToAddresses(), 'No address, only the user Id');
    Assert.isFalse(email.getSaveAsActivity(), 'Not saved as an activity');
    Assert.isTrue(
      email.getSubject().contains('Ada Lovelace'),
      'The subject names the visitor'
    );
    String body = email.getPlainTextBody();
    Assert.isTrue(body.contains('Ada Lovelace'), 'Name');
    Assert.isTrue(body.contains('Analytical Engines'), 'Company');
    Assert.isTrue(body.contains('ada@example.com'), 'Email');
    Assert.isTrue(body.contains('Line one of the message.'), 'Message');
    Assert.isTrue(body.contains('Line two.'), 'The whole message');
    Assert.isTrue(
      body.contains(String.valueOf(lead.Id).left(15)),
      'A link to the Lead'
    );
  }

  @isTest
  static void aLeadWithNoUserOwnerGoesToThePortfolioAdmins() {
    User admin = newUser('admin10a', 'Standard User');
    grantPortfolioAdmin(admin.Id);
    Group queue = new Group(Name = 'Proof Lead Queue', Type = 'Queue');
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert queue;
      insert new QueueSobject(QueueId = queue.Id, SobjectType = 'Lead');
    }
    Lead lead = newLead(queue.Id);

    Test.startTest();
    ContactFormLeadWriter.emailOwners(new List<Lead>{ lead });
    Test.stopTest();

    Set<Id> targets = targetsOf(ContactFormLeadWriter.lastOwnerEmails);
    Assert.isTrue(targets.contains(admin.Id), 'The Portfolio_Admin user');
    Assert.isFalse(targets.contains(queue.Id), 'Never the queue');
    Assert.areEqual(
      portfolioAdmins(),
      targets,
      'Exactly the Portfolio_Admin users, one email each'
    );
  }

  @isTest
  static void aFailedEmailKeepsTheLeadAndThrowsNothing() {
    User owner = newUser('fail10a', 'Standard User');
    Lead lead = newLead(owner.Id);
    ContactFormLeadWriter.forceEmailFailure = true;

    Test.startTest();
    ContactFormLeadWriter.emailOwners(new List<Lead>{ lead });
    Test.stopTest();

    Assert.areEqual(
      0,
      ContactFormLeadWriter.lastOwnerEmails.size(),
      'Nothing sent'
    );
    Assert.areEqual(1, [SELECT COUNT() FROM Lead], 'The Lead stays');
  }

  @isTest
  static void aSavedMessageEmailsItsOwnerOnce() {
    // So someone is told even when the org's rule leaves the Lead without a user owner.
    grantPortfolioAdmin(newUser('event10a', 'Standard User').Id);
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

    Lead saved = [SELECT Id, OwnerId FROM Lead];
    Set<Id> targets = targetsOf(ContactFormLeadWriter.lastOwnerEmails);
    Assert.isFalse(targets.isEmpty(), 'Someone is told');
    Assert.areEqual(
      ContactFormLeadWriter.lastOwnerEmails.size(),
      targets.size(),
      'One email per recipient'
    );
    User owner = [
      SELECT IsActive, UserType
      FROM User
      WHERE Id = :saved.OwnerId
    ];
    Set<Id> expected = owner.IsActive && owner.UserType == 'Standard'
      ? new Set<Id>{ saved.OwnerId }
      : portfolioAdmins();
    Assert.areEqual(expected, targets, 'The owner, or the admins when none');
  }
}

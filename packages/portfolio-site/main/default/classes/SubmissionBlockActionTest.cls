/**
 * @description       : Tests for SubmissionBlockAction, the work behind the Block sender quick
 *                      action on Lead. The action saves in user mode,
 *                      so every test runs as a user it makes itself, with Portfolio_Admin assigned
 *                      inside the test. Nothing depends on what the org has assigned.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
@isTest
private class SubmissionBlockActionTest {
  private static User blocker() {
    Profile admin = [
      SELECT Id
      FROM Profile
      WHERE Name = 'System Administrator'
      LIMIT 1
    ];
    User user = new User(
      Alias = 'blocker',
      Email = 'blocker@example.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'Blocker',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = admin.Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      Username = 'blocker.' + Crypto.getRandomInteger() + '@example.com.r7b'
    );
    // Setup records in their own runAs block avoid mixed DML with the test's own inserts.
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert user;
      insert new PermissionSetAssignment(
        AssigneeId = user.Id,
        PermissionSetId = [
          SELECT Id
          FROM PermissionSet
          WHERE Name = 'Portfolio_Admin'
          LIMIT 1
        ]
        .Id
      );
    }
    return user;
  }

  private static Lead lead(String email) {
    Lead record = new Lead(
      LastName = 'Spammer',
      Company = 'Spam',
      Email = email
    );
    insert record;
    return record;
  }

  private static SubmissionBlockAction.Request request(
    Id leadId,
    String type,
    String reason
  ) {
    SubmissionBlockAction.Request req = new SubmissionBlockAction.Request();
    req.leadId = leadId;
    req.blockType = type;
    req.reason = reason;
    return req;
  }

  @isTest
  static void blocksTheEmailAndMarksTheLeadAsSpam() {
    System.runAs(blocker()) {
      Lead spam = lead('Bot@Spam.Example');

      Test.startTest();
      List<SubmissionBlockAction.Response> responses = SubmissionBlockAction.blockSenders(
        new List<SubmissionBlockAction.Request>{
          request(spam.Id, 'Email', null)
        }
      );
      Test.stopTest();

      Assert.isTrue(responses[0].isSuccess, 'Blocked');
      Assert.areEqual(
        'bot@spam.example',
        responses[0].blockedValue,
        'Lower case'
      );
      Submission_Block__c block = [
        SELECT Type__c, Value__c, Active__c, Reason__c, Unique_Key__c
        FROM Submission_Block__c
      ];
      Assert.areEqual('Email', block.Type__c, 'Email block');
      Assert.areEqual('Email:bot@spam.example', block.Unique_Key__c, 'Key');
      Assert.areEqual('Blocked from a Lead', block.Reason__c, 'Default reason');
      Assert.isTrue(
        [SELECT Spam__c FROM Lead WHERE Id = :spam.Id].Spam__c,
        'Lead marked'
      );
    }
  }

  @isTest
  static void blocksTheDomainAndTurnsAnOldBlockBackOn() {
    System.runAs(blocker()) {
      Lead spam = lead('bot@spam.example');
      insert new Submission_Block__c(
        Type__c = 'Domain',
        Value__c = 'spam.example',
        Active__c = false
      );

      SubmissionBlockAction.blockSenders(
        new List<SubmissionBlockAction.Request>{
          request(spam.Id, 'Domain', 'Spam from the contact form')
        }
      );

      List<Submission_Block__c> blocks = [
        SELECT Active__c, Reason__c
        FROM Submission_Block__c
      ];
      Assert.areEqual(1, blocks.size(), 'The same block, not a second one');
      Assert.isTrue(blocks[0].Active__c, 'Turned back on');
      Assert.areEqual(
        'Spam from the contact form',
        blocks[0].Reason__c,
        'Reason kept'
      );
    }
  }

  @isTest
  static void reportsALeadWithNoEmail() {
    System.runAs(blocker()) {
      Lead noEmail = lead(null);

      List<SubmissionBlockAction.Response> responses = SubmissionBlockAction.blockSenders(
        new List<SubmissionBlockAction.Request>{
          request(noEmail.Id, 'Email', null)
        }
      );

      Assert.isFalse(responses[0].isSuccess, 'Nothing to block');
      Assert.areEqual('NothingToBlock', responses[0].errorType, 'Error type');
      Assert.areEqual(0, [SELECT COUNT() FROM Submission_Block__c], 'No block');
    }
  }

  @isTest
  static void reportsAnUnknownBlockType() {
    System.runAs(blocker()) {
      Lead spam = lead('bot@spam.example');

      List<SubmissionBlockAction.Response> responses = SubmissionBlockAction.blockSenders(
        new List<SubmissionBlockAction.Request>{
          request(spam.Id, 'Keyword', null)
        }
      );

      Assert.isFalse(
        responses[0].isSuccess,
        'Only Email or Domain from a Lead'
      );
    }
  }

  @isTest
  static void rollsBackWhenTheLeadCannotBeMarked() {
    System.runAs(blocker()) {
      Lead spam = lead('bot@spam.example');
      Database.LeadConvert convert = new Database.LeadConvert();
      convert.setLeadId(spam.Id);
      convert.setConvertedStatus(
        [SELECT ApiName FROM LeadStatus WHERE IsConverted = TRUE LIMIT 1]
        .ApiName
      );
      Database.convertLead(convert);

      List<SubmissionBlockAction.Response> responses = SubmissionBlockAction.blockSenders(
        new List<SubmissionBlockAction.Request>{
          request(spam.Id, 'Email', null)
        }
      );

      Assert.isFalse(
        responses[0].isSuccess,
        'A converted Lead cannot be marked'
      );
      Assert.isNotNull(responses[0].errorMessage, 'The reason is returned');
      Assert.areEqual(
        0,
        [SELECT COUNT() FROM Submission_Block__c],
        'The block is rolled back'
      );
    }
  }

  @isTest
  static void ignoresAnEmptyRequestList() {
    System.runAs(blocker()) {
      Assert.areEqual(
        0,
        SubmissionBlockAction.blockSenders(
            new List<SubmissionBlockAction.Request>()
          )
          .size(),
        'Nothing in, nothing out'
      );
      Assert.areEqual(
        0,
        SubmissionBlockAction.blockSenders(null).size(),
        'Null in'
      );
    }
  }
}

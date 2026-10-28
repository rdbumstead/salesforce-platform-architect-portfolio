/**
 * @description       : Tests for LeadReminderService. Business Hours cannot be inserted in a
 *                      test, so the expected times are worked out from the org's own default
 *                      Business Hours with the platform method the service uses.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/23/2026
 **/
@isTest
private class LeadReminderServiceTest {
  private static final Datetime FRIDAY_AFTERNOON = Datetime.newInstanceGmt(
    2026,
    10,
    23,
    21,
    30,
    0
  );

  private static Id defaultHours() {
    return [SELECT Id FROM BusinessHours WHERE IsDefault = TRUE LIMIT 1].Id;
  }

  @isTest
  static void oneBusinessDayIsTheNextOpenTimeADayLater() {
    Id hours = defaultHours();
    Datetime expected = BusinessHours.nextStartDate(
      hours,
      FRIDAY_AFTERNOON.addDays(1)
    );

    Test.startTest();
    Datetime due = LeadReminderService.addBusinessDays(FRIDAY_AFTERNOON, 1);
    Test.stopTest();

    Assert.areEqual(
      expected,
      due,
      'One step of one calendar day, then the next open time'
    );
    Assert.isTrue(due > FRIDAY_AFTERNOON, 'Due after the message arrived');
  }

  @isTest
  static void twoBusinessDaysStepTwice() {
    Id hours = defaultHours();
    Datetime first = BusinessHours.nextStartDate(
      hours,
      FRIDAY_AFTERNOON.addDays(1)
    );
    Datetime expected = BusinessHours.nextStartDate(hours, first.addDays(1));

    Assert.areEqual(
      expected,
      LeadReminderService.addBusinessDays(FRIDAY_AFTERNOON, 2),
      'Two steps'
    );
  }

  @isTest
  static void zeroOrNullDaysReturnTheStart() {
    Assert.areEqual(
      FRIDAY_AFTERNOON,
      LeadReminderService.addBusinessDays(FRIDAY_AFTERNOON, 0),
      'Zero days'
    );
    Assert.areEqual(
      FRIDAY_AFTERNOON,
      LeadReminderService.addBusinessDays(FRIDAY_AFTERNOON, null),
      'Null days'
    );
    Assert.isNull(LeadReminderService.addBusinessDays(null, 1), 'Null start');
  }

  @isTest
  static void stampSetsBothRemindersOnEveryLead() {
    List<Lead> leads = new List<Lead>{
      new Lead(LastName = 'One', Company = 'C'),
      new Lead(LastName = 'Two', Company = 'C')
    };

    LeadReminderService.stampReminders(leads, FRIDAY_AFTERNOON);

    Datetime first = LeadReminderService.addBusinessDays(FRIDAY_AFTERNOON, 1);
    for (Lead lead : leads) {
      Assert.areEqual(first, lead.Reply_Reminder_1_At__c, 'Reminder 1');
      Assert.areEqual(
        LeadReminderService.addBusinessDays(first, 1),
        lead.Reply_Reminder_2_At__c,
        'Reminder 2 is one business day after reminder 1'
      );
    }
  }

  @isTest
  static void stampIgnoresEmptyInput() {
    List<Lead> none = new List<Lead>();
    LeadReminderService.stampReminders(none, FRIDAY_AFTERNOON);
    LeadReminderService.stampReminders(null, FRIDAY_AFTERNOON);
    Lead lead = new Lead(LastName = 'X', Company = 'C');
    LeadReminderService.stampReminders(new List<Lead>{ lead }, null);
    Assert.isNull(lead.Reply_Reminder_1_At__c, 'No time, no reminder');
  }

  @isTest
  static void usesTheOverrideWhenSet() {
    Id hours = defaultHours();
    LeadReminderService.businessHoursOverride = hours;
    Assert.areEqual(
      BusinessHours.nextStartDate(hours, FRIDAY_AFTERNOON.addDays(1)),
      LeadReminderService.addBusinessDays(FRIDAY_AFTERNOON, 1),
      'The override is used'
    );
  }
}

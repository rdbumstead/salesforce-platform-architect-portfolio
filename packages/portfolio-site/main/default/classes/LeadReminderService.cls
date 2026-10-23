/**
 * @description       : Works out when the reply reminders for a portfolio contact form Lead are
 *                      due (content drafts section 2, ADR-031). A record triggered flow's
 *                      scheduled path offsets only in calendar minutes, hours, days or months, so
 *                      the business day count is done here with the org's default Business
 *                      Hours and stored on the Lead. The Lead_Contact_Form_Reminders flow then
 *                      runs its scheduled paths from those two fields.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 * @Test Class        : [LeadReminderServiceTest]
 **/
public with sharing class LeadReminderService {
  @TestVisible
  private static Id businessHoursOverride;
  private static Id defaultBusinessHoursId;

  /**
   * @description Sets Reply_Reminder_1_At__c and Reply_Reminder_2_At__c on each Lead to one
   *              and two business days after the given time. Changes the records in memory
   *              only, so the caller saves them in its own insert.
   * @param leads The Leads to stamp.
   * @param arrivedAt When the message arrived.
   */
  public static void stampReminders(List<Lead> leads, Datetime arrivedAt) {
    if (leads == null || leads.isEmpty() || arrivedAt == null) {
      return;
    }
    Datetime first = addBusinessDays(arrivedAt, 1);
    Datetime second = addBusinessDays(first, 1);
    for (Lead lead : leads) {
      lead.Reply_Reminder_1_At__c = first;
      lead.Reply_Reminder_2_At__c = second;
    }
  }

  /**
   * @description Moves forward one calendar day at a time, and after each step to the next
   *              moment the business hours are open. A message on Friday afternoon under
   *              Monday to Friday hours is due on Monday morning. Under 24 hour, 7 day hours
   *              (the platform default) every day counts, weekends included.
   * @param start The starting time.
   * @param days How many business days to add. Zero or less returns start.
   * @return Datetime The due time.
   */
  public static Datetime addBusinessDays(Datetime start, Integer days) {
    if (start == null) {
      return null;
    }
    Id hoursId = businessHoursId();
    Datetime cursor = start;
    for (Integer i = 0; i < (days == null ? 0 : days); i++) {
      cursor = BusinessHours.nextStartDate(hoursId, cursor.addDays(1));
    }
    return cursor;
  }

  private static Id businessHoursId() {
    if (businessHoursOverride != null) {
      return businessHoursOverride;
    }
    if (defaultBusinessHoursId == null) {
      defaultBusinessHoursId = [
        SELECT Id
        FROM BusinessHours
        WHERE IsDefault = TRUE
        WITH SYSTEM_MODE
        LIMIT 1
      ]
      .Id;
    }
    return defaultBusinessHoursId;
  }
}

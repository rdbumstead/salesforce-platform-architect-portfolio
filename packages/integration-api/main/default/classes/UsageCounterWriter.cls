/**
 * @description       : Counts the site's two guest actions, cover letters written and API Lab
 *                      requests sent, in Usage_Counter__c. There is one row per UTC day and
 *                      kind, keyed "kind:yyyy-mm-dd". record() reads the day's row with FOR
 *                      UPDATE, adds one and writes it, or inserts the row when the day has
 *                      none, so two visitors at once never lose a count.
 *
 *                      Counting must never cost the visitor anything. record() catches every
 *                      error, writes one log line with the kind and the error type, and
 *                      returns false. It skips the write when the transaction is short of
 *                      queries, DML statements or CPU time, because a governor limit cannot be
 *                      caught. Callers call it last, after the callout and after the visitor's
 *                      result is in hand, so no DML comes before a callout and the row lock is
 *                      held for the shortest time.
 *
 *                      The row holds a kind, a day and a count. No request content, name,
 *                      address or session value is stored. Runs without sharing on purpose:
 *                      the rows are counter state shared by every visitor, and the site guest
 *                      has no grant on the object, so a read that honoured sharing would hide
 *                      the day's row from the next visitor and split the count.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 * @Test Class        : [UsageCounterWriterTest]
 **/
public without sharing class UsageCounterWriter {
  public static final String KIND_COVER_LETTER = 'Cover_Letter';
  public static final String KIND_API_LAB_REQUEST = 'Api_Lab_Request';

  private static final Set<String> KINDS = new Set<String>{
    KIND_COVER_LETTER,
    KIND_API_LAB_REQUEST
  };
  private static final String DAY_FORMAT = 'yyyy-MM-dd';
  private static final Integer ATTEMPTS = 2;
  private static final Integer MIN_STATEMENTS_LEFT = 3;
  private static final Decimal CPU_SHARE_LIMIT = 0.9;

  // Tests set these to reach the paths a normal run cannot.
  @TestVisible
  private static Datetime nowOverride;
  @TestVisible
  private static Boolean failForTest = false;
  @TestVisible
  private static Boolean noHeadroomForTest = false;
  // Inserted just before the writer's own insert on the first attempt, as a rival request would.
  @TestVisible
  private static Usage_Counter__c rivalRow;

  /**
   * @description Adds one to today's row for the kind. Never throws.
   * @param kind KIND_COVER_LETTER or KIND_API_LAB_REQUEST.
   * @return Boolean True when the count was written, false when it was skipped or failed.
   * @example
   * UsageCounterWriter.record(UsageCounterWriter.KIND_COVER_LETTER);
   */
  public static Boolean record(String kind) {
    try {
      if (kind == null || !KINDS.contains(kind)) {
        PortfolioLog.info('UsageCounterWriter skipped: unknown kind');
        return false;
      }
      if (!hasHeadroom()) {
        PortfolioLog.info(
          'UsageCounterWriter skipped: ' + kind + ' no headroom'
        );
        return false;
      }
      if (failForTest) {
        throw new DmlException('Forced by a test');
      }
      addOne(kind, dayOf(currentTime()));
      return true;
    } catch (Exception e) {
      PortfolioLog.info(
        'UsageCounterWriter write failed: ' + kind + ' ' + e.getTypeName()
      );
      return false;
    }
  }

  /**
   * @description The row key for a kind on a UTC day.
   * @param kind The kind.
   * @param day The UTC day.
   * @return String For example Cover_Letter:2026-10-26.
   */
  @TestVisible
  private static String keyOf(String kind, Date day) {
    return kind +
      ':' +
      Datetime.newInstanceGmt(day, Time.newInstance(0, 0, 0, 0))
        .formatGmt(DAY_FORMAT);
  }

  private static void addOne(String kind, Date day) {
    String key = keyOf(kind, day);
    for (Integer attempt = 0; attempt < ATTEMPTS; attempt++) {
      List<Usage_Counter__c> rows = [
        SELECT Id, Count__c
        FROM Usage_Counter__c
        WHERE Key__c = :key
        WITH SYSTEM_MODE
        LIMIT 1
        FOR UPDATE
      ];
      if (!rows.isEmpty()) {
        rows[0].Count__c = (rows[0].Count__c ?? 0) + 1;
        Database.update(rows, true, AccessLevel.SYSTEM_MODE);
        return;
      }
      if (attempt == 0 && rivalRow != null) {
        insert rivalRow;
      }
      Database.SaveResult result = Database.insert(
        new Usage_Counter__c(
          Kind__c = kind,
          Day__c = day,
          Key__c = key,
          Count__c = 1
        ),
        false,
        AccessLevel.SYSTEM_MODE
      );
      if (result.isSuccess()) {
        return;
      }
      // A request at the same moment inserted the day's row first. Read it and add to it.
    }
    throw new UsageCounterException('The day\'s row could not be written.');
  }

  private static Boolean hasHeadroom() {
    if (noHeadroomForTest) {
      return false;
    }
    return Limits.getLimitQueries() - Limits.getQueries() >=
      MIN_STATEMENTS_LEFT &&
      Limits.getLimitDmlStatements() - Limits.getDmlStatements() >=
      MIN_STATEMENTS_LEFT &&
      Limits.getCpuTime() < Limits.getLimitCpuTime() * CPU_SHARE_LIMIT;
  }

  private static Datetime currentTime() {
    return nowOverride != null ? nowOverride : Datetime.now();
  }

  private static Date dayOf(Datetime moment) {
    return Date.newInstance(
      moment.yearGmt(),
      moment.monthGmt(),
      moment.dayGmt()
    );
  }

  /**
   * @description Raised inside record() when the day's row could not be written, and caught
   *              there.
   */
  public class UsageCounterException extends Exception {
  }
}

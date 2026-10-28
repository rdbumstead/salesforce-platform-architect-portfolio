/**
 * @description       : Holds Agentforce to the Hourly_Budget__c of its AI_Provider_Config__mdt
 *                      record per clock hour (UTC), so the org stays under the Developer
 *                      Edition's 150 generations an hour. The count lives in API_Rate_Window__c,
 *                      one row per hour keyed "agentforce-hour|yyyyMMddHH", which the rate window
 *                      cleanup job deletes with the rest. tryReserve() only reads and keeps the
 *                      call pending in memory. commitPending() writes it, and the dispatch calls
 *                      it after the last provider call, so no DML comes before a callout. The
 *                      read takes no lock, so letters running at the same moment can each pass
 *                      at the edge: the budget can be passed by the few calls in flight at
 *                      once, and the gap between 120 and 150 leaves room for that. A failed
 *                      write is logged and never reaches the visitor. Runs without sharing on
 *                      purpose: the rows are counter state shared by every caller, and the
 *                      integration user has no object grant on them.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 * @Test Class        : [AgentforceServiceBudgetTest]
 **/
public without sharing class AgentforceServiceBudget {
  /** Key__c prefix of the hourly rows. Not a papi-ai key, so the footer never counts it. */
  public static final String KEY_PREFIX = 'agentforce-hour';
  private static final String HOUR_FORMAT = 'yyyyMMddHH';

  @TestVisible
  private static Datetime nowOverride;
  // Tests set these to reach the paths a normal run cannot: a rival insert of the same hour's
  // row just before this one, and a failed write.
  @TestVisible
  private static API_Rate_Window__c rivalRow;
  @TestVisible
  private static Boolean failForTest = false;

  private static Integer pending = 0;
  private static String pendingKey;
  private static Datetime pendingStart;

  /**
   * @description Reserves one Agentforce call in the current hour when the budget allows it.
   *              Reads the hour's row and writes nothing.
   * @param budget Calls allowed per hour.
   * @return Boolean True when the call may go ahead and is now pending.
   */
  public static Boolean tryReserve(Integer budget) {
    Datetime start = hourStart(currentTime());
    String key = keyOf(start);
    Integer used = storedCount(key) + (pendingKey == key ? pending : 0);
    if (used >= budget) {
      return false;
    }
    pending++;
    if (pendingKey == null) {
      // A transaction that runs across the turn of an hour writes to its first hour.
      pendingKey = key;
      pendingStart = start;
    }
    return true;
  }

  /**
   * @description The calls this hour, stored and pending.
   * @return Integer The count.
   */
  public static Integer usedThisHour() {
    String key = keyOf(hourStart(currentTime()));
    return storedCount(key) + (pendingKey == key ? pending : 0);
  }

  /**
   * @description Writes the pending calls to the hour's row. Call it after the last
   *              callout. Never throws.
   */
  public static void commitPending() {
    if (pending == 0) {
      return;
    }
    Integer toAdd = pending;
    String key = pendingKey;
    Datetime start = pendingStart;
    pending = 0;
    pendingKey = null;
    pendingStart = null;
    try {
      addToRow(key, start, toAdd);
    } catch (Exception e) {
      // Recovered on purpose: a lost count must never fail the visitor's letter.
      PortfolioLog.info(
        'AgentforceServiceBudget write failed: ' + e.getTypeName()
      );
    }
  }

  private static void addToRow(String key, Datetime start, Integer toAdd) {
    if (failForTest) {
      throw new DmlException('Forced by a test');
    }
    List<API_Rate_Window__c> rows = lockedRow(key);
    if (rows.isEmpty() && rivalRow != null) {
      insert as system rivalRow;
      rivalRow = null;
    }
    if (rows.isEmpty()) {
      Database.SaveResult saved = Database.insert(
        new API_Rate_Window__c(
          Key__c = key,
          Window_Start__c = start,
          Count__c = toAdd
        ),
        false,
        AccessLevel.SYSTEM_MODE
      );
      if (saved.isSuccess()) {
        return;
      }
      // Another call inserted the hour's row first. Add to it instead.
      rows = lockedRow(key);
      if (rows.isEmpty()) {
        throw new DmlException(saved.getErrors()[0].getMessage());
      }
    }
    API_Rate_Window__c row = rows[0];
    row.Count__c = (row.Count__c ?? 0) + toAdd;
    Database.update(row, AccessLevel.SYSTEM_MODE);
  }

  private static List<API_Rate_Window__c> lockedRow(String key) {
    return [
      SELECT Id, Count__c
      FROM API_Rate_Window__c
      WHERE Key__c = :key
      WITH SYSTEM_MODE
      LIMIT 1
      FOR UPDATE
    ];
  }

  private static Integer storedCount(String key) {
    List<API_Rate_Window__c> rows = [
      SELECT Count__c
      FROM API_Rate_Window__c
      WHERE Key__c = :key
      WITH SYSTEM_MODE
      LIMIT 1
    ];
    return rows.isEmpty() || rows[0].Count__c == null
      ? 0
      : rows[0].Count__c.intValue();
  }

  /**
   * @description The row key of an hour.
   * @param start The hour's start.
   * @return String For example agentforce-hour|2026102623.
   */
  @TestVisible
  private static String keyOf(Datetime start) {
    return KEY_PREFIX + '|' + start.formatGmt(HOUR_FORMAT);
  }

  private static Datetime hourStart(Datetime value) {
    return Datetime.newInstanceGmt(
      value.yearGmt(),
      value.monthGmt(),
      value.dayGmt(),
      value.hourGmt(),
      0,
      0
    );
  }

  private static Datetime currentTime() {
    return nowOverride ?? Datetime.now();
  }
}

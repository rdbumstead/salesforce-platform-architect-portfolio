/**
 * @description       : Default rate limiter (decision 2026-10-02, ADR-025 amendment). Counts
 *                      requests in API_Rate_Window__c, one row per caller key per minute.
 *                      check() and checkKey() only read and lock the current window row; the
 *                      incremented count is written by commitPending(), which ApiRequestContext
 *                      calls when the response is written. No DML happens before a resource's
 *                      callouts, so callouts after ApiRequestContext.begin() stay legal.
 *                      Runs without sharing on purpose: window rows are counter state shared by
 *                      every caller, including the site guest on /papi/auth/token, and sharing
 *                      would hide rows owned by other users and split one caller's count.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [RateWindowLimiterTest]
 **/
public without sharing class RateWindowLimiter implements ApiRateLimiter {
  private static final Integer WINDOW_SECONDS = 60;
  private static final String KEY_SEPARATOR = '|';
  private static final String WINDOW_FORMAT = 'yyyyMMddHHmm';
  // Key__c is 255 characters: caller key, separator, 12-digit minute.
  private static final Integer MAX_CALLER_KEY_LENGTH = 242;
  private static final String LONG_KEY_PREFIX = 'sha256:';

  @TestVisible
  private static Datetime nowOverride;
  @TestVisible
  private static Boolean useSessionIdOverride = false;
  @TestVisible
  private static String sessionIdOverride;

  private static Map<String, PendingWindow> pendingByWindowKey = new Map<String, PendingWindow>();

  /**
   * @description One window row as read at check time, plus the requests recorded against it
   *              in this transaction and not yet written.
   */
  private class PendingWindow {
    private Id recordId;
    private String windowKey;
    private Datetime windowStart;
    private Integer count = 0;
    private Integer unsaved = 0;
  }

  /**
   * @description Records one request for the tier against the current caller and decides
   *              whether it may proceed. The caller is the session (SHA-256 of the session id),
   *              or the user when the session id is null. Every vended token runs as the
   *              same integration user, so a key by user would put every caller in one bucket.
   * @param tierKey Rate tier key (sapi, papi, papi-ai).
   * @param limitPerMinute Requests allowed per minute for the tier.
   * @return ApiRequestContext.RateDecision The decision and the values for the rate-limit headers.
   */
  public ApiRequestContext.RateDecision check(
    String tierKey,
    Integer limitPerMinute
  ) {
    return checkKey(callerKeyFor(tierKey), limitPerMinute);
  }

  /**
   * @description Records one request against the given key, exactly as given, and decides
   *              whether it may proceed. Reads the window row with FOR UPDATE; writes nothing.
   * @param callerKey Complete rate key.
   * @param limitPerMinute Requests allowed per minute for the key.
   * @return ApiRequestContext.RateDecision The decision and the values for the rate-limit headers.
   */
  public ApiRequestContext.RateDecision checkKey(
    String callerKey,
    Integer limitPerMinute
  ) {
    Datetime now = currentTime();
    Datetime windowStart = windowStartOf(now);
    String windowKey = windowKeyOf(callerKey, windowStart);

    PendingWindow pending = pendingByWindowKey.get(windowKey);
    if (pending == null) {
      try {
        pending = loadWindow(windowKey, windowStart);
      } catch (QueryException e) {
        // The row stayed locked by concurrent requests past the platform's lock wait.
        // Refuse rather than count blind; the caller retries in a second.
        ApiRequestContext.RateDecision busy = new ApiRequestContext.RateDecision(
          false,
          limitPerMinute,
          0,
          1
        );
        busy.busy = true;
        return busy;
      }
      pendingByWindowKey.put(windowKey, pending);
    }
    pending.count++;
    pending.unsaved++;

    Boolean allowed = pending.count <= limitPerMinute;
    return new ApiRequestContext.RateDecision(
      allowed,
      limitPerMinute,
      Math.max(0, limitPerMinute - pending.count),
      allowed ? 0 : secondsUntilNextWindow(now)
    );
  }

  /**
   * @description Writes every count recorded in this transaction and not yet saved. Called by
   *              ApiRequestContext when the response is written. Safe to call repeatedly and
   *              when nothing is pending. A row inserted concurrently since the check is
   *              re-read under lock and incremented, so no request is lost.
   */
  public static void commitPending() {
    List<API_Rate_Window__c> updates = new List<API_Rate_Window__c>();
    List<API_Rate_Window__c> inserts = new List<API_Rate_Window__c>();
    List<PendingWindow> insertedWindows = new List<PendingWindow>();

    for (PendingWindow pending : pendingByWindowKey.values()) {
      if (pending.unsaved == 0) {
        continue;
      }
      if (pending.recordId != null) {
        updates.add(
          new API_Rate_Window__c(
            Id = pending.recordId,
            Count__c = pending.count
          )
        );
        pending.unsaved = 0;
      } else {
        inserts.add(
          new API_Rate_Window__c(
            Key__c = pending.windowKey,
            Window_Start__c = pending.windowStart,
            Count__c = pending.count
          )
        );
        insertedWindows.add(pending);
      }
    }

    if (!updates.isEmpty()) {
      Database.update(updates, AccessLevel.SYSTEM_MODE);
    }
    if (!inserts.isEmpty()) {
      insertNewWindows(inserts, insertedWindows);
    }
  }

  private static void insertNewWindows(
    List<API_Rate_Window__c> inserts,
    List<PendingWindow> insertedWindows
  ) {
    List<Database.SaveResult> results = Database.insert(
      inserts,
      false,
      AccessLevel.SYSTEM_MODE
    );
    Map<String, PendingWindow> lostByWindowKey = new Map<String, PendingWindow>();
    for (Integer i = 0; i < results.size(); i++) {
      PendingWindow pending = insertedWindows[i];
      if (results[i].isSuccess()) {
        pending.recordId = results[i].getId();
        pending.unsaved = 0;
      } else {
        lostByWindowKey.put(pending.windowKey, pending);
      }
    }
    if (!lostByWindowKey.isEmpty()) {
      mergeIntoConcurrentWindows(lostByWindowKey);
    }
  }

  private static void mergeIntoConcurrentWindows(
    Map<String, PendingWindow> lostByWindowKey
  ) {
    Set<String> windowKeys = lostByWindowKey.keySet();
    List<API_Rate_Window__c> rows = [
      SELECT Id, Key__c, Count__c
      FROM API_Rate_Window__c
      WHERE Key__c IN :windowKeys
      WITH SYSTEM_MODE
      FOR UPDATE
    ];
    if (rows.size() != windowKeys.size()) {
      throw new RateWindowException(
        'Rate window insert failed and no concurrent row was found.'
      );
    }
    for (API_Rate_Window__c row : rows) {
      PendingWindow pending = lostByWindowKey.get(row.Key__c);
      row.Count__c =
        (row.Count__c == null ? 0 : row.Count__c) + pending.unsaved;
      pending.recordId = row.Id;
      pending.count = row.Count__c.intValue();
      pending.unsaved = 0;
    }
    Database.update(rows, AccessLevel.SYSTEM_MODE);
  }

  private static PendingWindow loadWindow(
    String windowKey,
    Datetime windowStart
  ) {
    PendingWindow pending = new PendingWindow();
    pending.windowKey = windowKey;
    pending.windowStart = windowStart;
    List<API_Rate_Window__c> rows = [
      SELECT Id, Count__c
      FROM API_Rate_Window__c
      WHERE Key__c = :windowKey
      WITH SYSTEM_MODE
      LIMIT 1
      FOR UPDATE
    ];
    if (!rows.isEmpty()) {
      pending.recordId = rows[0].Id;
      pending.count = rows[0].Count__c == null
        ? 0
        : rows[0].Count__c.intValue();
    }
    return pending;
  }

  @TestVisible
  private static String callerKeyFor(String tierKey) {
    String sessionId = useSessionIdOverride
      ? sessionIdOverride
      : UserInfo.getSessionId();
    String identity = String.isBlank(sessionId)
      ? UserInfo.getUserId()
      : sha256Hex(sessionId);
    return tierKey + ':' + identity;
  }

  @TestVisible
  private static String windowKeyOf(String callerKey, Datetime windowStart) {
    String key = String.isBlank(callerKey) ? '' : callerKey;
    if (key.length() > MAX_CALLER_KEY_LENGTH) {
      key = LONG_KEY_PREFIX + sha256Hex(key);
    }
    return key + KEY_SEPARATOR + windowStart.formatGmt(WINDOW_FORMAT);
  }

  private static String sha256Hex(String value) {
    return EncodingUtil.convertToHex(
      Crypto.generateDigest('SHA-256', Blob.valueOf(value))
    );
  }

  private static Datetime currentTime() {
    return nowOverride != null ? nowOverride : Datetime.now();
  }

  private static Datetime windowStartOf(Datetime now) {
    return Datetime.newInstanceGmt(
      now.yearGmt(),
      now.monthGmt(),
      now.dayGmt(),
      now.hourGmt(),
      now.minuteGmt(),
      0
    );
  }

  private static Integer secondsUntilNextWindow(Datetime now) {
    return Math.max(1, WINDOW_SECONDS - now.secondGmt());
  }

  /**
   * @description Raised when a window count cannot be written.
   */
  public class RateWindowException extends Exception {
  }
}

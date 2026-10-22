/**
 * @description       : Generic circuit breaker keyed by dependency name (Round 4 plan L6,
 *                      pillar-e-design 4.4, pillar-d-design T10). Three consecutive failures
 *                      open the circuit for 30 minutes. While it is open, isOpen() is true and
 *                      callers skip the dependency. When the 30 minutes pass the next call is
 *                      tried again: a success closes the circuit, a failure opens it for
 *                      another 30 minutes. State lives in the list custom setting
 *                      Circuit_Breaker_State__c, one row per key, never in Platform Cache.
 *                      recordSuccess and recordFailure write that row, so a caller makes them
 *                      only after its callouts (contract C2, no DML before a callout).
 *                      isOpen and snapshot never write.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 * @Test Class        : [CircuitBreakerTest]
 **/
// without sharing: the state rows are custom setting data with no owner and no record
// content. The scheduled refresh jobs, the site guest on the Delivery page and the guest
// cover letter path (plan L9) must all read and write the same rows, whoever runs them.
public without sharing class CircuitBreaker {
  public static final String KEY_JIRA = 'jira';
  public static final String KEY_GITHUB = 'github';
  public static final String KEY_GEMINI = 'gemini';
  public static final String KEY_AGENTFORCE = 'agentforce';

  /** The keys snapshot() always reports, in this order. */
  public static final List<String> KNOWN_KEYS = new List<String>{
    KEY_JIRA,
    KEY_GITHUB,
    KEY_GEMINI,
    KEY_AGENTFORCE
  };

  public static final Integer FAILURE_THRESHOLD = 3;
  public static final Integer OPEN_MINUTES = 30;

  /** Name is a Text(38) on a custom setting row. */
  private static final Integer MAX_KEY_LENGTH = 38;

  @TestVisible
  private static Datetime nowOverride;

  private static Map<String, Circuit_Breaker_State__c> statesByKey;

  /**
   * @description Whether the circuit for this dependency is open now.
   * @param key Dependency name, for example jira.
   * @return Boolean True while the open window has not passed.
   */
  public static Boolean isOpen(String key) {
    return openUntil(key) != null;
  }

  /**
   * @description When the open circuit for this dependency closes.
   * @param key Dependency name.
   * @return Datetime The end of the open window, or null when the circuit is closed.
   */
  public static Datetime openUntil(String key) {
    Circuit_Breaker_State__c state = states().get(normalize(key));
    Datetime openEnd = state?.Open_Until__c;
    return openEnd != null && now() < openEnd ? openEnd : null;
  }

  /**
   * @description Records a successful call: the failure count goes back to 0 and the
   *              circuit closes. Writes only when something changes. Call it after your
   *              callouts.
   * @param key Dependency name.
   */
  public static void recordSuccess(String key) {
    String normalized = normalize(key);
    Circuit_Breaker_State__c state = states().get(normalized);
    if (state == null) {
      return;
    }
    if (failuresOf(state) == 0 && state.Open_Until__c == null) {
      return;
    }
    state.Consecutive_Failures__c = 0;
    state.Open_Until__c = null;
    save(state);
  }

  /**
   * @description Records a failed call. On the third failure in a row, and on every failure
   *              after that, the circuit opens for OPEN_MINUTES. Call it after your callouts.
   * @param key Dependency name.
   */
  public static void recordFailure(String key) {
    String normalized = normalize(key);
    Circuit_Breaker_State__c state = states().get(normalized);
    if (state == null) {
      state = new Circuit_Breaker_State__c(
        Name = normalized,
        Consecutive_Failures__c = 0
      );
      states().put(normalized, state);
    }
    Datetime current = now();
    state.Consecutive_Failures__c = failuresOf(state) + 1;
    state.Last_Failure_At__c = current;
    if (state.Consecutive_Failures__c >= FAILURE_THRESHOLD) {
      state.Open_Until__c = current.addMinutes(OPEN_MINUTES);
    }
    save(state);
  }

  /**
   * @description Read-only view of every breaker for the footer: the four known keys first,
   *              then any other key that has a row.
   * @return List<BreakerState> One entry per key. A key with no row is closed with 0 failures.
   */
  public static List<BreakerState> snapshot() {
    List<BreakerState> result = new List<BreakerState>();
    Set<String> reported = new Set<String>();
    for (String key : KNOWN_KEYS) {
      result.add(stateFor(key));
      reported.add(key);
    }
    List<String> others = new List<String>(states().keySet());
    others.sort();
    for (String key : others) {
      if (!reported.contains(key)) {
        result.add(stateFor(key));
      }
    }
    return result;
  }

  private static BreakerState stateFor(String key) {
    Circuit_Breaker_State__c row = states().get(key);
    BreakerState view = new BreakerState();
    view.key = key;
    view.openUntil = openUntil(key);
    view.open = view.openUntil != null;
    view.failures = row == null ? 0 : failuresOf(row);
    return view;
  }

  private static void save(Circuit_Breaker_State__c state) {
    upsert as system state;
  }

  private static Integer failuresOf(Circuit_Breaker_State__c state) {
    return state.Consecutive_Failures__c == null
      ? 0
      : state.Consecutive_Failures__c.intValue();
  }

  private static Map<String, Circuit_Breaker_State__c> states() {
    if (statesByKey == null) {
      statesByKey = new Map<String, Circuit_Breaker_State__c>();
      for (
        Circuit_Breaker_State__c row : Circuit_Breaker_State__c.getAll()
          .values()
      ) {
        statesByKey.put(row.Name, row.clone(true, true));
      }
    }
    return statesByKey;
  }

  private static String normalize(String key) {
    if (String.isBlank(key)) {
      throw new IllegalArgumentException('A breaker key is required.');
    }
    String normalized = key.trim().toLowerCase();
    if (normalized.length() > MAX_KEY_LENGTH) {
      throw new IllegalArgumentException(
        'A breaker key is at most ' + MAX_KEY_LENGTH + ' characters.'
      );
    }
    return normalized;
  }

  private static Datetime now() {
    return nowOverride != null ? nowOverride : Datetime.now();
  }

  /**
   * @description One breaker as the footer reads it.
   */
  public class BreakerState {
    @AuraEnabled
    public String key;
    @AuraEnabled
    public Boolean open;
    @AuraEnabled
    public Integer failures;
    @AuraEnabled
    public Datetime openUntil;
  }
}

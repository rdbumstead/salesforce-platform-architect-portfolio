/**
 * @description       : Logging seam for the portfolio's Apex. When Nebula Logger is installed
 *                      it writes through Nebula's System.Callable entry point, CallableLogger,
 *                      found at run time with Type.forName. No source file names a Nebula type,
 *                      so CI, scratch orgs and any org without Nebula compile and run unchanged,
 *                      and every line then goes to System.debug instead. Nebula is an optional
 *                      dependency the owner installs by hand.
 *                      Callers pass only what may be logged: never a body, a header value or a
 *                      token. A logging failure never reaches the caller.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/21/2026
 * @Test Class        : [PortfolioLogTest]
 **/
public with sharing class PortfolioLog {
  /** Nebula Logger's Callable class, the same name with or without a namespace. */
  public static final String NEBULA_CLASS = 'CallableLogger';
  /** Namespace of the managed Nebula package. The unlocked package has none. */
  public static final String NEBULA_NAMESPACE = 'Nebula';
  /** Nebula action that adds an entry and, with saveLog true, saves it. */
  public static final String ACTION_NEW_ENTRY = 'newEntry';
  /** Tag added to every entry so the owner can filter portfolio lines in Nebula. */
  public static final String TAG = 'portfolio';

  @TestVisible
  private static System.Callable injectedSink;
  @TestVisible
  private static Boolean ignoreInstalledNebula = false;

  @TestVisible
  private static List<Type> candidateOverride;

  private static Boolean resolved = false;
  private static System.Callable nebulaSink;

  /**
   * @description Writes one INFO line.
   * @param message The line. Must hold no body, header value, token or personal data.
   * @return Boolean True when Nebula accepted the line, false when it went to System.debug.
   * @example
   * PortfolioLog.info('api request path=/sapi/v1/skills status=200');
   */
  public static Boolean info(String message) {
    String line = String.isBlank(message) ? '' : message;
    System.Callable sink = sink();
    if (sink != null && sendToNebula(sink, line)) {
      return true;
    }
    System.debug(LoggingLevel.INFO, line);
    return false;
  }

  /**
   * @description True when a Nebula Callable entry point was found (or injected by a test).
   * @return Boolean Whether lines go to Nebula.
   */
  public static Boolean isNebulaAvailable() {
    return sink() != null;
  }

  private static Boolean sendToNebula(System.Callable sink, String line) {
    try {
      Object output = sink.call(
        ACTION_NEW_ENTRY,
        new Map<String, Object>{
          'loggingLevel' => LoggingLevel.INFO.name(),
          'message' => line,
          'saveLog' => true,
          'tags' => new List<Object>{ TAG }
        }
      );
      // CallableLogger reports its own failures as isSuccess false instead of throwing.
      if (output instanceof Map<String, Object>) {
        return ((Map<String, Object>) output).get('isSuccess') != false;
      }
      return true;
    } catch (Exception e) {
      // A logging failure must never fail the request it describes. The line still
      // reaches System.debug through the caller's fallback.
      return false;
    }
  }

  private static System.Callable sink() {
    if (injectedSink != null) {
      return injectedSink;
    }
    if (ignoreInstalledNebula) {
      return null;
    }
    if (!resolved) {
      resolved = true;
      nebulaSink = findNebula();
    }
    return nebulaSink;
  }

  private static System.Callable findNebula() {
    List<Type> candidates = candidateOverride != null
      ? candidateOverride
      : new List<Type>{
          Type.forName(NEBULA_NAMESPACE, NEBULA_CLASS),
          Type.forName(NEBULA_CLASS)
        };
    for (Type candidate : candidates) {
      if (candidate == null) {
        continue;
      }
      try {
        Object instance = candidate.newInstance();
        if (instance instanceof System.Callable) {
          return (System.Callable) instance;
        }
      } catch (Exception e) {
        // A class of that name that cannot be built is treated as no Nebula.
        continue;
      }
    }
    return null;
  }
}

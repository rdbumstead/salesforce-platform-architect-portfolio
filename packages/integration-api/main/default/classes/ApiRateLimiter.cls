/**
 * @description       : Pluggable rate-limit store used by ApiRequestContext (ADR-025 amendment).
 *                      The default store is RateWindowLimiter (custom-object counter);
 *                      HeadersOnlyRateLimiter never rejects and is kept for tests and fallback.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/01/2026
 * @Test Class        : [ApiRequestContextTest]
 **/
public interface ApiRateLimiter {
  /**
   * @description Records one request against a tier and decides whether it may proceed.
   * @param tierKey Rate tier key (sapi, papi, papi-ai).
   * @param limitPerMinute Requests allowed per minute for the tier.
   * @return ApiRequestContext.RateDecision The decision and the values for the rate-limit headers.
   */
  ApiRequestContext.RateDecision check(String tierKey, Integer limitPerMinute);

  /**
   * @description Records one request against a key the caller built itself, exactly as given
   *              (no session or user suffix), and decides whether it may proceed.
   * @param callerKey Complete rate key, e.g. papi-token:<hash>.
   * @param limitPerMinute Requests allowed per minute for the key.
   * @return ApiRequestContext.RateDecision The decision and the values for the rate-limit headers.
   */
  ApiRequestContext.RateDecision checkKey(
    String callerKey,
    Integer limitPerMinute
  );
}

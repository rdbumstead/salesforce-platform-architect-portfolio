/**
 * @description       : Pluggable rate-limit store used by ApiRequestContext (ADR-025 amendment).
 *                      The default implementation emits headers only; a Platform Cache or
 *                      custom-object store can implement this interface without changing the context.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
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
}

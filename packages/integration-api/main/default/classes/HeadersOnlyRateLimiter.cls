/**
 * @description       : Rate limiter that reports the tier limit with full remaining capacity and
 *                      never rejects. No longer the default (RateWindowLimiter is); kept as a
 *                      store-free implementation for tests and as a fallback.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/01/2026
 * @Test Class        : [ApiRequestContextTest]
 **/
public with sharing class HeadersOnlyRateLimiter implements ApiRateLimiter {
  /**
   * @description Always allows the request and reports remaining capacity equal to the limit.
   * @param tierKey Rate tier key (unused by this store).
   * @param limitPerMinute Requests allowed per minute for the tier.
   * @return ApiRequestContext.RateDecision An allowing decision.
   */
  public ApiRequestContext.RateDecision check(
    String tierKey,
    Integer limitPerMinute
  ) {
    return new ApiRequestContext.RateDecision(
      true,
      limitPerMinute,
      limitPerMinute,
      0
    );
  }

  /**
   * @description Always allows the request and reports remaining capacity equal to the limit.
   * @param callerKey Rate key (unused by this store).
   * @param limitPerMinute Requests allowed per minute for the key.
   * @return ApiRequestContext.RateDecision An allowing decision.
   */
  public ApiRequestContext.RateDecision checkKey(
    String callerKey,
    Integer limitPerMinute
  ) {
    return check(callerKey, limitPerMinute);
  }
}

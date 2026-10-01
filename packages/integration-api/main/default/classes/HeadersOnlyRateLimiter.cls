/**
 * @description       : Default rate limiter. Reports the tier limit with full remaining capacity
 *                      and never rejects. Enforcement is deferred until a counter store is chosen
 *                      (ADR-025 amendment: Platform Cache trial, custom-object counter, or headers only).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
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
}

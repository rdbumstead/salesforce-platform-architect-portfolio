/**
 * @description       : POST /papi/auth/token. Vends a short-lived evaluator access token
 *                      (ADR-028). The only REST class the site guest user may execute. All
 *                      validation, limiting, cap and audit logic lives in TokenExchangeService.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/20/2026
 * @Test Class        : [PAPIAuthTokenTest]
 **/
// The old /v1/ spelling is kept as an alias until the path sunset (ADR-040). PAPIRouter serves the versionless URL.
@RestResource(urlMapping='/papi/v1/auth/token')
global with sharing class PAPIAuthToken {
  /**
   * @description Exchanges {"email","purpose"} for a token. 200 with the token, 400 on a bad
   *              body, 429 on the email+IP or tier limit, 503 at the daily cap or when the
   *              credential is missing or the exchange fails. Always no-store, no-cache.
   */
  @HttpPost
  global static void requestToken() {
    ApiRequestContext ctx = ApiRequestContext.begin();
    ctx.cache(ApiRequestContext.CachePolicy.NO_STORE);
    if (ctx.isRejected()) {
      // The rules refused the call before the body was read. The attempt is still recorded.
      TokenExchangeService.recordRejected(
        TokenExchangeService.attemptFromRest(
          RestContext.request,
          ctx.correlationId()
        ),
        RestContext.response.statusCode
      );
      return;
    }
    try {
      TokenExchangeService.Attempt attempt = TokenExchangeService.attemptFromRest(
        RestContext.request,
        ctx.correlationId()
      );

      // The token callout runs inside requestToken, before ok()/error() write the
      // rate-limit count, so no DML comes before the callout.
      TokenExchangeService.Result result = TokenExchangeService.requestToken(
        attempt
      );
      if (result.isIssued()) {
        ctx.ok(result.toTokenBody());
        return;
      }
      if (result.retryAfterSeconds != null) {
        ctx.header('Retry-After', String.valueOf(result.retryAfterSeconds));
      }
      if (result.rateDecision != null) {
        ctx.header(
          'X-RateLimit-Limit',
          String.valueOf(result.rateDecision.limitPerMinute)
        );
        ctx.header(
          'X-RateLimit-Remaining',
          String.valueOf(Math.max(0, result.rateDecision.remaining))
        );
      }
      ctx.error(
        result.statusCode,
        result.errorCode,
        result.message,
        result.retryable
      );
    } catch (Exception e) {
      ctx.serverError(e);
    }
  }
}

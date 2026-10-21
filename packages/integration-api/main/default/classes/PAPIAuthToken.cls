/**
 * @description       : POST /papi/v1/auth/token. Vends a short-lived evaluator access token
 *                      (ADR-028). The only REST class the site guest user may execute. All
 *                      validation, limiting, cap and audit logic lives in TokenExchangeService.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/20/2026
 * @Test Class        : [PAPIAuthTokenTest]
 **/
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
    TokenExchangeService.Attempt attempt = TokenExchangeService.attemptFromRest(
      RestContext.request,
      ctx.correlationId()
    );
    if (ctx.isRejected()) {
      TokenExchangeService.recordRejected(
        attempt,
        RestContext.response.statusCode
      );
      return;
    }

    // The token callout runs inside requestToken, before ok()/error() write the
    // rate-limit count (contract C2).
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
    ctx.error(result.statusCode, result.errorCode, result.message);
  }
}

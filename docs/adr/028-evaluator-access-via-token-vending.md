# ADR-028: Evaluator Access via Token Vending

## Status

Accepted (2026-10-01). Depends on [ADR-027](027-platform-native-api-authentication.md). Amended 2026-10-21, and again for Round 4 (see below).

## Context

The portfolio's Evidence Matrix invites reviewers to call the APIs and compare live responses against the OpenAPI contracts. Under [ADR-027](027-platform-native-api-authentication.md) every endpoint requires an OAuth 2.0 Bearer token obtained with the External Client App's consumer secret. A single External Client App cannot mint per-person credentials, so an external evaluator with `curl` has no way in unless one of the following is true:

- the secret is published (rejected in ADR-027),
- the evaluator asks the owner for credentials by email (manual, slow, and invisible to the portfolio),
- or the platform issues them a token on request.

The data behind the APIs is public portfolio content. The assets worth protecting are the consumer secret, the integration user's session, and the Developer Edition org's daily API request quota.

## Decision

Expose one unauthenticated endpoint, `POST /papi/v1/auth/token`, that performs the client-credentials exchange **server-side** and returns a **short-lived access token** to the caller. The consumer secret never leaves the org.

Request: `{ "email": string, "purpose": string }`.
Response: `{ "access_token", "token_type": "Bearer", "instance_url", "docs" }`. (The original response also carried `expires_in`. The owner dropped it on 2026-10-21, see the Round 4 amendment.)

Behaviour:

1. Validate the email format and reject malformed addresses with `400`. (The original text also rejected disposable addresses. The owner dropped that on 2026-10-21, see the Round 4 amendment.)
2. Apply the shared rate limiter keyed by email and source IP; reject with `429` and `Retry-After`.
3. Enforce a daily issuance cap (default 50 tokens/day) with `503` once exhausted.
4. Write an `API_Access_Request__c` audit record (email, purpose, timestamp, source IP, correlation ID).
5. Call the org's token endpoint through the `Portfolio_API` Named Credential and return the resulting token.

`PAPIAuthToken` is the **only** REST class the Experience Cloud guest user may execute. It shares a `TokenExchangeService` with the site's API Lab proxy so there is exactly one code path that touches the credential.

## Alternatives Considered

| Option                                        | Rejected because                                                                                                                   |
| :-------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| No external access; API Lab on the site only  | Loses the "verify it yourself with curl" evidence hook. The README already promises it.                                            |
| Publish a shared demo secret                  | A published secret is a defect, not a demo (see ADR-027).                                                                          |
| Manual credential requests by email           | Unobservable, unscalable, and demonstrates nothing about the platform.                                                             |
| One External Client App per evaluator         | Manual Setup work per reviewer; cannot be automated from Apex.                                                                     |
| Self-registration as an Experience Cloud user | Heavier than the problem warrants, requires login UX, and still does not give a `curl` user a Bearer token without a browser flow. |

## Rationale

- **The secret is never exposed.** The exchange happens inside the org through the Named Credential. The evaluator only ever sees a token that expires.
- **Least privilege is the real control.** A client-credentials token is valid for any REST API as the integration user, not only the Apex REST endpoints. The binding constraint is therefore the integration user's permission set: read-only on portfolio objects, nothing else. This is deliberately documented as the control so it is never relaxed casually.
- **Exposure is time-bounded.** The integration user runs under a dedicated profile with a 30-minute idle session timeout, so an issued token ends once the shared session goes unused for 30 minutes.
- **There is a kill switch.** Deactivating the External Client App invalidates every outstanding token immediately.
- **The quota is protected.** Each issued token can generate API requests against the Developer Edition limit of 15,000 per day. The issuance cap and rate limiter bound the worst case.
- **It is observable.** Every request leaves an audit row, which doubles as a lightweight signal of who evaluated the portfolio.

## Implications

- **New metadata:** `API_Access_Request__c` custom object (audit only, no guest read access), the `PAPIAuthToken` REST class, and guest execute access on that one class.
- **Spec change:** `/auth/token` is added to `portfolio-papi.yaml` with `security: []`; the generated Markdown is regenerated via `npm run docs:verify`.
- **Site:** the API Lab gains a "Get an API token" action that calls the same endpoint and prints a ready-to-paste `curl` command.
- **README / Evidence Matrix:** the verification method for API design changes from "call the endpoints" to "request a token, then call the endpoints", with the flow documented inline.
- **Operations (Maintenance Guide):** rotation runbook for the consumer secret, the daily cap setting, and the procedure for revoking access (deactivate the app, re-enable after rotation).
- **Risk accepted:** an email address is low friction. For read-only public data this is proportionate; if abuse appears, the cap and the kill switch are the response, not a redesign.

## Amendment (2026-10-21)

Behaviour as built in `PAPIAuthToken.requestToken` and `TokenExchangeService.requestToken`:

1. **Validation (400).** The body must be a JSON object of strings. `email` must be a valid address of at most 254 characters, and `purpose` is required, at most 280 characters. Disposable addresses are not rejected, and the decision no longer asks for it (Round 4 amendment).
2. **Rate limit (429).** 15 requests per minute per email and source IP (`TokenExchangeService.TOKEN_REQUESTS_PER_MINUTE`, decision 2026-10-20), keyed `papi-token:{SHA-256 hex of lowercase(email)|sourceIp}` through `ApiRateLimiter.checkKey`, on top of the PAPI tier limit applied by `ApiRequestContext.begin`. See the [ADR-025 amendment (2026-10-21)](025-papi-fan-out-throttling-capacity-planning.md#amendment-2026-10-21).
3. **Daily cap (503).** `TokenExchangeService.dailyCap` reads `Portfolio_Config__mdt.Token_Daily_Cap__c` on the `Ryan_Bumstead` record, default 50. The cap counts audit rows with outcome `Issued` created today; once reached, the response is 503 with `Retry-After` set to the seconds until the next midnight in the running user's time zone. A cap of 0 refuses every request.
4. **Audit.** Every attempt, including those `ApiRequestContext` rejects before the service runs (`TokenExchangeService.recordRejected`), writes one `API_Access_Request__c` row with `Email__c`, `Purpose__c`, `Source_IP__c`, `Correlation_Id__c`, `Channel__c` (`REST` or `Aura`) and `Outcome__c` (`Issued`, `Invalid_Request`, `Rate_Limited`, `Cap_Reached`, `Credential_Missing`, `Failed`). When the token callout runs, the row is written after it (contract C2).
5. **Exchange.** Through the `Portfolio_API_Token` Named Credential, not `Portfolio_API` (Apex cannot read the secret of the OAuth credential; see the [ADR-027 amendment (2026-10-21)](027-platform-native-api-authentication.md#amendment-2026-10-21)). A missing or ungranted credential, or `invalid_client_id`, answers 503 "Token issuance is not configured."; any other failure answers 503 "Token issuance is temporarily unavailable."
6. **Response.** `expires_in` was always 1800, the integration profile's session timeout, because the token endpoint returns no expiry. The Round 4 amendment drops it. `instance_url` is the My Domain root returned by the token endpoint, and evaluators call `{instance_url}/services/apexrest/...`. The token request itself goes to the site domain under `/portfoliovforcesite/services/apexrest/`.

The API Lab's `ApiLabController.requestEvaluatorToken` runs the same service, then calls `ApiRequestContext.commitRateCounts()` to write its rate count. An Aura call has no REST request, so the source IP comes from the current session when one exists and is otherwise the literal `unavailable`, which makes that key effectively per email. Each vended token is not its own session, so the P2 rate key does not separate evaluators. The Round 4 amendment below records what that means.

## Amendment (2026-10-21, Round 4)

**Every evaluator shares one token pool and one rate limit** (owner decision D1, 2026-10-21).

- Two token exchanges in a row return the same access token. The platform hands back the integration user's current session for the same client while that session is valid, instead of opening a new one. So every evaluator who asks for a token in that window gets the same token. This was proven twice in production on 2026-10-21: two exchanges compared equal by hash, and two separately vended tokens landed on the same `RateWindowLimiter` key.
- `RateWindowLimiter` keys SAPI and PAPI requests by a hash of the session id (P2), so all evaluators count against one bucket per tier: SAPI 120, PAPI 15 and `/papi/v1/ai/` 10 requests per minute, shared. One busy evaluator can use up the minute for everyone, and a 429 with `Retry-After` is the answer until the minute ends.
- The owner accepted this for launch. The data is public, the tiers are small, and the daily cap and the kill switch still bound the worst case. Nothing in the docs or the specs describes a per-evaluator limit.
- The token request itself is still limited per email and source IP (`papi-token` key, item 2 of the 2026-10-21 amendment), because that key does not depend on the session.

**No `expires_in`** (owner decision, 2026-10-21). The token endpoint reports no expiry for a client credentials grant, and the token is the integration user's shared session, which ends after 30 minutes without use (the integration profile's idle timeout). A fixed number would describe neither, so the response leaves the field out and the specs and docs say how the session ends instead.

**Disposable addresses.** The owner dropped "reject disposable addresses" from item 1 of the decision on 2026-10-21. No list of disposable domains is kept, and the audit row plus the daily cap are the controls.

## Note (2026-10-23)

The token request rate (15 a minute per email and source IP) and the default daily cap (50) are now read from the `Token_Requests_Per_Minute` and `Token_Daily_Cap_Default` records of `Portfolio_Setting__mdt`, with those numbers as the code defaults ([ADR-032](032-operational-settings-in-custom-metadata.md)). `Portfolio_Config__mdt.Token_Daily_Cap__c` still wins when set, so a cap of 0 still pauses vending.

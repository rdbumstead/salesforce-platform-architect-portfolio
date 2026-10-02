# ADR-028: Evaluator Access via Token Vending

## Status

Accepted (2026-10-01). Depends on [ADR-027](027-platform-native-api-authentication.md).

## Context

The portfolio's Evidence Matrix invites reviewers to call the APIs and compare live responses against the OpenAPI contracts. Under [ADR-027](027-platform-native-api-authentication.md) every endpoint requires an OAuth 2.0 Bearer token obtained with the External Client App's consumer secret. A single External Client App cannot mint per-person credentials, so an external evaluator with `curl` has no way in unless one of the following is true:

- the secret is published (rejected in ADR-027),
- the evaluator asks the owner for credentials by email (manual, slow, and invisible to the portfolio),
- or the platform issues them a token on request.

The data behind the APIs is public portfolio content. The assets worth protecting are the consumer secret, the integration user's session, and the Developer Edition org's daily API request quota.

## Decision

Expose one unauthenticated endpoint, `POST /papi/v1/auth/token`, that performs the client-credentials exchange **server-side** and returns a **short-lived access token** to the caller. The consumer secret never leaves the org.

Request: `{ "email": string, "purpose": string }`.
Response: `{ "access_token", "token_type": "Bearer", "expires_in", "instance_url", "docs" }`.

Behaviour:

1. Validate the email format and reject disposable or malformed addresses with `400`.
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
- **Exposure is time-bounded.** The integration user runs under a dedicated profile with a 30-minute session timeout, so issued tokens expire on their own.
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

# ADR-027: Platform-Native API Authentication (External Client App + Named Credential)

## Status

Accepted (2026-10-01). Supersedes [ADR-017](017-system-api-security-and-dual-sided-auth-pattern.md).

## Context

ADR-017 secured the System API (SAPI) by validating `client_id` / `client_secret` headers inside Apex against `Portfolio_Config__mdt`. That design existed to _simulate_ a MuleSoft API Manager policy enforcement point while the real gateway was expected to live in MuleSoft. The zero-cost operating model ([ADR-003](003-apex-rest-vs-external-service.md), [ADR-018](018-finops-constraint-aws-lambda-function-urls-vs-api-gateway.md)) removed MuleSoft from the architecture, so the simulation became the only gate.

A header check in Apex has three structural weaknesses:

1. The secret must be readable by the runtime, so it lives in metadata visible to every admin and in source control unless hashed.
2. The Experience Cloud guest user must hold execute access on every REST class for the check to run at all, which widens the guest attack surface that [ADR-012](012-guest-user-security-restriction-rules.md) deliberately narrows.
3. Rejection happens inside the transaction, after the platform has already spent governor budget on the request.

Salesforce provides a first-class answer to machine-to-machine authentication, and the portfolio should demonstrate it rather than re-implement it.

## Decision

Authenticate the SAPI and Process API (PAPI) with platform-native OAuth 2.0 on both sides of the boundary:

- **Inbound (provider side):** an **External Client App** (`externalClientApps` metadata, source-tracked) enabled for the **Client Credentials flow**, configured to _run as_ a dedicated integration user. Callers present `Authorization: Bearer <access_token>`. The guest user holds no execute access on any SAPI or PAPI class except the token-vending endpoint defined in [ADR-028](028-evaluator-access-via-token-vending.md).
- **Outbound (consumer side):** an **External Credential** using the OAuth 2.0 Client Credentials protocol against this org's own token endpoint, holding the External Client App consumer key and secret as its principal, wrapped by a `Portfolio_API` **Named Credential**. Any on-platform consumer (the site's API Lab proxy, the PAPI health check) calls the APIs through that Named Credential.
- **Authorisation:** the integration user holds a single permission set (`Integration_Access`) granting read-only access to the portfolio objects, execute access on the SAPI and PAPI classes, and nothing else.
- **Contract:** both OpenAPI specifications replace the two `apiKey` header schemes with one `oauth2` `clientCredentials` security scheme.

## Alternatives Considered

| Option                                               | Rejected because                                                                                                                                  |
| :--------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep the custom-metadata header check (ADR-017)      | Simulates a gateway that no longer exists; secret in metadata; guest user needs REST class access; rejection costs governor budget.               |
| Publish a shared demo secret in the documentation    | A published secret is not a secret. Reviewers would read it as a security defect, not a convenience.                                              |
| Legacy Connected App instead of External Client App  | Functionally equivalent for client credentials, but External Client Apps are the current packaging-friendly model and deploy cleanly from source. |
| Named / External Credentials alone                   | These are outbound-only constructs. They hold credentials Salesforce presents to others and cannot authenticate an inbound caller.                |
| Experience Cloud guest access with no authentication | Portfolio data is public, but an unauthenticated REST surface demonstrates nothing and exposes the org's API request quota to anyone.             |

## Rationale

- **Real controls instead of simulated ones.** The platform rejects an invalid or missing token before Apex executes. "No SOQL before authentication" is guaranteed by the runtime, not by code review.
- **Least privilege is explicit.** Everything a token can do is bounded by one permission set on one user, which is auditable in Setup and in source.
- **Secrets stay in the vault.** The consumer secret exists only in the External Credential principal. Rotation is a Setup action (regenerate in the External Client App, update the principal) with no code change and no deploy.
- **The dual-sided pattern survives.** ADR-017's separation between consumer and provider is preserved: the Named Credential is the consumer, the External Client App is the provider. The portfolio now demonstrates both constructs in a working loop rather than describing them.

## Implications

- **Guest user:** loses execute access on all SAPI and PAPI classes. Site components reach data through `@AuraEnabled` controllers or the API Lab proxy, never the REST surface directly.
- **API Lab (`c-api-tester`):** cannot hold a secret in the browser, so it calls an Apex proxy (`ApiLabController`) that invokes the API through `Portfolio_API`. Each call therefore traverses browser → Apex → Named Credential → External Client App → Apex REST. The added latency is shown on screen as part of the demonstration.
- **PAPI → SAPI:** remains in-process SOQL. A self-callout per sub-resource would cost eight API requests per `/profile/full` call for no security gain ([ADR-025](025-papi-fan-out-throttling-capacity-planning.md)). One PAPI health check does traverse the Named Credential so the credential is exercised continuously.
- **Rate limiting:** moves from "enforced by MuleSoft API Manager" to on-platform enforcement keyed by the calling application. See the amendment to ADR-025 for the Platform Cache constraint in Developer Edition.
- **Licensing:** the integration user consumes one Salesforce user licence in the Developer Edition org.
- **Documentation:** the SAS (§5.3, Appendix C) and Technical Guide (§1) sections describing `client_id` / `client_secret` validation against `Portfolio_Config__mdt` must be rewritten to match this decision.
- **Constraints carried forward from ADR-017:** the APIs remain read-only; non-GET methods on data resources return `405 Method Not Allowed`. The only POST endpoints are `/papi/v1/ai/generate` and the token-vending endpoint in ADR-028.

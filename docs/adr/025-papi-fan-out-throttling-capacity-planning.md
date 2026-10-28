# ADR-025: PAPI Fan-Out Throttling (Capacity Planning)

## Status

Accepted. Amended 2026-10-01, 2026-10-21 and 2026-10-28 (see below). The 2026-10-28 amendment corrects the Context and Rationale: PAPI was never built to call SAPI over HTTP, so the "~8 upstream calls" below are eight data reads in one transaction, not eight requests.

## Context

The Process API (PAPI) `/profile/full` endpoint aggregates data from ~8 upstream System API (SAPI) calls. SAPI has a hard limit of 120 req/min.

## Decision

Enforce a strict rate limit of **15 requests/minute** on the PAPI layer.

## Rationale

Implementing "Backpressure" at the edge prevents the "Fan-Out Effect" (1 request becoming 8) from cascading and exhausting downstream SAPI quotas (15 \* 8 = 120).

## Implications

Clients requesting full profile hydration faster than every 4 seconds will receive HTTP 429; this is acceptable for a Portfolio use case.

## Amendment (2026-10-01)

The limits above stand. The **enforcement point** changes: the original text assumed MuleSoft API Manager would apply the policy. With MuleSoft removed ([ADR-027](027-platform-native-api-authentication.md)), limits are enforced on-platform in a shared `ApiRequestContext`, keyed by the calling External Client App, emitting `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `Retry-After`.

Tiers: SAPI 120 req/min (burst 20); PAPI standard 15 req/min; PAPI `ai` tier 10 req/min; token vending per [ADR-028](028-evaluator-access-via-token-vending.md).

**Constraint:** the Developer Edition org has no Platform Cache allocation, so the counter cannot assume `Cache.Org`. Implementation must either (a) request the Platform Cache trial, (b) fall back to a lightweight custom-object counter purged by the existing cache-cleanup scheduler, or (c) ship the headers with enforcement documented as deferred. The choice is recorded in the implementation PR, not here.

## Amendment (2026-10-21)

The open constraint above is closed: option (b), a custom-object counter, was chosen (decision 2026-10-02), and the 2026-10-01 wording "keyed by the calling External Client App" is replaced by the keying below. Every vended token runs as the same integration user through the same External Client App, so keying by app or user would put every caller in one bucket.

Rate limits are enforced in Apex by `RateWindowLimiter`, a custom-object counter: one `API_Rate_Window__c` row per caller key per minute. `Key__c` is `{callerKey}|{yyyyMMddHHmm}` (UTC minute, unique external id, at most 255 characters; a caller key longer than 242 characters is replaced by `sha256:{hex}`). For SAPI and PAPI requests the caller key is `{tier}:{SHA-256 hex of the session id}`, or `{tier}:{user id}` when the session id is null. Each vended token is expected to be its own session (unverified until the live smoke). The token endpoint keys by `papi-token:{SHA-256 of lowercase email|source IP}`. Tiers: `sapi` 120, `papi` 15, `papi-ai` (`/papi/v1/ai/*`) 10 requests per minute. The window is a fixed calendar minute. Every response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Request limit + 1 within a minute gets `429` with `Retry-After` set to the seconds left in the minute, and the Error body `{httpStatus: 429, errorCode: "RATE_LIMIT_EXCEEDED", message: "Rate limit exceeded. Retry after N seconds.", correlationId, retryable: true}`. The rate check runs before any data query; a rejected request runs only the counter's own read and write. Rejected requests count. The check reads and locks the row and writes nothing. The incremented count is written when the response is written (`ok()`/`error()`), or by `ApiRequestContext.commitRateCounts()` for non-REST callers, so a resource may make callouts after `begin()`. If the row stays locked past the platform wait, the request gets 429 with `Retry-After: 1`. The daily `CacheCleanupScheduler` job deletes rows whose `Window_Start__c` is older than `Cache_Cleanup_Settings__mdt.Rate_Window_Retention_Days__c` (default 1 day). Platform Cache is not used. `HeadersOnlyRateLimiter` (never rejects) remains for tests.

Sources: `RateWindowLimiter.check`, `RateWindowLimiter.checkKey` and `RateWindowLimiter.commitPending`; `ApiRequestContext.applyRequestRules`, `ApiRequestContext.ok`, `ApiRequestContext.error` and `ApiRequestContext.commitRateCounts`; `TokenExchangeService.rateKey`; `CacheCleanupOrchestrator.runRateWindowCleanup` and `CacheCleanupRateWindowBatch.start`. The "burst 20" in the tier list above is not implemented: the window is a fixed calendar minute with no burst allowance.

## Note (2026-10-23)

The tier limits above (120, 15 and 10 a minute) and the API page sizes are now read from `Portfolio_Setting__mdt` records, with these numbers as the code defaults ([ADR-032](032-operational-settings-in-custom-metadata.md)). The decision is unchanged. A record outside its range is ignored, so a typo cannot set a tier to 0.

## Note (2026-10-24)

The SAPI list reads now come from `Query_Definition__mdt` records ([ADR-033](033-queries-in-custom-metadata.md)). The rate check is unchanged and still runs before any data query: the records load only when a read runs, so a rejected request loads none. The counter's own read stays in code, because a row read `FOR UPDATE` must not be editable as data. `/sapi/v1/projects` and `/sapi/v1/experience-highlights` spend one more SOQL query per request, to read their long filters in full.

## Amendment (2026-10-28): PAPI composes in process, and HTTP fan out was rejected

This corrects the Rationale above. The 15 a minute limit stands. The reason given for it does not, because PAPI never fans out to SAPI over HTTP.

**What is built.** PAPI and SAPI remain distinct logical API layers. PAPI composes the shared data access engine and request framework in process: it reads the same records through the query engine (`QueryDefinitions`, [ADR-033](033-queries-in-custom-metadata.md)) and the request framework (`ApiRequestContext`) SAPI also uses, with its own query definitions and its own transformer (`PAPITransformer`). One `/profile/full` request runs nine data reads in one Apex transaction. Those are data reads, not HTTP requests: nine SOQL queries cost the transaction nine of its query limit and nothing outside it.

**What was rejected, and why.** Turning those reads into HTTP requests from PAPI to SAPI through the `Portfolio_API` Named Credential:

- **The same org callout constraint.** The site's API Lab reaches PAPI through `Portfolio_API`, which is a callout into this same org. A request that arrived as a same org callout may not call out again ([ADR-015](015-strategy-pattern-for-generative-ai.md)), so an HTTP fan out would fail on the site's own path, the one visitors use.
- **Latency.** Callouts in one synchronous Apex transaction run one after another, and together they must finish inside the 120 seconds of callout time a transaction allows. Eight loopback calls would add each call's round trip to every PAPI response. The "parallel groups" the specification once described could not have run in parallel.
- **Shared capacity.** Each loopback request would arrive as an inbound REST request and count against the org's daily API request allocation (15,000 on this Developer Edition, `DailyApiRequests`), where the in process reads count nothing. Each would also run as the integration user's one shared session, so one PAPI call would spend about eight of the SAPI tier's 120 requests a minute that every evaluator shares ([ADR-028](028-evaluator-access-via-token-vending.md)).

**Why 15 a minute still holds.** One PAPI request still does the data work of about eight SAPI reads in one transaction. The lower limit keeps one caller's PAPI load in step with what the same data costs through SAPI's 120 a minute. The arithmetic 15 \* 8 = 120 is a sizing ratio, not a count of HTTP calls.

**The deliberate exception.** `/papi/v1/health` calls SAPI's `/sapi/v1/health` through `Portfolio_API`, once, so the health check proves the credential works. It is the only PAPI callout.

**Not decided here.** An opt in HTTP fan out for outside callers, kept off the site's path, would be a separate experiment with its own decision record.

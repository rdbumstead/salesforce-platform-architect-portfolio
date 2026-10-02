# ADR-025: PAPI Fan-Out Throttling (Capacity Planning)

## Status

Accepted. Amended 2026-10-01 (see below).

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

# ADR-025: PAPI Fan-Out Throttling (Capacity Planning)

## Status

Accepted

## Context

The Process API (PAPI) `/profile/full` endpoint aggregates data from ~8 upstream System API (SAPI) calls. SAPI has a hard limit of 120 req/min.

## Decision

Enforce a strict rate limit of **15 requests/minute** on the PAPI layer.

## Rationale

Implementing "Backpressure" at the edge prevents the "Fan-Out Effect" (1 request becoming 8) from cascading and exhausting downstream SAPI quotas (15 \* 8 = 120).

## Implications

Clients requesting full profile hydration faster than every 4 seconds will receive HTTP 429; this is acceptable for a Portfolio use case.

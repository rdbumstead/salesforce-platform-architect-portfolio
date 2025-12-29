# ADR-014: Deferred Telemetry Loading (Performance)

## Status

Accepted

## Context

Real-time telemetry fetching during initialization risks violating the LCP < 2.5s performance budget.

## Decision

Implement Deferred Telemetry Loading for the system health dashboard.

## Rationale

Decouples non-essential limit checks from the critical rendering path.

## Implications

Employs requestIdleCallback() to fetch data only after the primary UI has painted.

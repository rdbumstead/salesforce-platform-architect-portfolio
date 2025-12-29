# ADR-022: Resilience Engineering – Resilience Simulation Toggle

## Status

Accepted

## Context

Need to reduce recruiter "Time-to-Trust" by proving the system's resilience under failure.

## Decision

Implement a "Resilience Simulation" toggle (formerly Chaos Mode) within the Glass Box footer.

## Rationale

Allows evaluators to manually force integrations into failure states to observe the "Indefinite Degraded Mode" and circuit breakers in real-time.

## Implications

Requires state management (Session Cache) to track simulation status and mock 500 errors in service classes.

# ADR-022: Resilience Engineering – Resilience Simulation Toggle

## Status

Accepted. Amended 2026-10-21 (see below).

## Context

Need to reduce recruiter "Time-to-Trust" by proving the system's resilience under failure.

## Decision

Implement a "Resilience Simulation" toggle (formerly Chaos Mode) within the Glass Box footer.

## Rationale

Allows evaluators to manually force integrations into failure states to observe the "Indefinite Degraded Mode" and circuit breakers in real-time.

## Implications

Requires state management (Session Cache) to track simulation status and mock 500 errors in service classes.

## Amendment (2026-10-21): the breaker state and the toggle

The decision stands. The state and the toggle are built differently from the implications above.

- **No Session Cache.** The org has no Platform Cache partition, and the project decided against Platform Cache. Breaker state lives in the list custom setting `Circuit_Breaker_State__c` (one row per dependency, with `Consecutive_Failures__c`, `Open_Until__c` and `Last_Failure_At__c`), read and written by the `CircuitBreaker` class.
- **The breaker.** `CircuitBreaker` (`isOpen`, `openUntil`, `recordSuccess`, `recordFailure`, `snapshot`), keys `github`, `jira`, `gemini` and `agentforce`. Three consecutive failures open the circuit for 30 minutes. After that the next call is tried: a success closes it, a failure opens it for 30 more minutes. A skipped provider is recorded as `skipped_open_circuit`. The GitHub and Jira refresh jobs skip their callout while their circuit is open, and `ContentGenerationController.dispatch` skips Gemini (or Agentforce) while theirs is open and serves the next provider. State is written only after the callouts in a transaction, never before one.
- **The toggle is a visible switch, "Simulate an outage", in the roadmap card, driving the roadmap and Latest Updates together**, off by default, not in the footer. It passes `simulate` to `DeliveryController.getRecentCommits(Boolean simulate)` and `getRoadmap(Boolean simulate)`, which return the cached data marked `SIMULATED` and make no callout. No service class mocks a 500, and nothing the visitor does changes stored state.
- **What the visitor sees:** `SIMULATED` while the switch is on, `DEGRADED` while the real breaker for that source is open, and in both cases the last good data with its age.

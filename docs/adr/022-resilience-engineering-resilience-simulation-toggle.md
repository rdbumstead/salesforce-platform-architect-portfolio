# ADR-022: Resilience Engineering – Resilience Simulation Toggle

## Status

Accepted. Amended 2026-10-21, 2026-10-29 and 2026-10-30 (see below).

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

## Amendment (2026-10-29): the before and after for the outage switch

The decision stands. The switch now shows a before and after beside the panel it affects.

- While the "Simulate an outage" switch is on and a panel's feed is `SIMULATED`, the roadmap and Latest Updates show `c-outage-compare` above their content.
- It sets a static, labelled illustration of a panel with no saved copy and no breaker beside a three step trace of what the panel really does. Step one says no call was made to the source. Step two says the breaker counts a failed refresh and opens at 3 in a row for 30 minutes. Step three says the panel shows the last saved copy with its age.
- `DEGRADED`, a real open breaker, does not show it.
- **The numbers are text, not settings.** The 3 and the 30 are the `CircuitBreaker` defaults and the values of the `Circuit_Failure_Threshold` and `Circuit_Open_Minutes` settings, but they are written into the component's wording. If I change either setting, I change the wording too.

## Amendment (2026-10-30): the outage text reads the settings

This replaces the last bullet of the 2026-10-29 amendment. The decision and the rest stand.

- **The numbers come from the settings.** `DeliveryController.getRoadmap` and `getChangelog` return `failureThreshold` and `openMinutes` on the feed, read from `CircuitBreaker.failureThreshold()` and `openMinutes()`. Those read the `Circuit_Failure_Threshold` and `Circuit_Open_Minutes` settings and fall back to the code defaults of 3 and 30.
- **The components pass them on.** `c-roadmap-viewer` and `c-changelog` hand both numbers to `c-outage-compare`. The component holds no default of its own.
- **A missing number is left out.** When the threshold is missing the step reads "After repeated failures in a row it opens". When the open minutes are missing it leaves out the "for N minutes" part. It never shows a made up number.
- **Why.** The 2026-10-29 wording typed the 3 and the 30, so a change to either setting left the page telling visitors something untrue. Now the page changes with the setting and I edit nothing.

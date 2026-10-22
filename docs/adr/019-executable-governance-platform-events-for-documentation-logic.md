# ADR-019: Executable Governance – Platform Events for Documentation Logic

## Status

Accepted. Amended 2026-10-21 for Round 4 (see below).

## Context

Requirement to prove that documentation is a "living" asset rather than static text.

## Decision

Implement Executable Governance via the Governance_Notification\_\_e Platform Event and the c-smart-docs component.

## Rationale

Allows the UI to react in real-time to system state changes (e.g., CI/CD deployment completion), proving the candidate understands event-driven architecture.

## Implications

Requires the implementation of a subscription model in LWC using lightning/empApi.

## Amendment (2026-10-21, Round 4)

The decision stands: executable governance through a platform event. The names, the subscriber and the browser side change (owner decisions E1 to E4, 2026-10-21).

- **One event name, one component name (E1 a).** The event is `Governance_Event__e`, as the SAS and the existing component have it. The component is `smartChecklist` (`c-smart-checklist`). `Governance_Notification__e` and `c-smart-docs` are retired names.
- **The subscriber is on the server.** CI publishes the event after a production deploy (`deploy.yml`) and after the daily heartbeat (`keep-alive.yml`), each as that workflow's existing JWT user (E5 a). An Apex trigger on the event persists it as a `Pipeline_Run__c` record, upserted by the `Run_Key__c` external id, so a replayed event changes nothing. The trigger runs asynchronously in its own transaction.
- **Why `lightning/empApi` is out.** Salesforce lists `lightning-emp-api` as unsupported in LWR sites, and even where it is supported each subscribed browser counts as one of the org's 20 concurrent streaming clients, which a public site would exhaust. A guest has no session or OAuth token for Pub/Sub API either. So no visitor's browser subscribes to anything.
- **How the page reads it (E2 a).** `smartChecklist` reads `GovernanceController.getPipelineStatus()` (cacheable Apex: the latest run per workflow plus the age of the integration caches) when the page is viewed, and again with `refreshApex` when the tab becomes visible (`visibilitychange`). There is no timer and no polling loop.
- **What the checklist claims (E4).** Three items, each from evidence, never from code: the production deploy is green (from `deploy.yml`), the org heartbeat ran in the last 26 hours (from `keep-alive.yml`), and the integration caches are under 30 minutes old (computed in the org). An item with no data shows "No signal yet", never a tick. Test coverage on production is not claimed.
- **When (E3 a).** It ships in Round 4, before launch, not post-launch.
- The workflow publish steps are owner edits to `.github/workflows/**`, made after the event exists in production.

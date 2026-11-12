# ADR-003: Apex REST vs. External Service

## Status

- **Decision:** Accepted
- **Build:** [Live](../../packages/integration-api/main/default/classes/SAPIRouter.cls), also [SAPIRouterTest](../../packages/integration-api/main/default/classes/SAPIRouterTest.cls)

## Context

Need for a System API layer without incurring external hosting or middleware licensing costs.

## Decision

Implement Native Apex REST endpoints.

## Rationale

Simulates enterprise middleware patterns while operating entirely within the Salesforce Developer Edition budget.

## Implications

Integration logic is handled on-platform, consuming Apex CPU and Governor limits.

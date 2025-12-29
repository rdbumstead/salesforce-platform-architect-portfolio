# ADR-003: Apex REST vs. External Service

## Status

Accepted

## Context

Need for a System API layer without incurring external hosting or middleware licensing costs.

## Decision

Implement Native Apex REST endpoints.

## Rationale

Simulates enterprise middleware patterns while operating entirely within the Salesforce Developer Edition budget.

## Implications

Integration logic is handled on-platform, consuming Apex CPU and Governor limits.

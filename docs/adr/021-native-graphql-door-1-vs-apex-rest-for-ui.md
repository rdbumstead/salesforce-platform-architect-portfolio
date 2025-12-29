# ADR-021: Native GraphQL (Door 1) vs. Apex REST for UI

## Status

Accepted

## Context

LWR components require efficient, multi-object data fetching without multiple REST round-trips.

## Decision

Utilize native Salesforce GraphQL (lightning/uiGraphQLApi) for core frontend orchestration.

## Rationale

Provides automatic caching via Lightning Data Service (LDS) and reduces payload size by fetching only essential fields.

## Implications

Requires components to be built with wire adapters.

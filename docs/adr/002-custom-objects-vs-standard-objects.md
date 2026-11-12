# ADR-002: Custom Objects vs. Standard Objects

## Status

- **Decision:** Accepted
- **Build:** [Live](../../packages/portfolio-site/main/default/objects/Project__c), also [Experience\_\_c](../../packages/portfolio-site/main/default/objects/Experience__c)

## Context

Salesforce Guest User security policies heavily restrict access to standard objects like Contact or Case.

## Decision

Utilize Custom Objects (e.g., Project\_\_c) for core portfolio data.

## Rationale

Custom objects allow for granular CRUD and Field-Level Security (FLS) control specifically for public guest access.

## Implications

Requires a custom data model to mirror necessary standard object functionality.

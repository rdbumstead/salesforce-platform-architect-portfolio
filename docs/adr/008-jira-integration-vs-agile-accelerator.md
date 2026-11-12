# ADR-008: Jira Integration vs. Agile Accelerator

## Status

- **Decision:** Accepted
- **Build:** [Live](../../packages/portfolio-site/main/default/classes/JiraService.cls), also [JiraCacheRefreshJobTest](../../packages/portfolio-site/main/default/classes/JiraCacheRefreshJobTest.cls)

## Context

Need to demonstrate proficiency with industry-standard ALM tools.

## Decision

Establish a Direct Jira REST Integration for roadmap visualization.

## Rationale

Proves the ability to handle external authentication (Named Credentials) and complex JSON orchestration.

## Implications

Requires a circuit breaker to handle Jira API service outages.

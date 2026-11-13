# ADR-001: Experience Cloud (LWR) vs. Aura

## Status

- **Decision:** Superseded in part by [ADR-041](041-headless-static-front-end-on-cloudflare-pages.md), for the public front end only, since the cutover on 2026-11-09. Still Accepted for the API site and the org.
- **Build:** [Live](../../packages/portfolio-site/main/default/digitalExperiences)

Accepted. For the public front end, [ADR-041](041-headless-static-front-end-on-cloudflare-pages.md) superseded it at the cutover on 2026-11-09. The Experience Cloud site stays up until 2026-11-23 as the rollback target, and the API site and the org stay on Experience Cloud.

## Context

Public-facing portfolio site requires high performance to minimize bounce rates.

## Decision

Utilize the Lightning Web Runtime (LWR) framework.

## Rationale

Sub-second page loads are essential; the performance overhead of the Aura framework is unacceptable for this use case.

## Implications

Restricted to Lightning Web Components (LWC) and modern web standards.

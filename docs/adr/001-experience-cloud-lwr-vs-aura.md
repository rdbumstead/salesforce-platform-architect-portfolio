# ADR-001: Experience Cloud (LWR) vs. Aura

## Status

Accepted. For the public front end, [ADR-041](041-headless-static-front-end-on-cloudflare-pages.md) supersedes it at cutover (noted 2026-11-02). Until then the Experience Cloud site is still the live front end, and the API site and the org stay on Experience Cloud.

## Context

Public-facing portfolio site requires high performance to minimize bounce rates.

## Decision

Utilize the Lightning Web Runtime (LWR) framework.

## Rationale

Sub-second page loads are essential; the performance overhead of the Aura framework is unacceptable for this use case.

## Implications

Restricted to Lightning Web Components (LWC) and modern web standards.

# ADR-020: Mobile Performance – Static SVG Fallback Strategy

## Status

Accepted

## Context

The animated AntV G6 skill graph violates performance budgets (LCP < 2.5s) on low-power mobile devices.

## Decision

Implement a Static SVG Fallback for small viewports.

## Rationale

Prevents heavy canvas rendering on mobile, ensuring the site passes Lighthouse performance audits on 4G networks.

## Implications

Requires FORM_FACTOR detection in the c-skill-network LWC.

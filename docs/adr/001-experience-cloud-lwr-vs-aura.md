# ADR-001: Experience Cloud (LWR) vs. Aura

## Status

Accepted

## Context

Public-facing portfolio site requires high performance to minimize bounce rates.

## Decision

Utilize the Lightning Web Runtime (LWR) framework.

## Rationale

Sub-second page loads are essential; the performance overhead of the Aura framework is unacceptable for this use case.

## Implications

Restricted to Lightning Web Components (LWC) and modern web standards.

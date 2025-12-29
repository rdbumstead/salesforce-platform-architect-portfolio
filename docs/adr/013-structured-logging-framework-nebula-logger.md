# ADR-013: Structured Logging Framework (Nebula Logger)

## Status

Accepted

## Context

Requirement for persistent logs even during Apex transaction rollbacks.

## Decision

Adopt the Nebula Logger open-source framework.

## Rationale

Uses Platform Events for decoupled log persistence and provides a unified adapter for LWC and Apex.

## Implications

Requires a strict 2-day retention policy to manage storage limits in Developer Edition.

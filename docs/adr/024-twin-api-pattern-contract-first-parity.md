# ADR-024: Twin API Pattern – Contract-First Parity

## Status

Accepted

## Context

To prove enterprise maturity, the Salesforce implementation must match the MuleSoft design artifacts.

## Decision

Enforce the Twin API Pattern using OpenAPI 3.0 as the source of truth.

## Rationale

Ensures the Apex implementation (SAPI) and MuleSoft proxy remain interchangeable, demonstrating "API-Led Connectivity".

## Implications

Schema changes require a corresponding YAML update before implementation.

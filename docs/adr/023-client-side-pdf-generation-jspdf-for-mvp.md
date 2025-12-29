# ADR-023: Client-Side PDF Generation (jsPDF) for MVP

## Status

Accepted (Transitionary)

## Context

The Resume Builder requires PDF export, but server-side generation is deferred to Phase 8.

## Decision

Utilize jsPDF (Client-Side) via Static Resource for the MVP.

## Rationale

Enables functional PDF generation without middleware costs or early Lambda complexity.

## Implications

Output fidelity may vary across browsers; must migrate to serverless Node.js in Phase 8.

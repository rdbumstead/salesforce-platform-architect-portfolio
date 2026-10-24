# ADR-024: Twin API Pattern – Contract-First Parity

## Status

Accepted, amended 2026-10-23 (see the amendment below): the MuleSoft parity rationale is gone. Contract first stays.

## Context

To prove enterprise maturity, the Salesforce implementation must match the MuleSoft design artifacts.

## Decision

Enforce the Twin API Pattern using OpenAPI 3.0 as the source of truth.

## Rationale

Ensures the Apex implementation (SAPI) and MuleSoft proxy remain interchangeable, demonstrating "API-Led Connectivity".

## Implications

Schema changes require a corresponding YAML update before implementation.

## Amendment (2026-10-23): the MuleSoft twin is gone

**The MuleSoft twin no longer exists.** The Anypoint trial ended, its live deployment expired, and the Anypoint Studio project was removed from the repository on 2026-10-20 (SAS Appendix C). Authentication moved on platform with [ADR-027](027-platform-native-api-authentication.md). So the rationale above, keeping Apex and a MuleSoft proxy interchangeable, no longer applies: the Apex REST classes are the only runtime.

**What the decision still means.** The OpenAPI 3.0 files in `packages/integration-api/specs/` remain the contract for the Apex SAPI and PAPI. A change to a path, parameter or schema is made in the YAML first, then in Apex. The same files feed the rendered docs in `docs/api/oas/` (`npm run docs:api`, checked in CI by `npm run docs:verify`) and `scripts/api-smoke.sh`, which calls every GET path in both files. The site's API reference page reads identical copies in the `SAPI_Spec` and `PAPI_Spec` static resources. "Twin" now names the two API layers described by one pair of contracts, the System API and the Process API, not two runtimes.

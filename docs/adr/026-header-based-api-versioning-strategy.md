# ADR-026: Header-Based API Versioning Strategy

## Status

Accepted

## Context

The API contract will evolve (v1.1, v1.2) and requires a strategy to manage breaking changes without disrupting existing consumers.

## Decision

Utilize the `X-API-Version` header (e.g., `X-API-Version: 1.2`) rather than URL path versioning (e.g., `/v1/profile`).

## Rationale

Decouples the **Resource Identity** (URL) from the **Representation Version** (Schema). Allows for cleaner URLs and easier routing logic in the future AWS Lambda layer (Door 2).

## Implications

Clients must be configured to send this header; default behavior (missing header) will resolve to the latest stable version.

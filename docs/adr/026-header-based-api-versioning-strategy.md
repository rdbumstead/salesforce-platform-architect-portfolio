# ADR-026: Header-Based API Versioning Strategy

## Status

Accepted. Amended 2026-10-01 (see below).

## Context

The API contract will evolve (v1.1, v1.2) and requires a strategy to manage breaking changes without disrupting existing consumers.

## Decision

Utilize the `X-API-Version` header (e.g., `X-API-Version: 1.2`) rather than URL path versioning (e.g., `/v1/profile`).

## Rationale

Decouples the **Resource Identity** (URL) from the **Representation Version** (Schema). Allows for cleaner URLs and easier routing logic in the future AWS Lambda layer (Door 2).

## Implications

Clients must be configured to send this header; default behavior (missing header) will resolve to the latest stable version.

## Amendment (2026-10-01)

As implemented in January 2026 the services only _emitted_ `X-API-Version`; they never read it from the request, so the strategy was described but not enforced. From the API foundation work onward ([ADR-027](027-platform-native-api-authentication.md)) the shared `ApiRequestContext` reads `X-API-Version` and `X-Request-Id` on every request. A missing or malformed `X-Request-Id` returns `400`; a missing `X-API-Version` resolves to the latest stable version as stated above; an unsupported version returns `406`. Both headers are echoed on every response.

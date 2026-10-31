# ADR-026: Header-Based API Versioning Strategy

## Status

Accepted. Amended 2026-10-01; header rules corrected to the implementation 2026-10-20 and 2026-10-21 (see below).

## Context

The API contract will evolve (v1.1, v1.2) and requires a strategy to manage breaking changes without disrupting existing consumers.

## Decision

Utilize the `X-API-Version` header (e.g., `X-API-Version: 1.2`) rather than URL path versioning (e.g., `/v1/profile`).

## Rationale

Decouples the **Resource Identity** (URL) from the **Representation Version** (Schema). Allows for cleaner URLs and easier routing logic in the future AWS Lambda layer (Door 2).

## Implications

Clients must be configured to send this header; default behavior (missing header) will resolve to the latest stable version.

## Amendment (2026-10-01)

As implemented in January 2026 the services only _emitted_ `X-API-Version`; they never read it from the request, so the strategy was described but not enforced. From the API foundation work onward ([ADR-027](027-platform-native-api-authentication.md)) the shared `ApiRequestContext` reads `X-API-Version` and `X-Request-Id` on every request. On `/sapi/` paths a missing or non-UUID `X-Request-Id` returns `400 BAD_REQUEST`. On `/papi/` paths a missing `X-Request-Id` is replaced by a generated UUID and a present but non-UUID value returns `400`. A missing `X-API-Version` resolves to `v1`; any other value returns `400 BAD_REQUEST` with message `Unsupported X-API-Version` (the Error enum has no code for 406). Both headers are echoed on every response.

Source: `ApiRequestContext.applyRequestRules`, which every SAPI and PAPI REST class calls through `ApiRequestContext.begin()`.

## Amendment (2026-10-21)

The platform echoes a caller-supplied `X-Request-Id` on every response, including responses it generates before Apex runs, such as a 401. Apex therefore sets `X-Request-Id` only when it generated the value: on `/papi/` when the caller sent none, and on either API when the supplied value is not a UUID (the 400 response then carries a generated UUID in `correlationId`). A valid caller value is never set again by Apex, which would duplicate it (`id;id`). `correlationId` in error bodies always equals the id the caller sees.

Source: `ApiRequestContext.applyRequestRules`. The echo was observed on My Domain responses (a 401 from production and a 401 from a scratch org) and, once, on the site domain in an integration scratch org (guest requests, including an Apex 503). With no `X-Request-Id`, the platform returns its own 32-character hex id on responses it generates before Apex runs. Whether an authenticated PAPI response to a request without an id carries one id or two (the platform's and the UUID Apex generates) is unverified until the live smoke.

## Amendment (2026-10-31)

The URLs still carried a `/v1/` segment from before the header was read, so the decision above was only half carried out. [ADR-040](040-versionless-api-urls.md) removes the segment. The API is called at versionless URLs, the old `/v1/` URLs stay as aliases until a date I set, and the `X-API-Version` header is the only version switch.

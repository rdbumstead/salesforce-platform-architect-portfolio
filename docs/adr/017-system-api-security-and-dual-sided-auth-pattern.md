# ADR-017: System API Security & Dual-Sided Auth Pattern

## Status

Superseded by [ADR-027](027-platform-native-api-authentication.md) on 2026-10-01. The custom-metadata header validation described below was a stand-in for a MuleSoft policy enforcement point; with MuleSoft removed from the architecture, authentication moved to platform-native OAuth 2.0 (External Client App + Named Credential). The read-only constraint is carried forward unchanged. Amended 2026-10-20 (see below).

## Context

The architecture requires secure, stateless authentication between the Process Layer (PAPI) and System Layer (SAPI), mirroring an enterprise Mutual TLS or Client Credential flow.

## Decision

Implement a **Dual-Sided Client Credential** pattern using explicit header validation.

## Rationale

Establishes a clear separation of concerns between the "Consumer" (PAPI) and the "Provider" (SAPI), allowing for independent credential rotation and policy enforcement.

## Implications

- **Outbound (PAPI Layer):** The orchestration layer (simulated on AWS/MuleSoft) acts as the secure client. It retrieves the `client_id` and `client_secret` from a **Secure Vault** (e.g., AWS Secrets Manager) to sign the outbound request.
- **Inbound (SAPI Layer):** The Salesforce runtime acts as the API Gateway. It validates the incoming headers against `Portfolio_Config__mdt` (Custom Metadata) to simulate an API Policy enforcement point.
- **Constraints:** Write access is strictly prohibited; non-GET methods return 405 Method Not Allowed.

## Amendment (2026-10-20)

Nothing described above is in force. Inbound authentication is the **Portfolio API** External Client App (Client Credentials flow, run as the integration user); outbound calls use the `Portfolio_API_Auth` External Credential and the `Portfolio_API` Named Credential ([ADR-027](027-platform-native-api-authentication.md)). No custom metadata takes part in authentication: `Portfolio_Config__mdt` holds no credential fields, and no Apex class reads a `client_id` or `client_secret` header.

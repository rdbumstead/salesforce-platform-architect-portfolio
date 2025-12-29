# ADR-017: System API Security & Dual-Sided Auth Pattern

## Status

Accepted

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

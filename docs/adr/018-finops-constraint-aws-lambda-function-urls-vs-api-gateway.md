# ADR-018: FinOps Constraint – AWS Lambda Function URLs vs. API Gateway

## Status

Deferred (2026-10-23), like [ADR-016](016-cloudflare-worker-as-edge-ai-proxy.md). Originally Accepted. No AWS code exists in the repository and no Lambda function serves the portfolio. The decision stands as the Phase 8 design and takes effect only if Phase 8 is built.

## Context

Phase 8 requires an external polyglot gateway while maintaining a "$0.00 forever" guarantee.

## Decision

Utilize AWS Lambda Function URLs instead of Amazon API Gateway.

## Rationale

Standard AWS API Gateway free tiers expire after 12 months, whereas Function URLs are a permanent feature of the Lambda service.

## Implications

Requires moving security logic (API Key validation, rate limiting) inside the Lambda function code.

# ADR-018: FinOps Constraint – AWS Lambda Function URLs vs. API Gateway

## Status

Accepted

## Context

Phase 8 requires an external polyglot gateway while maintaining a "$0.00 forever" guarantee.

## Decision

Utilize AWS Lambda Function URLs instead of Amazon API Gateway.

## Rationale

Standard AWS API Gateway free tiers expire after 12 months, whereas Function URLs are a permanent feature of the Lambda service.

## Implications

Requires moving security logic (API Key validation, rate limiting) inside the Lambda function code.

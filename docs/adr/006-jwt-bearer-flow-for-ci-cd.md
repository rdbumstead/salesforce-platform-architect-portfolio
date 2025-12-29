# ADR-006: JWT Bearer Flow for CI/CD

## Status

Accepted

## Context

Requirement for a headless, automated deployment pipeline.

## Decision

Implement JWT Bearer Flow authentication for GitHub Actions.

## Rationale

Enables zero-touch, secure deployment without requiring manual credential rotation or login prompts.

## Implications

Requires a 4096-bit RSA certificate and a strictly managed Connected App.

# ADR-007: GitHub API Server-Side Caching

## Status

Accepted

## Context

GitHub unauthenticated API limits (60 req/hr) are insufficient for public traffic.

## Decision

Implement Apex-based caching via Scheduled Jobs and Custom Metadata.

## Rationale

Prevents site failure by serving a GitHub_Cache\_\_c record when API limits are exhausted.

## Implications

Commits may appear with a "Last Updated" delay of up to 15 minutes.

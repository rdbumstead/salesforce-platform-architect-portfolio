# ADR-013: Structured Logging Framework (Nebula Logger)

## Status

Accepted. Amended 2026-10-21 for Round 4 (see below).

## Context

Requirement for persistent logs even during Apex transaction rollbacks.

## Decision

Adopt the Nebula Logger open-source framework.

## Rationale

Uses Platform Events for decoupled log persistence and provides a unified adapter for LWC and Apex.

## Implications

Requires a strict 2-day retention policy to manage storage limits in Developer Edition.

## Amendment (2026-10-21, Round 4)

**Nebula Logger is an optional dependency the owner installs, reached through a seam** (owner decision, 2026-10-21).

- The owner installs Nebula Logger's unlocked, no-namespace package in production by hand. It is not in source, CI and scratch orgs run without it, and no source file names a Nebula type.
- `PortfolioLog` is the seam. It looks up Nebula's `System.Callable` entry point, `CallableLogger`, at run time with `Type.forName` (with or without the `Nebula` namespace) and sends each line through its `newEntry` action with the tag `portfolio`. When Nebula is absent, or the call fails, the line goes to `System.debug`, and a logging failure never reaches the caller.
- Every API request writes one line, `api request path=<path> status=<status> correlationId=<id> elapsedMs=<ms>`, through `RequestUtil.logRequest`, after the response is written (`ApiRequestContext`). The path loses its query string, and no body, header value or token is logged. The site cover letter writes the same line with the path `aura:ApiLabController.generateCoverLetter`.
- Retention stays 2 days, as the owner's setting in Nebula once it is installed.

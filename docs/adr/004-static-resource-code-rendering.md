# ADR-004: Static Resource Code Rendering

## Status

Accepted

## Context

Requirement to display raw source code without triggering GitHub API rate limits.

## Decision

Perform client-side fetches of code stored in Static Resources.

## Rationale

Decouples code visualization from external API availability and prevents 429 errors during high traffic.

## Implications

Code snippets must be packaged and deployed as part of the Salesforce metadata.

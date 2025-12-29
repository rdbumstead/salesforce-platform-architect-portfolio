# ADR-009: Granular Resume Data Model

## Status

Accepted

## Context

The site must generate tailored content for different professional personas (e.g., Admin vs. Architect).

## Decision

Utilize a Master-Detail relationship (Experience**c → Experience_Highlight**c).

## Rationale

Enables persona-based filtering of granular bullet points rather than static text blocks.

## Implications

Requires parent-child query logic to assemble the final resume payload.

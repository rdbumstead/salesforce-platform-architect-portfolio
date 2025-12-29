# ADR-016: Cloudflare Worker as Edge AI Proxy

## Status

Deferred to V2.0

## Context

Opportunity to further enhance resilience and reduce API costs via multi-cloud edge capabilities.

## Decision

Utilize a Cloudflare Worker to proxy Gemini requests and provide an edge caching layer.

## Rationale

Shields Salesforce from external API rate limits and decreases total latency while documenting a path to advanced multi-cloud scaling.

## Implications

Avoids scope creep for the initial MVP launch while establishing a Phase 8 architectural baseline.

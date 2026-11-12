# ADR-016: Cloudflare Worker as Edge AI Proxy

## Status

- **Decision:** Deferred (V2.0).
- **Build:** Designed. No Cloudflare Worker AI proxy runs.

## Context

Opportunity to further enhance resilience and reduce API costs via multi-cloud edge capabilities.

## Decision

Utilize a Cloudflare Worker to proxy Gemini requests and provide an edge caching layer.

## Rationale

Shields Salesforce from external API rate limits and decreases total latency while documenting a path to advanced multi-cloud scaling.

## Implications

Avoids scope creep for the initial MVP launch while establishing a Phase 8 architectural baseline.

## Amendment (2026-11-02): an edge layer now exists, and it is not this one

This ADR is still deferred. Its edge AI proxy is Designed only. [ADR-041](041-headless-static-front-end-on-cloudflare-pages.md) added a different edge layer, Cloudflare Pages Functions that carry the static site's request time features to Salesforce server side. It is a site actions layer. It forwards the contact form, the testimonial form, the cover letter, the API Lab and a few live readings to Apex REST with a client credentials token. It does not call Gemini, it does not cache a generated letter, and it sits in front of the same Agentforce then Gemini then template chain that this ADR left in Apex. If the AI proxy is ever built, it would be a new function beside those, and this ADR would be revisited.

# ADR-011: Context Grounding Strategy (Direct CRM vs. Data 360)

## Status

Accepted

## Context

Need for a Retrieval-Augmented Generation (RAG) source for Agentforce that avoids tight coupling with transactional data.

## Decision

Utilize Data 360 as the Trusted Context Layer.

## Rationale

Establishes separation of concerns and supports hybrid search (Vector + Semantic) across structured and unstructured data.

## Implications

Requires a provisioned Data 360 instance and manual configuration of data streams.

# ADR-011: Context Grounding Strategy (Direct CRM vs. Data 360)

## Status

Deferred (2026-10-22, see the amendment below). Originally Accepted.

## Context

Need for a Retrieval-Augmented Generation (RAG) source for Agentforce that avoids tight coupling with transactional data.

## Decision

Utilize Data 360 as the Trusted Context Layer.

## Rationale

Establishes separation of concerns and supports hybrid search (Vector + Semantic) across structured and unstructured data.

## Implications

Requires a provisioned Data 360 instance and manual configuration of data streams.

## Amendment (2026-10-22): deferred

I deferred this decision on 2026-10-22 (in the Pillar D design). The decision above is the target design. None of it is built, and nothing in the site or the API reads Data 360.

**What is built.** Grounding stays in Apex and reads the CRM directly. `PortfolioGroundingService.build(jobTitle, jobDescription)` selects featured `Project__c` rows and `Experience_Highlight__c` text through a `without sharing` selector with a fixed field list, ranks them by keywords from the job title and description, strips anything shaped like an email address or phone number, and returns at most 8,000 characters of JSON for the prompt. The cover letter page (`ApiLabController`) and `/papi/v1/ai/generate` (`PAPIAiGenerate`) both reach it through `ContentGenerationController.groundingSection` (SAS section 5.4.1).

**What exists in Data 360.** The production org has 14 data streams in the `default` data space, one per portfolio object, fed by the CRM connector. It has no search index and no retriever. Checked read-only on 2026-10-22: `SELECT COUNT() FROM DataStream` returns 14 and `SELECT COUNT() FROM DataSemanticSearch` returns 0.

**Why it is deferred.**

- Agentforce is deferred (decision 2026-10-02), so there is no Agentforce provider for a Data 360 retriever to ground.
- The data set is small: a handful of projects and about ten roles. Keyword ranking in Apex finds the same records an index would, so an index would not improve the letter.
- Index builds and queries are metered, and a Developer Edition caps Data 360 at 1,000 queries a day. Whether the edition carries any credit allowance is not documented.

**What would reopen it.** A real Agentforce provider (deferred, see [ADR-015](015-strategy-pattern-for-generative-ai.md)) and a reason to search text that keyword ranking cannot reach. Until then no document in this repository claims Data 360 grounding.

## Amendment (2026-10-26): the Agentforce provider now exists

The first reason above no longer holds. Agentforce is built as a Prompt Builder template and ships on ([ADR-015 amendment of 2026-10-26](015-strategy-pattern-for-generative-ai.md#amendment-2026-10-26-agentforce-is-built-and-the-deferral-is-lifted)). Data 360 grounding stays deferred for the other two reasons: the data set is small, and index builds and queries are metered. What would reopen it is now a reason to search text that keyword ranking cannot reach, and nothing else.

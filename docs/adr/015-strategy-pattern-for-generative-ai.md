# ADR-015: Strategy Pattern for Generative AI

## Status

Accepted. Amended 2026-10-20, and three times on 2026-10-21 (see below).

## Context

Agentforce in Developer Edition environments is prone to cold-start timeouts and transactional limits.

## Decision

Implement the Strategy Pattern via the IAIGenerationService Apex interface.

## Rationale

Decouples the UI from the AI provider, allowing seamless failover between Agentforce, Gemini, and Local Templates to ensure zero user "dead ends".

## Implications

Requires maintaining standardized response wrappers across AgentforceService, GeminiService, and LocalTemplateService.

## Amendment (2026-10-20)

**Agentforce is deferred.** `AgentforceService` is a mock: `AgentforceService.generateContent` returns the fixed string `Agentforce response for: <prompt>` and `isAvailable` always returns true. No Agentforce agent, topic or Models API call is built in source, and none is built while the deferral stands. No document may present Agentforce as the primary ("Gold") path, because the only thing that path can return is the mock's string. The Strategy Pattern and the `IAIGenerationService` interface stand; the providers that can serve real content are Gemini (`GeminiService`) and the deterministic Local Template (`LocalTemplateService`).

## Amendment (2026-10-21)

**Two dispatch paths now exist.**

- `ContentGenerationController.generateCoverLetter` (the `@AuraEnabled` entry point for the site's cover-letter page) keeps its original chain, Agentforce first, by decision (2026-10-20). Because `AgentforceService.isAvailable` always returns true and `AgentforceService.generateContent` returns the mock string, this method always returns `Agentforce response for: <prompt>`; Gemini and the Local Template are never reached from it. No document may present that page as live AI content until Agentforce is built.
- `ContentGenerationController.generateWithoutAgentforce`, used by `PAPIAiGenerate.generate` (`POST /papi/v1/ai/generate`), tries Gemini and then, for cover letters only, the Local Template. It never consults Agentforce. It is the path that reaches a real model.

**Model.** `GeminiService.MODEL` is `gemma-4-31b-it` (Gemma 4 31B through the Gemini API, `Gemini_API` Named Credential; decision 2026-10-20). `gemini-2.0-flash`, the model before, was shut down by Google on 2026-06-01. The key's free tier allows Gemma 4 31B 30 requests per minute, 16,000 tokens per minute and 14,400 requests per day. `GeminiService.generateContent` reports a failure as text starting `Error: Unable to generate content.` or `Exception: ` instead of throwing; `generateWithoutAgentforce` treats such text as a failed attempt.

## Amendment (2026-10-21): one dispatch and the provider switch

**One dispatch replaces both paths.** This supersedes the two-path description in the amendment above.

- `ContentGenerationController.dispatch` is the only provider chain. It tries Agentforce, then Gemini, then the Local Template (cover letters only), and records every attempt with its outcome (`served`, `skipped_off`, `failed`) and elapsed time.
- **Agentforce is a switch, and the switch is off.** `AgentforceService.isAvailable` reads the `Agentforce` record of the new `AI_Provider_Config__mdt`, which ships with `Enabled__c` false. It is also false when no record exists and for a site guest. Agentforce itself is still not implemented: `AgentforceService.generateContent` throws. So even with the switch on, the dispatch records a failed attempt and Gemini serves. No response names Agentforce unless a real Agentforce call wrote the content.
- **Gemini** is Gemma 4 31B (`gemma-4-31b-it`) through the Gemini API, with a 60 second callout timeout read from the `Gemini` record (owner decision 2026-10-21, replacing the 20 seconds first planned). Gemma 4 always reasons before it answers, and the owner measured 28.7 seconds for a trivial prompt, so a cover letter can take up to about a minute.
- **Local Template** serves cover letters when Gemini fails. Other content types answer 503 `ALL_PROVIDERS_UNAVAILABLE`.
- `PAPIAiGenerate` (`POST /papi/v1/ai/generate`) calls the dispatch, and its response adds `latencyMs`, `attempts` and `promptShown`.
- **The cover letter page proxies through the API.** `coverLetterGenerator` calls `ApiLabController.generateCoverLetter`, which posts to `/papi/v1/ai/generate` through the `Portfolio_API` Named Credential with a 90 second timeout, longer than the Gemini timeout plus the API overhead, so a slow model falls through to the Local Template inside the API instead of the page call failing first. The letter is written by the integration user under the API's validation and its 10 per minute `ai` rate tier, and the site guest needs no AI grant. `generateWithoutAgentforce` is removed, and `generateCoverLetter` on the controller now returns the same result object as the dispatch.
- **Grounding.** A cover letter prompt carries featured projects and experience highlights from `PortfolioGroundingService`, chosen by keywords from the job. It never includes an email address, a phone number or an owner field, and stays under 8,000 characters.
- **Show your work.** The page shows the provider and model on a badge read from the response, and a panel the visitor opens to see the fallback flag, latency, the attempts and the prompt that was sent.
- The metal names for the providers are dropped. The order is first, second and last resort.

## Amendment (2026-10-21): the site cover letter dispatches in process

**The site cover letter dispatches in process.** This supersedes the "cover letter page proxies through the API" bullet of the amendment above, for the page only (owner decision, 2026-10-21).

- **Why.** The page as first built reached Gemini by calling the org's own `/papi/v1/ai/generate` through the `Portfolio_API` Named Credential. A request that arrives as a callout from the same org may not call out again, so `GeminiService` failed at once with `System.CalloutException: Callout loop not allowed` and every live letter came from the Local Template. Apex tests mocked both callouts, so they could not see it.
- **What changed.** `ApiLabController.generateCoverLetter` keeps its signature and its `CoverLetterResult`, drops the `Portfolio_API` callout, and calls `ContentGenerationController.dispatch` in process, as the site guest. One callout leaves the org (to Gemini), so there is no loop.
- **The guest's grant.** `Portfolio_Guest` gains the `Gemini_Auth-Gemini_Principal` principal and nothing else for this. Agentforce is never consulted for a guest (`AgentforceService.isAvailable` is false for a site guest).
- **The limit still applies.** Before the dispatch the page path checks the key `papi-ai:site-cover-letter` (`ApiLabController.AI_RATE_KEY`) with `ApiRequestContext.rateLimiter().checkKey` at the AI tier's 10 requests a minute, and writes the count after the dispatch with `ApiRequestContext.commitRateCounts()`, never before the Gemini callout. It is one bucket shared by every site visitor, separate from the API's session keys. It carries the `papi-ai` prefix that `/papi/v1/ai/` uses, so the footer's "AI requests today" counts both paths.
- **Grounding as the guest.** The guest sees only rows shared to it, so the page's grounding reads featured projects and experience highlights through a `without sharing` selector that returns a fixed shape with no email, phone or owner field.
- **`/papi/v1/ai/generate` stays** for outside callers with a Bearer token, unchanged.

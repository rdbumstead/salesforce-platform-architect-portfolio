# ADR-015: Strategy Pattern for Generative AI

## Status

Accepted. Amended 2026-10-20, three times on 2026-10-21, and twice on 2026-10-26 (see below). The deferral of Agentforce was lifted on 2026-10-26.

## Context

Agentforce in Developer Edition environments has transactional limits and a call cap of 150 LLM generations an hour. It was first judged prone to cold-start timeouts. That was measured on 2026-10-26 and 27 in a scratch org: a cover letter called directly took 2.7 to 3.5 seconds (333 to 340 words), and the first call through the API after a quiet period took 13.7 seconds, then 2.9 to 3.2 seconds. Production is not measured yet.

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

**Model.** `GeminiService.MODEL` is `gemma-4-31b-it`, the code default used only when the `Gemini` record names no model (Gemma 4 31B through the Gemini API, `Gemini_API` Named Credential, decision of 2026-10-20). The model in use is set on the `Gemini` record, `gemini-2.5-flash` since 2026-10-26 (see the amendment below). `gemini-2.0-flash`, the model before, was shut down by Google on 2026-06-01. The key's free tier allowed Gemma 4 31B 30 requests per minute, 16,000 tokens per minute and 14,400 requests per day when read on 2026-10-20. `GeminiService.generateContent` reports a failure as text starting `Error: Unable to generate content.` or `Exception: ` instead of throwing, and `generateWithoutAgentforce` treats such text as a failed attempt.

## Amendment (2026-10-21): one dispatch and the provider switch

**One dispatch replaces both paths.** This supersedes the two-path description in the amendment above.

- `ContentGenerationController.dispatch` is the only provider chain. It tries Agentforce, then Gemini, then the Local Template (cover letters only), and records every attempt with its outcome (`served`, `skipped_off`, `failed`) and elapsed time.
- **Agentforce is a switch, and the switch is off.** `AgentforceService.isAvailable` reads the `Agentforce` record of the new `AI_Provider_Config__mdt`, which ships with `Enabled__c` false. It is also false when no record exists and for a site guest. Agentforce itself is still not implemented: `AgentforceService.generateContent` throws. So even with the switch on, the dispatch records a failed attempt and Gemini serves. No response names Agentforce unless a real Agentforce call wrote the content.
- **Gemini** is `gemini-2.5-flash` through the Gemini API (the model on the `Gemini` record, see the amendment of 2026-10-26), with a 60 second callout timeout read from the `Gemini` record (owner decision 2026-10-21, replacing the 20 seconds first planned). The first choice, Gemma 4 31B (`gemma-4-31b-it`), always reasons before it answers, and the owner measured 28.7 seconds for a trivial prompt.
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

## Amendment (2026-10-26): the model on the Gemini record is gemini-2.5-flash

The `Gemini` record of `AI_Provider_Config__mdt` now names `gemini-2.5-flash`. Gemma 4 31B did not answer a full cover letter prompt within the 60 second callout timeout, so every live letter fell back to the local template. Gemini 2.5 Flash answered one grounded letter in about 11 seconds in a scratch org. `GeminiService.MODEL` stays `gemma-4-31b-it` as the code default, used only when the record names no model, and the badge and the "Show your work" panel report whichever model answered.

The key's free tier allowed Gemini 2.5 Flash 5 requests per minute and 20 requests per day when it was read from the AI Studio rate limit page on 2026-10-20. That is a recorded reading, not a live one, and the template serves a cover letter once Google refuses. In the same scratch org test the second Flash call was refused with HTTP 503 and the template served. A live letter is therefore a best effort, and the template is the guaranteed answer.

## Amendment (2026-10-26): Agentforce is built and the deferral is lifted

This supersedes the 2026-10-20 deferral and the "switch ships off" description in the 2026-10-21 amendments.

- **What runs.** `AgentforceService` runs the Prompt Builder template `Portfolio_Cover_Letter` through `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate`, behind the `PromptTemplateClient` interface (the real client is `EinsteinPromptTemplateClient`, with the application name `PromptTemplateGenerationsInvocable`, without which the call fails). The platform documents no test hook for this API, so the interface exists to take a stub. The template has one input, `Input:Prompt` (`primitive://String`), and its content is `{!$Input:Prompt}` plus one line that holds the letter to the word range the prompt asks for. Its model is `sfdc_ai__DefaultGPT41`. The prompt the dispatch builds is the prompt the model reads.
- **The switch ships on.** The `Agentforce` record of `AI_Provider_Config__mdt` has `Enabled__c` true, `Timeout_Ms__c` 20000 and `Model_Or_Template__c` `Portfolio_Cover_Letter`. `AgentforceService.isAvailable` is still false for a site guest, because a guest may not run generative AI.
- **How a visitor's letter reaches it.** The AI Lab runs as the site guest. `ApiLabController.generateCoverLetter` first posts to `/papi/v1/ai/generate` with `provider` set to `Agentforce` through the `Portfolio_API` Named Credential, so the template runs as the integration user. A 200 is the letter. Anything else runs the dispatch in process from Gemini on, then the template, with the Agentforce attempt first in the attempts list. Gemini is never asked through the API, for the callout loop reason in the amendment of 2026-10-21. Connect worked inside a request that arrived as a same org callout in a scratch org (a Remote Site Setting stood in for the Named Credential, so the production proof call settles that exact path).
- **The worst case fits.** Apex allows 120 seconds of callouts in a transaction. The Agentforce timeout is the record's 20 seconds, capped to what Gemini's timeout leaves of the 120 seconds less a 2 second margin (`ApiLabController.CALLOUT_BUDGET_MS`).
- **A budget under the cap.** Agentforce is held to `Hourly_Budget__c` (120) calls per UTC hour, under the Developer Edition's 150. The count is one `API_Rate_Window__c` row per hour, key `agentforce-hour|yyyyMMddHH`, read before the template runs. Past it the attempt is `budget_exhausted` and the chain moves on. The read takes no lock, so calls in flight together can pass the budget by a few, inside the 30 left under 150.
- **The breaker.** A 429 or an answer from the limiter never counts as a breaker failure, and neither does a 401. Only no answer, or a 200 with no letter, does.
- **The last fallback is a real letter.** `LocalTemplateService` builds the letter in Apex from the records with no model: company and role, the current title, years on Salesforce, current certifications and up to three ranked highlights or projects. Its last line says no model wrote it.
- **A Published template cannot be changed by deploy.** A deploy that changes one reports Succeeded and changes nothing. A later wording change is a new version made in Prompt Builder.
- **API.** `POST /papi/v1/ai/generate` accepts `provider` with the one value `Agentforce`. With it only Agentforce is tried, and a failure is 503 `ALL_PROVIDERS_UNAVAILABLE`. The attempts outcome gains `skipped_open_circuit` and `budget_exhausted`.
- **Measured.** In a scratch org on 2026-10-26 and 27, three cover letters called directly took 2.7 to 3.5 seconds and came back at 333 to 340 words. Production is not measured yet and is the owner's proof call after the merge.

## Amendment (2026-10-27): the production proof call, and the letter length

This answers the "Measured" line of the amendment of 2026-10-26. The rest of that amendment stands.

- **Production proof call.** On 2026-10-27, after the deploy, one letter was requested on the live AI Lab as a site guest. It was written by Agentforce (`Portfolio_Cover_Letter`) in 418 words, 10 seconds from page load to letter, grounded on the real records, with no client name, email or phone. The route through the `Portfolio_API` Named Credential as the integration user works end to end. A second walk of the live journey the same day wrote two letters of 439 and 398 words.
- **The length.** Those letters ran over `Cover_Letter_Max_Words` (350), because production's records are fuller than a scratch org's. The Published template adds its own sentence for a `Length` line (write toward the upper number, in three body paragraphs of five sentences), which pushed letters past the maximum. The prompt's length line is now a word limit line that does not start with "Length", states 350 as a hard maximum and fixes a five paragraph shape, so the template needs no new version.
- **Measured after the change.** In a scratch org loaded with production's grounding records, six letters in a row came back at 277 to 322 words (nine Agentforce calls, 2026-10-27). Production lengths after the deploy that carries the line are not measured yet.

# ADR-015: Strategy Pattern for Generative AI

## Status

Accepted. Amended 2026-10-20 and 2026-10-21 (see below).

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

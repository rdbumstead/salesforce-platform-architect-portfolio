# ADR-015: Strategy Pattern for Generative AI

## Status

Accepted. Amended 2026-10-20 (see below).

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

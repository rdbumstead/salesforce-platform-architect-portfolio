# ADR-015: Strategy Pattern for Generative AI

## Status

Accepted

## Context

Agentforce in Developer Edition environments is prone to cold-start timeouts and transactional limits.

## Decision

Implement the Strategy Pattern via the IAIGenerationService Apex interface.

## Rationale

Decouples the UI from the AI provider, allowing seamless failover between Agentforce, Gemini, and Local Templates to ensure zero user "dead ends".

## Implications

Requires maintaining standardized response wrappers across AgentforceService, GeminiService, and LocalTemplateService.

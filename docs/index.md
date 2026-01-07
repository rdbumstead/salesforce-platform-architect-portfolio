# Salesforce Platform Architect Portfolio

[![View Source](https://img.shields.io/badge/GitHub-View_Source-181717?logo=github&logoColor=white)](https://github.com/rdbumstead/salesforce-platform-architect-portfolio)
[![CI/CD — main](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/deploy.yml)
[![PR Validation](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/pr.yml/badge.svg)](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/pr.yml)
[![Cloudflare Worker](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/deploy-worker.yml/badge.svg)](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/deploy-worker.yml)
[![Daily Org Heartbeat](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/keep-alive.yml/badge.svg)](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/keep-alive.yml)
[![License](https://img.shields.io/badge/License-MIT-green?logo=opensourceinitiative&logoColor=white)](LICENSE)

Welcome to the authoritative source of truth for the Salesforce Platform Architect Portfolio. This documentation is version-controlled and deployed directly from the codebase.

## 1. Operational Guides

_Target Audience: Stakeholders, Recruiters, Ops Team_

| Artifact                                                                             | Purpose                                                               |
| :----------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| [**01. Executive Overview**](guides/01-Executive-Overview.md)                        | Business value, "Definition of Done", and ROI analysis.               |
| [**02. Program Charter**](guides/02-Program-Charter.md)                              | Scope, timeline, user stories, and acceptance criteria.               |
| [**03. Systems Architecture (SAS)**](guides/03-SAS.md)                               | The "North Star" architecture, data models, and integration patterns. |
| [**04. Technical Guide**](guides/04-Technical-Guide.md)                              | Implementation details for LWC, Apex, and CI/CD.                      |
| [**05. Maintenance Guide**](guides/05-Maintenance-Guide.md)                          | Operations, rotation policies, and disaster recovery.                 |
| [**06. Guardrails & Governance**](guides/06-Guardrails-and-Executable-Governance.md) | Automated quality gates and compliance rules.                         |

---

## 2. Architectural Decision Records (ADRs)

_Target Audience: Architects, Developers_

> _ADRs are immutable records of significant design choices. They capture the context and consequences of decisions._

**Core Platform & UI**

- [ADR-001: Experience Cloud LWR vs. Aura](adr/001-experience-cloud-lwr-vs-aura.md)
- [ADR-002: Custom Objects vs. Standard Objects](adr/002-custom-objects-vs-standard-objects.md)
- [ADR-005: Gamified Testimonial UI](adr/005-gamified-testimonial-ui.md)
- [ADR-010: Visualization Engine (Vis.js vs. AntV G6)](adr/010-visualization-engine-vis-js-vs-antv-g6.md)
- [ADR-020: Mobile Performance (SVG Fallback)](adr/020-mobile-performance-static-svg-fallback-strategy.md)
- [ADR-021: Native GraphQL vs. Apex REST](adr/021-native-graphql-door-1-vs-apex-rest-for-ui.md)
- [ADR-023: Client-Side PDF Generation](adr/023-client-side-pdf-generation-jspdf-for-mvp.md)

**Integration & Security**

- [ADR-003: Apex REST vs. External Service](adr/003-apex-rest-vs-external-service.md)
- [ADR-006: JWT Bearer Flow for CI/CD](adr/006-jwt-bearer-flow-for-ci-cd.md)
- [ADR-007: GitHub API Server-Side Caching](adr/007-github-api-server-side-caching.md)
- [ADR-008: Jira Integration vs. Agile Accelerator](adr/008-jira-integration-vs-agile-accelerator.md)
- [ADR-012: Guest User Security (Restriction Rules)](adr/012-guest-user-security-restriction-rules.md)
- [ADR-017: System API Security & Dual-Sided Auth](adr/017-system-api-security-and-dual-sided-auth-pattern.md)
- [ADR-018: FinOps (Lambda URLs vs. API Gateway)](adr/018-finops-constraint-aws-lambda-function-urls-vs-api-gateway.md)
- [ADR-024: Twin API Pattern](adr/024-twin-api-pattern-contract-first-parity.md)
- [ADR-025: PAPI Fan-Out & Throttling](adr/025-papi-fan-out-throttling-capacity-planning.md)
- [ADR-026: Header-Based API Versioning](adr/026-header-based-api-versioning-strategy.md)

**AI & Telemetry**

- [ADR-011: Context Grounding Strategy](adr/011-context-grounding-strategy-direct-crm-vs-data-360.md)
- [ADR-013: Structured Logging (Nebula)](adr/013-structured-logging-framework-nebula-logger.md)
- [ADR-014: Deferred Telemetry Loading](adr/014-deferred-telemetry-loading-performance.md)
- [ADR-015: Strategy Pattern for GenAI](adr/015-strategy-pattern-for-generative-ai.md)
- [ADR-016: Cloudflare Worker as Edge Proxy](adr/016-cloudflare-worker-as-edge-ai-proxy.md)
- [ADR-019: Executable Governance (Platform Events)](adr/019-executable-governance-platform-events-for-documentation-logic.md)
- [ADR-022: Resilience Engineering (Chaos Toggle)](adr/022-resilience-engineering-resilience-simulation-toggle.md)

---

## 3. API Specifications (OAS)

_Target Audience: Integration Consumers_

- [**Salesforce System API (SAPI)**](api/oas/salesforce-sapi.md) - _Core Data Layer_
- [**Portfolio Process API (PAPI)**](api/oas/portfolio-papi.md) - _Orchestration Layer_

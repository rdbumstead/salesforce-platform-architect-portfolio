# Ryan Bumstead — Salesforce Platform Architect Portfolio

[![CI/CD — main](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/deploy.yml)
[![PR Validation](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/pr.yml/badge.svg)](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/pr.yml)
[![Cloudflare Worker](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/deploy-worker.yml/badge.svg)](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/deploy-worker.yml)
[![Daily Org Heartbeat](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/keep-alive.yml/badge.svg)](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/keep-alive.yml)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Ryan_Bumstead-0077B5?logo=linkedin&logoColor=white)](https://linkedin.com/in/ryanbumstead)
[![Trailhead](https://img.shields.io/badge/Trailhead-rbumstead-00A1E0?logo=salesforce&logoColor=white)](https://www.salesforce.com/trailblazer/rbumstead)
[![Certifications](https://img.shields.io/badge/Certifications-8_Salesforce-00A1E0?logo=salesforce&logoColor=white)](https://www.salesforce.com/trailblazer/rbumstead)
[![Email](https://img.shields.io/badge/Email-ryan@ryanbumstead.com-D14836?logo=gmail&logoColor=white)](mailto:ryan@ryanbumstead.com)
[![License](https://img.shields.io/badge/License-MIT-green?logo=opensourceinitiative&logoColor=white)](LICENSE)

**📅 Project Status:** Architecture complete (6 enterprise docs, 26 ADRs) • MVP code in development • **Live launch Q1 2026**

**🌐 Live Site:** [https://ryanbumstead.com](https://ryanbumstead.com) (Static placeholder until MVP launch)

> **Quick note for non-Salesforce readers:**  
> This is a full enterprise-grade system built on Salesforce (the #1 CRM platform). Think of it as a public web app with real-time data, AI-generated content, and strict DevOps—all running on Salesforce's cloud. The architecture is complete; the code is being built now.

**Contact:** [LinkedIn](https://linkedin.com/in/ryanbumstead) • ryan@ryanbumstead.com

---

## How to Evaluate This Portfolio

### What This Demonstrates

Principal-level Salesforce Platform Architecture including:

- **End-to-end multi-cloud systems design** — Lightning Web Runtime (LWR) + AWS Lambda BFF with $0.00-forever architecture
- **Enterprise DevOps maturity** — Delta deployments, automated quality gates, JWT-based CI/CD, scratch org automation
- **API-first architecture** — OpenAPI 3.0 specifications with Twin API pattern proving Salesforce/MuleSoft parity
- **Applied AI governance** — Triple-fallback inference pipeline (Agentforce → Gemini → Local) with circuit breakers
- **Production-grade observability** — Real-time Glass Box telemetry, distributed tracing, constraint-aware monitoring
- **Security architecture** — Zero Trust model with guest user restrictions, API key validation, read-only enforcement
- **Full enterprise documentation suite** — SAS, Charter, Technical Guide, Operations Guide, Governance Framework
- **8 Salesforce certifications** — AI Associate, Agentforce Specialist, Data Cloud Consultant, Platform App Builder

### Portfolio Overview

**📈 By The Numbers:**

- ✅ **6 enterprise architecture documents** — SAS, Charter, Technical Guide, Operations Guide, Governance Framework, Executive Overview
- ✅ **26 architectural decisions documented** — Covering performance, security, AI governance, FinOps, resilience, and integration patterns
- ✅ **12 core competencies mapped** — Each with verifiable artifacts and validation methods
- ✅ **4 active CI/CD pipelines** — Delta deployments, PR validation gates, heartbeat, Cloudflare Worker deployments
- ✅ **$0.00 forever multi-cloud architecture** — AWS Always-Free tier governance with Lambda Function URLs
- 🚧 **MVP launch Q1 2026** — Interactive demonstrations and live API testing
- 📐 **Phase 8 multi-cloud Q2 2026** — AWS Lambda BFF "Door 2" architecture activation

**⚡ Quick Navigation:** [Verify Claims](#evaluate-the-architecture) • [Evidence Matrix](#evidence-matrix) • [24 ADRs](#architectural-decision-records) • [Architecture Diagram](#north-star-architecture) • [Full Docs](#full-architecture-documentation)

---

## Evidence Matrix

<details>
<summary><strong>📊 Skills-to-Artifacts Evidence Matrix</strong> (Click to expand—maps competencies to verifiable deliverables)</summary>

| Core Competency                              | Demonstrated By                                 | Artifact/Evidence                                                                                                                                                                                | Verification Method                                            |
| :------------------------------------------- | :---------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------- |
| **API Design & Contract-First Architecture** | Twin API Pattern with OpenAPI 3.0               | [SAPI Specification](packages/integration-api/specs/salesforce-sapi.yaml) • [ADR-024](docs/guides/03-SAS.md#adr-024-twin-api-pattern--contract-first-parity)                                     | Review OpenAPI schema structure and Apex implementation parity |
| **Enterprise DevOps & CI/CD**                | Delta deployments with quality gates            | [GitHub Actions Workflows](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions) • [ADR-006](docs/guides/03-SAS.md#adr-006-jwt-bearer-flow-for-cicd)                    | Check pipeline badges and deployment history                   |
| **Multi-Cloud Architecture**                 | AWS Lambda BFF + Salesforce LWR hybrid          | [Phase 8 Design](docs/guides/03-SAS.md#appendix-j-cloud-finops-strategy-phase-8--q2-2026) • [ADR-018](docs/guides/03-SAS.md#adr-018-finops-constraint--aws-lambda-function-urls-vs-api-gateway)  | Review FinOps strategy and dual-door pattern                   |
| **AI/ML Governance**                         | Triple-fallback inference with circuit breakers | [AI Strategy Section](docs/guides/03-SAS.md#541-feature-spotlight-generative-cover-letter-engine) • [ADR-015](docs/guides/03-SAS.md#adr-015-strategy-pattern-for-generative-ai)                  | Review sequence diagram and failover logic                     |
| **Security Architecture**                    | Zero Trust with Guest User restrictions         | [Data Security Matrix](docs/guides/03-SAS.md#46-data-security-matrix) • [ADR-012](docs/guides/03-SAS.md#adr-012-guest-user-security-restriction-rules)                                           | Examine FLS configuration and API key validation               |
| **Resilience Engineering**                   | Circuit breaker pattern with degraded mode      | [Contingency Plans](docs/guides/03-SAS.md#8-contingency--rollback-plans) • [ADR-022](docs/guides/03-SAS.md#adr-022-resilience-engineering--resilience-simulation-toggle)                         | Test resilience simulation toggle (live Q1 2026)               |
| **Performance Optimization**                 | Mobile-first with measured LCP targets          | [NFRs Section](docs/guides/03-SAS.md#21-core-nfrs) • [ADR-020](docs/guides/03-SAS.md#adr-020-mobile-performance--static-svg-fallback-strategy)                                                   | Review Lighthouse CI results in Actions                        |
| **Data Modeling**                            | Persona-based resume generation schema          | [ERD Diagram](docs/guides/03-SAS.md#41-logical-data-model-erd) • [Data Dictionary](docs/guides/03-SAS.md#appendix-d-data-dictionary-detailed-schema)                                             | Examine junction object strategy and filtering logic           |
| **Cloud Financial Operations (FinOps)**      | $0.00 forever architecture                      | [FinOps Appendix](docs/guides/03-SAS.md#appendix-j-cloud-finops-strategy-phase-8--q2-2026) • [ADR-018](docs/guides/03-SAS.md#adr-018-finops-constraint--aws-lambda-function-urls-vs-api-gateway) | Verify Always-Free tier governance model                       |
| **Observability & Monitoring**               | Real-time telemetry with Glass Box pattern      | [Observability Section](docs/guides/03-SAS.md#9-observability--glass-box) • [ADR-014](docs/guides/03-SAS.md#adr-014-deferred-telemetry-loading-performance)                                      | View Glass Box footer demo (live Q1 2026)                      |
| **Integration Patterns**                     | Server-side caching for external APIs           | [GitHub Integration](docs/guides/03-SAS.md#a4-github-api-integration) • [ADR-007](docs/guides/03-SAS.md#adr-007-github-api-server-side-caching)                                                  | Review Named Credential configuration                          |
| **Technical Documentation**                  | Enterprise-grade architecture suite             | [6 Architecture Guides](#full-architecture-documentation) • [SAS](docs/guides/03-SAS.md)                                                                                                         | Review documentation structure and C4 model diagrams           |

</details>

---

### Evaluate the Architecture

**⏱️ Time-constrained?** 2 minutes → verification checklist | 5 minutes → pick 3 ADRs | 10 minutes → skills matrix deep dive

**Verification Checklist for Evaluators:**

**✅ Available Now:**

- [Architecture decisions documented with rationale](docs/guides/03-SAS.md#7-architectural-decision-records-adrs) — 26 ADRs covering performance, security, AI, FinOps
- [CI/CD pipelines green with delta deployment strategy](https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions) — 4 active workflows (deploy, PR validation, heartbeat, worker)
- [API contracts OpenAPI 3.0 compliant](packages/integration-api/specs/salesforce-sapi.yaml) — Twin API pattern with SAPI + PAPI specifications
- [Multi-cloud design cost-optimized](docs/guides/03-SAS.md#adr-018-finops-constraint--aws-lambda-function-urls-vs-api-gateway) — $0.00 forever architecture using AWS Always-Free tier
- [Mobile performance targets quantified](docs/guides/03-SAS.md#adr-020-mobile-performance--static-svg-fallback-strategy) — LCP < 2.5s with static SVG fallback strategy
- [Zero Trust security model enforced](docs/guides/03-SAS.md#46-data-security-matrix) — Guest user FLS restrictions + API key validation + read-only endpoints
- [AI governance with failover strategy](docs/guides/03-SAS.md#adr-015-strategy-pattern-for-generative-ai) — Triple-fallback inference stack with circuit breakers

**🚧 Available at MVP Launch (Q1 2026):**

- **Real-time observability** — Glass Box footer showing live Salesforce governor limits (Heap, CPU, SOQL) and AI provider health
- **Resilience simulation** — Toggle switch to force GitHub/Jira integration failures and observe circuit breaker behavior with cached fallbacks
- **Interactive API testing** — Built-in developer console to call REST endpoints, compare against OpenAPI spec, verify `X-Request-Id` headers
- **Mobile performance validation** — View on mobile devices to trigger static SVG fallback and validate LCP < 2.5s target

---

## Interactive Demonstrations (Live Q1 2026)

> **Note:** Detailed preview of items from the "Available at Launch" section above. The live site is currently under development.

**Resilience Engineering**

- Toggle "Resilience Simulation" in the Glass Box footer to force GitHub/Jira integration failures
- Watch the system serve cached data gracefully with circuit breaker status indicators (Open/Closed/Half-Open)
- Validates enterprise high-availability patterns under controlled failure conditions

**API-First Architecture**

- Use the built-in API Tester component to call native Salesforce REST endpoints
- Compare live responses against the OpenAPI specification in real-time
- Verify mandatory distributed tracing headers (`X-Request-Id`) and proper error response formats

**Production Observability**

- Monitor real-time Salesforce governor limits (Heap, CPU, SOQL queries) in the Glass Box footer
- Track AI provider health and automatic failover status across the triple-fallback stack
- Demonstrates constraint-aware development practices and platform limit management

**Mobile-First Performance**

- View the site on mobile devices to automatically trigger static SVG fallback for the skill graph
- Validates performance budgeting (LCP < 2.5s) and WCAG 2.1 AA accessibility compliance
- Proves responsive design with graceful degradation strategies

---

## Phase 8: Multi-Cloud Extension (Design Complete for Q2 2026)

**AWS Lambda Polyglot BFF (Door 2 Architecture)**

- **85% payload reduction** vs. parallel REST calls through intelligent server-side orchestration
- **$0.00 forever guarantee** — Strict governance using AWS Always-Free tier (Lambda Function URLs, no API Gateway)
- **Serverless resume engine** — Node.js Lambda for perfect PDF fidelity, replacing client-side jsPDF implementation
- **Enterprise API gateway** — Full rate limiting, API key management, and distributed tracing outside Salesforce governor limits

---

## Architectural Decision Records

<details>
<summary><strong>📋 Architectural Decision Records (ADR) Index</strong> (Click to expand—26 documented decisions)</summary>

| ID                                                                                       | Subject                             | Strategic Driver         |
| :--------------------------------------------------------------------------------------- | :---------------------------------- | :----------------------- |
| [ADR-001](docs/adr/001-experience-cloud-lwr-vs-aura.md)                                  | Experience Cloud (LWR) vs. Aura     | Performance (LCP < 2.5s) |
| [ADR-002](docs/adr/002-custom-objects-vs-standard-objects.md)                            | Custom Objects vs. Standard Objects | Security / Guest Access  |
| [ADR-003](docs/adr/003-apex-rest-vs-external-service.md)                                 | Apex REST vs. External Service      | Budget / FinOps          |
| [ADR-004](docs/adr/004-static-resource-code-rendering.md)                                | Static Resource Code Rendering      | Rate Limiting            |
| [ADR-005](docs/adr/005-gamified-testimonial-ui.md)                                       | Gamified Testimonial UI             | User Engagement          |
| [ADR-006](docs/adr/006-jwt-bearer-flow-for-ci-cd.md)                                     | JWT Bearer Flow for CI/CD           | DevOps Automation        |
| [ADR-007](docs/adr/007-github-api-server-side-caching.md)                                | GitHub API Server-Side Caching      | Resilience               |
| [ADR-008](docs/adr/008-jira-integration-vs-agile-accelerator.md)                         | Jira Integration vs. Accelerator    | ALM Maturity             |
| [ADR-009](docs/adr/009-granular-resume-data-model.md)                                    | Granular Resume Data Model          | Persona-Based Filtering  |
| [ADR-010](docs/adr/010-visualization-engine-vis-js-vs-antv-g6.md)                        | Vis.js vs. AntV G6                  | UI/UX Animation          |
| [ADR-011](docs/adr/011-context-grounding-strategy-direct-crm-vs-data-360.md)             | Direct CRM vs. Data 360 Grounding   | AI Architecture          |
| [ADR-012](docs/adr/012-guest-user-security-restriction-rules.md)                         | Guest User Restriction Rules        | Zero Trust Security      |
| [ADR-013](docs/adr/013-structured-logging-framework-nebula-logger.md)                    | Nebula Logger Implementation        | Observability            |
| [ADR-014](docs/adr/014-deferred-telemetry-loading-performance.md)                        | Deferred Telemetry Loading          | Performance              |
| [ADR-015](docs/adr/015-strategy-pattern-for-generative-ai.md)                            | Strategy Pattern for Generative AI  | High Availability        |
| [ADR-016](docs/adr/016-cloudflare-worker-as-edge-ai-proxy.md)                            | Cloudflare Worker as AI Proxy       | Multi-Cloud Scaling      |
| [ADR-017](docs/adr/017-system-api-security-and-dual-sided-auth-pattern.md)               | API Security & Method Constraints   | Security Governance      |
| [ADR-018](docs/adr/018-finops-constraint-aws-lambda-function-urls-vs-api-gateway.md)     | AWS Lambda URLs vs. API Gateway     | FinOps / Cost Control    |
| [ADR-019](docs/adr/019-executable-governance-platform-events-for-documentation-logic.md) | Platform Events for Documentation   | Executable Governance    |
| [ADR-020](docs/adr/020-mobile-performance-static-svg-fallback-strategy.md)               | Mobile Static SVG Fallback          | Performance              |
| [ADR-021](docs/adr/021-native-graphql-door-1-vs-apex-rest-for-ui.md)                     | Native GraphQL vs. Apex REST        | Frontend Orchestration   |
| [ADR-022](docs/adr/022-resilience-engineering-resilience-simulation-toggle.md)           | Resilience Simulation Toggle        | Trust / Resilience       |
| [ADR-023](docs/adr/023-client-side-pdf-generation-jspdf-for-mvp.md)                      | Client-Side PDF Generation (jsPDF)  | Tooling / MVP Speed      |
| [ADR-024](docs/adr/024-twin-api-pattern-contract-first-parity.md)                        | Twin API Pattern                    | Contract Parity          |
| [ADR-025](docs/adr/025-papi-fan-out-throttling-capacity-planning.md)                     | PAPI Fan-Out Throttling             | Capacity Planning        |
| [ADR-026](docs/adr/026-header-based-api-versioning-strategy.md)                          | Header-Based API Versioning         | Versioning Strategy      |

</details>

---

<details>
<summary><strong>📖 Glossary of Terms</strong> (Click to expand)</summary>

| Term          | Meaning                                                       | Status                        |
| :------------ | :------------------------------------------------------------ | :---------------------------- |
| **LWR**       | Lightning Web Runtime — Modern Salesforce frontend framework  | Live at MVP                   |
| **ADR**       | Architectural Decision Record — Documented design rationale   | Complete (24 records)         |
| **Dual-Door** | Native Salesforce + External API gateway strategy             | Door 1: MVP / Door 2: Phase 8 |
| **FinOps**    | Financial Operations — Cloud cost governance and optimization | Design complete for Phase 8   |
| **Glass Box** | Real-time system telemetry and observability UI pattern       | Live at MVP                   |
| **RAG**       | Retrieval-Augmented Generation — AI grounding technique       | Live at MVP                   |
| **BFF**       | Backend For Frontend — Tailored API layer for UI optimization | Design complete for Phase 8   |
| **SAPI**      | System API — Direct data access layer (API-led connectivity)  | Live at MVP                   |
| **PAPI**      | Process API — Orchestration layer (API-led connectivity)      | Live at MVP                   |

</details>

---

## North-Star Architecture

```mermaid
graph LR
    User((User)) --> LWR[Experience Cloud LWR]
    LWR -->|Door 1: Native GraphQL Q1 2026| SF_GQL[Salesforce GraphQL API]
    SF_GQL --> DB[(Custom Objects)]
    LWR -->|Door 2: External Gateway Q2 2026| Lambda[AWS Lambda Polyglot BFF]
    LWR --> Apex[Apex Runtime]
    Lambda --> Apex
    Apex --> Jira[Jira API]
    Apex --> GitHub[GitHub API]
    Apex <--> AI[Agentforce AI]
    style Lambda fill:#FF9900,stroke:#333,stroke-width:2px
```

> **Diagram Description (for accessibility):** The diagram shows a user connecting to an Experience Cloud LWR site, which routes data requests through either a native Salesforce GraphQL API (Door 1, live in Q1 2026) or an AWS Lambda Polyglot Backend For Frontend (Door 2, design complete for Q2 2026). The Apex Runtime handles integrations with Jira, GitHub, and Agentforce AI, all backed by custom Salesforce objects.

---

## Full Architecture Documentation

| Document                                      | Link                                                             |
| :-------------------------------------------- | :--------------------------------------------------------------- |
| 01 – Executive Overview                       | [Read →](docs/guides/01-Executive-Overview.md)                   |
| 02 – Program Charter & Roadmap                | [Read →](docs/guides/02-Program-Charter.md)                      |
| 03 – Systems Architecture Specification (SAS) | [Read →](docs/guides/03-SAS.md)                                  |
| 04 – Technical Implementation Guide           | [Read →](docs/guides/04-Technical-Guide.md)                      |
| 05 – Maintenance & Operations Guide           | [Read →](docs/guides/05-Maintenance-Guide.md)                    |
| 06 – Guardrails & Executable Governance       | [Read →](docs/guides/06-Guardrails-and-Executable-Governance.md) |

> **For Non-Salesforce Readers:** Document 06 includes plain-English explanations of Salesforce governor limits, AWS cost optimization patterns, and constraint-based design principles. No prior platform knowledge required.

---

## API & Integration Contracts (Contract-First Design)

This project utilizes a **Twin API Pattern** ([ADR-024](docs/guides/03-SAS.md#adr-024-twin-api-pattern--contract-first-parity)), where System and Process APIs are designed to strict OpenAPI 3.0 specifications to ensure technical parity between Salesforce and enterprise middleware.

| Specification       | Layer   | Description                                | Status / Link                                                                                         |
| :------------------ | :------ | :----------------------------------------- | :---------------------------------------------------------------------------------------------------- |
| **Salesforce SAPI** | System  | Core CRM data access (Read-Only)           | [YAML](packages/integration-api/specs/salesforce-sapi.yaml) • [Docs](docs/api/oas/salesforce-sapi.md) |
| **Portfolio PAPI**  | Process | Orchestration & tailored resume generation | [YAML](packages/integration-api/specs/portfolio-papi.yaml) • [Docs](docs/api/oas/portfolio-papi.md)   |

> **Architectural Note:** In the MVP, the **PAPI** is hosted on Salesforce Apex (Door 1). In Phase 8, the architecture enables Door 2, which delegates orchestration to an **AWS Lambda Polyglot Gateway** to bypass platform limits and support multi-cloud scalability.

> **Security Note:** Both APIs utilize a two-layer authentication model (See [ADR-017](docs/guides/03-SAS.md#adr-017-system-api-security--method-constraints)) featuring explicit API Key headers and internal OAuth2 Client Credentials for Salesforce connectivity.

---

## Repo Structure

```
├── packages/               # Multi-package monorepo (LWR, Apex Services, GraphQL)
├── docs/guides/            # Full enterprise documentation set
├── scripts/                # CI/CD utility scripts
├── .github/workflows/      # PR validation + delta deploy pipelines
└── config/                 # Linting, formatting, DevOps configs

# Repo is source-driven: no build artifacts, only clean source and configs.
```

---

**Owner:** Ryan Bumstead | **License:** MIT

_Delivered with enterprise rigor. Designed for real scale._

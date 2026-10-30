# Program Charter

**Table of Contents**

- [1. Executive Summary](#1-executive-summary)
  - [1.1 Purpose of This Document](#11-purpose-of-this-document)
  - [1.2 Strategic Intent: The Value: A Living Enterprise System](#12-strategic-intent-the-value-a-living-enterprise-system)
  - [1.3 Current vs. Target Architecture Scope](#13-current-vs-target-architecture-scope)
- [2. Governance Model & Scope](#2-governance-model--scope)
  - [2.1 Scope Definition](#21-scope-definition)
  - [2.2 Success Criteria (Definition of Done)](#22-success-criteria-definition-of-done)
- [3. Program Delivery & Roadmap](#3-program-delivery--roadmap)
  - [3.1 Program Charter & Delivery Tracks](#31-program-charter--delivery-tracks)
  - [3.2 Program Milestones](#32-program-milestones)
  - [3.3 Detailed Phasing](#33-detailed-phasing)
- [4. Implementation Checklist (Execution Plan)](#4-implementation-checklist-execution-plan)
- [5. Product Strategy & User Stories](#5-product-strategy--user-stories)
  - [5.1 Outcome-Driven Product Framework](#51-outcome-driven-product-framework)
  - [5.2 Epic Breakdown Example: Resume Builder](#52-epic-breakdown-example-resume-builder)
  - [5.3 Core User Stories](#53-core-user-stories)

---

Project: Salesforce Platform Architect Portfolio

Version: 1.0

Owner: Ryan Bumstead

Launch target: Q1 2027

## 1. Executive Summary

### 1.1 Purpose of This Document

This Program Charter sets out the scope, the success criteria and the delivery plan for the Salesforce Platform Architect Portfolio. It is the reference for what is in scope, how success is judged and which milestones remain. Where it lists work still to come, it says so.

### 1.2 Strategic Intent: The Value: A Living Enterprise System

This is not a static website. It is a live, observable platform governed by production constraints. It demonstrates "Enterprise Grade" as a way of working through:

- **Glass Box Telemetry:** on every visit, the footer shows that request's governor limit use (heap, CPU, SOQL), the org's daily API request and async Apex quotas, and the AI, GitHub and Jira circuit breakers, which shows FinOps and multi-tenant awareness.
- **Dynamic Architecture:** an Entity Relationship Diagram (ERD) drawn from the org's own schema when the page opens, not a static image.
- **Executable Governance:** a checklist on the Delivery page that ticks its own items from pipeline records (for example "production deploy green", with the commit and the run behind it).
- **Resilience Simulation:** a "Simulate an outage" switch on each Delivery page feed re-reads that feed as if GitHub or Jira were down, so a visitor sees the cached data come back marked as simulated ([ADR-022](../adr/022-resilience-engineering-resilience-simulation-toggle.md)).

### 1.3 Current vs. Target Architecture Scope

#### Current MVP State (Q1 2027 Launch)

- 100% on-platform data access using Apex REST + native Salesforce GraphQL (lightning/uiGraphQLApi)
- Skill Graph and Project Gallery use the native GraphQL wire adapter. The Roadmap and Changelog read cached Jira and GitHub data through Apex (`DeliveryController`), because the cache is one JSON row per refresh, not one record per item (my decision, 2026-10-21)
- External services the site depends on: the Gemini API for cover letters (with a local template when it fails), GitHub and Jira for the Delivery page (read by scheduled jobs into caches, never by a visitor), and Google Analytics 4 for events. No middleware, server or database outside Salesforce is required

#### Target Enterprise State, Phase 8 (planned for 2027 to 2028): _designed, not built_

- Plan: an AWS Lambda Polyglot Gateway (Function URL), "Door 2", designed in SAS section 1.1 and Appendix M. The repository holds no AWS code.
- Deferred so the launch does not wait on it
- Because nothing of it is built, it adds no cost and no load to the live site

## 2. Governance Model & Scope

### 2.1 Scope Definition

**In Scope:**

- **Public-facing Experience Cloud (LWR)** site with "5-Minute Tour" guided navigation.
- **Custom LWC component framework** including a custom API Testing Harness.
- **Apex REST API implementation** in MuleSoft's API led layers (a System API and a Process API), matching the OpenAPI specifications in the repository (15 SAPI and 8 PAPI paths, version 1.3.0).
- **Generative AI** grounding and prompt engineering in Apex (`PortfolioGroundingService`, `ContentGenerationController.dispatch`). Agentforce, a Prompt Builder template, is the first provider and ships on.
- **Client-side document generation** (Resume).
- **Generative AI Utility:** A "Dynamic Cover Letter Engine" that uses Gemini 2.5 Flash through the Gemini API, with a local template as the last resort, to write personalized application letters based on the visitor's job description and the architect's matching project history (featured projects and experience highlights).
- **Gamified Social Proof engine** with "Vibe-Gated" submission logic.
- **Automated CI/CD Pipeline** with Static Analysis, Unit Testing gates, and a results step summary on every PR run ("PR Validation Results" in `pr.yml`).
- **External API Integration (GitHub):** the portfolio repository's recent commits on the site, read by a scheduled job into a cache.
- **External API Integration (Jira):** the portfolio roadmap's Epics and Stories, read by a scheduled job into a cache.
- **Planned for Phase 8 (2027 to 2028), designed and not built:** multi-cloud integration patterns on the AWS free tier (a Lambda Function URL, object storage and CloudFront).
- **Advanced Visualization:** a skills matrix with "years used" from linked roles, and a D3.js force graph that loads only when a visitor opens it ([ADR-020 amendment](../adr/020-mobile-performance-static-svg-fallback-strategy.md)).
- **Dynamic ERD Visualizer:** an Entity Relationship Diagram drawn from the org's own schema through the Apex Schema class and the same D3.js engine, in place of a static architecture diagram.
- **Executable Governance:** LWC-based documentation that verifies its own success criteria from pipeline evidence. CI publishes a platform event, an Apex trigger persists it, and the checklist reads the result when viewed (for example, ticking "production deploy green" with the commit and the run behind it).
- **Enterprise Observability:** structured Apex logging through one seam (`PortfolioLog`) that writes to **Nebula Logger** (Open Source) when I have installed it, and to debug logs when not. Nebula is optional, so CI and scratch orgs run without it.

**Out of Scope:**

- Authenticated user profiles (Customer/Partner).
- Paid Middleware (Heroku/Enterprise AWS) implementation.
- Managed Package development.
- **Browser Compatibility:** Optimized strictly for Chromium/Webkit engines (Chrome, Safari, modern Edge). Support for legacy Internet Explorer or pre-Chromium Edge behavior is explicitly excluded to minimize QA overhead and testing time.

### 2.2 Success Criteria (Definition of Done)

To define the "Definition of Done" for this portfolio, the following metrics must be met:

**Portfolio Impact:**

- LinkedIn post regarding launch generates > 100 views.
- Interview requests received from 3+ companies within 30 days of launch.

**Functional Acceptance:**

- All 5 pillars accessible via guided navigation.
- API tester successfully calls at least 3 endpoints (Experience, Skills, Certifications).
- The resume downloads as one text based PDF, and a "Copy ATS text" button copies the plain text version (`c-resume-builder`).
- The skills page shows the matrix on every device, and its graph view opens on desktop and tablet only.
- Mobile responsive layout passes manual verification on iOS Safari and Android Chrome.

**Technical Acceptance:**
| Metric | Current Baseline (Est.) | Target (Hard Gate) |
| :--- | :--- | :--- |
| **LCP (Mobile)** | 7.59 s median on `/` and 7.57 s on `/resume`, 7.57 to 10.62 s across the six main routes, Lighthouse 11 mobile on production, 2026-10-29 (Technical Guide §2.11) | Target **2.5 s**. Gate: the best the LWR shell allows, mobile LCP medians of 7.5 to 9.6 s on the six main routes, measured the same way |
| **Apex Coverage** | 98% org wide, 1000 of 1000 tests passing (production's post deploy test run of the 2026-10-24 deploy) | **90% or more**, enforced on every pull request |
| **Code Scanning** | N/A | **0 Critical or High violations** (`npm run scan`) |
| **Accessibility** | 100 on every Lighthouse mobile run of the six main routes (scratch copy, Technical Guide §2.11). The Round 17 audit found gaps Lighthouse does not score, fixed on 2026-10-30 and not yet re-audited (SAS Appendix G.6) | **100**, with a screen reader pass by me |

- LCP measured with a Lighthouse mobile audit, three runs per route, medians. The target is 2.5 s. Most of the mobile LCP is render delay in the LWR framework's own script, which keeps it above the target, so the gate is the best the LWR shell allows: mobile LCP medians of 7.5 to 9.6 s on the six main routes, measured with Lighthouse 11 mobile on a scratch copy of the site (Technical Guide §2.11). The Round 17 production baseline is wider, 7.57 to 10.62 s. In the lab profile the first site component renders at about 5 s, after about 850 KB of framework scripts and styles, so site changes alone cannot reach 2.5 s. I keep 2.5 s as the target and say plainly that it is not met. The only change in that round with a proven effect was home layout shift, 0.33 to 0 (Technical Guide §2.11).
- Every Apex test passes and org wide coverage is 90% or more. `pr.yml` runs every local test in a scratch org and `scripts/coverage-gate.js --min 90` fails the pull request otherwise. It also validates the pull request check only against production with the local tests, so a test that fails only in production fails the pull request too.
- CI/CD pipeline passing (Green build badge on Repo).
- No Critical or High violations from Salesforce Code Analyzer (`npm run scan`, `--severity-threshold 2`, run on every pull request).
- The network log shows no `D3_Library` request until a graph view is opened.
- Lighthouse Accessibility score remains 100 with the "Matrix | Graph" view switch present.
- Skills graph: a D3.js force layout with pan, zoom and node drag (eleven d3 modules in an 81,482 byte static resource, where the AntV graph library it replaced was 1.57 MB), loaded only when a visitor opens the graph view on desktop or tablet. Phones show the skills matrix and request no graph engine, and the Pillar A ERD shows its object list. A drag or the arrow keys pan the graph at any zoom, and a plain wheel scrolls the page.

**Engagement:**

- Average Session Duration > 2 minutes (verified via GA4).
- **ai_live_model_rate:** % of generations served by a live model, Agentforce or Gemini (Target > 80%). Agentforce ships on, so a letter is served by a live model unless both providers fail.
- **ai_fallback_usage:** % of generations served by the Local Template (the fallback share).
- **ai_complete_failure_rate:** % of requests that end with no content at all, a 503 or an error message (Target < 1%).
- **finops_quota_visibility:** visitors who hover over or focus the footer's "AI requests today" line.
- All three AI rates are to come from one GA4 event, `ai_generation_completed`, with the parameters `provider`, `model`, `fallback`, `latency_ms` and `outcome`. GA4 computes the rates, so no counter is stored in Salesforce (my decision, 2026-10-21). Component events go to GA4 through the site's head script ([Technical Guide §2.8](./04-Technical-Guide.md#28-analytics-instrumentation-ga4)). Delivery was proven on a scratch copy of the site. I still have to do the check in production's GA4 DebugView. Before that change no component event reached GA4, so no earlier rate or conversion figure exists.

**Conversion:**

- Greater than 20% of visitors interact with "API Tester" or "Resume Builder" (verified via Custom Events).
  - **api_test_executed:** User successfully calls an endpoint in the API Tester.
  - **resume_downloaded** (`format` `pdf` or `ats`): User downloads the PDF or copies the ATS text.
  - **resilience_test_triggered:** User turns on a "Simulate an outage" switch.

**Reach:**

- Traffic originating from > 3 distinct geographic regions.

## 3. Program Delivery & Roadmap

This implementation is run as a program of parallel delivery tracks, so the dependencies between the schema, the API and the UI are planned and the critical path stays short.

### 3.1 Program Charter & Delivery Tracks

The delivery is organized into four parallel tracks:

1. **Data & Schema:** Foundation layer, security modeling, and AI grounding sources.
2. **Experience Layer:** LWR implementation, branding, and mobile optimization.
3. **Integration Services:** API definitions, Mocking, and External Service configuration.
4. **DevOps & Governance:** CI/CD pipeline, Code Quality gates, and Documentation.

### 3.2 Program Milestones

- **Milestone 1 (Foundation):** Schema deployed, Baseline API contracts (OAS) defined. (Completed)
- **Milestone 2 (Core Interactions):** LWR Site active, Navigation functional, Resume logic validated. (Completed)
- **Milestone 3 (Integration):** External services (Jira/GitHub) connected, Security scanning active. (Completed)
- **Milestone 4 (Intelligence):** Grounded generation in Apex with a visible fallback chain, "Vibe-Gate" logic tested. Agentforce is built as a Prompt Builder template ([ADR-015](../adr/015-strategy-pattern-for-generative-ai.md), 2026-10-26). Data 360 grounding is deferred ([ADR-011](../adr/011-context-grounding-strategy-direct-crm-vs-data-360.md), 2026-10-22). (Completed)
- **Milestone 5 (Go-Live):** Planned for Q1 2027: the public launch and a telemetry review. The `ryanbumstead.com` domain already redirects to the site.

### 3.3 Detailed Phasing

**Phase 1: Core Foundation (Completed)**

- **Org Setup:** (DevHub, DX Project).
- **GitHub Repo Init:** (a branch ruleset on `main`: changes arrive by pull request, and force pushes are blocked).
- **CI/CD Pipeline V1:** (Validation Only).

**Phase 2: Data & API Layer (Completed)**

- **Schema Deployment:** (Completed)
- **Apex REST Services:** (Completed) 15 SAPI and 8 PAPI paths. Contract v2.0.0 is selected by the `X-API-Version: v2` header and returns public keys only. v1 is deprecated for one month and then answers 410 ([ADR-039](../adr/039-api-v2-and-the-v1-sunset.md).
- **Data Loading:** (Completed) seed data in `data/site`.

**Phase 3: UI Framework (Completed)**

- **Theme Layout:** `c-portfolio-theme-layout`, with the header, its "How it's built" menu, the Back to top arrow and the theme toggle.
- **Home page:** `c-hero-banner`, then the case studies (`c-case-study-grid`), and a "How this site is built" section (`c-site-build-section`) with the tour and the pillar cards.
- **Navigation:** the header and the tour read one pillar list, `c/pillarData`.

**Phase 4: Integrations (Completed)**

- **Jira Connect:** (the `Jira_API` Named Credential).
- **GitHub Connect:** (the `GitHub_API` Named Credential and the `Github_Cache__c` cache).

**Phase 5: Intelligence**

- **Data 360 streams:** the CRM connector ingests the portfolio objects. No search index or retriever is built, and grounding on Data 360 is deferred ([ADR-011 amendment, 2026-10-22](../adr/011-context-grounding-strategy-direct-crm-vs-data-360.md#amendment-2026-10-22-deferred)).
- **Grounding:** in Apex, reading the CRM directly (`PortfolioGroundingService.build`, SAS section 5.4.1).
- **Prompt Engineering:** and the "Show your work" panel (provider, model, latency, attempts and the prompt that was sent, filled by Apex, not by the model)
- **AI Generation Service:** one dispatch: Agentforce (a Prompt Builder template, on by default), then Gemini 2.5 Flash through the Gemini API, then the Local Template

**Phase 6: Observability & Launch**

- **System Health "Glass Box Telemetry":** `c-footer` with deferred loading (ADR-014) shows CPU, heap and SOQL use against their limits, AI provider health and AI requests today.
- **Enterprise Logging:** Nebula Logger is optional. I install it (unlocked package, no namespace) in production by hand and sets 2-day retention (Maintenance Guide). Apex reaches it only through the `PortfolioLog` seam.
- **Resilience Simulation:** the "Simulate an outage" switch on each Delivery page feed, which returns the cached data marked as simulated (`DeliveryController`).
- **Analytics Instrumentation:** Google Analytics 4 (GA4) with custom events for API tests, resume downloads and the other events in `c/analyticsService`.
- **API Mode Indicator:** the Glass Box footer measures the guest GraphQL path after first paint and shows it as live with its latency, or as unavailable. It is measured on every visit, never a constant label (my decision, 2026-10-21).
- **Final Polish:** Mobile optimization, Lighthouse audits, and Public DNS configuration. The domain redirect is in place. The device checks on iOS and Android are planned before launch.

**Phase 7: Observability & Governance (moved into the launch scope, built)**

- **System Health Dashboard:** "Glass Box Telemetry" footer.
- **Smart Documentation:** moved into the launch scope (my decision, 2026-10-21). `c-smart-checklist` reads `Pipeline_Run__c` records written by an Apex trigger on `Governance_Event__e`, which CI publishes. It does not use `lightning/empApi`, which LWR sites do not support.

**Phase 8: Multi-Cloud & FinOps, a Hybrid GraphQL Strategy (planned for 2027 to 2028)**

| Phase       | Status                  | Rationale                                                                   |
| :---------- | :---------------------- | :-------------------------------------------------------------------------- |
| **Phase 8** | **Designed, not built** | Designed to show how the site would scale out, deferred until after launch. |
| **MVP**     | **Live**                | Focus on measured mobile LCP and the Zero Cost constraint.                  |

_The design is in the SAS. Apart from the GraphQL check, which confirms what runs today, every item below is a plan and none of it is built._

- **Native GraphQL Verification:**
  - Confirm `c-skill-network` and Project Gallery use `lightning/uiGraphQLApi`. `c-roadmap-viewer` reads Apex over the cache by design (my decision, 2026-10-21)
- **AWS Lambda Polyglot Gateway:** (Function URL), "Door 2", **designed, not built** (planned for 2027 to 2028)
  - Deploy single HTTPS Function URL endpoint (no API Gateway)
  - Support both REST → GraphQL translation and direct GraphQL
  - In-function governance: `x-api-key` validation, tiered rate limiting, CloudWatch metrics
- **Static Asset Offloading:** (AWS object storage and CloudFront)
  - Migrate heavy media assets (images, videos) from Salesforce Static Resources.
- **Resume Engine Migration:**
  - Move PDF generation from client-side `jsPDF` to serverless Node.js Lambda
- **FinOps & Cost Governance:** (designed to cost $0.00 a month)
  - Use only Always Free services
  - Deliberately avoid API Gateway and VPC to eliminate all cost traps
  - CloudWatch billing alarm at $0.01
- **API Lab Upgrade:**
  - Enable "Enterprise Mode" toggle
  - Live payload comparison (Native vs Lambda)
  - Real-time rate-limit counters in `c-footer`

**Phase 9: Edge AI Proxy (Cloudflare Workers)**

- A deferred design in [ADR-016](../adr/016-cloudflare-worker-as-edge-ai-proxy.md), not built. The one Cloudflare Worker that runs today is the cache warmer ([Technical Guide §2.13](./04-Technical-Guide.md#213-cloudflare-cache-warmer-worker)), which calls no API.

## 4. Implementation Checklist (Execution Plan)

**Phase 1: Foundation & DevOps**

- **A.1:** Configure Connected App (JWT) & GitHub Secrets.
- **D.1:** Deploy `Project__c` Object.
- **D.2:** Deploy `Testimonial__c` Object.
- **E.1:** Apex tests for every class, with org wide coverage gated at 90% on every pull request (`scripts/coverage-gate.js`).
- **A.7:** Not built: no C4 diagram was exported or uploaded as a static resource. The diagrams are the Mermaid blocks in the guides.
- **1.3:** Verify Technical Acceptance Criteria (CI/CD Green, LCP Baseline).

**Phase 2: Delivery**

- **Config:** Create free Atlassian Jira account and generate API Token.
- **A.8:** Configure Named Credential Jira_API in Salesforce.
- **Dev:** Develop `c-roadmap-viewer` LWC + `JiraService.cls`.
- **D.3 / D.4:** Deploy `Experience__c` parent and `Experience_Highlight__c` child objects.
- **Dev:** Develop `c-resume-builder` LWC with persona-based Apex filtering logic.

**Phase 3: Integration**

- **Dev:** Implement `SAPIExperience` Apex Class (System API).
- **Appendix C:** MuleSoft governance policies, kept as a reference in SAS Appendix C. The MuleSoft artifacts are no longer in the repository.
- **Docs:** Upload Redoc documentation as Static Resource.
- **Dev:** Develop `c-api-tester` LWC, which calls the APIs through the Apex proxy `ApiLabController` and the `Portfolio_API` Named Credential, with no browser `fetch()`.
- **A.4:** Implement GitHub Live Feed, the custom object cache (`Github_Cache__c`), and the Queueable refresh with its scheduler.

**Phase 4: Innovation**

- **A.6:** Agentforce Service Agent and topic grounding. In source with four topics and three read only actions, shipped inactive and not on the site (ADR-036, SAS Appendix A.6). The cover letter provider runs a Prompt Builder template.
- **Security:** Enable "Lightning Web Security" in Session Settings.
- **Asset:** the `D3_Library` static resource (`d3-force` and its dependencies, plus `d3-zoom` and `d3-drag`, Public cache). It replaced `G6_Library`.
- **Dev:** `c-skill-network` shows the matrix and draws the graph view through `c/graphEngine`.
- **Optimization:** the engine loads only when the graph view opens (network log proof).
- **Mobile:** phones show the matrix and never request the engine. This replaced the planned static SVG fallback ([ADR-020 amendment](../adr/020-mobile-performance-static-svg-fallback-strategy.md)).
- **A11y:** the graph is laid out before it is drawn, so it does not animate, and an accessible list mirrors every graph.
- Conduct Mobile QA on iOS and Android devices.

**Phase 5: Optimization**

- **Dev:** Logging through one seam, `PortfolioLog`, to Nebula Logger when installed and debug logs otherwise. The planned `LogService.cls` with email offloading was not built.
- **Dev:** Implement "Vibe-Gate" logic on `c-testimonial-submit`.
- **Docs:** Not built: C4 Level 2 and 3 diagrams in IcePanel. The diagrams are the Mermaid blocks in the guides.

**Phase 6: Observability & Launch**

- **Setup:** I install Nebula Logger (unlocked package) by hand and set its retention (`LoggerSettings__c`). It is optional.
- **Dev:** Build `c-footer` LWC (Glass Box Telemetry) using requestIdleCallback.
- **Dev:** Implement `c/analyticsService` for unified GA4 event tracking.
- **Config:** the "Simulate an outage" switches and their simulated reads in `DeliveryController.cls`.
- **QA:** Verify "Glass Box Telemetry" matches actual Developer Console limits.
- **QA:** Verify GA4 Real-Time view receives api_test_executed events.

## 5. Product Strategy & User Stories

### 5.1 Outcome-Driven Product Framework

Before user stories are written, features are evaluated against a "Problem Statement Framework" to ensure they deliver architectural value.

- **Problem Statement:** Recruiters and Hiring Managers struggle to verify an architect's hands-on skills through static PDFs.
- **The Need:** A verified, interactive demonstration of complex capabilities (API, LWC, AI).
- **The Value:** Reduces "Time-to-Trust" for the evaluator and differentiates me from paper-qualified applicants.

### 5.2 Epic Breakdown Example: Resume Builder

- **Epic:** Dynamic Resume Generation.
- **Value Driver:** Demonstrates ability to manipulate complex data hierarchies and render client-side.
- **Acceptance Criteria:**
  - Loads < 2s.
  - Filters by persona ("Platform Architect", "Salesforce Developer" or "System Admin").
  - Exports to clean PDF.

### 5.3 Core User Stories

| ID          | Persona               | I Want To...                     | So That...                                                                                                                                                    |
| :---------- | :-------------------- | :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SPAP-47** | Motion-Sensitive User | Avoid motion                     | The site is accessible and I avoid motion sickness triggers. Met by following the system "reduce motion" setting, and the graphs are drawn without animation. |
| **SPAP-46** | Mobile User           | Have fast loading visuals        | Performance stays high and I don't burn data.                                                                                                                 |
| **SPAP-44** | Visitor               | See a skill network              | I understand capability relationships visually. Built as a D3.js graph beside the skills matrix that never moves on its own.                                  |
| **SPAP-40** | Recruiter             | Generate a tailored cover letter | I immediately see candidate fit without reading a generic bio.                                                                                                |
| **SPAP-35** | Viewer                | See live roadmap data            | I know the current project status and active work.                                                                                                            |
| **SPAP-31** | Recruiter             | See persona-specific bullets     | I see role-relevant accomplishments (Admin vs Architect).                                                                                                     |
| **SPAP-30** | Recruiter             | Download resumes                 | I can store them in my ATS for compliance.                                                                                                                    |
| **SPAP-29** | Recruiter             | View a dynamic resume            | I can evaluate relevant experience quickly.                                                                                                                   |
| **SPAP-28** | Visitor               | Have guided navigation           | I can complete the 5-minute tour efficiently.                                                                                                                 |
| **SPAP-27** | Site Visitor          | See a clear hero banner          | I immediately understand the purpose of the portfolio.                                                                                                        |

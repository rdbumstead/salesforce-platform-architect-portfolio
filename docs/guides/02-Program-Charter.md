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
  - [3.1 Program Charter & Workstreams](#31-program-charter--workstreams)
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

Date: MVP – Q1 2027

Est. Total Effort: ~70 Hours (MVP Core in ~47 Hours)

## 1. Executive Summary

### 1.1 Purpose of This Document

This Program Charter defines the strategic intent and delivery plan for the Salesforce Platform Architect Portfolio. It serves as the authoritative reference for project scope, business value, and timeline.

### 1.2 Strategic Intent: The Value: A Living Enterprise System

This is not a static website. It is a live, observable platform governed by production constraints. It demonstrates "Enterprise Grade" as a mindset through:

- **Glass Box Telemetry:** Real-time visibility into Governor Limits (Heap, CPU) and API quotas, proving FinOps and multi-tenant awareness.
- **Dynamic Architecture:** A live Entity Relationship Diagram (ERD) generated from the actual production schema, not a static image.
- **Executable Governance:** Documentation that self-verifies against runtime state (e.g., "Pipeline Green" checks verify themselves).
- **Resilience Simulation:** On-demand testing of fallback patterns and Circuit Breakers (e.g., severing GitHub integration to test graceful degradation).

### 1.3 Current vs. Target Architecture Scope

#### Current MVP State (Q1 2027 Launch)

- 100% on-platform data access using Apex REST + native Salesforce GraphQL (lightning/uiGraphQLApi)
- Skill Graph and Project Gallery use the native GraphQL wire adapter. The Roadmap and Changelog read cached Jira and GitHub data through Apex (`DeliveryController`), because the cache is one JSON row per refresh, not one record per item (owner decision E7, 2026-10-21)
- No external dependencies required

#### Target Enterprise State – Phase 8 (2027-2028) – _Design Complete / Implementation Deferred_

- AWS Lambda Polyglot Gateway (Function URL) "Door 2" fully designed (see SAS 1.1 & 5.3).
- Implementation deferred to guarantee on-time MVP launch
- Zero impact on cost, timeline, or performance of MVP

## 2. Governance Model & Scope

### 2.1 Scope Definition

**In Scope:**

- **Public-facing Experience Cloud (LWR)** site with "5-Minute Tour" guided navigation.
- **Custom LWC component framework** including a custom API Testing Harness.
- **Apex REST API implementation** matching MuleSoft specifications.
- **Generative AI** grounding and prompt engineering in Apex (`PortfolioGroundingService`, `ContentGenerationController.dispatch`). Agentforce is built as a switch in the dispatch and ships off.
- **Client-side document generation** (Resume).
- **Generative AI Utility:** A "Dynamic Cover Letter Engine" that uses Gemma 4 31B through the Gemini API, with a local template as the last resort, to write personalized application letters based on the visitor's job description and the architect's matching project history (featured projects and experience highlights).
- **Gamified Social Proof engine** with "Vibe-Gated" submission logic.
- **Automated CI/CD Pipeline** with Static Analysis, Unit Testing gates, and a results step summary on every PR run ("PR Validation Results" in `pr.yml`).
- **External API Integration (GitHub):** Live feed of portfolio repository commits displayed on the site.
- **External API Integration (Jira):** Live fetch of portfolio roadmap Epics and Stories.
- **Multi-Cloud Integration patterns using AWS Free Tier (Lambda Function URL, S3, CloudFront) – Phase 8 (2027-2028) – design complete**
- **Advanced Visualization:** a skills matrix with "years used" from linked roles, and a D3 force graph that loads only when a visitor opens it ([ADR-020 amendment](../adr/020-mobile-performance-static-svg-fallback-strategy.md)).
- **Dynamic ERD Visualizer:** A live-rendered Entity Relationship Diagram utilizing the Schema class and the same D3 engine to visualize the actual Org metadata, replacing static architecture diagrams.
- **Executable Governance:** LWC-based documentation that verifies its own success criteria from pipeline evidence. CI publishes a platform event, an Apex trigger persists it, and the checklist reads the result when viewed (for example, ticking "production deploy green" with the commit and the run behind it).
- **Enterprise Observability:** structured Apex logging through one seam (`PortfolioLog`) that writes to **Nebula Logger** (Open Source) when the owner has installed it, and to debug logs when not. Nebula is optional, so CI and scratch orgs run without it.

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
- Resume generates in both ATS (Plain Text) and Creative (PDF) modes.
- The skills page shows the matrix on every device, and its graph view opens on desktop and tablet only.
- Mobile responsive layout passes manual verification on iOS Safari and Android Chrome.

**Technical Acceptance:**
| Metric | Current Baseline (Est.) | Target (Hard Gate) |
| :--- | :--- | :--- |
| **LCP (Mobile)** | 8.9 s on `/`, live, before Round 5 (measured) | Target **2.5 s**. Gate: the best the LWR shell allows, measured: mobile LCP medians of 7.5 to 9.6 s (Lighthouse 11 mobile, Round 6) on the six main routes |
| **Apex Coverage** | 78% (Avg Project) | **> 90%** |
| **Code Scanning** | N/A | **0 Critical Violations** |
| **Accessibility** | 85 (Avg Theme) | **100** |

- LCP measured with a Lighthouse mobile audit, three runs per route, medians. The target is 2.5 s. Most of the mobile LCP is render delay in the LWR framework's own script, which keeps it above the target, so the gate is the best the LWR shell allows, measured: mobile LCP medians of 7.5 to 9.6 s (Lighthouse 11 mobile, Round 6) on the six main routes (Technical Guide §2.11).
- All Apex tests > 90% coverage (Hard Governance Gate).
- CI/CD pipeline passing (Green build badge on Repo).
- Zero critical security warnings from PMD Scanner.
- The network log shows no `D3_Library` request until a graph view is opened.
- Lighthouse Accessibility score remains 100 with the "Matrix | Graph" view switch present.
- Skills graph: D3 force layout (`d3-force` and three helper modules, an 18,544 byte static resource, down from the 1.57 MB G6 library), loaded only when a visitor opens the graph view on desktop or tablet. Phones show the skills matrix and request no graph engine, and the Pillar A ERD shows its object list.

**Engagement:**

- Average Session Duration > 2 minutes (verified via GA4).
- **ai_live_model_rate:** % of generations served by a live model, Agentforce or Gemini (Target > 80%). Agentforce ships switched off, so today this is the Gemini share.
- **ai_fallback_usage:** % of generations served by the Local Template (the fallback share).
- **ai_complete_failure_rate:** % of requests that end with no content at all, a 503 or an error message (Target < 1%).
- **finops_quota_visibility:** visitors who hover over or focus the footer's "AI requests today" line.
- All three AI rates come from one GA4 event, `ai_generation_completed`, with the parameters `provider`, `model`, `fallback`, `latency_ms` and `outcome`. GA4 computes the rates, so no counter is stored in Salesforce (owner decision PD-D8, 2026-10-21).

**Conversion:**

- Greater than 20% of visitors interact with "API Tester" or "Resume Builder" (verified via Custom Events).
  - **api_test_executed:** User successfully calls an endpoint in the API Tester.
  - **resume_downloaded** (`format` `pdf`): User exports a resume in Creative Mode.
  - **resilience_test_triggered:** User toggles the "Resilience Simulation" switch.

**Reach:**

- Traffic originating from > 3 distinct geographic regions.

## 3. Program Delivery & Roadmap

This implementation is managed as a multi-workstream program, ensuring dependencies between Schema, API, and UI are managed to minimize critical path blocking.

### 3.1 Program Charter & Workstreams

The delivery is organized into four parallel execution tracks:

1. **Data & Schema:** Foundation layer, security modeling, and AI grounding sources.
2. **Experience Layer:** LWR implementation, branding, and mobile optimization.
3. **Integration Services:** API definitions, Mocking, and External Service configuration.
4. **DevOps & Governance:** CI/CD pipeline, Code Quality gates, and Documentation.

### 3.2 Program Milestones

- **M1 (Foundation):** Schema deployed, Baseline API contracts (OAS) defined. (Completed)
- **M2 (Core Interactions):** LWR Site active, Navigation functional, Resume logic validated.
- **M3 (Integration):** External services (Jira/GitHub) connected, Security scanning active.
- **M4 (Intelligence):** Grounded generation in Apex with a visible fallback chain, "Vibe-Gate" logic tested. Data 360 grounding and Agentforce are deferred ([ADR-011](../adr/011-context-grounding-strategy-direct-crm-vs-data-360.md), 2026-10-22).
- **M5 (Go-Live):** Public Launch, DNS propagation, Telemetry review.

### 3.3 Detailed Phasing

**Phase 1: Core Foundation (Completed)**

- **Org Setup:** (DevHub, DX Project).
- **GitHub Repo Init:** (Branch Protection Rules).
- **CI/CD Pipeline V1:** (Validation Only).

**Phase 2: Data & API Layer (In Progress)**

- **Schema Deployment:** (Completed)
- **Apex REST Services:** (`SAPIProject`, `SAPIExperience`).
- **Data Loading:** (Seed Data).

**Phase 3: UI Framework (Pending)**

- **Theme Layout:** Component.
- **Hero Banner:** (Dynamic).
- **Navigation Service.**

**Phase 4: Integrations**

- **Jira Connect:** (Named Credential).
- **GitHub Connect:** (Cache Strategy).

**Phase 5: Intelligence**

- **Data 360 streams:** the CRM connector ingests the portfolio objects. No search index or retriever is built, and grounding on Data 360 is deferred ([ADR-011 amendment, 2026-10-22](../adr/011-context-grounding-strategy-direct-crm-vs-data-360.md#amendment-2026-10-22-deferred)).
- **Grounding:** in Apex, reading the CRM directly (`PortfolioGroundingService.build`, SAS section 5.4.1).
- **Prompt Engineering:** and the "Show your work" panel (provider, model, latency, attempts and the prompt that was sent, filled by Apex, not by the model)
- **AI Generation Service:** one dispatch: Agentforce only when switched on (it ships off), then Gemma 4 31B through the Gemini API, then the Local Template

**Phase 6: Observability & Launch**

- **System Health "Glass Box Telemetry":** Develop `c-system-health-footer` with deferred loading (ADR-014) to visualize Heap/CPU/API limits.
- **Enterprise Logging:** the owner installs Nebula Logger (unlocked package, no namespace) in production and sets 2-day retention. Apex reaches it only through the `PortfolioLog` seam.
- **Resilience Simulation:** Implement "Resilience Simulation" toggle to force-test Circuit Breakers and cached data fallbacks.
- **Analytics Instrumentation:** Deploy Google Analytics 4 (GA4) with custom events for API tests and resume downloads.
- **API Mode Indicator:** the Glass Box footer measures the guest GraphQL path after first paint and shows it as live with its latency, or as unavailable. It is measured on every visit, never a constant label (owner decision, 2026-10-21).
- **Final Polish:** Mobile optimization, Lighthouse audits, and Public DNS configuration.

**Phase 7: Observability & Governance (Post-Launch)**

- **System Health Dashboard:** "Glass Box Telemetry" footer.
- **Smart Documentation:** moved into the launch scope (owner decision E3, 2026-10-21). `c-smart-checklist` reads `Pipeline_Run__c` records written by an Apex trigger on `Governance_Event__e`, which CI publishes. It does not use `lightning/empApi`, which LWR sites do not support.

**Phase 8: Multi-Cloud & FinOps – Hybrid GraphQL Strategy (2027-2028)**

| Phase       | Status                         | Rationale                                                               |
| :---------- | :----------------------------- | :---------------------------------------------------------------------- |
| **Phase 8** | **Design Complete / Deferred** | Fully architected to prove "Scale Up" capability, but deferred for MVP. |
| **MVP**     | **Live**                       | Focus on measured mobile LCP and the Zero Cost constraint.              |

_Design artifacts complete; implementation begins post-launch._

- **Native GraphQL Verification:**
  - Confirm `c-skill-network` and Project Gallery use `lightning/uiGraphQLApi`. `c-roadmap-viewer` reads Apex over the cache by design (E7)
- **AWS Lambda Polyglot Gateway:** (Function URL) – "Door 2" – **Designed, not yet implemented** (planned 2027-2028)
  - Deploy single HTTPS Function URL endpoint (no API Gateway)
  - Support both REST → GraphQL translation and direct GraphQL
  - In-function governance: `x-api-key` validation, tiered rate limiting, CloudWatch metrics
- **Static Asset Offloading:** (S3 + CloudFront)
  - Migrate heavy media assets (images, videos) from Salesforce Static Resources.
- **Resume Engine Migration:**
  - Move PDF generation from client-side `jsPDF` to serverless Node.js Lambda (perfect fidelity)
- **FinOps & Cost Governance:** ($0.00 forever)
  - Use only Always Free services
  - Deliberately avoid API Gateway and VPC to eliminate all cost traps
  - CloudWatch billing alarm at $0.01
- **API Lab Upgrade:**
  - Enable "Enterprise Mode" toggle
  - Live payload comparison (Native vs Lambda)
  - Real-time rate-limit counters in `c-system-health-footer`

**Phase 9: Edge AI Proxy (Cloudflare Workers)**

## 4. Implementation Checklist (Execution Plan)

**Phase 1: Foundation & DevOps**

- **A.1:** Configure Connected App (JWT) & GitHub Secrets.
- **D.1:** Deploy `Project__c` Object.
- **D.2:** Deploy `Testimonial__c` Object.
- **E.1:** Write ProjectControllerTest (90% Hard Gate).
- **A.7:** Generate C4 Level 1 diagram in IcePanel & Upload as Static Resource.
- **1.3:** Verify Technical Acceptance Criteria (CI/CD Green, LCP Baseline).

**Phase 2: Delivery**

- **Config:** Create free Atlassian Jira account and generate API Token.
- **A.8:** Configure Named Credential Jira_API in Salesforce.
- **Dev:** Develop `c-roadmap-viewer` LWC + `JiraService.cls`.
- **D.3 / D.4:** Deploy `Experience__c` parent and `Experience_Highlight__c` child objects.
- **Dev:** Develop `c-resume-builder` LWC with persona-based Apex filtering logic.

**Phase 3: Integration**

- **Dev:** Implement `SAPIExperience` Apex Class (System API).
- **Appendix C:** Configure MuleSoft Governance Policies (Reference Implementation).
- **Docs:** Upload Redoc documentation as Static Resource.
- **Dev:** Develop `c-api-tester` LWC with fetch() harness.
- **A.4:** Implement GitHub Live Feed, the custom object cache (`Github_Cache__c`), and the Queueable refresh with its scheduler.

**Phase 4: Innovation**

- **A.6:** Agentforce Service Agent and topic grounding. Not built: Agentforce is a switch in the dispatch that ships off (SAS Appendix A.6).
- **Security:** Enable "Lightning Web Security" in Session Settings.
- **Asset:** the `D3_Library` static resource (`d3-force` and its three dependencies, Public cache). It replaced `G6_Library` in Round 5.
- **Dev:** `c-skill-network` shows the matrix and draws the graph view through `c/graphEngine`.
- **Optimization:** the engine loads only when the graph view opens (network log proof).
- **Mobile:** phones show the matrix and never request the engine. This replaced the planned static SVG fallback ([ADR-020 amendment](../adr/020-mobile-performance-static-svg-fallback-strategy.md)).
- **A11y:** nothing animates, and an accessible list mirrors every graph.
- Conduct Mobile QA on iOS and Android devices.

**Phase 5: Optimization**

- **Dev:** Implement `LogService.cls` (Email Offloading).
- **Dev:** Implement "Vibe-Gate" logic on `c-testimonial-submit`.
- **Docs:** Generate C4 Level 2 & 3 Diagrams in IcePanel.

**Phase 6: Observability & Launch**

- **Dev:** Install Nebula Logger (Unlocked Pkg) & configure `LoggerSettings__c`.
- **Dev:** Build `c-system-health-footer` LWC (Glass Box Telemetry) using requestIdleCallback.
- **Dev:** Implement `AnalyticsService.js` for unified GA4 event tracking.
- **Config:** Add "Resilience Simulation" toggle and resilience logic to `GitHubService.cls`.
- **QA:** Verify "Glass Box Telemetry" matches actual Developer Console limits.
- **QA:** Verify GA4 Real-Time view receives api_test_executed events.

## 5. Product Strategy & User Stories

### 5.1 Outcome-Driven Product Framework

Before user stories are written, features are evaluated against a "Problem Statement Framework" to ensure they deliver architectural value.

- **Problem Statement:** Recruiters and Hiring Managers struggle to verify an architect's hands-on skills through static PDFs.
- **The Need:** A verified, interactive demonstration of complex capabilities (API, LWC, AI).
- **The Value:** Reduces "Time-to-Trust" for the evaluator; differentiates the candidate from paper-qualified applicants.

### 5.2 Epic Breakdown Example: Resume Builder

- **Epic:** Dynamic Resume Generation.
- **Value Driver:** Demonstrates ability to manipulate complex data hierarchies and render client-side.
- **Acceptance Criteria:**
  - Loads < 2s.
  - Filters by "Admin" vs "Architect" persona.
  - Exports to clean PDF.

### 5.3 Core User Stories

| ID          | Persona               | I Want To...                     | So That...                                                     |
| :---------- | :-------------------- | :------------------------------- | :------------------------------------------------------------- |
| **SPAP-47** | Motion-Sensitive User | Pause animations                 | The site is accessible and I avoid motion sickness triggers.   |
| **SPAP-46** | Mobile User           | Have fast loading visuals        | Performance stays high and I don't burn data.                  |
| **SPAP-44** | Visitor               | See an animated skill network    | I understand capability relationships visually.                |
| **SPAP-40** | Recruiter             | Generate a tailored cover letter | I immediately see candidate fit without reading a generic bio. |
| **SPAP-35** | Viewer                | See live roadmap data            | I know the current project status and active work.             |
| **SPAP-31** | Recruiter             | See persona-specific bullets     | I see role-relevant accomplishments (Admin vs Architect).      |
| **SPAP-30** | Recruiter             | Download resumes                 | I can store them in my ATS for compliance.                     |
| **SPAP-29** | Recruiter             | View a dynamic resume            | I can evaluate relevant experience quickly.                    |
| **SPAP-28** | Visitor               | Have guided navigation           | I can complete the 5-minute tour efficiently.                  |
| **SPAP-27** | Site Visitor          | See a clear hero banner          | I immediately understand the purpose of the portfolio.         |

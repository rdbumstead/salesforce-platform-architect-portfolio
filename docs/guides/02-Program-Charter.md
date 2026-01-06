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

Date: MVP — Q1 2026

Est. Total Effort: ~70 Hours (MVP Core in ~47 Hours)

## 1. Executive Summary

### 1.1 Purpose of This Document

This Program Charter defines the strategic intent and delivery plan for the Salesforce Platform Architect Portfolio. It serves as the authoritative reference for project scope, business value, and timeline.

### 1.2 Strategic Intent: The Value: A Living Enterprise System

This is not a static website. It is a live, observable platform governed by production constraints. It demonstrates "Enterprise Grade" as a mindset through:

- **Glass Box Telemetry:** Real-time visibility into Governor Limits (Heap, CPU) and API quotas, proving FinOps and multi-tenant awareness.
- **Dynamic Architecture:** A live Entity Relationship Diagram (ERD) generated from the actual production schema, not a static image.
- **Executable Governance:** Documentation that self-verifies against runtime state (e.g., "Pipeline Green" checks verify themselves).
- **Resilience Simulation:** On-demand testing of fallback patterns and circuit breakers (e.g., severing GitHub integration to test graceful degradation).

### 1.3 Current vs. Target Architecture Scope

#### Current MVP State (Q1 2026 Launch)

- 100% on-platform data access using Apex REST + native Salesforce GraphQL (lightning/uiGraphQLApi)
- Skill Graph, Roadmap, and Project Gallery all use native wire adapter for sub-250 ms LCP
- No external dependencies required

#### Target Enterprise State — Phase 8 (Q2 2026) — _Design Complete / Implementation Deferred_

- AWS Lambda Polyglot Gateway (Function URL) "Door 2" fully designed (see SAS 1.1 & 5.3).
- Implementation deferred to guarantee on-time MVP launch
- Zero impact on cost, timeline, or performance of MVP

## 2. Governance Model & Scope

### 2.1 Scope Definition

**In Scope:**

- **Public-facing Experience Cloud (LWR)** site with "5-Minute Tour" guided navigation.
- **Custom LWC component framework** including a custom API Testing Harness.
- **Apex REST API implementation** matching MuleSoft specifications.
- **Agentforce (AI)** grounding and prompt engineering.
- **Client-side document generation** (Resume).
- **Generative AI Utility:** A "Dynamic Cover Letter Engine" that utilizes Agentforce to generate personalized application letters based on the visitor's job description and the architect's matching project history.
- **Gamified Social Proof engine** with "Vibe-Gated" submission logic.
- **Automated CI/CD Pipeline** with Static Analysis, Unit Testing gates, and Automated PR Commenting.
- **External API Integration (GitHub):** Live feed of portfolio repository commits displayed on the site.
- **External API Integration (Jira):** Live fetch of portfolio roadmap Epics and Stories.
- **Multi-Cloud Integration patterns using AWS Free Tier (Lambda Function URL, S3, CloudFront) — Phase 8 (Q2 2026) — design complete**
- **Advanced Visualization:** Dynamic Skill Graph using AntV G6 with custom flow animation.
- **Dynamic ERD Visualizer:** A live-rendered Entity Relationship Diagram utilizing the Schema class and AntV G6 to visualize the actual Org metadata, replacing static architecture diagrams.
- **Executable Governance:** LWC-based documentation that subscribes to Platform Events to automatically verify its own success criteria (e.g., verifying a "Green Build" checkbox in real-time).
- **Enterprise Observability:** Implementation of **Nebula Logger** (Open Source) for structured, event-driven error logging across Apex, LWC, and Flow, replacing standard debug logs.

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
- Skill Graph renders with animated "flow" lines on Desktop (Static SVG on Mobile).
- Mobile responsive layout passes manual verification on iOS Safari and Android Chrome.

**Technical Acceptance:**

- LCP < 2.5s measured via Lighthouse Mobile Audit.
- All Apex tests > 90% coverage (Hard Governance Gate).
- CI/CD pipeline passing (Green build badge on Repo).
- Zero critical security warnings from PMD Scanner.
- Network Tab screenshot confirms G6 lazy-load occurs >2s after LCP.
- Lighthouse Accessibility score remains 100 with animation toggle present.
- Mobile viewport serves <50KB static SVG instead of 220KB G6 library.

**Engagement:**

- Average Session Duration > 2 minutes (verified via GA4).
- **ai_primary_success_rate:** % of requests served by Agentforce (Target > 80%).
- **ai_fallback_usage:** % of requests served by Gemini or Local Template (Success via Resilience).
- **ai_complete_failure_rate:** % returning emergency error message (Target < 1%)
- **finops_quota_visibility:** Users interacting with the Quota/Health footer (Hover events).

**Conversion:**

- Greater than 20% of visitors interact with "API Tester" or "Resume Builder" (verified via Custom Events).
  - `api_test_executed`: User successfully calls an endpoint in the API Tester.
  - `resume_download_pdf`: User exports a resume in Creative Mode.
  - `resilience_test_triggered`: User toggles the "Resilience Simulation" switch.

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
- **M4 (Intelligence):** Data360 Setup and data Ingested, Agentforce grounded, "Vibe-Gate" logic tested.
- **M5 (Go-Live):** Public Launch, DNS propagation, Telemetry review.

### 3.3 Detailed Phasing

**Phase 1: Core Foundation (Completed)**

- Org Setup (DevHub, DX Project).
- GitHub Repo Init (Branch Protection Rules).
- CI/CD Pipeline V1 (Validation Only).

**Phase 2: Data & API Layer (In Progress)**

- Schema Deployment. (Completed)
- Apex REST Services (SAPI_Project, SAPI_Experience).
- Data Loading (Seed Data).

**Phase 3: UI Framework (Pending)**

- Theme Layout Component.
- Hero Banner (Dynamic).
- Navigation Service.

**Phase 4: Integrations**

- Jira Connect (Named Credential).
- GitHub Connect (Cache Strategy).

**Phase 5: Intelligence**

- Data360 Setup
- Data360 Data Integration (CRM Connector → `Project__c`, `Experience__c`)
- Agentforce Grounding on Data360 Data Model Objects (DMOs)
- Prompt Engineering & Mirror Mode configuration
- Triple-fallback AI generation service (Agentforce → Gemini Flash → Local Template)

**Phase 6: Observability & Launch**

- **System Health "Glass Box":** Develop c-system-health-footer with deferred loading (ADR-014) to visualize Heap/CPU/API limits.
- **Enterprise Logging:** Install and configure Nebula Logger (Unlocked Package); configure storage guardrails (2-day retention).
- **Resilience Simulation:** Implement "Resilience Simulation" toggle to force-test circuit breakers and cached data fallbacks.
- **Analytics Instrumentation:** Deploy Google Analytics 4 (GA4) with custom events for API tests and resume downloads.
- **API Mode Indicator:** Glass Box footer displays "GraphQL Mode: Native (Live)" — prepares UI for Phase 8 toggle.
- **Final Polish:** Mobile optimization, Lighthouse audits, and Public DNS configuration.

**Phase 7: Observability & Governance (Post-Launch)**

- **System Health Dashboard:** "Glass Box" footer.
- **Smart Documentation:** Implement c-smart-checklist using lightning/empApi to listen for Deployment_Event\_\_e and auto-complete governance checklists.

**Phase 8: Multi-Cloud & FinOps — Hybrid GraphQL Strategy (Q2 2026)**
_Design artifacts complete; implementation begins post-launch._

- Native GraphQL Verification
  - Confirm Skill Graph, Roadmap, and Project Gallery all use lightning/uiGraphQLApi (already live in MVP)
- AWS Lambda Polyglot Gateway (Function URL) — "Door 2"
  - Deploy single HTTPS Function URL endpoint (no API Gateway)
  - Support both REST → GraphQL translation and direct GraphQL
  - In-function governance: x-api-key validation, tiered rate limiting, CloudWatch metrics
- **Static Asset Offloading (S3 + CloudFront):**
  - Migrate heavy media assets (images, videos) from Salesforce Static Resources.
- Resume Engine Migration
  - Move PDF generation from client-side jsPDF to serverless Node.js Lambda (perfect fidelity)
- **FinOps & Cost Governance ($0.00 forever):**
  - Use only Always Free services
  - Deliberately avoid API Gateway and VPC to eliminate all cost traps
  - CloudWatch billing alarm at $0.01
- **API Lab Upgrade**
  - Enable "Enterprise Mode" toggle
  - Live payload comparison (Native vs Lambda)
  - Real-time rate-limit counters in Glass Box footer

**Phase 9: Edge AI Proxy (Cloudflare Workers)**

## 4. Implementation Checklist (Execution Plan)

**Phase 1: Foundation & DevOps**

- **A.1:** Configure Connected App (JWT) & GitHub Secrets.
- **D.1:** Deploy `Project__c` Object.
- **D.2:** Deploy `Testimonial__c` Object.
- **E.1:** Write ProjectControllerTest (Target: 90% coverage).
- **A.7:** Generate C4 Level 1 diagram in IcePanel & Upload as Static Resource.
- **1.3:** Verify Technical Acceptance Criteria (CI/CD Green, LCP Baseline).

**Phase 2: Delivery**

- Create free Atlassian Jira account and generate API Token.
- **A.8:** Configure Named Credential Jira_API in Salesforce.
- Develop c-roadmap-viewer LWC + JiraService.cls.
- **D.3 / D.4:** Deploy `Experience__c` parent and `Experience_Highlight__c` child objects.
- Develop c-resume-builder LWC with persona-based Apex filtering logic.

**Phase 3: Integration**

- Implement SAPI_Experience Apex Class (System API).
- **Appx C:** Configure MuleSoft Governance Policies (Reference Implementation).
- Upload Redoc documentation as Static Resource.
- Develop c-api-tester LWC with fetch() harness.
- **A.4:** Implement GitHub Live Feed, Custom Setting Cache, and Scheduler.

**Phase 4: Innovation**

- **A.6:** Configure Agentforce Service Agent & Topic Grounding.
- **Security:** Enable "Lightning Web Security" in Session Settings.
- **Asset:** Download g6.min.js (v4.x/v5.x) and upload as G6_Library (Public Cache).
- **Dev:** Implement c-skill-network LWC using G6 graph.update loop for edge animation.
- **Optimization:** Implement G6 lazy-loading (Network Tab proof).
- **Optimization:** Build "Static SVG" fallback for mobile LCP compliance.
  - **Asset:** Export static SVG from G6 during local build (graph.toFullDataURL()).
  - **Upload:** Store SVG as Static Resource "Skill_Graph_Fallback".
  - **Logic:** c-skill-network detects mobile and renders `<img src={staticResourceUrl}>`.
- **A11y:** Add "Pause Animation" toggle button.
- Conduct Mobile QA on iOS and Android devices.

**Phase 5: Optimization**

- Implement LogService.cls (Email Offloading).
- Implement "Vibe-Gate" logic on c-testimonial-submit.
- Generate C4 Level 2 & 3 Diagrams in IcePanel.

**Phase 6: Observability & Launch**

- [ ] **Dev:** Install Nebula Logger (Unlocked Pkg) & configure `LoggerSettings__c`.
- **Dev:** Build c-system-health-footer LWC (Glass Box) using requestIdleCallback.
- **Dev:** Implement AnalyticsService.js for unified GA4 event tracking.
- **Config:** Add "Resilience Simulation" toggle and resilience logic to `GitHubService.cls`.
- **QA:** Verify "Glass Box" matches actual Developer Console limits.
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

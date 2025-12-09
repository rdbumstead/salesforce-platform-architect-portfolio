# Technical Guide

**Table of Contents**

- [1. CI/CD & DevOps Implementation](#1-cicd--devops-implementation)
  - [Authentication](#authentication)
  - [Security Rotation Policy](#security-rotation-policy)
  - [Pipeline Strategy: Delta Deployment](#pipeline-strategy-delta-deployment)
  - [Quality Gates](#quality-gates)
  - [Rollback Plan](#rollback-plan)
- [2. Integration Service Implementation](#2-integration-service-implementation)
  - [2.1 GitHub Integration (Live Feed)](#21-github-integration-live-feed)
  - [2.2 Jira Integration (Roadmap)](#22-jira-integration-roadmap)
  - [2.3 Agentforce Integration](#23-agentforce-integration)
- [3. Frontend (LWR) Component Logic](#3-frontend-lwr-component-logic)
  - [3.1 c-skill-network (Visualization)](#31-c-skill-network-visualization)
  - [3.2 c-resume-builder](#32-c-resume-builder)
  - [3.3 c-testimonial-submit](#33-c-testimonial-submit)
  - [3.4 Dynamic ERD Visualizer (c-schema-visualizer)](#34-dynamic-erd-visualizer-c-schema-visualizer)
  - [3.5 Executable Governance (c-smart-docs)](#35-executable-governance-c-smart-docs)
  - [3.6 c-system-health-footer (Glass Box)](#36-c-system-health-footer-glass-box)
  - [3.7 Architectural Decision Record: ADR-014 (Deferred Telemetry)](#37-architectural-decision-record-adr-014-deferred-telemetry)
  - [3.8 Analytics Instrumentation (GA4)](#38-analytics-instrumentation-ga4)
- [4. Quality Assurance Checklist](#4-quality-assurance-checklist)

---

Project: Salesforce Platform Architect Portfolio

Version: 1.0

Owner: Ryan Bumstead

Date: MVP — Q1 2026

## 1. CI/CD & DevOps Implementation

The pipeline uses **JWT Bearer Flow** for headless, zero-touch authentication within GitHub Actions.

### Authentication

- Connected App with "Use Digital Signatures".
- Keys stored in **GitHub Secrets**.

### Security Rotation Policy

- **Certificate Strength:** 4096-bit RSA.
- **Rotation Schedule:** Every 13 months (400-day certificate validity) with mandatory 30-day overlap
- **Execution window:** within 30 days of certificate expiry or Q4 maintenance
- **Rationale:** Prevents calendar creep and guarantees zero downtime
- **Procedure:** Rotate keys in force-app and GitHub Secrets during the Q4 maintenance window.

```bash
openssl genrsa -des3 -passout pass:SomePassword -out portfolio.pass.key 4096
openssl rsa -passin pass:SomePassword -in portfolio.pass.key -out portfolio.key
openssl req -new -key portfolio.key -x509 -days 400 -out portfolio.crt
```

### Pipeline Strategy: Delta Deployment

To ensure efficiency and avoid hitting Salesforce Metadata API limits, the pipeline utilizes a "Delta Deployment" strategy using sfdx-git-delta.

- **Validation (pr.yml):** Calculates the diff between the PR branch and origin/main. It generates a temporary package of _only_ the changed components and runs a "Dry Run" deployment with RunLocalTests to ensure validity without altering the org.
- **Production (deploy.yml):** Calculates the diff between the current commit and the previous commit (HEAD~1). It deploys strictly the changed metadata to the Production environment.
- **Cross-Platform Compatibility:** The package.json scripts leverage shx and rimraf to ensure all shell commands (mkdir, rm) execute consistently on both Windows (Local Development) and Ubuntu Linux (GitHub Actions Runners).

### Quality Gates

- **Hard Gate (CI Failure):** Apex Coverage < 75%. (The build will fail if this is not met).

```bash
sf apex run test --code-coverage --coverage-requirement 75
```

- **Architectural Target:** Apex Coverage ≥ 90%. (Current State: 80% - Optimization In Progress).

### Rollback Plan

- In case of deployment failure, the mitigation is to revert the main branch to the previous commit SHA and trigger a fresh deployment of the reverted state.
- Verify site health via Smoke Test suite
- **Destructive Changes:** The pipeline is configured to respect destructiveChanges.xml. If metadata is deleted from the repo, sfdx-git-delta will generate the destructive manifest, and the pipeline will automatically delete those components from the Org during deployment.

## 2. Integration Service Implementation

All external API calls originate from a secure **Named Credential** accessed via Apex, with no client-side access tokens used.

### 2.1 GitHub Integration (Live Feed)

- **Mechanism:** Uses the GitHub_API Named Credential.
- **Caching Strategy (ADR-007):**
  - An **Apex Scheduled Job** (`GitHubCacheRefreshJob.cls`) refreshes the API response.
  - Data is stored in the `GitHub_Cache__c` **Custom Setting** to prevent rate-limit exhaustion (60 requests/hour unauthenticated).
- **Degraded Mode:**
  - Upon HTTP 429 response, the system automatically serves cached responses from `GitHub_Cache__c` indefinitely until the limit resets.

### 2.2 Jira Integration (Roadmap)

- **Authentication:** Basic Auth with a Named Credential.
- **Component:** c-roadmap-viewer LWC calls the Apex JiraService.cls to fetch Epics/Stories via REST API.
- **Degraded Mode:**
  - After three consecutive 503 errors, a circuit breaker opens for 30 minutes.
  - The user sees a "Roadmap temporarily unavailable" message.

### 2.3 Agentforce Integration

- **Grounding:** Configure Agent Topic to query Project\_\_c.
- **System Prompt:** Use "Mirror Mode" in system instructions to reveal logic.
- **Fallback:** If unavailable, use "Fallback Mode" in Custom Metadata to display a static "AI Interaction Preview" video.

**Interface Definition (IAIGenerationService):**

```apex
public interface IAIGenerationService {
  AIResponseWrapper generate(String prompt, String context);
  String getProviderName(); // e.g., 'Agentforce'
  Boolean isHealthy(); // Circuit Breaker check
  Integer getEstimatedLatencyMs(); // For Glass Box telemetry
}
```

**Standardized Response Object (AIResponseWrapper):**

```apex
public class AIResponseWrapper {
  @AuraEnabled
  public String status; // 'success' | 'fallback' | 'error'
  @AuraEnabled
  public String provider; // 'agentforce' | 'gemini' | 'local_template'
  @AuraEnabled
  public String content;
  @AuraEnabled
  public Integer latencyMs;

  public AIResponseWrapper(
    String status,
    String provider,
    String content,
    Integer latencyMs
  ) {
    this.status = status;
    this.provider = provider;
    this.content = content;
    this.latencyMs = latencyMs;
  }
}
```

**Gemini Quota Implementation:**

- **Logic:** Check `Cache.Org.getPartition('local.AIMetrics').get('GeminiDailyCount')`.
- **Threshold:** If count >= 1200, throw custom QuotaExceededException.
- **Increment:** On success/fail, increment cache key `GeminiDailyCount_{Date}` (TTL: 24h).

## 3. Frontend (LWR) Component Logic

The front-end is based on **LWR** for sub-second page loads. **Lightning Web Security (LWS)** is required for security and to support libraries like AntV G6 and jsPDF.

### 3.1 c-skill-network (Visualization)

- **Lazy Loading:** Dynamic import (lazy-loading) of the **G6 library** occurs only when the component enters the viewport to maintain a fast initial LCP.
- **Mobile Guardrail:**
  - Automatically detects mobile viewports (FORM_FACTOR).
  - Falls back to a **static SVG image** (Skill_Graph_Fallback Static Resource) to prevent rendering overhead on low-power devices.
- **Stale Data Guardrail:** Mobile SVG includes embedded build timestamp. If server-side skill count > SVG metadata count, a subtle "Graph outdated — refresh for latest" banner appears.
- **Accessibility (A11y):**
  - Includes a "Pause Animation" toggle button.
  - Uses the **"Shadow Structure" Pattern** (a visually hidden `<ul>`) for screen readers.

### 3.2 c-resume-builder

- Performs client-side PDF generation using **jsPDF**.
- The underlying Apex logic filters Experience_Highlight\_\_c records based on the user's requested **Persona Tag** (e.g., Admin vs. Architect).

### 3.3 c-testimonial-submit

- Uses a "Mad Libs" style sentence builder.
- Includes a "Vibe Toggle" (Professional/Casual) to implement the "Vibe-Gated" submission pattern.

### 3.4 Dynamic ERD Visualizer (c-schema-visualizer)

- **Schema Extraction:** The Apex controller SchemaService.cls utilizes Schema.getGlobalDescribe() to dynamically map Project**c, Skill**c, and their Junction objects.
- **Node Mapping:** Salesforce Child Relationships (getDescribe().getChildRelationships()) are mapped to G6 "Edges," while SObjects are mapped to "Nodes."
- **Performance:** To prevent Heap Size errors during schema description, the service is strictly scoped to the portfolio namespace and caches the JSON result in Platform Cache.

### 3.5 Executable Governance (c-smart-docs)

- **Event Subscription:** Utilizes the lightning/empApi module to subscribe to event/Governance_Notification\_\_e.
- **State Management:** The component maintains the state of checklist items (e.g., isBuildGreen, isTestsPassing) in the browser's localStorage so the "Verified" checkmarks persist across page reloads for the user session.

### 3.6 c-system-health-footer (Glass Box)

- **Component:** c-system-health-footer
- **Purpose:** Displays real-time Salesforce Limits (Heap, CPU) and GitHub API quotas.
- **Implementation:** Uses the **Deferred Loading Pattern** (see ADR-014). The component loads with placeholder data and triggers the Apex data fetch only via requestIdleCallback() to ensure it never delays the main page load (LCP).
- **Resilience Toggle:** Includes the "Resilience Simulation" switch that forces the GitHubService into a degraded state for testing.
- **Telemetry Data:**
  - AI Provider: Name, Health Status, Latency.
  - FinOps Quota: Gemini requests remaining (Calculated from Org Cache).

### 3.7 Architectural Decision Record: ADR-014 (Deferred Telemetry)

- **Context:** Real-time telemetry is non-essential for the user journey.
- **Decision:** All "System Health" data fetching must be decoupled from the critical rendering path.
- **Implementation:** Fetch logic is wrapped in requestIdleCallback() (or a 3000ms setTimeout fallback).
- **Consequence:** Zero impact on LCP scores; UI renders instantly, health bars animate in later.

### 3.8 Analytics Instrumentation (GA4)

- **Global Tag:** Injected via Experience Builder Head Markup.
- **Event Strategy:**
  - `page_view`: Automatic (History State Change).
  - `generate_resume`: Triggered on PDF generation success (tracks conversion).
  - `api_test_run`: Triggered on REST Callout completion (tracks engagement).
  - `resilience_simulation_toggled`: Triggered when the Chaos Mode switch is flipped.

## 4. Quality Assurance Checklist

- [ ] **LCP:** Verify < 2.5s via Lighthouse Mobile Audit.
- [ ] **Coverage:** Verify Apex tests > 75% coverage.
- [ ] **Security:** Verify Zero critical warnings from PMD Scanner.
- [ ] **Accessibility:** Confirm the "Pause Animation" toggle exists and works.
- [ ] **Degradation Test:** Toggle "Resilience Simulator" (disconnect GitHub). Verify UI seamlessly switches to cached data with a "Data Stale" badge.
- [ ] **Limit Visibility:** Verify "Glass Box" footer accurately reflects Heap Size changes after running a heavy operation.
- [ ] **Analytics:** Verify api_test_executed event fires in GA4 Real-Time view when using the API Tester.
- [ ] Verify Skill Graph/Roadmap use lightning/uiGraphQLApi (Network tab shows /graphql call to Salesforce domain)
- [ ] API Lab "Enterprise Mode" tab disabled with clear "Phase 8 — Q2 2026" messaging
- [ ] **Circuit Breaker Recovery:**
  1. Trigger 3 Agentforce failures (mock).
     - PASS: Circuit auto-resets to **Closed**.
  2. Wait 61 seconds.
     - PASS: Next request attempts Agentforce.
  3. Submit new request.
     - PASS: Nebula logs "Circuit recovered".

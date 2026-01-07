# Technical Guide

**Table of Contents**

- [1. Integration Service Implementation](#1-integration-service-implementation)
  - [1.1 GitHub Integration (Live Feed)](#11-github-integration-live-feed)
  - [1.2 Jira Integration (Roadmap)](#12-jira-integration-roadmap)
  - [1.3 Agentforce Integration](#13-agentforce-integration)
  - [1.4 System API Security (The "Twin" Pattern)](#14-system-api-security-the-twin-pattern)
- [2. Frontend (LWR) Component Logic](#2-frontend-lwr-component-logic)
  - [2.1 `c-skill-network` (Visualization)](#21-c-skill-network-visualization)
  - [2.2 `c-resume-builder` (Resume Generation)](#22-c-resume-builder-resume-generation)
  - [2.3 `c-testimonial-submit` (Social Proof)](#23-c-testimonial-submit-social-proof)
  - [2.4 `c-schema-visualizer` (Dynamic ERD Visualizer)](#24-c-schema-visualizer-dynamic-erd-visualizer)
  - [2.5 `c-smart-docs` (Executable Governance)](#25-c-smart-docs-executable-governance)
  - [2.6 `c-system-health-footer` (Glass Box Telemetry)](#26-c-system-health-footer-glass-box-telemetry)
  - [2.7 Architectural Decision Record: ADR-014 (Deferred Telemetry)](#27-architectural-decision-record-adr-014-deferred-telemetry)
  - [2.8 Analytics Instrumentation (GA4)](#28-analytics-instrumentation-ga4)
- [3. Quality Assurance Checklist](#3-quality-assurance-checklist)
  - [3.4 Concrete Testing Example](#34-concrete-testing-example)

---

Project: Salesforce Platform Architect Portfolio

Version: 1.0

Owner: Ryan Bumstead

Date: MVP – Q1 2026

## 1. Integration Service Implementation

All external API calls originate from a secure **Named Credential** accessed via Apex, with no client-side access tokens used.

### 1.1 GitHub Integration (Live Feed)

- **Mechanism:** Uses the GitHub_API Named Credential.
- **Caching Strategy (ADR-007):**
  - An **Apex Scheduled Job** (`GitHubCacheRefreshJob.cls`) refreshes the API response.
  - Data is stored in the `GitHub_Cache__c` **Custom Setting** to prevent rate-limit exhaustion (60 requests/hour unauthenticated).
- **Degraded Mode:**
  - Upon HTTP 429 response, the system automatically serves cached responses from `GitHub_Cache__c` indefinitely until the limit resets.

### 1.2 Jira Integration (Roadmap)

- **Authentication:** Basic Auth with a Named Credential.
- **Component:** `c-roadmap-viewer` LWC calls the Apex JiraService.cls to fetch Epics/Stories via REST API.
- **Degraded Mode:**
  - After three consecutive 503 errors, a Circuit Breaker opens for 30 minutes.
  - The user sees a "Roadmap temporarily unavailable" message.

### 1.3 Agentforce Integration

- **Grounding:** Configure Agent Topic to query `Project__c`.
- **System Prompt:** Use "Mirror Mode" in system instructions to reveal logic.
- **Resilience Strategy (Triple Fallback):**
  1. **Primary:** Call Agentforce (Standard).
  2. **Secondary:** If timeout/error, call Google Gemini Flash (via Named Credential).
  3. **Tertiary (Safety Net):** If both fail or quotas exceeded, load "Local Template" from Static Resource (Deterministic JSON).
- **Fallback Mode:** Configurable via Custom Metadata to force degradation for testing.

### 1.4 System API Security (The "Twin" Pattern)

This architecture simulates an enterprise API Gateway hand-off:

| Role          | Component                | Responsibility                                           | Implementation                                                                                                                           |
| :------------ | :----------------------- | :------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------- |
| **Sender**    | PAPI (Integration Layer) | **Secure Storage:** Holds the keys to access Salesforce. | In a real scenario, keys live in AWS Secrets Manager. In this demo, they are configuration properties injected at runtime.               |
| **Validator** | SAPI (Salesforce Core)   | **Policy Enforcement:** Verifies the keys permit access. | Uses `Portfolio_Config__mdt` to act as a local decision point, rejecting requests with invalid headers before they reach business logic. |

**Interface Definition (IAIGenerationService):**

```apex
public interface IAIGenerationService {
  AIResponseWrapper generate(String prompt, String context);
  String getProviderName(); // e.g., 'Agentforce'
  Boolean isHealthy(); // Circuit Breaker check
  Integer getEstimatedLatencyMs(); // For Glass Box Telemetry
}
```

**Standardized Response Object (AIResponseWrapper):**

<details>
<summary>View AIResponseWrapper.cls</summary>

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

</details>

**Gemini Quota Implementation:**

- **Logic:** Check `Cache.Org.getPartition('local.AIMetrics').get('GeminiDailyCount')`.
- **Threshold:** If count >= 1200, throw custom QuotaExceededException.
- **Increment:** On success/fail, increment cache key `GeminiDailyCount_{Date}` (TTL: 24h).

## 2. Frontend (LWR) Component Logic

The front-end is based on **LWR** for sub-second page loads. **Lightning Web Security (LWS)** is required for security and to support libraries like AntV G6 and jsPDF.

### 2.1 `c-skill-network` (Visualization)

- **Lazy Loading:** Dynamic import (lazy-loading) of the **G6 library** occurs only when the component enters the viewport to maintain a fast initial LCP.
- **Mobile Guardrail:**
  - Automatically detects mobile viewports (FORM_FACTOR).
  - Falls back to a **static SVG image** (Skill_Graph_Fallback Static Resource) to prevent rendering overhead on low-power devices.
- **Stale Data Guardrail:** Mobile SVG includes embedded build timestamp. If server-side skill count > SVG metadata count, a subtle "Graph outdated – refresh for latest" banner appears.
- **Accessibility (A11y):**
  - Includes a "Pause Animation" toggle button.
  - Uses the **"Shadow Structure" Pattern** (a visually hidden `<ul>`) for screen readers.

### 2.2 `c-resume-builder` (Resume Generation)

- **Pdf Generation:** Performs client-side PDF generation using **jsPDF**.
- **Logic:** The underlying Apex logic filters `Experience_Highlight__c` records based on the user's requested **Persona Tag** (e.g., Admin vs. Architect).

### 2.3 `c-testimonial-submit` (Social Proof)

- Uses a "Mad Libs" style sentence builder.
- Includes a "Vibe Toggle" (Professional/Casual) to implement the "Vibe-Gated" submission pattern.

### 2.4 `c-schema-visualizer` (Dynamic ERD Visualizer)

- **Schema Extraction:** The Apex controller `SchemaService.cls` utilizes `Schema.getGlobalDescribe()` to dynamically map `Project__c`, `Skill__c`, and their Junction objects.
- **Node Mapping:** Salesforce Child Relationships (getDescribe().getChildRelationships()) are mapped to G6 "Edges," while SObjects are mapped to "Nodes."
- **Performance:** To prevent Heap Size errors during schema description, the service is strictly scoped to the portfolio namespace and caches the JSON result in Platform Cache.

### 2.5 `c-smart-docs` (Executable Governance)

- **Event Subscription:** Utilizes the `lightning/empApi` module to subscribe to `event/Governance_Notification__e`.
- **State Management:** The component maintains the state of checklist items (e.g., `isBuildGreen`, `isTestsPassing`) in the browser's `localStorage` so the "Verified" checkmarks persist across page reloads for the user session.

### 2.6 `c-system-health-footer` (Glass Box Telemetry)

- **Component:** `c-system-health-footer`
- **Purpose:** Displays real-time Salesforce Limits (Heap, CPU) and GitHub API quotas.
- **Implementation:** Uses the **Deferred Loading Pattern** (see ADR-014). The component loads with placeholder data and triggers the Apex data fetch only via requestIdleCallback() to ensure it never delays the main page load (LCP).
- **Resilience Toggle:** Includes the "Resilience Simulation" switch that forces the GitHubService into a degraded state for testing.
- **Telemetry Data:**
  - AI Provider: Name, Health Status, Latency.
  - FinOps Quota: Gemini requests remaining (Calculated from Org Cache).

### 2.7 Architectural Decision Record: ADR-014 (Deferred Telemetry)

- **Context:** Real-time telemetry is non-essential for the user journey.
- **Decision:** All "System Health" data fetching must be decoupled from the critical rendering path.
- **Reference:** See **[ADR-014: Deferred Telemetry Loading](../adr/014-deferred-telemetry-loading-performance.md)** for full decision context.

### 2.8 Analytics Instrumentation (GA4)

- **Global Tag:** Injected via Experience Builder Head Markup.
- **Event Strategy:**
  - `page_view`: Automatic (History State Change).
  - `resume_download_pdf`: Triggered on PDF generation success (tracks conversion).
  - `api_test_executed`: Triggered on REST Callout completion (tracks engagement).
  - `resilience_test_triggered`: Triggered when the Resilience Simulation switch is flipped.

## 3. Quality Assurance Checklist

- [ ] **LCP:** Verify < 2.5s via Lighthouse Mobile Audit.
- [ ] **Coverage:** Verify Apex tests > 90% coverage (Hard Gate).
- [ ] **Security:** Verify Zero critical warnings from PMD Scanner.
- [ ] **Accessibility:** Confirm the "Pause Animation" toggle exists and works.
- [ ] **Degradation Test:** Toggle "Resilience Simulation" (disconnect GitHub). Verify UI seamlessly switches to cached data with a "Data Stale" badge.
- [ ] **Limit Visibility:** Verify "Glass Box Telemetry" footer accurately reflects Heap Size changes after running a heavy operation.
- [ ] **Analytics:** Verify api_test_executed event fires in GA4 Real-Time view when using the API Tester.
- [ ] Verify Skill Graph/Roadmap use lightning/uiGraphQLApi (Network tab shows /graphql call to Salesforce domain)
- [ ] API Lab "Enterprise Mode" tab disabled with clear "Phase 8 – Q2 2026" messaging
- [ ] **Circuit Breaker Recovery:**
  - [ ] Trigger 3 Agentforce failures (mock).
    - PASS: Circuit auto-resets to **Closed**.
  - [ ] Wait 61 seconds.
    - PASS: Next request attempts Agentforce.
  - [ ] Submit new request.
    - PASS: Nebula logs "Circuit recovered".

## 3.4 Concrete Testing Example

We don't just "aim" for quality; we enforce it. Here is a real example of an Apex test that mocks the GitHub API and enforces Governor Limits:

```apex
@IsTest
private class GitHubServiceTest {
  @IsTest
  static void testGetRepoDetails_EnforcesLimits() {
    // 1. Set Mock with specific payload
    Test.setMock(
      HttpCalloutMock.class,
      new GitHubMockResponse(200, '{"stargazers_count": 5}')
    );

    // 2. Execute within Governor Limit tracking
    Test.startTest();
    GitHubService.RepoDetails result = GitHubService.getRepoDetails('my-repo');
    Test.stopTest();

    // 3. Assert Logic AND Governance
    System.assertEquals(5, result.stars, 'Should parse JSON correctly');
    System.assertEquals(
      1,
      Limits.getCallouts(),
      'Should make exactly 1 callout'
    );
    System.assert(
      Limits.getHeapSize() < 100000,
      'Heap usage should be minimal'
    );
  }
}
```

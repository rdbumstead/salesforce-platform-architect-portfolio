# Technical Guide

**Table of Contents**

- [1. Integration Service Implementation](#1-integration-service-implementation)
  - [1.1 GitHub Integration (Live Feed)](#11-github-integration-live-feed)
  - [1.2 Jira Integration (Roadmap)](#12-jira-integration-roadmap)
  - [1.3 Agentforce Integration (Deferred)](#13-agentforce-integration-deferred)
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

Date: MVP – Q1 2027

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

### 1.3 Agentforce Integration (Deferred)

> [!NOTE]
> **Agentforce is deferred** (decision 2026-10-02, recorded in the [ADR-015 amendment](../adr/015-strategy-pattern-for-generative-ai.md#amendment-2026-10-20)). `AgentforceService` is a mock: `AgentforceService.generateContent` returns the fixed string `Agentforce response for: <prompt>`. Nothing in this guide claims Agentforce as a live provider.

- **Providers that serve real content:** Google Gemini (`GeminiService`, through the `Gemini_API` Named Credential) and the deterministic Local Template (`LocalTemplateService`).
- **Design retained for later:** an Agent Topic grounded on `Project__c` with "Mirror Mode" system instructions. It is not built.

### 1.4 System API Security (The "Twin" Pattern)

The APIs use platform-native OAuth 2.0 on both sides of the boundary ([ADR-027](../adr/027-platform-native-api-authentication.md)). The earlier design validated `client_id`/`client_secret` headers against Custom Metadata to simulate a MuleSoft policy point; that simulation was retired when MuleSoft left the architecture.

| Role         | Component                                              | Responsibility                                                          | Implementation                                                                                                                                                                                                               |
| :----------- | :----------------------------------------------------- | :---------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Provider** | External Client App (Client Credentials flow)          | **Authentication:** issues Bearer tokens; rejects bad callers upstream  | Runs as a dedicated integration user holding `Integration_Access` (read-only objects + execute on `SAPI*`/`PAPI*`). The platform rejects unauthenticated calls before Apex.                                                  |
| **Consumer** | External Credential + `Portfolio_API` Named Credential | **Secure Storage:** holds the consumer key/secret in the platform vault | Used by `ApiLabController` (site proxy) and the PAPI health check. No secret is ever stored in metadata or source.                                                                                                           |
| **Vendor**   | `PAPIAuthToken` (`POST /papi/v1/auth/token`)           | **Evaluator access:** exchanges email + purpose for a short-lived token | The only REST class the guest user can execute ([ADR-028](../adr/028-evaluator-access-via-token-vending.md)). Shares `TokenExchangeService` with the proxy.                                                                  |
| **Context**  | `ApiRequestContext` (shared by every REST class)       | **Contract hygiene:** headers, pagination, errors, cache, rate limits   | Reads/echoes `X-Request-Id` and `X-API-Version`, bounds `limit`/`offset`, emits the `Error` schema, applies `Cache-Control` per resource, enforces [ADR-025](../adr/025-papi-fan-out-throttling-capacity-planning.md) tiers. |

**Deployment prerequisites (per org):**

1. **Integration user** (`portfolio-api@ryanbumstead.com` in the production org) on the **`Portfolio API Integration`** profile. The profile is in source (`packages/integration-api/main/default/profiles/`): Salesforce Platform licence, API access only, the licence's default object permissions revoked, and a 30-minute session timeout (`Portfolio_API_Integration.profileSessionSetting-meta.xml`). The user itself is created in Setup.
2. **`Integration_Access`** assigned to the integration user. It is the only source of data access: read-only on `Account`, `Certification__c`, `Contact`, `Education__c`, `Experience_Highlight__c`, `Experience_Skill__c`, `Experience__c`, `Github_Cache__c`, `Jira_Cache__c`, `Project_Asset__c`, `Project_Skill__c`, `Project__c`, `Skill__c` and `Testimonial__c`, no editable field, plus execute access on the SAPI and PAPI REST classes ([ADR-027 amendment](../adr/027-platform-native-api-authentication.md#amendment-2026-10-20)).
3. **"Portfolio API" External Client App**, created in Setup (it is not in source): Client Credentials flow enabled, "run as" set to the integration user, pre-authorised through `Integration_Access`.
4. **External Credential principal.** `Portfolio_API_Auth` (in source) has one named principal, `Portfolio_API_Principal`. Enter the app's consumer key and secret on that principal in Setup. They are never in source or custom metadata.
5. **`Portfolio_API` Named Credential** (in source), URL `https://ryan-bumstead-dev-ed.develop.my.salesforce.com` (the My Domain root), authenticated by `Portfolio_API_Auth`. Callers append `/services/apexrest/...`.
6. Guest profile granted execute access on `PAPIAuthToken` only.
7. **Schedule the cache cleanup job.** `CacheCleanupScheduler` is not scheduled by any deploy. `CacheCleanupScheduler.execute` checks `CacheCleanupSettings.isEnabled()` and then calls `CacheCleanupOrchestrator.run()`, which starts `GithubCacheCleanupBatch`. Schedule it once per org from anonymous Apex, as an administrator:

   ```apex
   System.schedule(
     'Cache Cleanup Daily',
     '0 0 3 * * ?',
     new CacheCleanupScheduler()
   );
   ```

   Check it with `SELECT CronJobDetail.Name, NextFireTime FROM CronTrigger WHERE CronJobDetail.Name = 'Cache Cleanup Daily'`.

**Operational notes:** rotation and revocation procedures are in the [Maintenance Guide §1.2](./05-Maintenance-Guide.md#12-external-client-app-secret-rotation).

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

> [!TIP]
> **Show, Don't Tell:** Instead of manually checking these items, run the unified verification script to audit the entire system state in one command:
>
> ```bash
> npm run pre-launch-check
> # Runs: LCP audit (Lighthouse), PMD security scan, Apex test coverage, and Circuit Breaker simulation
> ```

### 3.1 Key Verification Items

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

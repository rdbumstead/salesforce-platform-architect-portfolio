# Technical Guide

**Table of Contents**

- [1. Integration Service Implementation](#1-integration-service-implementation)
  - [1.1 GitHub Integration (Live Feed)](#11-github-integration-live-feed)
  - [1.2 Jira Integration (Roadmap)](#12-jira-integration-roadmap)
  - [1.3 AI Content Generation (Agentforce switch off)](#13-ai-content-generation-agentforce-switch-off)
  - [1.4 System API Security (The "Twin" Pattern)](#14-system-api-security-the-twin-pattern)
- [2. Frontend (LWR) Component Logic](#2-frontend-lwr-component-logic)
  - [2.1 `c-skill-network` (Visualization)](#21-c-skill-network-visualization)
  - [2.2 `c-resume-builder` (Resume Generation)](#22-c-resume-builder-resume-generation)
  - [2.3 `c-testimonial-submit` (Social Proof)](#23-c-testimonial-submit-social-proof)
  - [2.4 `c-schema-visualizer` (Dynamic ERD Visualizer)](#24-c-schema-visualizer-dynamic-erd-visualizer)
  - [2.5 `c-smart-checklist` (Executable Governance)](#25-c-smart-checklist-executable-governance)
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

- **Mechanism:** Uses the `GitHub_API` Named Credential, authenticated by the `GitHub_Auth` External Credential (a read-only token in the `GitHub_Principal` principal). Authenticated calls get 5,000 requests an hour.
- **Caching Strategy ([ADR-007](../adr/007-github-api-server-side-caching.md#amendment-2026-10-21-round-4)):**
  - `IntegrationCacheRefreshScheduler` runs at :00, :15, :30 and :45 and enqueues `GitHubCacheRefreshJob` (`Queueable`, `Database.AllowsCallouts`, because scheduled Apex cannot call out synchronously).
  - The job reads the latest commits on `main` and inserts one row into the `Github_Cache__c` **custom object**, with the mapped commit list in `JSON_Payload__c`.
  - Guests never call out. The `c-changelog` component reads the newest row through `DeliveryController.getRecentCommits()`.
- **Degraded Mode:**
  - A failed refresh inserts nothing, so the last good list keeps showing with its age.
  - The cleanup batch keeps the newest row per cache object, so an outage never empties the page.

### 1.2 Jira Integration (Roadmap)

- **Authentication:** Basic Auth through the `Jira_API` Named Credential (`Jira_Auth` External Credential, `Jira_Principal` principal).
- **Refresh:** `JiraCacheRefreshJob`, enqueued by the same scheduler, runs the JQL `project = SPAP AND labels = portfolio-roadmap` (owner decision E6, 2026-10-21) and inserts one `Jira_Cache__c` row.
- **Component:** `c-roadmap-viewer` reads the newest row through `DeliveryController.getRoadmap()` and places issues in To Do, In Progress and Done by Jira status category, so a renamed workflow status cannot empty a column. It never calls Jira.
- **Principal access:** the scheduling admin user reaches both principals through `Portfolio_Admin` (owner decision E8, 2026-10-21). `Integration_Access` keeps them too, by the owner's choice. `Portfolio_Guest` has neither.
- **Degraded Mode:**
  - After three consecutive failures, a circuit breaker skips Jira refreshes for 30 minutes, and `DeliveryController` reports `DEGRADED` while it is open.
  - With no usable cache row, the user sees a "Roadmap temporarily unavailable" message.

### 1.3 AI Content Generation (Agentforce switch off)

> [!NOTE]
> **Agentforce is not implemented, and its switch ships off** (decision 2026-10-02, [ADR-015 Round 3 amendment](../adr/015-strategy-pattern-for-generative-ai.md#amendment-2026-10-21-round-3)). `AgentforceService.generateContent` throws, so nothing in this guide claims Agentforce as a live provider.

- **One dispatch.** `ContentGenerationController.dispatch` tries Agentforce, then Gemini, then the Local Template (cover letters only), and records every attempt with its outcome and elapsed time.
  - Agentforce is consulted only when `AgentforceService.isAvailable` is true: the `Agentforce` record of `AI_Provider_Config__mdt` has `Enabled__c` set, and the running user is not a site guest. The record ships with `Enabled__c` false. Switching it on today only adds a failed attempt, because the class throws.
  - Gemini is Gemma 4 31B (`gemma-4-31b-it`, `GeminiService.MODEL`) through the Gemini API and the `Gemini_API` Named Credential, with a 60 second callout timeout from the `Gemini` record (owner decision 2026-10-21). Gemma 4 always reasons before it answers (the owner measured 28.7 seconds for a trivial prompt), so a cover letter can take up to about a minute. `GeminiService` reports a failure as text starting `Error: Unable to generate content.` or `Exception: `, which the dispatch treats as a failed attempt.
  - The Local Template serves a cover letter when Gemini fails. Other content types answer 503 `ALL_PROVIDERS_UNAVAILABLE`.
- **Callers.** `PAPIAiGenerate.generate` (`POST /papi/v1/ai/generate`) calls the dispatch for outside callers with a Bearer token and returns `provider`, `model`, `fallbackOccurred`, `latencyMs`, `attempts` and `promptShown`. The site's cover letter page (`coverLetterGenerator`) calls `ApiLabController.generateCoverLetter`, which runs the same dispatch **in process, as the site guest** ([ADR-015 Round 4 amendment](../adr/015-strategy-pattern-for-generative-ai.md#amendment-2026-10-21-round-4)):
  - It checks the AI tier key with `ApiRequestContext.rateLimiter().checkKey` (the same `papi-ai` prefix as `/papi/v1/ai/`, 10 requests a minute) before the dispatch and writes the count with `ApiRequestContext.commitRateCounts()` after it, so the footer's "AI requests today" counts both paths.
  - `Portfolio_Guest` holds the `Gemini_Auth-Gemini_Principal` principal for this. Agentforce is never consulted for a guest.
  - Grounding as the guest goes through a `without sharing` selector that returns a fixed shape with no email, phone or owner field, because a guest sees only rows shared to it.
  - Why not through the API: the Round 3 page posted to the org's own `/papi/v1/ai/generate` through the `Portfolio_API` Named Credential. A request that arrives as a callout from the same org may not call out again ("Callout loop not allowed"), so Gemini could never answer the page and every live letter came from the Local Template.
- **Limits.** The Gemini key's free tier allows Gemma 4 31B 30 requests per minute, 16,000 tokens per minute and 14,400 requests per day.
- **Grounding.** `PortfolioGroundingService` adds featured projects and experience highlights to a cover letter prompt, ranked by keywords from the job title and description. It never selects Email, Phone or an owner field, strips anything shaped like an email address or phone number, and caps the JSON at 8,000 characters (about 2,000 tokens).
- **Show your work.** The page's badge shows the provider and model from the response. A panel the visitor opens shows the fallback flag, the round trip and generation time, the attempts and the prompt that was sent. The panel is built in Apex and the component, not by asking the model to reveal its prompt.
- **Footer.** `ContentGenerationController.providerStatus()` returns each provider's switch and state (`on`, `off`, `not built`) for the Round 4 footer.
- **Not built:** a real Agentforce provider and the hourly budget it needs (`Hourly_Budget__c` is in the config but not read yet).

### 1.4 System API Security (The "Twin" Pattern)

The APIs use platform-native OAuth 2.0 on both sides of the boundary ([ADR-027](../adr/027-platform-native-api-authentication.md)). The earlier design validated `client_id`/`client_secret` headers against Custom Metadata to simulate a MuleSoft policy point; that simulation was retired when MuleSoft left the architecture.

| Role         | Component                                              | Responsibility                                                          | Implementation                                                                                                                                                                                                                                                                                                                  |
| :----------- | :----------------------------------------------------- | :---------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Provider** | External Client App (Client Credentials flow)          | **Authentication:** issues Bearer tokens; rejects bad callers upstream  | Runs as a dedicated integration user holding `Integration_Access` (read-only objects + execute on `SAPI*`/`PAPI*`). The platform rejects unauthenticated calls before Apex.                                                                                                                                                     |
| **Consumer** | External Credential + `Portfolio_API` Named Credential | **Secure Storage:** holds the consumer key/secret in the platform vault | Used by `ApiLabController.invoke` (site proxy) and `PAPIHealth` (credential check). Token vending uses a second pair, `Portfolio_API_Token_Auth` and `Portfolio_API_Token`. No secret is ever stored in metadata or source.                                                                                                     |
| **Vendor**   | `PAPIAuthToken` (`POST /papi/v1/auth/token`)           | **Evaluator access:** exchanges email + purpose for a short-lived token | The only REST class the guest user can execute ([ADR-028](../adr/028-evaluator-access-via-token-vending.md)). Shares `TokenExchangeService` with the proxy.                                                                                                                                                                     |
| **Context**  | `ApiRequestContext` (shared by every REST class)       | **Contract hygiene:** headers, pagination, errors, cache, rate limits   | Reads `X-Request-Id` and `X-API-Version` (sets `X-Request-Id` only when it generated one), bounds `limit`/`offset`, emits the `Error` schema, applies `Cache-Control` per resource, and enforces the [ADR-025](../adr/025-papi-fan-out-throttling-capacity-planning.md#amendment-2026-10-21) tiers through `RateWindowLimiter`. |

**Rate limiting.** Rate limits are enforced in Apex by `RateWindowLimiter`, a custom-object counter: one `API_Rate_Window__c` row per caller key per minute. For SAPI and PAPI requests the caller key is `{tier}:{SHA-256 hex of the session id}`, or `{tier}:{user id}` when the session id is null; the token endpoint keys by `papi-token:{SHA-256 of lowercase email|source IP}`. Tiers: `sapi` 120, `papi` 15, `papi-ai` (`/papi/v1/ai/*`) 10 requests per minute, over a fixed calendar minute. Request limit + 1 within a minute gets `429` `RATE_LIMIT_EXCEEDED` with `Retry-After` set to the seconds left in the minute. The check (`RateWindowLimiter.checkKey`) reads and locks the row and writes nothing; the count is written with the response (`ApiRequestContext.ok`/`error`) or by `ApiRequestContext.commitRateCounts()` for non-REST callers, so resources may make callouts after `begin()`. Full rules: [ADR-025 amendment (2026-10-21)](../adr/025-papi-fan-out-throttling-capacity-planning.md#amendment-2026-10-21).

**Deployment prerequisites (per org):**

1. **Integration user** (`portfolio-api@ryanbumstead.com` in the production org) on the **`Portfolio API Integration`** profile. The profile is in source (`packages/integration-api/main/default/profiles/`): Salesforce Platform licence, API access only, the licence's default object permissions revoked, and a 30-minute session timeout (`Portfolio_API_Integration.profileSessionSetting-meta.xml`). The user itself is created in Setup.
2. **`Integration_Access`** assigned to the integration user. It is the only source of data access: read-only on `Account`, `Certification__c`, `Certification_Skill__c`, `Contact`, `Education__c`, `Experience_Highlight__c`, `Experience_Skill__c`, `Experience__c`, `Github_Cache__c`, `Jira_Cache__c`, `Project_Asset__c`, `Project_Skill__c`, `Project__c`, `Skill__c` and `Testimonial__c`, no editable field, plus execute access on 21 SAPI and PAPI REST classes (every resource class except `PAPIAuthToken`, which the integration user never needs) and External Credential principal access to `Portfolio_API_Auth-Portfolio_API_Principal`, without which `PAPIHealth` reports `credential: DOWN` ([ADR-027 amendments](../adr/027-platform-native-api-authentication.md#amendment-2026-10-21)).
3. **"Portfolio API" External Client App**, created in Setup (it is not in source): Client Credentials flow enabled, "run as" set to the integration user, pre-authorised through `Integration_Access`.
4. **External Credential principals, two of them.** Enter the values in Setup; they are never in source or custom metadata.
   - `Portfolio_API_Auth` (OAuth 2.0 client credentials, in source), named principal `Portfolio_API_Principal`: the app's consumer key and secret. Used through the `Portfolio_API` Named Credential.
   - `Portfolio_API_Token_Auth` (Custom, in source), named principal `Portfolio_API_Token_Principal`: authentication parameters `Client_Id` (the consumer key) and `Client_Secret` (the consumer secret). `TokenExchangeService.exchangeToken` sends them as merge fields in the token request body, because Apex cannot read the secret of an OAuth credential.
5. **Named Credentials** (both in source, both the My Domain root `https://ryan-bumstead-dev-ed.develop.my.salesforce.com`):
   - `Portfolio_API`, authenticated by `Portfolio_API_Auth`. Callers append `/services/apexrest/...`.
   - `Portfolio_API_Token`, using `Portfolio_API_Token_Auth`, merge fields allowed in the body, no generated Authorization header. Used only for `/services/oauth2/token`.
6. **Assign `Portfolio_Guest` to the site guest user** (in source, `packages/portfolio-site/main/default/permissionsets/Portfolio_Guest.permissionset-meta.xml`; no licence, assignable to the guest user): class access to `PAPIAuthToken` and `ApiLabController` only; principal access to `Portfolio_API_Auth-Portfolio_API_Principal` and `Portfolio_API_Token_Auth-Portfolio_API_Token_Principal`; read on `UserExternalCredential`; no portfolio object or field grants. Without it, the guest gets 403 on `POST /papi/v1/auth/token`. Assigning it to the guest user is a Setup step for the org owner. Once it is assigned, remove the temporary `Portfolio_API_Access` permission set created in Setup on 2026-10-02.
7. **Schedule the cache cleanup job daily at 03:00 org time** (decision 2026-10-20). `CacheCleanupScheduler` is not scheduled by any deploy. `CacheCleanupScheduler.execute` checks `CacheCleanupSettings.isEnabled()` and then calls `CacheCleanupOrchestrator.run()`, which starts `GithubCacheCleanupBatch` and, through `CacheCleanupOrchestrator.runRateWindowCleanup()`, `CacheCleanupRateWindowBatch`. That batch deletes `API_Rate_Window__c` rows whose `Window_Start__c` is older than `Cache_Cleanup_Settings__mdt.Rate_Window_Retention_Days__c` (`Default` record: 1 day). Schedule it once per org from anonymous Apex, as an administrator:

   ```apex
   System.schedule(
     'Cache Cleanup Daily',
     '0 0 3 * * ?',
     new CacheCleanupScheduler()
   );
   ```

   Check it with `SELECT CronJobDetail.Name, NextFireTime FROM CronTrigger WHERE CronJobDetail.Name = 'Cache Cleanup Daily'`.

8. **Confirm `SAPIResume` is gone after the Round 2 deploy.** The class and its test were removed from source. A deploy that carries no destructive manifest leaves them in the org. After the deploy, run the Tooling query `SELECT Name FROM ApexClass WHERE Name LIKE 'SAPIResume%'`; if it returns rows, delete both classes with a destructive deploy.
9. **Assign `Portfolio_Admin`** to administrators who need to report on `API_Access_Request__c` (the token audit trail) and `API_Rate_Window__c`. It grants read and View All on both objects and read on their fields; without it the fields are not readable, even in SOQL.
10. **Token settings.** `Portfolio_Config__mdt.Ryan_Bumstead.Token_Daily_Cap__c` sets the daily evaluator token cap (`TokenExchangeService.dailyCap`, default 50 when blank); `Last_Secret_Rotation__c` records the last rotation date.

**Operational notes:** rotation and revocation procedures are in the [Maintenance Guide §1.2](./05-Maintenance-Guide.md#12-external-client-app-secret-rotation).

**Interface Definition (IAIGenerationService):**

```apex
public interface IAIGenerationService {
  String generateContent(String prompt, Map<String, Object> context);
  Boolean isAvailable();
}
```

`AgentforceService`, `GeminiService` and `LocalTemplateService` implement it. The API dispatch returns a `ContentGenerationController.GenerationResult` (`content`, `provider` `Gemini` or `Local`, `model`, `fallbackOccurred`); `PAPIAiGenerate.generate` writes those fields to the response.

**Gemini Quota Tracking: not built.** The design counted Gemini calls in a Platform Cache partition (`local.AIMetrics`). The org has no Platform Cache partition, and no class reads or writes such a counter. The bounds that do exist are the `papi-ai` rate tier (10 requests per minute) and the Gemini API key's own limits above.

## 2. Frontend (LWR) Component Logic

The front-end is based on **LWR** for sub-second page loads. **Lightning Web Security (LWS)** is required for security and to support libraries like AntV G6 and jsPDF.

### 2.1 `c-skill-network` (Visualization)

- **Data:** the component reads `Skill__c` and its junctions through the `lightning/uiGraphQLApi` wire adapter (`skillNetwork.js`, `SKILL_NETWORK_QUERY`).
- **Lazy Loading:** G6 loads only when the graph container scrolls into view (`skillNetwork.whenVisible`, an `IntersectionObserver`), so the 1.57 MB library never competes with the first paint. The script loads through the shared module `c/g6Loader`: `loadG6(component)` calls `loadScript` on the `G6_Library` static resource (AntV G6 4.8.23) once per page and hands every caller the same `G6` global. A failed load is not cached, so a later call can try again.
- **Mobile Guardrail:**
  - On a small form factor (`@salesforce/client/formFactor` is `Small`) or a viewport under 768 px, G6 never loads.
  - Instead the component draws an **inline SVG built from the same live GraphQL data** (`skillNetwork.buildSvgModel`). There is no pre-rendered image and no `Skill_Graph_Fallback` static resource, so the mobile graph cannot go stale and needs no "outdated" banner.
- **Accessibility (A11y):**
  - Includes a pause toggle for the layout animation ("Pause layout animation" and "Resume layout animation").
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

### 2.5 `c-smart-checklist` (Executable Governance)

- **No browser subscription.** `lightning-emp-api` is unsupported in LWR sites, and a guest has no token for Pub/Sub API, so the component imports no `lightning/empApi` and opens no channel ([ADR-019 Round 4 amendment](../adr/019-executable-governance-platform-events-for-documentation-logic.md#amendment-2026-10-21-round-4)).
- **Server side.** CI publishes `Governance_Event__e` after a production deploy and after the daily heartbeat. An Apex trigger upserts a `Pipeline_Run__c` record by `Run_Key__c`, so a replayed event changes nothing.
- **Read.** The component wires `GovernanceController.getPipelineStatus()` (cacheable): the latest run per workflow plus the age of the integration caches. It reads when the page is viewed and calls `refreshApex` when the tab becomes visible again (`visibilitychange`). There is no `setInterval` and no `setTimeout` loop.
- **Items.** Production deploy green, heartbeat within 26 hours, integration caches under 30 minutes. Each shows its evidence (commit and time, linking to the run). An item with no data shows "No signal yet", never a tick. Nothing is kept in `localStorage`.

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
- [ ] Verify the Skill Graph uses `lightning/uiGraphQLApi` (the Network tab shows a `/graphql` call to the Salesforce domain). The Roadmap reads Apex over the cache (`DeliveryController.getRoadmap`), so it makes no GraphQL call
- [ ] API Lab "Enterprise Mode" tab disabled with clear "Phase 8 – 2027-2028" messaging
- [ ] **AI fallback:** with the Gemini API unavailable, `POST /papi/v1/ai/generate` with `type: CoverLetter` returns `provider: Local` and `fallbackOccurred: true`. (The circuit-breaker checks this list used to hold are not applicable: no circuit breaker class exists and Agentforce is deferred.)

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

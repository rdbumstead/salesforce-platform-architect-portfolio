# Technical Guide

**Table of Contents**

- [1. Integration Service Implementation](#1-integration-service-implementation)
  - [1.1 GitHub Integration (Live Feed)](#11-github-integration-live-feed)
  - [1.2 Jira Integration (Roadmap)](#12-jira-integration-roadmap)
  - [1.3 AI Content Generation (Agentforce switch off)](#13-ai-content-generation-agentforce-switch-off)
  - [1.4 System API Security (The "Twin" Pattern)](#14-system-api-security-the-twin-pattern)
  - [1.5 Logging (Nebula Logger, optional)](#15-logging-nebula-logger-optional)
- [2. Frontend (LWR) Component Logic](#2-frontend-lwr-component-logic)
  - [2.1 `c-skill-network` (Visualization)](#21-c-skill-network-visualization)
  - [2.2 `c-resume-builder` (Resume Generation)](#22-c-resume-builder-resume-generation)
  - [2.3 `c-testimonial-submit` (Social Proof)](#23-c-testimonial-submit-social-proof)
  - [2.4 `c-schema-visualizer` (Dynamic ERD Visualizer)](#24-c-schema-visualizer-dynamic-erd-visualizer)
  - [2.5 `c-smart-checklist` (Executable Governance)](#25-c-smart-checklist-executable-governance)
  - [2.6 `c-footer` (Glass Box Telemetry)](#26-c-footer-glass-box-telemetry)
  - [2.7 Architectural Decision Record: ADR-014 (Deferred Telemetry)](#27-architectural-decision-record-adr-014-deferred-telemetry)
  - [2.8 Analytics Instrumentation (GA4)](#28-analytics-instrumentation-ga4)
  - [2.9 Site Theme, Tokens and Fonts](#29-site-theme-tokens-and-fonts)
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
  - Guests never call out. The `c-changelog` component reads the newest row through `DeliveryController.getRecentCommits(simulate)`.
- **Degraded Mode:**
  - A failed refresh inserts nothing, so the last good list keeps showing with its age.
  - Three consecutive failures open the `github` circuit breaker for 30 minutes, refreshes are skipped while it is open, and `DeliveryController` reports `DEGRADED`.
  - The cleanup batch keeps the newest row per cache object, so an outage never empties the page.

### 1.2 Jira Integration (Roadmap)

- **Authentication:** Basic Auth through the `Jira_API` Named Credential (`Jira_Auth` External Credential, `Jira_Principal` principal).
- **Refresh:** `JiraCacheRefreshJob`, enqueued by the same scheduler, runs the JQL `project = <key> AND labels = "portfolio-roadmap" ORDER BY updated DESC`, where the key is `Portfolio_Config__mdt.Jira_Project_Key__c` (`SPAP`), and inserts one `Jira_Cache__c` row from the first page of 50 issues. Only issues labelled `portfolio-roadmap` become public (owner decision E6, 2026-10-21).
- **Component:** `c-roadmap-viewer` reads the newest row through `DeliveryController.getRoadmap(simulate)` and places issues in To Do, In Progress and Done by Jira status category, so a renamed workflow status cannot empty a column. It never calls Jira.
- **Principal access:** the scheduling admin user reaches both principals through `Portfolio_Admin` (owner decision E8, 2026-10-21). `Integration_Access` keeps them too, by the owner's choice. `Portfolio_Guest` has neither.
- **Degraded Mode:**
  - After three consecutive failures, the `jira` circuit breaker skips Jira refreshes for 30 minutes, and `DeliveryController` reports `DEGRADED` while it is open.
  - With no usable cache row, the user sees a "Roadmap temporarily unavailable" message.

### 1.3 AI Content Generation (Agentforce switch off)

> [!NOTE]
> **Agentforce is not implemented, and its switch ships off** (decision 2026-10-02, [ADR-015 Round 3 amendment](../adr/015-strategy-pattern-for-generative-ai.md#amendment-2026-10-21-round-3)). `AgentforceService.generateContent` throws, so nothing in this guide claims Agentforce as a live provider.

- **One dispatch.** `ContentGenerationController.dispatch` tries Agentforce, then Gemini, then the Local Template (cover letters only), and records every attempt with its outcome (`served`, `skipped_off`, `skipped_open_circuit`, `failed`), its elapsed time and, on a failure, a short `detail` such as `HTTP 503` or the exception type, never a key or a URL with a query string. While the `gemini` or `agentforce` circuit breaker is open, that provider is skipped. Breaker state is written after every provider has been tried.
  - Agentforce is consulted only when `AgentforceService.isAvailable` is true: the `Agentforce` record of `AI_Provider_Config__mdt` has `Enabled__c` set, and the running user is not a site guest. The record ships with `Enabled__c` false. Switching it on today only adds a failed attempt, because the class throws.
  - Gemini is Gemma 4 31B (`gemma-4-31b-it`, `GeminiService.MODEL`) through the Gemini API and the `Gemini_API` Named Credential, with a 60 second callout timeout from the `Gemini` record (owner decision 2026-10-21). Gemma 4 always reasons before it answers (the owner measured 28.7 seconds for a trivial prompt), so a cover letter can take up to about a minute. `GeminiService` reports a failure as text starting `Error: Unable to generate content.` or `Exception: `, which the dispatch treats as a failed attempt.
  - The Local Template serves a cover letter when Gemini fails. Other content types answer 503 `ALL_PROVIDERS_UNAVAILABLE`.
- **Callers.** `PAPIAiGenerate.generate` (`POST /papi/v1/ai/generate`) calls the dispatch for outside callers with a Bearer token and returns `provider`, `model`, `fallbackOccurred`, `latencyMs`, `attempts` and `promptShown`. The site's cover letter page (`coverLetterGenerator`) calls `ApiLabController.generateCoverLetter`, which runs the same dispatch **in process, as the site guest** ([ADR-015 Round 4 amendment](../adr/015-strategy-pattern-for-generative-ai.md#amendment-2026-10-21-round-4)):
  - It checks `ApiLabController.AI_RATE_KEY` (`papi-ai:site-cover-letter`, 10 requests a minute, one bucket for every site visitor) with `ApiRequestContext.rateLimiter().checkKey` before the dispatch and writes the count with `ApiRequestContext.commitRateCounts()` after it. The key has the `papi-ai` prefix that `/papi/v1/ai/` counts on, so the footer's "AI requests today" counts both paths. Over the limit, the page says "Too many cover letters were requested in the last minute. Try again in a minute."
  - It writes one log line through `PortfolioLog` with the path `aura:ApiLabController.generateCoverLetter`.
  - `Portfolio_Guest` holds the `Gemini_Auth-Gemini_Principal` principal for this. Agentforce is never consulted for a guest.
  - Grounding as the guest goes through a `without sharing` selector that returns a fixed shape with no email, phone or owner field, because a guest sees only rows shared to it.
  - Why not through the API: the Round 3 page posted to the org's own `/papi/v1/ai/generate` through the `Portfolio_API` Named Credential. A request that arrives as a callout from the same org may not call out again ("Callout loop not allowed"), so Gemini could never answer the page and every live letter came from the Local Template.
- **Limits.** The Gemini key's free tier allows Gemma 4 31B 30 requests per minute, 16,000 tokens per minute and 14,400 requests per day.
- **Grounding.** `PortfolioGroundingService` adds featured projects and experience highlights to a cover letter prompt, ranked by keywords from the job title and description. It never selects Email, Phone or an owner field, strips anything shaped like an email address or phone number, and caps the JSON at 8,000 characters (about 2,000 tokens).
- **Show your work.** The page's badge shows the provider and model from the response. A panel the visitor opens shows the fallback flag, the round trip and generation time, the attempts (each with its `detail` when the dispatch reports one) and the prompt that was sent. The panel is built in Apex and the component, not by asking the model to reveal its prompt.
- **Fallback message.** When the template letter is used, the page says "The AI model could not be reached" if the Gemini attempt failed in under 1 second (`coverLetterGenerator.UNREACHABLE_MS`), and "The AI model was busy or too slow" otherwise. Each letter sends the GA4 event `ai_generation_completed`, and a request with no letter sends `ai_complete_failure`.
- **Footer.** `ContentGenerationController.providerStatus()` returns each provider's switch and state (`on`, `off`, `not built`) and `circuitOpenUntil` while its breaker is open, for the footer (section 2.6).
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
2. **`Integration_Access`** assigned to the integration user. It is the only source of data access: read-only on `Account`, `Certification__c`, `Certification_Skill__c`, `Contact`, `Education__c`, `Experience_Highlight__c`, `Experience_Skill__c`, `Experience__c`, `Github_Cache__c`, `Jira_Cache__c`, `Project_Asset__c`, `Project_Skill__c`, `Project__c`, `Skill__c` and `Testimonial__c`, no editable field, plus execute access on 21 SAPI and PAPI REST classes (every resource class except `PAPIAuthToken`, which the integration user never needs) and External Credential principal access to `Portfolio_API_Auth-Portfolio_API_Principal`, without which `PAPIHealth` reports `credential: DOWN`, plus the `Gemini_Auth`, `GitHub_Auth` and `Jira_Auth` principals ([ADR-027 amendments](../adr/027-platform-native-api-authentication.md#amendment-2026-10-21)).
3. **"Portfolio API" External Client App**, created in Setup (it is not in source): Client Credentials flow enabled, "run as" set to the integration user, pre-authorised through `Integration_Access`.
4. **External Credential principals, two of them.** Enter the values in Setup; they are never in source or custom metadata.
   - `Portfolio_API_Auth` (OAuth 2.0 client credentials, in source), named principal `Portfolio_API_Principal`: the app's consumer key and secret. Used through the `Portfolio_API` Named Credential.
   - `Portfolio_API_Token_Auth` (Custom, in source), named principal `Portfolio_API_Token_Principal`: authentication parameters `Client_Id` (the consumer key) and `Client_Secret` (the consumer secret). `TokenExchangeService.exchangeToken` sends them as merge fields in the token request body, because Apex cannot read the secret of an OAuth credential.
5. **Named Credentials** (both in source, both the My Domain root `https://ryan-bumstead-dev-ed.develop.my.salesforce.com`):
   - `Portfolio_API`, authenticated by `Portfolio_API_Auth`. Callers append `/services/apexrest/...`.
   - `Portfolio_API_Token`, using `Portfolio_API_Token_Auth`, merge fields allowed in the body, no generated Authorization header. Used only for `/services/oauth2/token`.
6. **Assign `Portfolio_Guest` to the site guest user** (in source, `packages/portfolio-site/main/default/permissionsets/Portfolio_Guest.permissionset-meta.xml`, no licence, assignable to the guest user). As of Round 4 it grants:
   - class access to `ApiLabController`, `DeliveryController`, `FooterController`, `GovernanceController`, `PAPIAuthToken`, `ResumeController` and `TestimonialController`
   - read on `Experience__c`, `Experience_Skill__c`, `Project__c`, `Project_Asset__c`, `Project_Skill__c` and `Skill__c`, create on `Testimonial__c`, and read on `UserExternalCredential`
   - principal access to `Portfolio_API_Auth-Portfolio_API_Principal`, `Portfolio_API_Token_Auth-Portfolio_API_Token_Principal` and `Gemini_Auth-Gemini_Principal` (the last one for the in-process cover letter, ADR-015 Round 4 amendment)
   - no Contact, Account, certification or education access, and no GitHub or Jira principal.

   Without it, the guest gets 403 on `POST /papi/v1/auth/token`. Assigning it to the guest user is a Setup step for the org owner.

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
9. **Assign `Portfolio_Admin`** to administrators who need to report on `API_Access_Request__c` (the token audit trail), `API_Rate_Window__c` and `Pipeline_Run__c`. It grants read and View All on the first two, read on `Pipeline_Run__c`, and read on their fields. Without it the fields are not readable, even in SOQL. It also grants the `GitHub_Auth-GitHub_Principal` and `Jira_Auth-Jira_Principal` principals, which the admin who schedules the cache refresh needs (owner decision E8, 2026-10-21). `Integration_Access` keeps those two principals as well.
10. **Token settings.** `Portfolio_Config__mdt.Ryan_Bumstead.Token_Daily_Cap__c` sets the daily evaluator token cap (`TokenExchangeService.dailyCap`, default 50 when blank); `Last_Secret_Rotation__c` records the last rotation date.
11. **Governance publisher.** CI publishes `Governance_Event__e` as each workflow's existing JWT user (`deploy.yml` and `keep-alive.yml`). Assign `Governance_Publisher` (Create on that event only) to whichever of those users cannot create it yet. The publish steps in the two workflows are the owner's edits, made after the event is deployed to production.
12. **Schedule the cache refresh** as the administrator who holds `Portfolio_Admin` (it carries the GitHub and Jira principals). From anonymous Apex, once per org: `IntegrationCacheRefreshScheduler.scheduleAll();`. It creates four jobs, `Integration Cache Refresh :00`, `:15`, `:30` and `:45`, each enqueuing `GitHubCacheRefreshJob` and `JiraCacheRefreshJob`. With no `Portfolio_Config__mdt` record (a scratch org), each job logs and exits.

**Operational notes:** rotation and revocation procedures are in the [Maintenance Guide §1.2](./05-Maintenance-Guide.md#12-external-client-app-secret-rotation).

**Interface Definition (IAIGenerationService):**

```apex
public interface IAIGenerationService {
  String generateContent(String prompt, Map<String, Object> context);
  Boolean isAvailable();
}
```

`AgentforceService`, `GeminiService` and `LocalTemplateService` implement it. The API dispatch returns a `ContentGenerationController.GenerationResult` (`content`, `provider` `Gemini` or `Local`, `model`, `fallbackOccurred`); `PAPIAiGenerate.generate` writes those fields to the response.

**Gemini Quota Tracking: not built.** The design counted Gemini calls in a Platform Cache partition (`local.AIMetrics`). The org has no Platform Cache partition, and no class reads or writes such a counter. The bounds that do exist are the `papi-ai` rate limits (10 requests per minute on the API and 10 on the site page), the `gemini` circuit breaker and the Gemini API key's own limits above. The footer shows "AI requests today" from the rate rows (section 2.6).

### 1.5 Logging (Nebula Logger, optional)

- **One seam.** `PortfolioLog.info(message)` writes a line to Nebula Logger when it is installed and to `System.debug` when it is not ([ADR-013 Round 4 amendment](../adr/013-structured-logging-framework-nebula-logger.md#amendment-2026-10-21-round-4)). It finds Nebula's `System.Callable` entry point, `CallableLogger`, at run time with `Type.forName` (namespace `Nebula` first, then none), so no source file depends on Nebula at compile time. CI and scratch orgs run without it.
- **One line per API request.** After the response is written, `ApiRequestContext` calls `RequestUtil.logRequest`, which writes `api request path=<path> status=<status> correlationId=<id> elapsedMs=<ms>`. The query string is cut off and no body, header value or token is logged. The site cover letter writes the same line with the path `aura:ApiLabController.generateCoverLetter`.
- **Never fails a request.** Nebula reports its own failures as `isSuccess` false, and the seam then falls back to `System.debug`. An exception inside the seam is caught.
- **Install (owner, production only).** Nebula Logger's unlocked package with no namespace, installed by hand. Set log retention to 2 days in Nebula's settings, to stay inside Developer Edition storage. Entries carry the tag `portfolio`.

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
- **Round 5:** the owner has asked for a skills redesign (a matrix plus a new graph engine, with G6 removed). It is planned for Round 5 and not built. This section describes the component as it is.

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
- **Server side.** CI publishes `Governance_Event__e` after a production deploy and after the daily heartbeat. `GovernanceEventTrigger` hands each batch to `GovernanceEventHandler.handle`, which upserts a `Pipeline_Run__c` record by `Run_Key__c` (`<workflow>:<run id>`), so a replayed event changes nothing, skips events with an unknown workflow or status or no run id, and keeps the newest 60 rows per workflow.
- **Read.** The component wires `GovernanceController.getPipelineStatus()` (cacheable): the latest run per workflow plus the age of the integration caches. It reads when the page is viewed and calls `refreshApex` when the tab becomes visible again (`visibilitychange`). There is no `setInterval` and no `setTimeout` loop.
- **Items.** "Production deploy green", "Org heartbeat in the last 26 hours" and "Integration caches under 30 minutes old", each worked out in `GovernanceController` from evidence only: no run is "No signal yet", a `Failure` is "Failed", old evidence is "Out of date", and only fresh success is "Passed". Each shows its evidence (commit and time, linking to the run). Nothing is kept in `localStorage`.

### 2.6 `c-footer` (Glass Box Telemetry)

- **Component:** `c-footer`, one line: copyright, the deploy badge with a status dot, the telemetry in Fira Code, profile links and "Back to top".
- **Links:** `FooterController.getLinks()` (cacheable) returns only `gitHubUrl` and `linkedInUrl` from `Portfolio_Config__mdt`. It never selects the owner's email or phone.
- **Deferred load (ADR-014):** the component paints first and calls `FooterController.getSystemSnapshot()` from `requestIdleCallback`, or a zero delay timeout where the browser has none, so the fetch never delays the main page load (LCP). The method is not cacheable, so each visit reads current values.
- **Telemetry Data:**
  - Limits: CPU time, heap size and SOQL queries used against their limits (`Limits.getCpuTime`, `getHeapSize`, `getQueries` and their limits).
  - AI providers: one row per provider from `ContentGenerationController.providerStatus()`, for example "Agentforce: off", or "Gemini: circuit open until 14:05" while its breaker is open.
  - "AI requests today: N": `SUM(Count__c)` of today's `API_Rate_Window__c` rows whose key starts `papi-ai:`, through a `without sharing` inner class that returns only the number. It counts requests from the site page and from `/papi/v1/ai/generate`, not Gemini calls, so it is never called a Gemini quota (PD-D9). Hover or focus sends `finops_quota_visibility`.
  - If the snapshot call fails, the line shows "status unavailable".
- **Deploy badge:** `https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/deploy.yml/badge.svg?branch=main`, alt text "Production deploy status", allowed by the `GitHub_Badge` CSP trusted site (img-src). If the image fails, a text link to the Actions page takes its place.
- **Resilience toggle:** not in the footer. The "Simulate an outage" switch sits on the changelog and the roadmap (ADR-022 Round 4 amendment).

### 2.7 Architectural Decision Record: ADR-014 (Deferred Telemetry)

- **Context:** Real-time telemetry is non-essential for the user journey.
- **Decision:** All "System Health" data fetching must be decoupled from the critical rendering path.
- **Reference:** See **[ADR-014: Deferred Telemetry Loading](../adr/014-deferred-telemetry-loading-performance.md)** for full decision context.

### 2.8 Analytics Instrumentation (GA4)

- **One event layer.** `c/analyticsService` exports `trackEvent(name, params)` and `EVENTS`, the one event list. `trackEvent` does nothing when `window.gtag` is absent and never throws, so analytics can never break a component. Later rounds append to `EVENTS`.
- **Events** (measurement id `G-G6P1S31J8L`):
  - `api_test_executed` {`path`, `status`}, `api_reference_opened` {`spec`}
  - `ai_generation_completed` {`provider`, `model`, `fallback`, `latency_ms`, `outcome`}, where `outcome` is `live`, `template_unreachable` or `template_slow`, and `ai_complete_failure` {`message_kind`}, where the kind is `rate_limited`, `no_provider`, `invalid_input` or `other`, never the message. The Charter's AI rates are computed in GA4 from these (PD-D8).
  - `resume_downloaded` {`persona`, `format`}
  - `roadmap_viewed`, `changelog_commit_clicked` {`sha`}, `governance_run_link_clicked` {`workflow`}
  - `finops_quota_visibility`, `theme_changed` {`theme`}
- **The tag.** The GA4 tag loads from head markup, with a page view sent on every route change, because the LWR router changes routes without a page load.
- **CSP.** To load the tag the site runs on **Relaxed CSP** (owner decision, 2026-10-21). That lets inline scripts and `eval()` run on the site, so only reviewed head markup adds scripts, and `https://www.googletagmanager.com` is on the site's script allowlist. The GA4 image and connect hosts are trusted sites in source (`GA4_Tag_Manager`, `GA4_Analytics`, `GA4_Google`), so a Builder setting saved only in production cannot drift from the repo.

### 2.9 Site Theme, Tokens and Fonts

- **The theme follows the visitor's system setting.** Light tokens sit on `:root` in the site stylesheet (`sfdc_cms__styles/styles_css/styles.css`). Dark tokens apply under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`, and again on `:root[data-theme="dark"]`, so the first paint needs no script. Light is the fallback.
- **The toggle.** The header's theme button in `portfolioThemeLayout` sets `data-theme="light"` or `"dark"` on the `html` element and on its own host, which overrides the media query, and stores the choice under the `localStorage` key `portfolio-theme`. No stored value means "follow the system". Changing it sends the GA4 event `theme_changed`. No other component reads that key or sets the attribute.
- **Design tokens.** Components use only the `--pf-*` custom properties (background, surface, text, accent, chip, warning, success, code, button, error, fonts, radius and spacing), defined in `styles.css` and mirrored on the `:host` of `portfolioThemeLayout`. The stylesheet also maps the platform's `--dxp-g-*` globals onto them, because it loads after the branding set's inline styles.
- **Fonts.** Inter (400 to 700) for text and Fira Code (400 and 500) for section labels, pillar letters, code, API output and the footer metrics. Both are Latin woff2 files in the `Portfolio_Fonts` static resource, loaded by `@font-face` with `font-display: swap` from a same-origin URL, so the site's CSP needs no new host (licences in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)).
- **Header.** A slim sticky header with the primary navigation, a pillar menu and the theme button. Under 768 px the navigation collapses behind a menu button. Primary controls are at least 44 px high.
- **Shared pillar list.** `c/pillarData` exports `PILLARS` and `pillarByLetter`, the one list the header and the home page read.

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
- [ ] **Degradation Test:** turn on "Simulate an outage" on the changelog or the roadmap. Verify the cached data stays on screen with a `SIMULATED` badge and no request leaves for GitHub or Jira.
- [ ] **Limit Visibility:** Verify "Glass Box Telemetry" footer accurately reflects Heap Size changes after running a heavy operation.
- [ ] **Analytics:** Verify api_test_executed event fires in GA4 Real-Time view when using the API Tester.
- [ ] Verify the Skill Graph uses `lightning/uiGraphQLApi` (the Network tab shows a `/graphql` call to the Salesforce domain). The Roadmap reads Apex over the cache (`DeliveryController.getRoadmap`), so it makes no GraphQL call
- [ ] API Lab "Enterprise Mode" tab disabled with clear "Phase 8 – 2027-2028" messaging
- [ ] **AI fallback:** with the Gemini API unavailable, `POST /papi/v1/ai/generate` with `type: CoverLetter` returns `provider: Local` and `fallbackOccurred: true`, and the site page shows the template letter with the reason. After three Gemini failures the footer shows "Gemini: circuit open until HH:MM" and the next letter skips Gemini.

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

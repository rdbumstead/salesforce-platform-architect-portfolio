# Technical Guide

**Table of Contents**

- [1. Integration Service Implementation](#1-integration-service-implementation)
  - [1.1 GitHub Integration (Live Feed)](#11-github-integration-live-feed)
  - [1.2 Jira Integration (Roadmap)](#12-jira-integration-roadmap)
  - [1.3 AI Content Generation (Agentforce switch off)](#13-ai-content-generation-agentforce-switch-off)
  - [1.4 System API Security (The "Twin" Pattern)](#14-system-api-security-the-twin-pattern)
  - [1.5 Logging (Nebula Logger, optional)](#15-logging-nebula-logger-optional)
  - [1.6 Operational Settings (`Portfolio_Setting__mdt`)](#16-operational-settings-portfolio_setting__mdt)
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
  - [2.10 Project Asset Gallery and Decision Matrix](#210-project-asset-gallery-and-decision-matrix)
  - [2.11 Mobile Performance](#211-mobile-performance)
  - [2.12 Home Page Cards and Timeline](#212-home-page-cards-and-timeline)
  - [2.13 Cloudflare Cache Warmer Worker](#213-cloudflare-cache-warmer-worker)
  - [2.14 View Source (`c-view-source`)](#214-view-source-c-view-source)
  - [2.15 API Lab and API Reference](#215-api-lab-and-api-reference)
  - [2.16 Contact Form and Submission Guard](#216-contact-form-and-submission-guard)
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
  - The same scheduled run also enqueues `SourceCacheRefreshJob` when a View source file is due, which fills `Source_Cache__c` from the GitHub contents API (section 2.14). It needs no schedule of its own.
  - Guests never call out. The `c-changelog` component reads the newest row through `DeliveryController.getRecentCommits(simulate)`.
- **Degraded Mode:**
  - A failed refresh inserts nothing, so the last good list keeps showing with its age.
  - Three consecutive failures open the `github` circuit breaker for 30 minutes, refreshes are skipped while it is open, and `DeliveryController` reports `DEGRADED`.
  - The cleanup batch keeps the newest row per cache object, so an outage never empties the page.
- **Logging.** When no `Portfolio_Config__mdt` record names a repository, and when a refresh fails, `GitHubCacheRefreshJob.refresh` writes one line through `PortfolioLog.info` (section 1.5) and returns without writing a cache row. The failure line names only the exception type, and the failure still counts toward the `github` breaker.

### 1.2 Jira Integration (Roadmap)

- **Authentication:** Basic Auth through the `Jira_API` Named Credential (`Jira_Auth` External Credential, `Jira_Principal` principal).
- **Refresh:** `JiraCacheRefreshJob`, enqueued by the same scheduler, runs the JQL `project = <key> AND labels = "portfolio-roadmap" ORDER BY updated DESC`, where the key is `Portfolio_Config__mdt.Jira_Project_Key__c` (`SPAP`), and inserts one `Jira_Cache__c` row from the first page of 50 issues. Only issues labelled `portfolio-roadmap` become public (owner decision E6, 2026-10-21).
- **Component:** `c-roadmap-viewer` reads the newest row through `DeliveryController.getRoadmap(simulate)` and places issues in To Do, In Progress and Done by Jira status category, so a renamed workflow status cannot empty a column. It never calls Jira. Cards name their epic as "Part of {name} | {key}" and epic cards come first in each column. Every column shows at most 8 cards (the `Roadmap_Column_Limit` setting, section 1.6, sent as `columnLimit`) with its own "Show all N" button and state, which keeps `aria-expanded` and the count in the column heading. Done shows its newest 8 by `updatedAt`, and To Do and In Progress keep the feed order and cut at 8. Earlier only Done was capped. The owner chose to cap every column, which replaced the test that pinned the Done only rule. A View source button in the roadmap header opens `roadmapViewer.js`, `roadmapViewer.html` and `DeliveryController.cls` (section 2.14).
- **Principal access:** the scheduling admin user reaches both principals through `Portfolio_Admin` (owner decision E8, 2026-10-21). `Integration_Access` keeps them too, by the owner's choice. `Portfolio_Guest` has neither.
- **Degraded Mode:**
  - After three consecutive failures, the `jira` circuit breaker skips Jira refreshes for 30 minutes, and `DeliveryController` reports `DEGRADED` while it is open.
  - With no usable cache row, the user sees a plain empty line ("Nothing on the roadmap yet"), and only a failed read shows "Roadmap temporarily unavailable".
- **Logging.** `JiraCacheRefreshJob.refresh` logs the same two cases (no config record, a failed refresh) through `PortfolioLog.info`, the failure by exception type only.

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
- **Fallback message.** When the template letter is used, the page says "The AI model could not be reached" if the Gemini attempt failed in under 1 second (`coverLetterGenerator.UNREACHABLE_MS`), and "The AI model was busy or too slow" otherwise. Each letter sends the event `ai_generation_completed`, and a request with no letter sends `ai_complete_failure` (section 2.8 says where component events stand).
- **Footer.** `ContentGenerationController.providerStatus()` returns each provider's switch and state (`on`, `off`, `not built`) and `circuitOpenUntil` while its breaker is open, for the footer (section 2.6).
- **Not built:** a real Agentforce provider and the hourly budget it needs (`Hourly_Budget__c` is in the config but not read yet).
- **An unshipped agent prototype lives only in the production org** (pillar D decision D12 a, 2026-10-22). It holds the `Portfolio_Guide_Agent` Service Agent (version 1, inactive), its six custom topics (Data Integration Strategies, Zero Cost Architecture, Experience Object Queries, Skill Object Utilization, Real Time Data Validation, Technical Role Evaluation), two custom actions ("Get Portfolio Context", which calls the invocable `PortfolioAgentService.getPortfolioContext`, and "Contact Record Summary", the prompt template `0hffj000009W6ijAAC`), and the platform's default `Copilot_for_Salesforce` agent, also inactive. None of the agent, topic, action or template metadata is in source, and neither the site nor the API uses any of it. `PortfolioAgentService` is in source only as the action's Apex. Since Round 7 it no longer reads or returns `Owner_Email__c` or `Owner_Phone__c`, so reviving the agent cannot expose the owner's email or phone (audit E6). The stray permission set `Contact_Information_Agent_Permissions`, which named another org's agent user, was removed from source in Round 5. The prototype is kept for a later real Agentforce provider (pillar D decision D5).

### 1.4 System API Security (The "Twin" Pattern)

The APIs use platform-native OAuth 2.0 on both sides of the boundary ([ADR-027](../adr/027-platform-native-api-authentication.md)). The earlier design validated `client_id`/`client_secret` headers against Custom Metadata to simulate a MuleSoft policy point; that simulation was retired when MuleSoft left the architecture.

| Role         | Component                                              | Responsibility                                                          | Implementation                                                                                                                                                                                                                                                                                                                  |
| :----------- | :----------------------------------------------------- | :---------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Provider** | External Client App (Client Credentials flow)          | **Authentication:** issues Bearer tokens; rejects bad callers upstream  | Runs as a dedicated integration user holding `Integration_Access` (read-only objects + execute on `SAPI*`/`PAPI*`). The platform rejects unauthenticated calls before Apex.                                                                                                                                                     |
| **Consumer** | External Credential + `Portfolio_API` Named Credential | **Secure Storage:** holds the consumer key/secret in the platform vault | Used by `ApiLabController.invoke` (site proxy) and `PAPIHealth` (credential check). Token vending uses a second pair, `Portfolio_API_Token_Auth` and `Portfolio_API_Token`. No secret is ever stored in metadata or source.                                                                                                     |
| **Vendor**   | `PAPIAuthToken` (`POST /papi/v1/auth/token`)           | **Evaluator access:** exchanges email + purpose for a short-lived token | The only REST class the guest user can execute ([ADR-028](../adr/028-evaluator-access-via-token-vending.md)). Shares `TokenExchangeService` with the proxy.                                                                                                                                                                     |
| **Context**  | `ApiRequestContext` (shared by every REST class)       | **Contract hygiene:** headers, pagination, errors, cache, rate limits   | Reads `X-Request-Id` and `X-API-Version` (sets `X-Request-Id` only when it generated one), bounds `limit`/`offset`, emits the `Error` schema, applies `Cache-Control` per resource, and enforces the [ADR-025](../adr/025-papi-fan-out-throttling-capacity-planning.md#amendment-2026-10-21) tiers through `RateWindowLimiter`. |

**Plain text resume.** `GET /papi/v1/resume/generate` honours `Accept: text/plain`. When the first media type in `Accept` is `text/plain` (`PAPIResume.wantsPlainText`, parameters after a semicolon ignored, the header name matched in any case), a 200 answer carries the generated text alone with `Content-Type: text/plain; charset=UTF-8`. `PAPIResume.getResume` still runs `ApiRequestContext.ok` first, so the status, the rate count, the cache directive, the other headers and the request log line are the same as for JSON, and then replaces the body with the text. Any other `Accept` keeps the JSON body, and errors are always JSON. `scripts/api-smoke.sh` makes one such call and prints the first line.

**Rate limiting.** Rate limits are enforced in Apex by `RateWindowLimiter`, a custom-object counter: one `API_Rate_Window__c` row per caller key per minute. For SAPI and PAPI requests the caller key is `{tier}:{SHA-256 hex of the session id}`, or `{tier}:{user id}` when the session id is null. The token endpoint keys by `papi-token:{SHA-256 of lowercase email|source IP}`. Tiers: `sapi` 120, `papi` 15, `papi-ai` (`/papi/v1/ai/*`) 10 requests per minute, over a fixed calendar minute. These are the shipped values of the `Api_Sapi_Rate_Per_Minute`, `Api_Papi_Rate_Per_Minute` and `Api_Ai_Rate_Per_Minute` settings (section 1.6). Request limit + 1 within a minute gets `429` `RATE_LIMIT_EXCEEDED` with `Retry-After` set to the seconds left in the minute. The check (`RateWindowLimiter.checkKey`) reads and locks the row and writes nothing. The count is written with the response (`ApiRequestContext.ok`/`error`) or by `ApiRequestContext.commitRateCounts()` for non-REST callers, so resources may make callouts after `begin()`. Full rules: [ADR-025 amendment (2026-10-21)](../adr/025-papi-fan-out-throttling-capacity-planning.md#amendment-2026-10-21).

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
6. **Assign `Portfolio_Guest` to the site guest user** (in source, `packages/portfolio-site/main/default/permissionsets/Portfolio_Guest.permissionset-meta.xml`, no licence, assignable to the guest user). It grants:
   - class access to eleven site controllers, `ApiLabController`, `ContactFormController`, `DecisionMatrixController`, `DeliveryController`, `FooterController`, `GovernanceController`, `ProjectCardController`, `ResumeController`, `SchemaService`, `SourceController` and `TestimonialController`, plus two REST classes, the token endpoint `PAPIAuthToken` and the spec endpoint `OpenApiDocument`
   - read on `Experience__c`, `Experience_Skill__c`, `Project__c`, `Project_Asset__c`, `Project_Skill__c` and `Skill__c`, create and read on `Testimonial__c`, and read on `UserExternalCredential`
   - read on `Experience__c.Start_Date__c` and `Experience__c.End_Date__c` (Round 5), which the skills matrix needs for "years used", on `Skill__c.Persona_Tag__c` (Round 7, the persona filter) and on the testimonial fields the wall shows (Round 7)
   - no Lead permission: the contact form saves Leads through a platform event (section 2.16)
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
13. **Allow deployments while Apex jobs are scheduled.** In Setup > Deployment Settings, tick "Allow deployments of components when corresponding Apex jobs are pending or in progress". Items 7 and 12 schedule five jobs, and Salesforce refuses any deploy that changes a class one of them depends on (the error reads "You can bypass this error by allowing deployments with Apex jobs in the Deployment Settings page in Setup"). The setting is an org preference, not metadata in this repository, so set it in every org that runs the scheduled jobs. The production org has it since 2026-10-22. Scratch orgs do not need it, because nothing is scheduled in them.
14. **Graph engine resource.** `D3_Library` (eleven D3 modules, 81,482 bytes in source, Public cache) replaces `G6_Library`. The delta deploy on `main` removes `G6_Library` and `c/g6Loader` as post-destructive changes (`deploy.yml`, "Generate Delta"). A full deploy does not delete anything, so after one, check with the Tooling query `SELECT Name FROM StaticResource WHERE Name = 'G6_Library'` and remove it with a destructive deploy if it is still there. Nothing on the site loads it.
15. **Employer Hub demo objects.** The four `EH_` objects ship with the `EH_Demo_Read` permission set (read only). It is optional and for administrators only. The site guest needs no grant to see them in the diagram, because describe does not filter by object permission (ADR-029).
16. **Contact form email rules (Setup, not in source).** The Lead assignment rule, the auto-response rule with its "Portfolio Website" entry, and the notification address they use are created in Setup, after the deploy, with the owner present. They are kept out of source on purpose, because they hold an email address. The email templates they use (`Portfolio_Contact_Auto_Response`, `Portfolio_Contact_New_Lead`) are in source.

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

### 1.6 Operational Settings (`Portfolio_Setting__mdt`)

Operational values such as page sizes, rate limits, refresh intervals and display counts live in one custom metadata type, one record per value, so the owner can change one without editing code ([ADR-032](../adr/032-operational-settings-in-custom-metadata.md)).

- **The type.** `Portfolio_Setting__mdt`, visibility Public. `Number_Value__c` (Number 18,4) or `Text_Value__c` (Text 255) holds the value, `Min_Value__c` and `Max_Value__c` (Number 18,4) its safe range, and `Description__c` (Text Area 255) says in plain words what it controls and what range is safe. The label is the setting's plain name.
- **The accessor.** `PortfolioSettings` (`with sharing`) has `getInteger(developerName, fallback)`, `getDecimal(developerName, fallback)` and `getText(developerName, fallback)`. Every caller passes its own code constant as the fallback, so the code still says what the default is. A record that is missing, holds no value, or holds a number outside its `Min_Value__c` to `Max_Value__c` range gives the fallback, so a mistyped record never breaks a request. `getInteger` cuts a decimal to its whole part and gives the fallback for a number too large for an Integer. `getText` gives the fallback for a blank value and has no range.
- **One read per transaction.** The records are read once with `Portfolio_Setting__mdt.getAll()`, which runs no SOQL, and kept in a static map for the rest of the transaction.
- **Tests.** The test visible `PortfolioSettings.overrides` map sets a value without a record, and `overrideNumber(developerName, value)` is the short form. A key mapped to null reads as a missing record. `PortfolioSettingsTest` (16 tests) covers a shipped record, a missing one, a null value, both sides of the range and both bounds, no range, a number too large for an Integer, the overrides, one load per transaction with no SOQL, and a read as the site guest with no permission set assigned.
- **What stays in code.** Contract values (field lengths, enum and key strings, spec names) and layout constants (graph geometry, image sizes, label lengths) are not settings.
- **The records.** 23 ship, each with the value the code used before, so the deploy that brings them changes no behaviour. `Portfolio_Config__mdt.Token_Daily_Cap__c` still wins over `Token_Daily_Cap_Default` when it is set.
- **The readers.** Every record has one, and each keeps its old constant as the fallback:
  - `ApiRequestContext`: the two page sizes and the three rate tiers, through the public `maxPageSize()`, `defaultPageSize()` (never above the max), `sapiLimitPerMinute()`, `papiLimitPerMinute()` and `aiLimitPerMinute()`. The 400 message for a bad `limit` names the values in force. `ApiLabController` checks the site cover letter's bucket against `aiLimitPerMinute()`.
  - `TokenExchangeService`: `requestsPerMinute()` and the daily cap default (the config cap first).
  - `PAPIAiGenerate`: the three `maxLength` bounds, with the default held inside the other two, and its 400 message names the bounds in force. `PAPIHealth`: the credential callout timeout.
  - `CircuitBreaker`: `failureThreshold()` and `openMinutes()`. `SubmissionGuard`: the contact form's minimum time and daily cap and the testimonial rate. `SourceCacheRefreshJob`: the refresh age, the files per run and the content length.
  - `GovernanceController`: the heartbeat and cache freshness windows. The checklist's item labels are fixed in `c/smartChecklist` ("Org heartbeat today", "Integration caches under 30 minutes old"), so they do not follow a changed value.
  - `DeliveryController.getRoadmap`: `Roadmap_Column_Limit`, sent to `c/roadmapViewer` as `columnLimit`, which keeps its own constant of 8 when the value is missing or not a whole number of 1 or more. `ResumeController.getTimeline`: `Timeline_Tab_Limit`, sent as `tabLimit`.
  - `getInteger` drops a fraction, so 2.75 reads as 2.

| Record                         | Value  | Safe range     | What it is for                                                            |
| :----------------------------- | :----- | :------------- | :------------------------------------------------------------------------ |
| `Api_Default_Page_Size`        | 50     | 1 to 200       | Records an API list returns when the caller sends no `limit`              |
| `Api_Max_Page_Size`            | 200    | 1 to 200       | Largest `limit` an API caller may ask for                                 |
| `Api_Sapi_Rate_Per_Minute`     | 120    | 1 to 1000      | SAPI requests per caller per minute before 429                            |
| `Api_Papi_Rate_Per_Minute`     | 15     | 1 to 1000      | PAPI requests per caller per minute before 429                            |
| `Api_Ai_Rate_Per_Minute`       | 10     | 1 to 100       | AI generation requests per caller per minute before 429                   |
| `Token_Requests_Per_Minute`    | 15     | 1 to 100       | Evaluator token requests per email and IP per minute                      |
| `Token_Daily_Cap_Default`      | 50     | 0 to 1000      | Daily token cap when `Portfolio_Config__mdt.Token_Daily_Cap__c` is blank  |
| `Circuit_Failure_Threshold`    | 3      | 1 to 20        | Failed callouts in a row that open an integration's circuit               |
| `Circuit_Open_Minutes`         | 30     | 1 to 1440      | Minutes an open circuit stays open                                        |
| `Testimonial_Rate_Per_Minute`  | 5      | 1 to 100       | Testimonial submissions per minute across all visitors                    |
| `Contact_Daily_Cap`            | 20     | 1 to 1000      | Contact form Leads accepted in a day                                      |
| `Contact_Min_Elapsed_Ms`       | 3000   | 0 to 60000     | Milliseconds a form must be open before a submission counts               |
| `Source_Refresh_Hours`         | 24     | 1 to 168       | Hours before a cached source file is read from GitHub again               |
| `Source_Max_Files_Per_Run`     | 90     | 1 to 100       | Source files one refresh run reads                                        |
| `Source_Content_Max_Length`    | 131072 | 1024 to 131072 | Characters of a source file kept before it is cut and marked truncated    |
| `Heartbeat_Stale_Hours`        | 26     | 1 to 168       | Hours before the checklist calls the org heartbeat out of date            |
| `Governance_Cache_Minutes`     | 30     | 1 to 1440      | Minutes before the checklist calls the GitHub and Jira caches out of date |
| `Ai_Min_Length`                | 100    | 50 to 4000     | Smallest `maxLength` an AI generation request may ask for                 |
| `Ai_Max_Length`                | 1000   | 50 to 4000     | Largest `maxLength` an AI generation request may ask for                  |
| `Ai_Default_Length`            | 500    | 50 to 4000     | `maxLength` an AI generation request gets when it sends none              |
| `Health_Credential_Timeout_Ms` | 10000  | 1000 to 120000 | Milliseconds the health check waits for its credential callout            |
| `Roadmap_Column_Limit`         | 8      | 1 to 50        | Cards each roadmap column shows before its Show all button                |
| `Timeline_Tab_Limit`           | 5      | 1 to 50        | Entries each home page timeline tab shows before its View all button      |

How to change a value safely is in the [Maintenance Guide §3.5](./05-Maintenance-Guide.md#35-changing-an-operational-setting).

## 2. Frontend (LWR) Component Logic

The front-end is based on **LWR** for sub-second page loads. **Lightning Web Security (LWS)** is required for security and to support libraries like D3 and jsPDF.

### 2.1 `c-skill-network` (Visualization)

The Skills page (`c/skillNetwork`) opens on a matrix: one row per skill category, ordered by Category Order then name, with one chip per skill ordered by proficiency and then name. Each chip shows the skill's name, its proficiency out of 5 and the years it was used. Years used come from real role dates, not a self rating: the date ranges of the roles linked to the skill through Experience Skill are merged where they overlap, a current role or one with no end date counts to today, and the total shows to one decimal, as "under 1 yr" below a year, or not at all when no role is linked. Selecting a chip lists the roles and projects that used the skill. On desktop and tablet a Matrix and Graph switch opens a graph view. The graph engine is D3 behind `c/graphEngine`, from the `D3_Library` static resource, and it is requested only when the graph is first opened. The layout runs to completion before anything is drawn: skills cluster by category on an inner ring, roles and projects sit on an outer ring, and edges appear only for the node that is hovered or selected. The component draws the result as SVG from its own template, so nothing animates on its own and reduced motion needs no special case. Phones and viewports under 768 px get the matrix only and never request the engine. A visually hidden list names every node and its connections. G6 is no longer used anywhere on the site.

- **Data:** `Skill__c` with `Category_Order__c`, its `Project_Skill__c` and `Experience_Skill__c` junctions, and each linked role's `Start_Date__c`, `End_Date__c` and `Is_Current_Role__c`, through the `lightning/uiGraphQLApi` wire adapter. The site guest reads the two dates through `Portfolio_Guest` field permissions added in Round 5. Without them the query fails validation for the guest.
- **Engine contract (`c/graphEngine`):**
  - `loadGraphEngine(component)` returns a Promise resolving to `window.d3`. It loads `D3_Library` through `loadScript` once per page. A failed load rejects and is not cached, so the next open tries again.
  - `layoutGraph(d3, nodes, edges, options)` is pure and synchronous. It runs `forceManyBody`, `forceCollide`, `forceLink`, `forceX` and `forceY` toward `options.anchors[node.group]` (groups on a ring when absent) for a fixed number of ticks with a seeded random source, keeps every node inside `options.width` by `options.height`, and returns `{ nodes, edges }` with `x` and `y` on each node and `x1 y1 x2 y2` on each edge. The same input gives the same output.
- **Engine resource:** `D3_Library` holds the official UMD builds of d3-dispatch 3.0.1, d3-quadtree 3.0.1, d3-timer 3.0.1, d3-force 3.0.0, and then d3-selection 3.0.0, d3-color 3.1.0, d3-interpolate 3.0.1, d3-ease 3.0.1, d3-transition 3.0.1, d3-drag 3.0.0 and d3-zoom 3.0.0, appended unchanged after the project's own header comment, 81,482 bytes in source. `graphEngine.test.js` pins each segment's SHA-256 to its npm package file.
- **Pan, zoom and drag:** `attachPanZoom(d3, svg, options)` and `attachNodeDrag(d3, elements, options)` in `c/graphEngine` wire d3-zoom and d3-drag to the drawn SVG and report the transform and the dragged positions back to the component, which still draws everything from its template. Zoom runs from 1x to 4x in steps of 1.5 (`ZOOM`). Double click does not zoom.
  - **Pan.** A background drag pans the graph at any zoom level, 100% included, up to 120 view box units past the graph's edge (`PAN_MARGIN`, passed as `translateExtent`), so the graph can never be lost. The graph itself is a keyboard stop (a group labelled "Skill graph"). While it has focus, the arrow keys pan it 40 units a press (`PAN_STEP`, through `panBy`, the same on screen at any zoom) and do not scroll the page, and a hint over its top left corner reads "Arrow keys pan the graph. Reset view centres it again."
  - **Zoom.** A plain mouse wheel scrolls the page and never zooms (`ctrlWheel`). Ctrl with the wheel, or a trackpad pinch, which arrives as a Ctrl wheel, zooms, at most one step per wheel event. A one finger swipe still scrolls a tablet page.
  - **Buttons.** Zoom in, Zoom out and Reset view stay as real buttons for keyboard users, the zoom level is announced politely ("Zoom 150%"), and Reset view returns the zoom, the pan and every dragged node to the start. Node drag is unchanged.
- **Persona filter (Round 7):** the matrix can be filtered by the resume's personas, with pressed buttons for All, Platform Architect, Salesforce Developer and System Admin and a polite summary such as "Showing 2 of 6 skills for Platform Architect." The tags are `Skill__c.Persona_Tag__c`, a multi-select with the same values as `Experience_Highlight__c.Persona_Tag__c` (Admin, Developer, Architect), read by a separate GraphQL query so the skills still load if the tags cannot be read. The filter appears only once at least one skill is tagged. The tags are set by a data script the owner reviews and runs, so until then the page looks as it did. Choosing a persona sends `skills_persona_filtered`.
- **View source:** a View source button at the top of the component opens its `skillNetwork.js`, `skillNetwork.html` and `graphEngine.js` (section 2.14).
- **Spacing:** both graphs were spread out in Round 6 and the spacing is measured by a Jest test on production shaped data (`skillNetwork/__tests__/layoutSpacing.test.js`). On the skills graph each category label holds its own place in the layout, so skills gather round it rather than under it.
- **Failure:** if the engine cannot load, the graph view says "The graph could not load. The matrix still shows every skill."
- **Analytics:** `skills_view_changed` with the view on every switch, `skill_selected` with the skill and its years on a selection, and `graph_zoom_used` with `control` set to `in`, `out` or `reset` for the buttons, `wheel` when a Ctrl wheel or pinch gesture ends, and `keyboard` on the first arrow key pan each time the graph has focus (section 2.8). A touch pinch sends nothing.
- **The D3.js skill:** the skill production listed as "AntV G6 (Graph)" is renamed "D3.js", keeping its links to roles and projects, by a data script the owner runs after the Round 7 deploy.
- **History:** until Round 5 the page drew a G6 force graph and an inline SVG on phones ([ADR-020 amendment](../adr/020-mobile-performance-static-svg-fallback-strategy.md#amendment-2026-10-22-round-5-matrix-first-the-graph-on-open-d3-as-the-engine)).

### 2.2 `c-resume-builder` (Resume Generation)

- **Pdf Generation:** Performs client-side PDF generation using **jsPDF**.
- **Role order (Round 7, audit F12):** current roles first, then the newest start date, then sort order (`ResumeController`). The same order drives the resume, its PDF and the home page timeline.
- **View source:** a View source button opens `resumeBuilder.js`, `resumeBuilder.html` and `ResumeController.cls` (section 2.14).
- **Logic:** The underlying Apex logic filters `Experience_Highlight__c` records based on the user's requested **Persona Tag** (e.g., Admin vs. Architect).
- **Skills follow the persona.** `ResumeController.getResume(persona)` keeps, for a chosen persona, the skills whose `Skill__c.Persona_Tag__c` includes it plus every skill with no tag, so a new skill nobody has tagged yet never disappears. With no persona chosen it keeps every skill. The screen, the "Copy ATS text" output and the PDF all build from that one payload, and PAPI `GET /papi/v1/resume/generate` applies the same rule to the skills it prints (`PAPIResume.showsSkillFor`).
- **Certifications:** current certifications are listed newest first with issuer and earned month, then one "Verify on Trailhead" link, then the retired ones in their own list, so the link never reads as covering them. `Certification__c.Is_Retired__c` separates the two. The link comes from `Portfolio_Config__mdt.Credential_Verification_URL__c`, a Text field so the value renders exactly as stored, through `ResumeController` as `credentialVerificationUrl`. With no value set, no link shows.

### 2.3 `c-testimonial-submit` (Social Proof)

- **The form (Round 7, B9).** The sentence "I'm a [relationship], and Ryan [strength]. The result? [outcome]" sits inside one `fieldset` whose `legend` reads the sentence. Each blank is a labelled select, a polite live region previews the finished sentence, and an optional note follows. The vibe (Professional or Casual) chooses the `Testimonial_Fragment__mdt` set, and switching it clears the chosen phrases. A Recruiter, or a Fan or visitor, sees only the outcomes whose audience is Anyone.
- **The server.** `TestimonialController` accepts only a known fragment of the chosen vibe, stores the composed sentence in `Context__c` and the fragment names and the note in fields of their own, runs `SubmissionGuard` (honeypot, minimum time, blocklist, 5 a minute across all visitors on the `testimonial-submit` key) and never sets `Approved__c` ([ADR-005 amendment](../adr/005-gamified-testimonial-ui.md)).
- **The wall.** `c-testimonial-wall` on `/testimonials` shows approved testimonials from `TestimonialController.getApprovedTestimonials`, each in its tone, with a "Professional / All" filter that uses the API feed's rule (the Professional vibe from a Manager, Client or Peer). It renders nothing when there are none or the read fails. The guest reads the rows through the `Guest_Read_Testimonials` sharing rule, and the restriction rule hides unapproved ones ([ADR-012 amendment](../adr/012-guest-user-security-restriction-rules.md)).
- **Analytics.** Each submit the server answers sends `testimonial_submitted` with the vibe and the outcome (`accepted`, `rate_limited` or `invalid`), and nothing the visitor typed or chose. Switching the wall's filter sends `testimonials_filtered` with the new filter, `all` or `professional`.

### 2.4 `c-schema-visualizer` (Dynamic ERD Visualizer)

The Business Architecture page draws the live ERD with `c/schemaVisualizer`, fed by `SchemaService.getSchemaGraph(scope)` (`@AuraEnabled(cacheable=true)`, `with sharing`, API 64.0). The scope is `employerHub` (the default on the page) or `portfolio`, and a two-button toggle switches between them. Discovery reads the global describe keys once: custom objects of this org (ending in `__c` with no namespace), minus custom settings, plus a standard allowlist per scope (Account and Contact for the portfolio, and Account, Contact, Case, Opportunity and Contract for the Employer Hub). Objects whose name starts with `EH_` belong to the Employer Hub. `Schema_Visualizer_Object__mdt` rows move an object to a scope or hide it, and four shipped rows hide `API_Rate_Window__c`, `API_Access_Request__c`, `Github_Cache__c` and `Jira_Cache__c`. Only the filtered list is described, with `SObjectDescribeOptions.DEFERRED`. Edges come from reference fields whose target is in scope, not from child relationships, and a field with a relationship order is master-detail while every other reference is a lookup. The only cache is the browser's, from `cacheable=true`. There is no Platform Cache. The response carries its own CPU time, which the caption shows ("9 objects, described in 96 ms of server CPU"). Uncached, the portfolio scope took 141 ms and the Employer Hub 96 ms in a scratch org, against a 1,000 ms budget. The site guest sees the same objects as an admin, because describe does not filter by object permission. On desktop and tablet the D3 engine (`c/graphEngine`) loads once the diagram scrolls into view. Nodes are drawn as rounded rectangles with the label and field count. Master-detail edges are solid with a dot at the parent, lookups are dashed, and a legend explains both. Selecting a node lists its fields (name, label, type, reference targets). On phones and viewports under 768 px the object list is the visible view and the engine is never requested. The same list sits behind the diagram on desktop for screen readers and keyboards.

- **Deviation from the first design:** this section used to say edges came from `getChildRelationships()` and the result was cached in Platform Cache. Neither is built: child relationships on `Account` alone run to hundreds, and the org has no Platform Cache partition ([ADR-029](../adr/029-schema-visualizer-scope-discovery-and-caching.md)).
- **Spacing:** the layout treats each object box as an oval, so boxes keep at least 36 px apart without hitting the edge. Measured by `schemaVisualizer/__tests__/layoutSpacing.test.js` on both scopes (Round 6).
- **Failure:** if the engine cannot load, the page says "The diagram could not load, so the object list is shown instead."
- **View source:** a View source button beside the heading opens `schemaVisualizer.js`, `schemaVisualizer.html` and `SchemaService.cls` (section 2.14).
- **Analytics:** `erd_scope_changed` with the scope, `erd_node_selected` with the object (section 2.8).
- **Tests:** `SchemaServiceTest` proves, among others, that `Project_Skill__c` to `Project__c` is a master-detail edge, the four hidden objects are absent, an override moves an object, an `EH_` object lands in the Employer Hub, custom settings are left out, an unknown scope throws, each scope stays under the CPU budget, and the site guest gets the same objects as an admin.

### 2.5 `c-smart-checklist` (Executable Governance)

- **No browser subscription.** `lightning-emp-api` is unsupported in LWR sites, and a guest has no token for Pub/Sub API, so the component imports no `lightning/empApi` and opens no channel ([ADR-019 Round 4 amendment](../adr/019-executable-governance-platform-events-for-documentation-logic.md#amendment-2026-10-21-round-4)).
- **Server side.** CI publishes `Governance_Event__e` after a production deploy and after the daily heartbeat. `GovernanceEventTrigger` hands each batch to `GovernanceEventHandler.handle`, which upserts a `Pipeline_Run__c` record by `Run_Key__c` (`<workflow>:<run id>`), so a replayed event changes nothing, skips events with an unknown workflow or status or no run id, and keeps the newest 60 rows per workflow.
- **Read.** The component wires `GovernanceController.getPipelineStatus()` (cacheable): the latest run per workflow plus the age of the integration caches. It reads when the page is viewed and calls `refreshApex` when the tab becomes visible again (`visibilitychange`). There is no `setInterval` and no `setTimeout` loop.
- **Items.** "Production deploy green", "Org heartbeat today" (a heartbeat more than 26 hours old, the `Heartbeat_Stale_Hours` setting, is out of date) and "Integration caches under 30 minutes old" (the `Governance_Cache_Minutes` setting), each worked out in `GovernanceController` from evidence only: no run is "No signal yet", a `Failure` is "Failed", old evidence is "Out of date", and only fresh success is "Passed". Each shows its evidence (commit and time, linking to the run). Nothing is kept in `localStorage`.

### 2.6 `c-footer` (Glass Box Telemetry)

- **Component:** `c-footer`, one line: copyright, the deploy badge with a status dot, the telemetry in Fira Code, profile links, a Contact link and "Back to top". The Contact link goes to the `/contact` page (`{site base}/contact`), built from the site base path in `footer.js`.
- **Links:** `FooterController.getLinks()` (cacheable) returns only `gitHubUrl` and `linkedInUrl` from `Portfolio_Config__mdt`. It never selects the owner's email or phone.
- **Deferred load (ADR-014):** the component paints first and calls `FooterController.getSystemSnapshot()` from `requestIdleCallback`, or a zero delay timeout where the browser has none, so the fetch never delays the main page load (LCP). The method is not cacheable, so each visit reads current values.
- **Telemetry Data:**
  - Limits: CPU time, heap size and SOQL queries used against their limits (`Limits.getCpuTime`, `getHeapSize`, `getQueries` and their limits).
  - AI providers: one row per provider from `ContentGenerationController.providerStatus()`, for example "Agentforce: off", or "Gemini: circuit open until 14:05" while its breaker is open.
  - "AI requests today: N": `SUM(Count__c)` of today's `API_Rate_Window__c` rows whose key starts `papi-ai:`, through a `without sharing` inner class that returns only the number. It counts requests from the site page and from `/papi/v1/ai/generate`, not Gemini calls, so it is never called a Gemini quota (PD-D9). Hover or focus sends `finops_quota_visibility`.
  - Org quotas (Round 7): `DailyApiRequests` and `DailyAsyncApexExecutions` from `OrgLimits.getMap()`, shown as "API requests today N of M" and "async Apex today N of M". A quota the org does not report is left out, and a failed `OrgLimits` read leaves the list empty, so the footer never shows a guessed number. `DataStorageMB` is not shown, because the site guest cannot read it (`FooterControllerTest`).
  - GitHub and Jira breakers (Round 7): "GitHub: circuit closed" and "Jira: circuit closed" beside the AI providers, or open until a time, from `CircuitBreaker.snapshot()`.
  - If the snapshot call fails, the line shows "status unavailable".
  - "GraphQL: live, N ms": at the same idle moment the footer loads `c/graphqlProbe` with a dynamic import and times one small read (the first `Skill__c` Id) from the moment the probe connects to the first answer. If the read fails the line says "GraphQL: unavailable". The timer starts when the probe's field is created, not in `connectedCallback`, because the wire can answer before the component connects, and the footer shows a time only when it is a finite number. An earlier order showed "GraphQL: live, NaN ms" on `/skills` (`graphqlProbe.earlyWire.test.js`).
  - "GraphQL: cached, no request made": the data service can answer from records another component already read, with no request at all. So the probe watches the browser's resource timing (a `PerformanceObserver`) from the moment it is created, and when the answer arrives with no request to `/services/data/vNN.N/graphql` since then, it reports the answer as cached and the footer shows this line instead of a near zero time. When a request did go out, the line reads "GraphQL: live, N ms". Where resource timing is missing, the probe reports no cached flag and the footer shows the time. The probe is a separate module so the GraphQL adapter stack never loads before first paint (§2.11).
- **Deploy badge:** `https://github.com/rdbumstead/salesforce-platform-architect-portfolio/actions/workflows/deploy.yml/badge.svg?branch=main`, alt text "Production deploy status", allowed by the `GitHub_Badge` CSP trusted site (img-src). If the image fails, a text link to the Actions page takes its place.
- **Resilience toggle:** not in the footer. The "Simulate an outage" switch sits on the changelog and the roadmap (ADR-022 Round 4 amendment).

### 2.7 Architectural Decision Record: ADR-014 (Deferred Telemetry)

- **Context:** Real-time telemetry is non-essential for the user journey.
- **Decision:** All "System Health" data fetching must be decoupled from the critical rendering path.
- **Reference:** See **[ADR-014: Deferred Telemetry Loading](../adr/014-deferred-telemetry-loading-performance.md)** for full decision context.

### 2.8 Analytics Instrumentation (GA4)

- **One event layer.** `c/analyticsService` exports `trackEvent(name, params)` and `EVENTS`, the one event list. `trackEvent` does nothing when `window.gtag` is absent and never throws, so analytics can never break a component. New events are appended to `EVENTS`, and nothing else in it changes.
- **Delivery does not work yet.** The events below are named and sent by the components through `trackEvent`. A check on production on 2026-10-23, with every collect request answered locally, found that none of them reaches GA4: from inside a component `trackEvent` finds no usable `gtag`, so it sends nothing. Only the tag's own page views and scroll events go out. A fix to the delivery is being built. Until it ships, no number in GA4 comes from a component event.
- **Events** (measurement id `G-G6P1S31J8L`):
  - `api_test_executed` {`path`, `status`}, `api_reference_opened` {`spec`}
  - `ai_generation_completed` {`provider`, `model`, `fallback`, `latency_ms`, `outcome`}, where `outcome` is `live`, `template_unreachable` or `template_slow`, and `ai_complete_failure` {`message_kind`}, where the kind is `rate_limited`, `no_provider`, `invalid_input` or `other`, never the message. The Charter's AI rates are to be computed in GA4 from these once component events arrive there.
  - `resume_downloaded` {`persona`, `format`}
  - `roadmap_viewed`, `changelog_commit_clicked` {`sha`}, `governance_run_link_clicked` {`workflow`}
  - `resilience_test_triggered` {`source`: `changelog` or `roadmap`}, sent when the "Simulate an outage" switch is turned on
  - `finops_quota_visibility`, `theme_changed` {`theme`}
  - Round 5: `skills_view_changed` {`view`}, `skill_selected` {`skill`, `years`}, `erd_scope_changed` {`scope`}, `erd_node_selected` {`object`}, `gallery_asset_opened` {`type`, `pillar`}, `matrix_weight_changed` {`criterion`}, `matrix_reset`
  - Round 7: `skills_persona_filtered` {`persona`}
  - Home page: `timeline_tab_changed` {`tab`: `work`, `education` or `certifications`}, `timeline_expanded` {`tab`, `expanded`}, `case_study_opened` {`pillar`, the letter}, `start_path_followed` {`path`: `resume`, `pillars` or `api`} (section 2.12)
  - View source: `view_source_opened` {`source_key`}, `view_source_file_selected` {`source_key`, `file_label`} (section 2.14)
  - Forms: `contact_form_submitted` {`outcome`: `accepted`, `rate_limited` or `invalid`} (section 2.16), `testimonial_submitted` {`vibe`, `outcome`} and `testimonials_filtered` {`filter`: `all` or `professional`} (section 2.3)
  - Layout: `back_to_top_used`, no parameters (section 2.9)
  - Skills graph: `graph_zoom_used` {`control`: `in`, `out`, `reset`, `wheel` or `keyboard`} (section 2.1)
  - None of these parameters holds a name, an email, a message, free text or an id of a person.
- **The tag.** The GA4 tag loads from head markup, with a page view sent on every route change, because the LWR router changes routes without a page load. The route change page view is sent from the plain head script that wraps `history.pushState`, which calls the exported `gtag('event', 'page_view', ...)` with the new location. Before Round 5 that listener sat inside the privileged iframe, never received the outer window's event, and no page view was sent after the first page.
- **CSP.** To load the tag the site runs on **Relaxed CSP** (owner decision, 2026-10-21). That lets inline scripts and `eval()` run on the site, so only reviewed head markup adds scripts, and `https://www.googletagmanager.com` is on the site's script allowlist (Experience Builder "Trusted Sites for Scripts"), kept in source in the site bundle at `digitalExperiences/site/Portfolio1/sfdc_cms__trustedSites/trustedSites/content.json`. It deploys with the site, so production needs no hand step. On the scratch site the tag loaded and a `g/collect` hit reached `google-analytics.com`. The GA4 image and connect hosts are trusted sites in source (`GA4_Tag_Manager`, `GA4_Analytics`, `GA4_Google`), so a Builder setting saved only in production cannot drift from the repo.

### 2.9 Site Theme, Tokens and Fonts

- **The theme follows the visitor's system setting.** Light tokens sit on `:root` in the site stylesheet (`sfdc_cms__styles/styles_css/styles.css`). Dark tokens apply under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`, and again on `:root[data-theme="dark"]`, so the first paint needs no script. Light is the fallback.
- **The toggle.** The header's theme button in `portfolioThemeLayout` sets `data-theme="light"` or `"dark"` on the `html` element and on its own host, which overrides the media query, and stores the choice under the `localStorage` key `portfolio-theme`. No stored value means "follow the system". Changing it sends the GA4 event `theme_changed`. No other component reads that key or sets the attribute.
- **Design tokens.** Components use only the `--pf-*` custom properties (background, surface, text, accent, chip, warning, success, code, button, error, fonts, radius and spacing), defined in `styles.css` and mirrored on the `:host` of `portfolioThemeLayout`. The stylesheet also maps the platform's `--dxp-g-*` globals onto them, because it loads after the branding set's inline styles.
- **Fonts.** Inter (400 to 700) for text and Fira Code (400 and 500) for section labels, pillar letters, code, API output and the footer metrics. Both are Latin woff2 files in the `Portfolio_Fonts` static resource, loaded by `@font-face` with `font-display: swap` from a same-origin URL, so the site's CSP needs no new host (licences in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)).
- **Header.** A slim sticky header. It shows the name as the home link on every page, then Home, Resume, Skills, Testimonials and Contact, then the Pillars menu, centred between the name and the theme button on desktop. Home is left out on the home page itself, in the desktop header and the phone menu alike. The link to the page on screen carries `aria-current="page"`. On phones (under 768 px) the links fold behind the menu button. The Pillars menu opens on a click, and closes on a click outside it, on Escape (focus returns to its button) and after a pillar link is followed. Primary controls are at least 44 px high.
- **Back to top.** `portfolioThemeLayout` adds a floating "Back to top" button on every page once the visitor has scrolled one screen height (`BACK_TO_TOP_SCREENS` 1, times the window's inner height). It stays a layout constant, because no server call serves the layout. It is a real button, next after the main content in the tab order, lifted above the footer and clear of it at 320 px. Pressed, it scrolls to the top, instantly when `prefers-reduced-motion` is set, and moves focus to the top of the main content, and sends `back_to_top_used`. While it has focus it stays on screen. The footer's own "Back to top" link sends no event.
- **Removed in Round 7.** The unused `placeholderTerminal` component, a pre-launch splash that no page placed. The `SiteSamples` static resource stays, because the site's Visualforce error pages (for example `FileNotFound` and `InMaintenance`) and `SitePoweredBy` load it.
- **Shared pillar list.** `c/pillarData` exports `PILLARS` and `pillarByLetter`, the one list the header and the home page read. Pillar B's name and its page label there are both "Solution Architecture", so its badge, its card link, its tour stop and its item in the header's Pillars menu read that way. The route, view title, page heading and page title (`Solution Architecture | Ryan Bumstead`) say the same. Only the address stays `/nonprofit-solutions`, so no link breaks and no redirect is needed. The `Project__c.Pillar_Label__c` formula, which the API returns as `pillarLabel`, and the pillar page descriptions in the site views repeat the names, so `pillarData/__tests__/pillarSources.test.js` fails when either disagrees with `c/pillarData`. That test keeps "Nonprofit Solutions" as a former name.

### 2.10 Project Asset Gallery and Decision Matrix

**`c/projectAssetGallery`** (properties `pillar` A to E and `heading`) reads `Project__c` by `Pillar__c` with `Project_Assets__r` through `lightning/uiGraphQLApi`, ordered by Sort Order. An Image shows with its alt text and opens full size in a new tab. A Document is a download link. A Video or Link is an external link with `rel="noopener"` and no embed. An asset with no URL shows its name and "Not available yet". URLs that start with http or https are used as they are. `resource:<Name>/<path>` becomes `<site base path>/sfsites/c/resource/<Name>/<path>`, so images ship as static resources deployed by CI. Any other value gets no link. Opening an asset sends `gallery_asset_opened` with the type and pillar. It is generic, so any project page can reuse it. With no assets, or when the read fails, it renders nothing at all, no heading and no note (Round 6), so a pillar with no published material shows no empty section. A `Url` field accepts the `resource:` form (`SchemaServiceTest.assetUrlFieldAcceptsResourcePath`), so no extra field was needed.

**`c/decisionMatrix`** shows the Pillar B matrix ([ADR-030](../adr/030-decision-matrix-as-custom-metadata.md)):

- **Data:** one cacheable call, `DecisionMatrixController.getMatrix()`, returns the three options, the ten criteria with the owner's starting weights, the thirty scores with rationale and evidence, and `hasPlaceholders`. It reads three Custom Metadata Types in the `nonprofit-literacy` package with SOQL and maps each score to its option and criterion by record Id. The site guest needs only class access, no custom metadata grant.
- **In the browser:** `computeTotals` sums weight times score per option, `rankOptions` orders them, and `findFlip` searches each criterion's weight from 0 to 10 for the smallest single change that would put the runner-up ahead. That is the sensitivity line. Moving a slider makes no server call. "Reset to the starting weights" restores every `Default_Weight__c`.
- **Placeholders:** while any score has `Is_Placeholder__c`, a banner says "Scores and weights are provisional placeholders pending the owner's review." Since Round 6 every score is reviewed and no flag is set, so no banner shows. At the starting weights the totals are NPSP and PMM 268, Nonprofit Cloud 262 and Education Cloud 152.
- **Analytics:** `matrix_weight_changed` with the criterion, `matrix_reset`.
- **View source:** a View source button at the top opens `decisionMatrix.js`, `decisionMatrix.html` and `DecisionMatrixController.cls` (section 2.14).
- **Tests:** `DecisionMatrixControllerTest` fails when any option and criterion pair lacks a score, and proves the site guest gets the same matrix as an admin, cell for cell.

**`c/pillarBStory`** holds the six sections of the Pillar B page: the client, discovery with the lifecycle to object table, the decision matrix introduction, the cost and effort table from public licence facts with a source per row, the solution design with the object model redrawn in `NL_Assets`, and the outcome. Discovery opens by saying the work was done in pre-sales (decision D3). Since Round 7 each table that scrolls sideways is a named keyboard stop (`tabindex="0"`, `role="region"` and an `aria-label` such as "Lifecycle concepts table, scrolls sideways"), so a keyboard user can scroll it on a phone. There is no video prototype (decision D8), so the page has no video section and sends no video event.

### 2.11 Mobile Performance

Round 5 measured every change with the Lighthouse CLI (11.4.0, mobile profile, simulated throttling), three runs per route on a scratch copy of the site, and kept or reverted it on the median.

- **Kept: the footer's GraphQL probe loads after the page is idle.** `c/footer` imported `lightning/uiGraphQLApi` statically, so about 237 KB of GraphQL adapter modules were preloaded with the layout on every route before first paint. The probe now lives in `c/graphqlProbe`, which the footer loads with a literal `import("c/graphqlProbe")` after `load` plus idle and renders through `lwc:component` (the footer declares `lightning__dynamicComponent`). Rendering the child behind `lwc:if` was not enough, because the bundler still preloaded it.
- **Kept: the hero reads `ResumeController.getHeader()`.** It returns only the header from the owner Contact, so the bio, which is the home page's LCP element on the live site, no longer waits on the full resume query.
- **Tried and reverted:** loading `gtag/js` after the window `load` event (Total Blocking Time rose on all four routes) and preloading the headshot from the head markup (LCP rose on three of four routes, because a head preload is fetched on every route).
- **Results**, medians of three runs, before in brackets:

| Route      | FCP             | LCP              |
| ---------- | --------------- | ---------------- |
| `/`        | 4.61 s (5.91 s) | 7.30 s (8.20 s)  |
| `/resume`  | 5.16 s (6.43 s) | 9.85 s (9.39 s)  |
| `/skills`  | 5.75 s (5.75 s) | 9.28 s (9.42 s)  |
| `/api-lab` | 5.27 s (6.50 s) | 8.65 s (10.02 s) |

- **Reading them.** First paint came about 1.2 s sooner everywhere except `/skills`, which needs the GraphQL stack for the skills matrix itself. The `/resume` LCP lands near 8.6 s or near 10.1 s from run to run on identical code, so its median does not show a direction. Accessibility scored 1 on every run.
- **What is left.** The launch target of LCP under 2.5 s on mobile is not met. The remaining cost is outside the site's own files: about 500 KB of LWR framework and data service modules on every route, about 420 ms of `gtag/js` script, and the platform's SLDS stylesheets. Fonts were not changed in Round 5, because dropping a weight the pages use would change how they look.

**Round 6, the recorded gate.** One more measured try, on a scratch copy of the site with Lighthouse 11.4.0 (mobile profile, simulated throttling, three runs per route, medians). Two changes, each measured alone:

- **Tried and reverted: fonts.** Dropping the unused Inter 500 face and preloading Inter 600 lowered LCP on three routes and raised it on three, and Total Blocking Time rose on three. A font preload cannot shorten script render delay, so the numbers did not earn it.
- **Tried and reverted: deferring SLDS stylesheets 2 to 4.** Lighthouse never counted any stylesheet as render blocking (`render-blocking-resources` is empty on all six routes), so deferring them left the critical path as it was, and LCP rose on three routes.
- **Why LCP stays high.** Every text LCP on these routes is render delay from script: the LWR framework and data service modules and the components' own data calls. The home page LCP is the hero photo, whose request waits on the component. None of that is in the site's own files.
- **Results** of the shipped build (the same code as before the round), medians with all three runs:

| Route                    | FCP    | LCP (runs)                 |
| ------------------------ | ------ | -------------------------- |
| `/`                      | 4.55 s | 7.51 s (7.21, 7.51, 8.72)  |
| `/resume`                | 5.00 s | 7.66 s (7.66, 6.57, 10.01) |
| `/skills`                | 6.11 s | 9.62 s (9.71, 9.02, 9.62)  |
| `/api-lab`               | 5.18 s | 8.65 s (8.51, 9.92, 8.65)  |
| `/business-architecture` | 5.92 s | 8.51 s (7.28, 8.57, 8.51)  |
| `/nonprofit-solutions`   | 6.24 s | 8.43 s (8.61, 8.43, 7.33)  |

- **The gate.** Mobile LCP on the scratch site measured 7.5 to 9.6 s with Lighthouse 11 mobile, which is the best the LWR shell allows, against a 2.5 s target. Accessibility scored 1 on every run. The same code measured twice spreads by up to 3.9 s on one route (`/skills`, 5.71 to 9.71 s), so a single run proves little. These are scratch numbers, not live ones.

### 2.12 Home Page Cards and Timeline

- **Start here paths.** Under the hero, three paths by audience: "For recruiters" to the resume, "For architects" to the pillar cards further down the page (the link moves focus to the pillars heading), and "For developers" to the API Lab. The developer path shows only while Pillar C is live in `c/pillarData`. Following a path sends `start_path_followed` with `path` set to `resume`, `pillars` or `api`.
- **Pillar cards.** `ProjectCardController.getPillarCards()` is a cacheable Apex method that reads `Project__c` through a `without sharing` selector in system mode and returns one row per pillar letter (featured first, then sort order, then name) with `pillar`, `headlineMetric`, `headlineLabel`, `imageUrl`, `imageAlt`, and since Round 7 `challenge`, `solution`, `businessValue`, `liveUrl`, `repositoryUrl` and `headlineSource`. `heroBanner` merges the rows into its cards by letter. The static `c/pillarData` still draws every card, so a missing row or a failed read changes nothing. The read goes through Apex rather than GraphQL because the Apex adapter is already on the home page for the hero.
- **Card numbers are computed (Round 7, audits F11 and G5).** `Project__c.Headline_Metric_Source__c` (a picklist) names where a card's number comes from, and the controller computes it each time the cards load: "Employer Hub objects" counts the Employer Hub objects the ERD draws (`SchemaService.countObjects`), "API paths" counts the paths in the `SAPI_Spec` and `PAPI_Spec` resources, "AI providers" counts the providers `ContentGenerationController.providerStatus()` reports as on, and "Apex tests" reads `Tests_Passed__c` and `Org_Coverage__c` from the newest `Pipeline_Run__c` with `Status__c` Success and a test count, so a run with a failed test shows the passed count, which CI writes after each production deploy. The number replaces the first number in `Headline_Metric__c`, and fills the label's `{n}` token (and `{coverage}` for Apex tests). With no source set, or when a source fails, the stored text shows (`headlineSource` reads `stored`). A label whose token cannot be filled hides the headline, so the card never shows `NaN` or a 0 from a failed read. A card leads with a number only when both a metric and a label result, and shows its image only when both `Hero_Image_URL__c` and `Hero_Image_Alt__c` are set. Setting the sources on the production rows is a data script the owner runs.
- **Case study.** Each card can open a short case study: a real `button` with `aria-expanded` shows the Challenge, Solution and Business Value text and "Live site" and "Source code" links, each only when set. A card with no case study text shows no button. Opening one sends `case_study_opened` with the pillar letter. Closing it sends nothing. For Pillars C, D and E the owner's data script blanks the case study fields by default, because their stored text described things the site does not do, and keeps the old text in the script for the owner to review.
- **Card images.** `Project_Card_Images` holds one 640 by 360 WebP per pillar (`pillar-a.webp` to `pillar-e.webp`), each under 28 KB, cropped from that pillar's own public page in the light theme with nothing that identifies a person. Records point at them as `resource:Project_Card_Images/pillar-x.webp`, resolved by `c/externalUrl` `toSiteAssetUrl` the same way as the project gallery. Images load lazily below the hero, so the bio stays the first paint.
- **Hero (Round 7).** The headshot is 232 px square on desktop and lines up with the top of the text (audit F10), 184 px on tablets and 120 px on phones. The "Take the 5 minute tour" button keeps its fill in both themes: the platform's link rule outranked the plain `.btn-primary` class, so the button rules now also match `:link` and `:visited` (audit F8). The short rule before section labels such as "01 / THE PILLARS" is gone, the text stays (audit F9).
- **Timeline.** `ResumeController.getTimeline()` returns `work`, `education`, `certifications`, `verificationUrl` and `tabLimit` through the same `without sharing`, system mode selector as the resume, in a fixed shape with no email, phone, address or `Owner_*` field. Roles come current first and then newest start, schools newest completion first. `certifications` lists only the current ones (`Is_Retired__c` false), newest earned first, each with its name, issuer and earned date. Retired certifications stay on `/resume`. `verificationUrl` is `Portfolio_Config__mdt.Credential_Verification_URL__c`, and `tabLimit` is the `Timeline_Tab_Limit` setting (section 1.6), 5 when the record is missing or out of its range. The site guest needs class access only.
- **Timeline tabs.** `c/experienceTimeline` has three tabs, Work, Education and Certifications, and follows the tabs pattern: a tab list with `aria-selected` and a roving tab index, ArrowLeft, ArrowRight, Home and End move between tabs, and each panel has `role="tabpanel"`. Each tab shows its first `tabLimit` entries. A tab with more gets a real `button` reading "View all N", with `aria-expanded` and `aria-controls` naming the list, that shows the rest in place and then reads "Show fewer". Each tab keeps its own state and focus stays on the button. The Certifications tab ends with one "Verify on Trailhead" link when `verificationUrl` is set and starts with `http` or `https`. It opens in a new tab with `rel="noopener noreferrer"` and uses the stored value exactly. The component renders nothing when every list is empty, hides a tab whose list is empty, and uses only the site tokens with 44 px tap targets.
- **Timeline analytics.** `timeline_tab_changed` on a tab change, with `tab` set to `work`, `education` or `certifications`. `timeline_expanded` on each View all or Show fewer press, with `tab` and `expanded` (true when the list opened).

### 2.13 Cloudflare Cache Warmer Worker

The one piece of the running system outside Salesforce, apart from the domain redirect (SAS section 6.1).

- **What it is.** A Cloudflare Worker named `portfolio-cache-warmer` (`config/wrangler.toml`), whose code is `scripts/cache-warmer.js`. Its `scheduled` handler runs on a cron trigger every 5 minutes (`*/5 * * * *`) and sends one GET to `TARGET_URL`, `https://ryanbumstead.com/`, with `Cache-Control: no-cache` and `Pragma: no-cache`. It logs the status and never retries.
- **Why.** To wake the site regularly, so a visitor is less likely to be the first request after a quiet spell. The Worker's own comment says the `no-cache` headers make sure the request reaches Salesforce rather than a cache. No measurement of the effect has been taken, so none is claimed.
- **What it is not.** It is not the edge AI proxy of [ADR-016](../adr/016-cloudflare-worker-as-edge-ai-proxy.md), which stays deferred. It reads nothing, caches nothing and calls no API.
- **Deploy.** `deploy-worker.yml` runs `wrangler deploy --config config/wrangler.toml` on a push to `main` that changes either file, or by hand, with the `CLOUDFLARE_API_TOKEN` secret.
- **Not yet checked.** `TARGET_URL` is the redirect domain, so the request reaches the site only by following the 301. Whether the deployed Worker follows it, and whether it fires every 5 minutes, has not been read from Cloudflare's logs.

### 2.14 View Source (`c-view-source`)

A "View source" button on the showcase components opens the component's real source, read from GitHub ahead of time and cached in the org (Round 7, audit B1). A visitor never causes a GitHub call.

- **The control.** `<c-view-source source-key="skillNetwork"></c-view-source>`. `sourceKey` is its only public property. It renders a real `button` labelled "View source" with a 44 px target. Pressed, it opens a native `<dialog>` with `showModal()`, so it sits above the sticky header and the page behind it is inert. The dialog is labelled by its heading, "Source: " and the component's name, and lists the files as tabs (the arrow keys move between them). The chosen file shows in `c-code-viewer` with a link to it on GitHub that opens in a new tab with `rel="noopener noreferrer"`. Focus moves to the heading when the dialog opens, Tab stays inside it, and Escape or Close returns focus to the button. When the key is unknown or no file is cached yet, nothing renders at all.
- **Files per key.** `Source_File__mdt` records (`Source_Key__c`, `Path__c`, `Label__c`, `Sort_Order__c`) list the files, so the owner can change them without code. Each key lists the component's `.js` and `.html` and its main Apex class, or `graphEngine.js` for `skillNetwork`, which has no Apex. The keys are `skillNetwork`, `schemaVisualizer`, `decisionMatrix`, `apiTester`, `resumeBuilder` and `roadmapViewer`.
- **Read.** `SourceController.getSourceFiles(sourceKey)` (`@AuraEnabled(cacheable=true)`) returns `path`, `label`, `language`, `content`, `htmlUrl`, `fetchedAt` and `truncated` per file, in sort order, from `Source_Cache__c` only. The guest has no permission on `Source_Cache__c`, so the controller reads it through a `without sharing` selector in system mode that returns those fields for the configured paths only. `SourceControllerTest` runs as the site guest and proves the read makes no callout.
- **Analytics.** Opening the dialog sends `view_source_opened` with the source key. Choosing another file sends `view_source_file_selected` with the key and the file's label.
- **Fill.** `SourceCacheRefreshJob` (`Queueable`, callouts allowed) reads each configured path at `main` through `GitHubService` and the `GitHub_API` Named Credential and upserts one `Source_Cache__c` row per path. `IntegrationCacheRefreshScheduler` enqueues it on its existing quarter hour schedule only when a path is due, meaning it has no row or was last checked 24 hours ago (the `Source_Refresh_Hours` setting), so each file is read at most once a day, a failing one included. The first run after a deploy reads every path, 18 today. A run makes at most 90 callouts (`Source_Max_Files_Per_Run`), all before any write. A failed read keeps the last good content and records only the check time and status, and it counts toward the `github` circuit breaker, which also makes the job skip while open. Content longer than 131,072 characters is cut and marked `truncated`. Rows for paths no longer configured are deleted.
- **Highlighting.** `c/prismHighlighter` is the site's one Prism module. `loadPrism` loads the `Prism_JS` resource once per page, `highlight` builds HTML only from escaped text (Prism tokens for a known grammar, the `clike` grammar for an unknown one, escaped plain text if Prism is missing or throws), and `languageForPath` maps `.cls` and `.trigger` to Apex, `.js` to JavaScript, `.html` and `.xml` to markup, plus CSS, YAML and JSON. `Prism_JS` gained Prism 1.30.0's Apex, SQL, JSON and YAML grammars in Round 7. `c-code-viewer` uses it, and its scroll region is a named keyboard stop.
- **Placed on:** the API Lab (`apiTester`), the skills page (`skillNetwork`), the Pillar A data model (`schemaVisualizer`), the Pillar B decision matrix (`decisionMatrix`), the resume (`resumeBuilder`) and the Delivery roadmap (`roadmapViewer`). The ERD hides `Source_Cache__c` through the `Hide_Source_Cache` record of `Schema_Visualizer_Object__mdt`.
- **Not yet checked in production:** the first refresh through `GitHub_API` runs only after the deploy. The same credential serves the commits job today.

### 2.15 API Lab and API Reference

- **One source for the specs (Round 7, G2).** `packages/integration-api/specs` holds the two YAML specs. `npm run specs:sync` (`scripts/sync-specs.js`) generates every copy: the `SAPI_Spec` and `PAPI_Spec` YAML static resources the API reference reads, the `SAPI_OpenAPI` and `PAPI_OpenAPI` JSON resources `/openapi.json` serves, the `API_Lab_Catalog` resource the Lab reads, and the Postman collection. `npm run specs:check` writes nothing and fails when a copy differs, and a Jest test in `apiReference` fails the same way.
- **Path list (G1).** `ApiLabController` allows only the paths in `API_Lab_Catalog`, built from the specs' GET operations, so a new spec path appears in the Lab with no code change. `/papi/v1/auth/token` and `/papi/v1/ai/generate` are left out on purpose, with the reason in the script. A missing or broken catalog refuses every path.
- **The Lab (B3).** Query parameters are controls built from the spec: pills for up to four values, a picklist above that, true and false pills for a boolean, bounded `limit` and `offset`, hinted id fields, and every chosen value as a removable pill over the query string, plus the free text Advanced field, which wins on a shared name. "Next page" follows `X-Has-More`. The response body is highlighted by `c/prismHighlighter` and checked against the path's response schema: which documented keys are present, missing, or not in the spec. Each call sends `api_test_executed` with the path, the status and `param_count`.
- **The reference.** `c-api-reference` renders Redoc inside the component. Redoc looks its sections up on `document`, which cannot see inside the component, so the component scrolls a chosen section below the sticky header itself and answers Redoc's section lookups from the rendered reference. It finds the header's bottom by scanning down the page's centre line where it cannot read the theme layout's shadow root. Deep links (`#tag/...`, `#operation/...`, `?spec=`) land on their section, on load too.
- **The menu.** On desktop (50rem and wider) Redoc's menu sticks just below the site header and the pinned SAPI and PAPI switch, scrolls on its own and never grows taller than the viewport below that line. A tag row opens and closes with a click, Enter or Space (Redoc's own expand), scrolls its intro into view and keeps focus on the row. An operation row scrolls its section into view, moves focus there and sets its link in the address. Space on a row never scrolls the page. The open row's label is `#1D4ED8`, which passes contrast on Redoc's active grey. Phones keep Redoc's folded menu behind its own menu button.
- **Spec switch.** Before each render the component disposes the previous Redoc store (`disposePreviousRedoc`), because Redoc 2.5.4 never unmounts its last render and the old store's scroll tracking would rewrite the address to the other spec. The check reads React internals inside a try and does nothing when their shape is not the expected one, so a Redoc upgrade has to recheck it.
- **WebKit.** Redoc does not render in WebKit (Safari), so there the page shows its fallback with a link to the hosted reference.
- **Machine readable specs (B4).** `OpenApiDocument` (SAS Appendix B.3).
- **Postman.** `docs/api/postman/portfolio-api.postman_collection.json`. Run `POST /auth/token` first: it stores the token and instance URL for the other requests.

### 2.16 Contact Form and Submission Guard

A native contact form on its own page, `/contact`, that lands as a Lead ([ADR-031](../adr/031-native-contact-form.md)).

- **The page.** The `Contact` route (`/contact`, page title "Contact | Ryan Bumstead", its own description) holds `c-contact-form` with the heading "Get in touch" and a short intro. The header's Contact item and the footer's Contact link point at it.
- **On the home page.** `c-contact-call` takes the form's old place: a "Get in touch" heading, one sentence and a link styled as a button, "Contact Ryan", to `/contact`. An old link to `/#contact` still works: when the home page's address ends in `#contact`, on load or later, `c-contact-call` sends the visitor on to `/contact`, replacing the history entry so Back does not land on the redirect again.
- **The form.** `c-contact-form` sits under a heading with `id="contact"`. First and last name, email, an optional company and a message, a one line privacy note, a hidden honeypot field, and the time since the form appeared. It thanks the visitor inline ("Thanks, check your inbox.") with no redirect. When the address ends in `#contact`, on load or later, the form scrolls into view and its heading takes focus.
- **Analytics.** Each submit the server answers sends `contact_form_submitted` with only its `outcome`: `accepted`, `rate_limited` (the daily cap) or `invalid`. Nothing the visitor typed goes with it.
- **As the guest.** `ContactFormController` validates the input and runs `SubmissionGuard.check`, then publishes one `Contact_Form_Submission__e`. The guest has no Lead permission at all.
- **The Lead.** `ContactFormSubmissionTrigger` runs as the Automated Process user and calls `ContactFormLeadWriter`, which inserts each Lead in system mode with `Database.DMLOptions`: the default assignment rule, the auto-response only when the event asks for it, and duplicates allowed so a returning visitor is never refused. `LeadSource` is "Portfolio Website". The hop through the event is needed because the auto-response rule fails in the guest's own context.
- **Limits.** The auto-response is asked for only on the first message from an address in 24 hours, so the form cannot be used to send mail to someone again and again. The form takes at most 20 messages in 24 hours in all, and says so when the cap is reached.
- **Silent drops.** `SubmissionGuard` drops a message when the honeypot is filled, when it was sent less than 3 seconds after the form appeared, or when the email, its domain or the text matches an active `Submission_Block__c` row (types Email, Domain, Keyword, IP Hash). The visitor sees the normal thanks, nothing is stored or sent, and the block's hit count and last hit are updated. The same guard runs for the testimonial form. No visitor IP is used, because Apex cannot read one in a guest request.
- **Failures.** A batch that fails to insert is retried by the event bus three times, then kept as `Contact_Form_Failure__c` rows with the reason, and the `Portfolio_Admin` users get a custom notification. The visitor never sees an error.
- **Reminders.** `LeadReminderService` stamps `Reply_Reminder_1_At__c` and `Reply_Reminder_2_At__c` at one and two business days after arrival, using the org's default Business Hours, and the `Lead_Contact_Form_Reminders` flow sends the `Portfolio_Contact_Reminder` custom notification at those times unless the Lead's status has moved on.
- **Block sender.** The "Block sender" quick action on Lead (`Lead_Block_Sender` screen flow, `SubmissionBlockAction`) adds the Lead's email or domain to `Submission_Block__c` with a reason, turns an existing block back on, and marks the Lead as spam (`Spam__c`) so its reminders stop. It is on the Lead layout's action list, which the mobile app uses.
- **Admin objects.** `Submission_Block__c` and `Contact_Form_Failure__c` have tabs and are admin only, through `Portfolio_Admin`. A starter list of disposable email domains is loaded by a data script the owner runs.
- **Email rules.** The assignment and auto-response rules are set up in Setup (deployment prerequisite 16) and are not in source.

## 3. Quality Assurance Checklist

> [!TIP]
> **One command.** `npm run pre-launch-check -- --target-org <alias>` runs the release checks in order and stops at the first failure: Prettier on the files changed against `origin/main`, the code analyzer (`npm run scan`), a delta dry run with `RunLocalTests` against the named org (`scripts/validate.js`), the Jest tests, and the Apex test and coverage gate (`scripts/coverage-gate.js`, 90%). A Lighthouse run follows and is optional. The org is required and never taken from the CLI default, because the main checkout's default is production (`scripts/pre-launch-check.js`). Name a scratch org, never production, since the coverage step runs every local test in the org it is given.

### 3.1 Key Verification Items

- [ ] **LCP:** Run a Lighthouse mobile audit (three runs per route, medians) and compare with the 2.5 s target and the recorded gate in §2.11.
- [ ] **Coverage:** every Apex test passes and org wide coverage is 90% or more (`npm run sf:coverage -- --target-org <alias>`). `pr.yml` enforces the same gate on every pull request.
- [ ] **Security:** no Critical or High violation from Salesforce Code Analyzer (`npm run scan`).
- [ ] **Internal references:** `npm run refs:check` (`scripts/check-internal-refs.js`) exits 0. It fails when a comment, a metadata description or a help text under `packages/` names a build process code instead of saying what the code does. It reads only prose (comments per language, `description` and `inlineHelpText` in XML, `description` values in JSON and YAML, the whole of a Markdown file), so a hex colour, an `h1` tag or an id in test data never counts, and it skips the vendored third party bundles it lists by name. An exception goes in `scripts/internal-refs-allowlist.json` with the path, the exact line and a reason, and the list is empty today. Its own tests are `node --test scripts/check-internal-refs.test.js`, and `pr.yml` runs both in `quality-check`.
- [ ] **Live smoke test:** after a production deploy, the Live Smoke Test passes (Maintenance Guide §3.2). By hand: `SITE_BASE=<site root> node scripts/live-smoke.js`, with Playwright and its Chromium and WebKit browsers installed.
- [ ] **Accessibility:** confirm nothing animates (the skills graph and the ERD are drawn once, after the layout finishes), so no pause control is needed (SAS Appendix G.2).
- [ ] **Degradation Test:** turn on "Simulate an outage" on the changelog or the roadmap. Verify the cached data stays on screen with a "Simulated" badge (status `SIMULATED`) and no request leaves for GitHub or Jira.
- [ ] **Limit Visibility:** the footer shows CPU, heap and SOQL use against their limits. These are the figures of the `FooterController.getSystemSnapshot` call itself, so they cannot reflect another operation. Verify the line renders, and that it reads "status unavailable" when the call fails.
- [ ] **Analytics:** Verify api_test_executed event fires in GA4 Real-Time view when using the API Tester. Today it does not, because no component event reaches GA4 yet (§2.8).
- [ ] Verify the Skill Graph uses `lightning/uiGraphQLApi` (the Network tab shows a `/graphql` call to the Salesforce domain). The Roadmap reads Apex over the cache (`DeliveryController.getRoadmap`), so it makes no GraphQL call
- [ ] **AI fallback:** with the Gemini API unavailable, `POST /papi/v1/ai/generate` with `type: CoverLetter` returns `provider: Local` and `fallbackOccurred: true`, and the site page shows the template letter with the reason. After three Gemini failures the footer shows "Gemini: circuit open until HH:MM" and the next letter skips Gemini.

## 3.4 Concrete Testing Example

Here is a real test from the repository, `GitHubCacheRefreshJobTest.shouldInsertNothingWhenGitHubFails` (`packages/portfolio-site/main/default/classes/GitHubCacheRefreshJobTest.cls`). It mocks a GitHub outage and proves the degraded mode in section 1.1: the job makes one callout, stores nothing, the page keeps serving the last good commits, and the `github` circuit breaker counts the failure. `useRepo` and `newestRow` are helpers in the same class, and `CountingMock` is its `HttpCalloutMock`, which counts the calls it answers.

```apex
@IsTest
static void shouldInsertNothingWhenGitHubFails() {
  useRepo('o/r');
  CountingMock mock = new CountingMock(503, '{"message":"down"}');
  Test.setMock(HttpCalloutMock.class, mock);

  Test.startTest();
  String outcome = GitHubCacheRefreshJob.refresh();
  Test.stopTest();

  Assert.areEqual(GitHubCacheRefreshJob.OUTCOME_FAILED, outcome, 'Outcome');
  Assert.areEqual(1, mock.calls, 'The call was made');
  Assert.areEqual(
    1,
    [SELECT COUNT() FROM Github_Cache__c],
    'Nothing inserted'
  );
  Assert.isTrue(
    newestRow().JSON_Payload__c.contains(GOOD_SHA),
    'The newest good row is untouched'
  );
  Assert.areEqual(
    GOOD_SHA,
    DeliveryController.getRecentCommits(null).items[0].sha,
    'The page keeps serving the last good commits'
  );
  Assert.areEqual(
    1,
    CircuitBreaker.snapshot()[1].failures,
    'The github breaker counted the failure'
  );
}
```

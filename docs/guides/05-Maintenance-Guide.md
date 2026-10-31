# Maintenance & Operations Guide

**Table of Contents**

- [1. Security Rotation Policy (CI/CD)](#1-security-rotation-policy-cicd)
  - [1.1 Rotation Procedure](#11-rotation-procedure)
  - [1.2 External Client App Secret Rotation](#12-external-client-app-secret-rotation)
- [2. Environment Hygiene (The "Clean Sweep")](#2-environment-hygiene-the-clean-sweep)
  - [2.1 Organization Rules](#21-organization-rules)
  - [2.2 Emergency Cleanup Protocol](#22-emergency-cleanup-protocol)
- [3. DevOps Architecture](#3-devops-architecture)
  - [3.1 Local Development Commands](#31-local-development-commands)
  - [3.2 Pipeline Triggers](#32-pipeline-triggers)
  - [3.3 Pipeline Strategy: Delta Deployment](#33-pipeline-strategy-delta-deployment)
  - [3.4 Org Persistence](#34-org-persistence)
  - [3.5 Changing an Operational Setting](#35-changing-an-operational-setting)
  - [3.6 Changing a Query Definition](#36-changing-a-query-definition)
  - [3.7 Site Content the Owner Edits](#37-site-content-the-owner-edits)
  - [3.8 Owner Emails and Testimonial Approvals](#38-owner-emails-and-testimonial-approvals)
  - [3.9 The Postman Collection and the Run in Postman Link](#39-the-postman-collection-and-the-run-in-postman-link)
  - [3.10 Setting the API v1 Dates and Retiring v1](#310-setting-the-api-v1-dates-and-retiring-v1)
  - [3.11 Retiring the Old /v1/ URLs](#311-retiring-the-old-v1-urls)
- [4. Disaster Recovery](#4-disaster-recovery)
  - [4.1 Scenario: Deployment Failure](#41-scenario-deployment-failure)
  - [4.2 Scenario: Security Misconfiguration (Guest User)](#42-scenario-security-misconfiguration-guest-user)
  - [4.3 Scenario: GitHub Rate Limit Exhaustion](#43-scenario-github-rate-limit-exhaustion)
  - [4.4 Scenario: Token Vending Abuse](#44-scenario-token-vending-abuse)
  - [4.5 Scenario: Contact Form Abuse](#45-scenario-contact-form-abuse)
- [5. Observability & Monitoring](#5-observability--monitoring)
  - [5.1 Quota Monitoring (Not Built)](#51-quota-monitoring-not-built)
  - [5.2 Logging](#52-logging)

---

Project: Salesforce Platform Architect Portfolio

Owner: Ryan Bumstead

Version: 1.0

Date: MVP – Q1 2027

This document outlines the operational procedures required to maintain the security, stability, and "Green Build" status of the portfolio architecture.

## 1. Security Rotation Policy (CI/CD)

To demonstrate enterprise compliance standards, the JWT authentication keys used for GitHub Actions must be rotated annually.

- **Rotation Schedule:** Every 13 months (400-day certificate validity) with mandatory 30-day overlap window.
- **Execution window:** within 30 days of certificate expiry or during Q4 maintenance, whichever comes first
- **Key Strength:** 4096-bit RSA.
- **Rationale:** Eliminates calendar creep and guarantees zero risk of expired credentials

### 1.1 Rotation Procedure

**1. Generate New Keys**

Run the following OpenSSL commands in your terminal:

<details>
<summary>Click to view OpenSSL Commands</summary>

```bash
# 1. Generate 4096-bit Private Key
openssl genrsa -des3 -passout pass:SomePassword -out portfolio.pass.key 4096

# 2. Strip Password (for CI/CD Server)
openssl rsa -passin pass:SomePassword -in portfolio.pass.key -out portfolio.key

# 3. Generate Certificate (Valid for ~13 Months)
openssl req -new -key portfolio.key -x509 -days 400 -out portfolio.crt
```

</details>

**2. Update Salesforce Connected App**

1. Log in to the Dev Hub Org.
2. Navigate to **App Manager** > **GitHub Actions CI** > **Manage**.
3. Click **Edit Policies**.
4. Under **Digital Signatures**, upload the _new_ portfolio.crt file.
5. **Save**. (Note: Updates can take 2-10 minutes to propagate).

**3. Update GitHub Secrets**

1. Navigate to Repo **Settings** > **Secrets and variables** > **Actions**.
2. Update `SFDX_JWT_KEY` with the content of the _new_ portfolio.key.

**3. Gemini API Key:** Rotate every 90 days. The key is not on the `Gemini_API` Named Credential. It is the `API_Key` authentication parameter of the `Gemini_Principal` principal on the `Gemini_Auth` External Credential, which the Named Credential sends as the `x-goog-api-key` header. Setup → **Named Credentials** → **External Credentials** → **Gemini_Auth** → principal **Gemini_Principal** → **Edit** → set `API_Key` to the new key → **Save**. Then generate one cover letter on the site and check the badge names Gemini, not the Local Template.

### 1.2 External Client App Secret Rotation

The portfolio APIs authenticate with OAuth 2.0 Client Credentials issued by the **Portfolio API** External Client App ([ADR-027](../adr/027-platform-native-api-authentication.md)). The consumer secret lives in the External Client App and in **two** External Credential principals:

- `Portfolio_API_Principal` of `Portfolio_API_Auth` (OAuth), used by the `Portfolio_API` Named Credential for the API Lab proxy and the `PAPIHealth` credential check;
- `Portfolio_API_Token_Principal` of `Portfolio_API_Token_Auth` (Custom), whose `Client_Id` and `Client_Secret` parameters `TokenExchangeService.exchangeToken` sends to the token endpoint to vend evaluator tokens ([ADR-028 amendment](../adr/028-evaluator-access-via-token-vending.md#amendment-2026-10-21)).

- **Rotation Schedule:** every 90 days, or immediately on suspected exposure.
- **Blast radius:** rotating the secret invalidates both principals until they are updated, and tokens already issued keep working until the shared session ends after 30 minutes without use.

**Procedure**

1. Setup → **External Client App Manager** → **Portfolio API** → **Settings** → **OAuth Settings** → **Consumer Key and Secret** → **Rotate** (or **Regenerate**). Copy the new secret once.
2. Setup → **Named Credentials** → **External Credentials** → **Portfolio_API_Auth** → principal **Portfolio_API_Principal** → **Edit** → paste the new secret → **Save**.
3. Setup → **Named Credentials** → **External Credentials** → **Portfolio_API_Token_Auth** → principal **Portfolio_API_Token_Principal** → **Edit** → set the `Client_Secret` parameter to the new secret (and `Client_Id`, if the consumer key changed) → **Save**.
4. Verify the outbound credential: call `GET /papi/health` (from the site's API Lab, or with a Bearer token) and check `dependencies.credential` is `UP`. `PAPIHealth.checkCredential` makes one GET through `Portfolio_API` to `/sapi/health` and reports `UP` only on HTTP 200; on failure `details.credential` holds the HTTP status or exception type. It needs the caller to have principal access to `Portfolio_API_Auth-Portfolio_API_Principal` (granted to the integration user by `Integration_Access`).
5. Verify token vending: run `scripts/api-smoke.sh` with your own email; the token request must return 200.
6. Record the rotation date in `Portfolio_Config__mdt.Ryan_Bumstead.Last_Secret_Rotation__c`.

**Revocation (kill switch)**

- Setup → **External Client App Manager** → **Portfolio API** → **Deactivate**. Every outstanding Bearer token, including evaluator tokens issued by `POST /papi/auth/token` ([ADR-028](../adr/028-evaluator-access-via-token-vending.md)), stops working immediately. Reactivate after rotating.

## 2. Environment Hygiene (The "Clean Sweep")

The Developer Edition org shares space with Trailhead challenges and standard Salesforce metadata. To prevent "Pollution" from failing the CI/CD pipeline, strict separation is enforced.

### 2.1 Organization Rules

- **Authorized Code:** Only metadata present in `packages/` is authorized.
- **Standard Sites:** Authenticated users are out of scope, so no portfolio feature uses a login. The site template's own routes (`/login`, `/SelfRegister`, `/ForgotPassword`, `/news`) and their standard controllers (for example `LightningLoginFormController` and `CommunitiesSelfRegController`) are still in source and on the site. I chose to leave them in place (2026-10-23).

### 2.2 Emergency Cleanup Protocol

If standard Visualforce pages or Apex classes lock the deployment (Dependency Hell), use the **"Lobotomy Strategy"**:

1. **Decouple:** Overwrite the blocking Visualforce Page with empty code to remove Apex references:

```html
<apex:page>
  <h1>Feature Disabled</h1>
</apex:page>
```

2. **Deploy:** Push the empty page to break the dependency.
3. **Delete:** Run the `sf project delete source` command for the Apex Class.

## 3. DevOps Architecture

### 3.1 Local Development Commands

To prevent "Commit Shame" (failing pipelines after pushing), developers must execute validation scripts locally before pushing to GitHub. The project uses npm scripts to abstract complex CLI commands:

- **`npm run scan`**: Executes the Salesforce Code Analyzer (PMD/ESLint) and outputs a human-readable scan-results.html report (visualized in browser). _Success Criteria: no violation at severity 1 or 2 (`--severity-threshold 2`)_
- **`npm run delta`**: Generates the incremental package.xml in the `changed/` folder by comparing local changes against origin/main.
- **`npm run delta:validate -- --target-org <alias>`**: runs the delta generation and then a dry run deployment of the delta with `RunLocalTests` to the named org (`scripts/validate.js`). There is no `npm run validate` script.
  - _Note:_ `scripts/validate.js` exits cleanly when the delta is empty, and sets the manifest API version from `sfdx-project.json`. The org is required: the script never uses the CLI default.
- **`npm run sf:coverage -- --target-org <alias>`**: runs every local Apex test in the named org and fails on a failed test or org wide coverage under 90% (`scripts/coverage-gate.js`).
- **`npm run specs:sync`** and **`npm run specs:check`**: regenerate every copy of the API specs from `packages/integration-api/specs`, or fail when a copy differs (`scripts/sync-specs.js`). Edit the YAML there, never a copy. The pre-commit hook runs the sync, the API docs and the Postman collection for a staged spec and stages what they write (`scripts/regenerate-spec-outputs.js`, section 3.9).
- **`npm run docs:counts`**: fails when the ADR count in README or STATUS, or an ADR link in the indexes, disagrees with `docs/adr` (`scripts/check-doc-counts.js`).
- **`npm run refs:check`**: fails when a comment, metadata description or help text under `packages/`, or any text in `docs/`, `README.md` or `STATUS.md`, names a build process code. It scans the same paths as CI, and the pre-commit hook runs it on staged files there. It reads only prose and skips vendored bundles. Exceptions go in `scripts/internal-refs-allowlist.json` with a reason ([Technical Guide §3.1](./04-Technical-Guide.md#31-key-verification-items)).
- **`npm run ci:local`**: the "before you push" command. It runs on your machine every check the `quality-check` job in `pr.yml` runs, in the same order and with the same arguments (`scripts/ci-local.js`). The checks are the secret scan, Jest, the API docs check, internal references, smoke routes, the Postman collection, Mermaid diagrams and the Code Analyzer. By default it runs only the steps whose files changed against `origin/main` (the merge base, plus staged, unstaged and new files). `npm run ci:local -- --all` runs every step and `npm run ci:local -- --list` prints the steps and which would run. Every selected step runs even after one fails, so one pass shows every failure, and the exit code is 1 if any failed.
  - _Pre-push hook:_ `.husky/pre-push` runs `node scripts/ci-local.js --changed` and blocks the push when a step fails. The `--no-verify` flag on the push skips it, for an emergency, and that call belongs to the owner.
  - _Skips:_ a few commands need something a machine may lack, so the runner says SKIPPED and lists each skip again in the summary. A skip is not a pass. The Postman check needs the pinned `openapi-to-postmanv2` dev dependency (run `npm install`). The Postman probe needs the network. The Mermaid render needs `MERMAID_CLI_DIR` (the one line install is in `pr.yml`) and a Chrome or Edge, which the runner looks for through `PUPPETEER_EXECUTABLE_PATH` and the usual Windows paths. The Mermaid tests and the alt text check always run.
  - _Drift test:_ `node --test scripts/ci-local.test.js` reads `quality-check` in `pr.yml` and fails when a command there has no step in `ci-local.js`. Add the step in the same change as the workflow edit.
  - _Git worktrees:_ the hooks live in `.husky/_`, which `npx husky` generates and git does not track, so a new worktree has none and git runs no hooks there at all. Run `npx husky` once in each new worktree. In a worktree with no org pinned (no local `sf config set target-org`), the pre-commit hook skips the Salesforce validate step and says so, because the integration deploy and CI validate backend changes. The main checkout validates as before.
- **`npm run pre-launch-check -- --target-org <alias>`**: the release checks in one command ([Technical Guide §3](./04-Technical-Guide.md#3-quality-assurance-checklist)).

### 3.2 Pipeline Triggers

- **PR Validation (pr.yml):** Runs on pull requests to `main` that modify `packages/**`, `sfdx-project.json`, `package.json`, `scripts/**` or `pr.yml` itself. One run per PR at a time: a new push cancels the run still going, and a label event runs in its own group, so it never cancels a real run.
  - _Quality Gate:_ every Apex test passes and org wide coverage is 90% or more (`scripts/coverage-gate.js --min 90`).
  - _Security Gate:_ no Critical or High violation from Salesforce Code Analyzer (`npm run scan`), plus `npm run scan:secrets`, the Jest tests and `npm run docs:verify`.
  - _Internal references:_ the `quality-check` job runs the gate's own tests and then `scripts/check-internal-refs.js` over `packages/`, the docs, README and STATUS, and fails the PR on any hit. The generated API pages in `docs/api/oas` are skipped, and a real false positive goes in `scripts/internal-refs-allowlist.json` with its reason.
- **Docs Internal References:** a pull request to `main` that changes only the docs, README or STATUS does not start PR Validation, so this workflow runs the same gate and its tests on its own, with no scratch org.
  - _Site guest access:_ after the full deploy to the scratch org and before the tests, the job assigns `Portfolio_Guest` to the scratch site's guest user, as production's guest already holds it. Guest test classes then never race each other to assign it.
  - _Production check only:_ in scratch mode, after the scratch tests, the job builds the PR's delta against `origin/<base>` and validates it against production as a dry run with `RunLocalTests`. A component or a test that fails only in production stops the PR before the merge. It deploys nothing, and a PR with no metadata change skips it. In fallback mode the fallback step already runs this check.
- **Production Deploy (deploy.yml):** Runs on a push to `main` that modifies `packages/**` (both `portfolio-site` and `integration-api`), `sfdx-project.json`, `package.json` or `docs/**`, or by hand in delta, full or destructive mode. After a real deploy it runs every local test in production, then the Jest suite on the merged commit, and publishes a `Governance_Event__e` with the run, the commit and, when each run returned a summary, the Apex tests run and passed, org wide coverage and the Jest tests run and passed. A Jest failure is reported in the run and never undoes the deploy. It then publishes the Experience Cloud site and waits on the publish job until it reports Complete, so the smoke that follows checks what was just shipped. A publish that fails or runs past five minutes fails the run. A failed deploy publishes a Failure event. A push with no metadata change deploys nothing and publishes nothing.
  - _Live smoke test:_ after a deploy that changed production, the `smoke` job runs the Live Smoke Test workflow below. The run summary says Passed, Failed or Not run.
  - _Docs cache:_ when the push changed `docs/**`, the `docs-cache` job runs after the deploy job. A docs only push finds no metadata in its delta and deploys nothing first. The job waits 60 seconds, because the GitHub contents API caches for 60, runs `scripts/refresh-docs-cache.apex` in production as the workflow's signed in admin, waits for the queued job, and fails unless every docs record reads 200 since it started. A failed refresh keeps the last good content on `/docs`.
  - _Destructive mode (by hand only):_ removes from production the components named in a committed manifest folder under `manifest/destructive/` (`destructive_manifest_dir`, holding an empty `package.xml` and a `destructiveChanges.xml`). It refuses any other folder and a `package.xml` that names types, lists what it will delete, runs a check only deploy first and then the real one. It exists for a component deleted in source that no delta will ever carry.
- **Postman Sync (postman-sync.yml):** starts when a Deploy to Production run that a push to `main` started completes with success, and can be run by hand. It checks out the deployed commit, runs `scripts/build-postman-collection.js --check` so a stale collection fails the run, then `scripts/postman-sync.js push`, which needs the `POSTMAN_API_KEY` secret and the `POSTMAN_COLLECTION_UID` repository variable. It is its own workflow, not a job inside deploy.yml, because GitHub issues badges per workflow and the site footer shows its badge. A smoke failure fails the deploy run, so the sync waits for the next good deploy or a run by hand.
- **Live Smoke Test (smoke.yml):** called by Deploy to Production, run on its own once a day at 09:30 UTC (after the 08:00 heartbeat) so a break between deploys is caught, and runnable by hand from the Actions tab. GitHub emails the repository owner when a scheduled run fails. It runs `scripts/live-smoke.js` against the live site. Every route must answer 200 and show its key components, with no console error outside a short known list in the script, in Chromium and WebKit at 1400 by 900 and 390 by 844. It is read only: it loads pages, submits no form, clicks nothing and blocks Google Analytics so it never counts as a visitor. A failed row is loaded once more in a fresh context before it counts. On a failure it fails the run, uploads `smoke.json`, and publishes a `Governance_Event__e` with workflow `smoke` and status Failure, which lands as a `Pipeline_Run__c` row keyed `smoke:<run id>`. It undoes nothing. A pass writes no row.

### 3.3 Pipeline Strategy: Delta Deployment

To ensure efficiency and avoid hitting Salesforce Metadata API limits, the pipeline utilizes a "Delta Deployment" strategy using sfdx-git-delta.

- **Validation (pr.yml):** creates a one day scratch org and deploys the whole of `packages` to it, then runs every local test through the coverage gate. Only when the scratch org cannot be created does it fall back to a delta: the diff between the PR branch and `origin/<base>`, deployed to production as a dry run with `RunLocalTests`, which changes nothing.
- **Production (deploy.yml):** calculates the diff from `github.event.before`, the commit `main` pointed at before the push, to `HEAD`, so a push of several commits deploys all of them. `HEAD~1` is used only when the event has no earlier commit. It deploys strictly the changed metadata to the Production environment.
- **Destructive Changes:** The pipeline is configured to respect `destructiveChanges.xml`. If metadata is deleted from the repo, sfdx-git-delta will generate the destructive manifest, and the pipeline will automatically delete those components from the Org during deployment. A delta that only deletes still passes its empty `package.xml`, because the destructive flags need a manifest. A deletion that no delta carries, such as a component removed in a commit whose deploy has already run, goes through the hand run destructive mode in §3.2 with a manifest committed under `manifest/destructive/`.
- **Cross-Platform Compatibility:** The `package.json` scripts leverage `shx` and `rimraf` to ensure all shell commands (mkdir, rm) execute consistently on both Windows (Local Development) and Ubuntu Linux (GitHub Actions Runners).

### 3.4 Org Persistence

- **Heartbeat (keep-alive.yml):** Runs daily at 08:00 UTC to execute a SOQL query against the org.
- _Purpose:_ Prevents the Developer Edition from being marked inactive and deleted by Salesforce.

### 3.5 Changing an Operational Setting

Page sizes, rate tiers, the token rate and cap default, circuit breaker limits, form guard limits, source refresh limits, governance freshness windows, AI length bounds, the health check timeout, the roadmap and timeline display counts, the cover letter word range, the Gemini output token limit and temperature, and the home page testimonial minimum are `Portfolio_Setting__mdt` records ([Technical Guide §1.6](./04-Technical-Guide.md#16-operational-settings-portfolio_setting__mdt), [ADR-032](../adr/032-operational-settings-in-custom-metadata.md)).

1. To change a limit, edit the record's **Number Value** in Setup > Custom Metadata Types > Portfolio Setting > Manage Records. It takes effect on the next request, with no deploy.
2. Keep it inside the record's **Min Value** to **Max Value**. A value outside that range is ignored and the code default applies, and so does a cleared value or a deleted record. Its **Description** says what it controls and what is safe. A fraction is dropped (2.75 reads as 2).
3. Commit the same value to the record's file under `packages/portfolio-site/main/default/customMetadata/`. A full mode deploy writes every record in source, and a delta that touches the file writes it too, so a value changed only in Setup can be put back to the shipped one.
4. `Token_Daily_Cap_Default` applies only while `Portfolio_Config__mdt.Token_Daily_Cap__c` is blank. To pause or lower token vending, set the config cap (§4.4).

### 3.6 Changing a Query Definition

The portfolio's content reads (the SAPI lists, the Process API, the API Lab options and nine site classes) are `Query_Definition__mdt` records, one per read, each checked against the query its class holds in code ([Technical Guide §1.7](./04-Technical-Guide.md#17-query-definitions-query_definition__mdt), [ADR-033](../adr/033-queries-in-custom-metadata.md)).

1. A record can only narrow its read. Its filter is added to the class's filter, the smaller row limit applies, and a field outside the class's allowlist, a missing required field, an unknown bind, a weaker access mode or a filter that does not parse makes the class run its own query instead. So a record that seems to change nothing has probably failed a check.
2. Edit the record in Setup > Custom Metadata Types > Query Definition > Manage Records, or in its file under `packages/portfolio-site/main/default/customMetadata/`. Write an optional filter as `(IsDeleted = :hasX OR Field = :x)`, using only the binds the class already supplies.
3. Run `SAPIQueryDefinitionsTest`, `ApiQueryDefinitionsTest` and `SiteQueryDefinitionsTest`. Their validation tests list every record that fails a check, with the reasons. Their ships equal tests fail for any record that differs from its class, so a deliberate change to a shipped record needs the class's default changed to match, which is a code change.
4. Commit the change. A full mode deploy writes every record in source, so a change made only in Setup can be put back.

### 3.7 Site Content the Owner Edits

- **The title line and the value sentence.** Edit **Hero Line** (the title line under the name) and **Value Sentence** (one sentence on the value delivered) on my Contact. Each shows on the home page only while it is set.
- **The proof strip.** "On Salesforce since 2017" and the active certification count are one list, `PROOF_POINTS` in `c/pillarData`. Check both every quarter, and change the count and its test in the same commit.
- **A home case study.** The home page shows up to three `Project__c` rows that have **Home Sort** set, lowest first. To add one, create the row with its Home Title (optional), Client Line, Case Tags, headline number and label, Challenge, Solution, Business Value and link, and give it a Home Sort. To reorder, change the Home Sort numbers. To retire one, clear its Home Sort. Clear every Home Sort and the section disappears with no empty heading. A row with a Home Sort and no Pillar never appears as a pillar card. The featured flag is not used here and changing it does not move a card. The text reaches production through a script I run, not through CI. A card's number can be computed from a live source (Technical Guide §2.12), which is better than a typed number that goes stale.
- **When home testimonials appear.** Edit **Home testimonials minimum** in Portfolio Setting (§3.5). The home page shows up to three approved testimonials once that many are approved.
- **The cover letter instruction.** Edit **Instruction** on the **Cover Letter** record of the AI Prompt custom metadata type, and commit the same text to `AI_Prompt.Cover_Letter.md-meta.xml`. A blank or missing record falls back to the text in `ContentGenerationController`. The word range is the `Cover_Letter_Min_Words` and `Cover_Letter_Max_Words` settings, and the prompt turns them into a word limit line with the maximum as a hard limit and a fixed five paragraph shape. Keep the line from starting with "Length": the Published `Portfolio_Cover_Letter` template adds its own sentence for a `Length` line, and a changed template needs a new version made in Prompt Builder, not a deploy.
- **A document on `/docs`.** Each listed document is a `Source_File__mdt` record with `Source_Key__c` `docs`, its `Path__c` in the repository, its `Label__c` and its `Sort_Order__c`. The daily source refresh reads it from `main`, and a push that changes `docs/**` refreshes every listed document after the deploy (§3.2), so a changed document shows soon after its merge. A new document needs its record deployed first. The doc key in the address comes from the record name: `docs_sas` gives `sas` and `docs_adr_027` gives `adr-027`. Keep the SAS headings 5.1 to 5.5 as they are, because each pillar page's "Read the design" link uses their slugs.

### 3.8 Owner Emails and Testimonial Approvals

- **A new contact message.** The Lead owner gets one email with the visitor's name, company, email, full message and a link to the Lead. While the Lead has no internal user as its owner, for example while the assignment rule leaves it with the Automated Process user, the email goes to the `Portfolio_Admin` users instead. A Lead rule entry that assigns "Portfolio Website" leads to me, with no template, is optional. With it the in app reply reminders reach me as well.
- **A new testimonial.** It is submitted to the Testimonial Approval process for you, and the request email shows the quote, the author, title, relationship and vibe. Reply with APPROVE, APPROVED or YES on the first line to publish it, or REJECT, REJECTED or NO to keep it off the site, or open the request in Salesforce. Approval sets **Approved** and the testimonial shows on the site. A rejected one stays saved and hidden.
- **A testimonial saved before the hand off.** It was never submitted, so submit it for approval from the record, or tick **Approved** by hand.
- **Who gets the emails.** Both go to a user, never to an address in source. The approval goes to the testimonial's owner, the site's default owner for guest records.

### 3.9 The Postman Collection and the Run in Postman Link

The API Lab and the API reference offer the Process API (PAPI) collection as a download, the static resource `PAPI_Postman_Collection`. It is generated from the v2 spec, `portfolio-papi-v2.yaml`, so it follows the spec and sends `X-API-Version: v2`.

1. Edit the spec and commit it. When a staged file under `packages/integration-api/specs` is YAML, the pre-commit hook runs `scripts/regenerate-spec-outputs.js`. It runs `sync-specs.js`, `generate-api-docs.js` and `build-postman-collection.js`, then stages the files they made, so the collection, the spec copies, the API Lab catalog and the API docs go into the same commit as the spec. lint-staged runs its file groups one after another (`--concurrent false` in the `precommit` script), so Prettier has finished with the spec before the generators read it. Run in parallel, a spec Prettier changed was copied before the change.
2. To regenerate by hand, run `node scripts/regenerate-spec-outputs.js`, or only the collection with `node scripts/build-postman-collection.js`. The converter is the exact dev dependency `openapi-to-postmanv2@6.4.0`, so `npm install` is enough. `package.json` is the one place its version is written: the PR check and the Postman Sync workflow both run `npm ci`, and the builder stops with "Run npm install" when the installed version is not the pinned one. To move to a new converter version, change the pin, regenerate the collection and commit both together.
3. `node scripts/build-postman-collection.js --check` writes nothing and exits 1 when the committed file is stale. The same spec gives the same bytes. The file must never hold a token.
4. `docs/api/postman/portfolio-api.postman_collection.json` is a different collection. It holds both specs, comes from `sync-specs.js` and stays in the repository for the System API. The site offers the generated one.
5. **Run in Postman.** The button shows only while `Portfolio_Setting.Postman_Run_Url` holds an https link on postman.com or getpostman.com. It ships empty, so only the download shows. Fill it in Setup after the public workspace exists, and commit the same value to `Portfolio_Setting.Postman_Run_Url.md-meta.xml`. The Postman Sync workflow pushes the regenerated collection to the workspace after each deploy (section 3.2), so no import by hand is needed.

### 3.10 Setting the API v1 Dates and Retiring v1

API v1 is deprecated and has two dates, both `Portfolio_Setting__mdt` records ([ADR-039](../adr/039-api-v2-and-the-v1-sunset.md)). Both ship empty, so until I set them v1 carries no `Deprecation` or `Sunset` header and nothing answers 410.

1. **The records.** `Api_V1_Deprecation_Date` and `Api_V1_Sunset_Date`, in `packages/portfolio-site/main/default/customMetadata/`. Each holds a date in **Text Value** written `yyyy-MM-dd` and read as 00:00 UTC. Leave **Number Value** empty.
2. **What they do.** With the deprecation date set, every v1 response carries a `Deprecation` header. With the sunset date set, every v1 response carries a `Sunset` header, and from 00:00 UTC on that day every v1 call, with or without an `X-API-Version` header, gets 410 with `errorCode` `GONE`, except `POST /papi/auth/token`, `/sapi/health` and `/papi/health`. They keep their deprecation headers and are answered normally, so a client can still get a token and check that the API is up. A value that is not a `yyyy-MM-dd` date reads as empty, and so does an empty one. v2 is never affected. The `Link` header to the v2 reference is sent on v1 either way.
3. **How I set them.** I edit the Text Value in the record's file and deploy the changed record. It is a deploy of one metadata record and needs no code change. After the deploy I call a v1 path and read `Deprecation` and `Sunset` in the response headers, and I call a v2 path and read none. I plan to set the sunset to the deploy date plus 30 days.
4. **After the sunset.** Once v1 has answered 410 for as long as I want, I clean up in one change: delete `salesforce-sapi.yaml` and `portfolio-papi.yaml`, remove the `V1_SPECS` list and its uses in `scripts/sync-specs.js`, run `npm run specs:sync` and delete the v1 static resources it no longer writes (`SAPI_Spec`, `PAPI_Spec`, `SAPI_OpenAPI` and `PAPI_OpenAPI`, each with its meta file), remove the "v1 (deprecated)" option from the API Lab and API reference pickers, remove the v1 branch of `OpenApiDocument` and the v1 sunset code in `ApiRequestContext`, and regenerate `docs/api`. Then I delete the two date records, or leave them empty.

### 3.11 Retiring the Old /v1/ URLs

The API is called at versionless URLs, and the old `/v1/` URLs are aliases that reach the same code ([ADR-040](../adr/040-versionless-api-urls.md)). They have their own two dates, separate from the v1 version dates in section 3.10. Both are `Portfolio_Setting__mdt` records and both ship empty, so until I set them an old URL answers as it always did, with a `Link` header that points at the versionless URL and nothing else.

1. **The records.** `Api_V1_Path_Deprecation_Date` and `Api_V1_Path_Sunset_Date`, in `packages/portfolio-site/main/default/customMetadata/`. Each holds a date in **Text Value** written `yyyy-MM-dd` and read as 00:00 UTC. Leave **Number Value** empty.
2. **Before I set a date.** I read the request log for `legacyPath=true` lines (the log line ends with it when a caller used an old URL), so I know who still calls them. Our own callers already use the versionless URLs.
3. **Deprecating.** I set `Api_V1_Path_Deprecation_Date`, deploy the one record, call an old URL and read `Deprecation` and `Link` in the response headers. A versionless URL carries neither.
4. **Retiring.** I set `Api_V1_Path_Sunset_Date` to the day I want, deploy the record and check the same call. From 00:00 UTC on that day an old URL answers 410 `GONE` with the versionless URL in the message, and every version header is accepted, v2 included. `POST /papi/v1/auth/token`, `/papi/v1/health` and `/sapi/v1/health` keep answering, with their dates and `Link`, so a client can still get a token and learn the new URL. A versionless URL is never affected. A date that is not `yyyy-MM-dd` reads as empty.
5. **If a call is both v1 and on an old URL** the response carries the earlier of the two `Deprecation` dates and the earlier of the two `Sunset` dates, and the 410 comes from whichever sunset has passed. The message says which.
6. **After the sunset.** Once the old URLs have answered 410 for as long as I want, I remove them in one change: the `/v1/` `urlMapping` of each handler class (the routers then own every URL, and the exceptions need their routes in `PAPIRouter` and `SAPIRouter` already, which they have), the `LEGACY_SEGMENT` handling and the two path settings in `ApiRequestContext`, the two path date records, and the v1 specs along with the rest of section 3.10 step 4. Then I redeploy and run every test.

#### Switching the versionless URLs off and on

`Api_Versionless_Urls` is a `Portfolio_Setting__mdt` record that ships `On` ([ADR-040](../adr/040-versionless-api-urls.md)). It is the first rollback for a fault in a router or in one of our callers, and it needs no deploy.

1. **Turn it off.** Setup, Custom Metadata Types, Portfolio Setting, Manage Records, `Api_Versionless_Urls`, Edit. Set **Text Value** to `Off` and save. Only `Off` turns it off. Blank, a typo or a missing record read as `On`.
2. **Check it took effect.** Call `GET /services/apexrest/papi/health` and expect 404 with the message "Versionless URLs are switched off. Use /services/apexrest/papi/v1/health." Call `/services/apexrest/papi/v1/health` and expect 200 with no `canonical` Link. Open the API Lab and read the curl examples: they show `/v1/` URLs. The Lab reads the value through a cacheable call, so a page that was already open can need a reload.
3. **What changes while Off.** The routers answer 404, our callers use the `/v1/` URLs, the old URLs send no `canonical` Link, and the path dates (section 3.11 above) do not apply, so no old URL answers 410. The version rules of section 3.10 are unchanged.
4. **The smoke script fails while Off.** `scripts/api-smoke.sh` calls versionless URLs, so it fails on its routes until the switch is `On` again. That is expected.
5. **Turn it back on.** Set **Text Value** to `On`, save, and repeat the check: `/services/apexrest/papi/health` answers 200.
6. **When Off is not enough.** The switch does not help with a fault in the shared path handling in `ApiRequestContext`, because the old classes run through it too. Then I revert the code change.

## 4. Disaster Recovery

### 4.1 Scenario: Deployment Failure

If Apex classes fail with "You can bypass this error by allowing deployments with Apex jobs in the Deployment Settings page in Setup", nothing is wrong with the code. A scheduled job (`Cache Cleanup Daily` or one of the four `Integration Cache Refresh` jobs) depends on a changed class. Tick "Allow deployments of components when corresponding Apex jobs are pending or in progress" in Setup > Deployment Settings ([Technical Guide](./04-Technical-Guide.md) deployment prerequisite 13), then re-run the failed deploy. The deploy is atomic, so the failed attempt changed nothing. For any other failure:

1. Revert main branch to previous commit SHA.
2. Trigger fresh deployment.
3. Verify site health: the deploy's `smoke` job runs the Live Smoke Test on its own (§3.2). After a publish, or to check again, run Live Smoke Test by hand from the Actions tab and read its summary.

### 4.2 Scenario: Security Misconfiguration (Guest User)

- **Symptom:** PMD Scan or Health Check fails due to "Guest User Open Access".
- **Mitigation:**
  1. **Immediate Rollback:** Revert the guest permission set `Portfolio_Guest` (`packages/portfolio-site/main/default/permissionsets/Portfolio_Guest.permissionset-meta.xml`) to the previous commit. It must grant only what [Technical Guide §1.4, prerequisite 6](./04-Technical-Guide.md#14-system-api-security-the-twin-pattern) lists: class access to the twelve site controllers (including `ContactFormController` and `SourceController`), the token endpoint `PAPIAuthToken` and the spec endpoint `OpenApiDocument`, read on the six portfolio objects, create and read on `Testimonial__c`, read on `UserExternalCredential`, and the `Portfolio_API_Auth`, `Portfolio_API_Token_Auth` and `Gemini_Auth` principals. Never a GitHub or Jira principal, and never Contact, Account or Lead access.
  2. **If unsure:** redeploy the `main` branch version of `Portfolio_Guest` to the affected org, then read the grants back (`SELECT SobjectType, PermissionsRead, PermissionsCreate FROM ObjectPermissions WHERE Parent.Name = 'Portfolio_Guest'`, and the same for `SetupEntityAccess`) and compare them with prerequisite 6. Do not plan on deleting the permission set first: it is assigned to the guest user, and whether the platform allows deleting an assigned permission set has not been tested here.

### 4.3 Scenario: GitHub Rate Limit Exhaustion

- Visitors never call GitHub. `GitHubCacheRefreshJob` refreshes `Github_Cache__c` every 15 minutes, and a failed refresh (429, 500 or a timeout) inserts nothing, so the changelog keeps showing the last good list with its age. Three failures in a row open the `github` breaker for 30 minutes, and refreshes are skipped until it closes.

### 4.4 Scenario: Token Vending Abuse

- **Symptom:** spike in `API_Access_Request__c` records, `429`/`503` responses from `/papi/auth/token`, or Developer Edition API request usage trending toward the 15,000/day limit (Setup → System Overview).
- **Immediate mitigation:**
  1. Deactivate the **Portfolio API** External Client App (see §1.2). All issued tokens die.
  2. Lower `Token_Daily_Cap__c` on the `Ryan_Bumstead` `Portfolio_Config__mdt` record (when blank, the `Token_Daily_Cap_Default` setting applies, 50 as shipped) or set it to 0 to pause vending: `TokenExchangeService.dailyCap` reads it and a cap of 0 answers every token request with 503.
- **Reading the audit trail:** `API_Access_Request__c` rows (one per token attempt) and the daily cap count are readable by users holding `Portfolio_Admin`, which grants read and View All on `API_Access_Request__c` and `API_Rate_Window__c` and read on their fields. Without it the fields are not readable, so reports and SOQL fail.
- **Recovery:** rotate the secret (§1.2), review the audit rows (`Email__c`, `Source_IP__c`, `Outcome__c`, `Channel__c`) for the offending email/IP, reactivate the app, restore the cap.
- **Per-caller limits already in place:** 15 token requests per minute per email and source IP, and the PAPI tier limits (`RateWindowLimiter`, [ADR-025](../adr/025-papi-fan-out-throttling-capacity-planning.md#amendment-2026-10-21)).
- **Why this is enough:** tokens run as the integration user, whose only permissions are read-only on public portfolio data. The asset at risk is the API quota, not the data.

### 4.5 Scenario: Contact Form Abuse

- **Symptom:** unwanted Leads with `LeadSource` "Portfolio Website", or auto-responses to addresses nobody typed in.
- **Mitigation:** on the Lead, run "Block sender" (email or domain), from desktop or the mobile app. The sender's next message is thanked and dropped. Add a Keyword row to `Submission_Block__c` for a phrase. Deactivate a row (`Active__c`) to undo a block.
- **Already in place:** the honeypot, the 3 second minimum, one auto-response per address in 24 hours, and at most 20 messages in 24 hours ([Technical Guide §2.16](./04-Technical-Guide.md#216-contact-form-and-submission-guard)).
- **Lost messages:** check the `Contact_Form_Failure__c` tab. A row there is a message that failed to save, with the reason.

## 5. Observability & Monitoring

### 5.1 Quota Monitoring (Not Built)

The design was a scheduled job that read a Gemini usage counter from a Platform Cache partition (`local.AIMetrics`) and emailed me above a threshold. **It is not built:** the org has no Platform Cache partition, and no class keeps such a counter. What exists today:

- The Gemini API key's own limits for Gemini 2.5 Flash, as recorded on 2026-10-20 (AI Studio): 5 requests per minute and 20 requests per day. Read the current figures before relying on them. Past them, `/papi/ai/generate` falls back to the local template for cover letters and answers 503 `ALL_PROVIDERS_UNAVAILABLE` otherwise.
- The `papi-ai` rate tier, 10 requests per minute (`RateWindowLimiter`). The site cover letter has its own bucket, `papi-ai:site-cover-letter`, shared by every site visitor. `/papi/ai/generate` keys by session, and every evaluator token is the same session, so evaluators share one bucket too.
- The footer's "AI requests today" line (`FooterController.getSystemSnapshot`), the sum of today's `papi-ai` counts. It counts requests, not Gemini calls.
- The audit object `API_Access_Request__c` for evaluator token requests.
- Setup → System Overview for the org's daily API request usage (15,000 per day in Developer Edition).
- The footer's Storage row in Quotas and limits and its panel, read from one stored snapshot (`Storage_Snapshot__c`). `StorageSnapshotJob` refreshes it from the 15 minute integration scheduler when it is older than the `Storage_Snapshot_Hours` setting (1 to 24). If the row is missing, no snapshot has been stored yet, and scheduling `IntegrationCacheRefreshScheduler.scheduleAll()` as the admin starts it. The data by area is an estimate (record counts times 2 KB) and Setup holds the exact figures ([Technical Guide §2.23](./04-Technical-Guide.md#223-storage-snapshot-and-site-usage)).
- The `Site_Usage_History` report type and the "Site usage, last 30 days" report in Portfolio Owner Reports show each site's origin and cache bandwidth and request time by day. Whether the LWR site's traffic appears there, or counts toward the Developer Edition's 500 MB a day, is open. On 2026-10-27 the LWR site showed no rows. "Site traffic today" in the footer is off (`Footer_Site_Traffic_Visible` is 0).

### 5.2 Logging

- **Where logs go.** Apex logs through `PortfolioLog` (one line per API request: path, status, correlation id, elapsed time). With Nebula Logger installed, the lines are Nebula log entries tagged `portfolio`. Without it, they are ordinary debug logs, visible only while a trace flag is set.
- **Nebula is optional and I install it myself.** Install its unlocked, no-namespace package in production by hand. No deploy installs or needs it, and removing it changes nothing but where the lines land.
- **Retention.** Set Nebula's log retention to 2 days, to protect the Developer Edition's 5 MB of data storage.
- **What is never logged:** a request or response body, a header value, a token or a query string ([Technical Guide §1.5](./04-Technical-Guide.md#15-logging-nebula-logger-optional)).

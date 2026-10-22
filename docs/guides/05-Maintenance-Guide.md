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
- [4. Disaster Recovery](#4-disaster-recovery)
  - [4.1 Scenario: Deployment Failure](#41-scenario-deployment-failure)
  - [4.2 Scenario: Security Misconfiguration (Guest User)](#42-scenario-security-misconfiguration-guest-user)
  - [4.3 Scenario: GitHub Rate Limit Exhaustion](#43-scenario-github-rate-limit-exhaustion)
  - [4.4 Scenario: Token Vending Abuse](#44-scenario-token-vending-abuse)
- [5. Observability & Monitoring](#5-observability--monitoring)
  - [5.1 Quota Monitoring (Automated)](#51-quota-monitoring-automated)

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

**3. Gemini API Key:** Rotate every 90 days. Update Named Credential Gemini_API

### 1.2 External Client App Secret Rotation

The portfolio APIs authenticate with OAuth 2.0 Client Credentials issued by the **Portfolio API** External Client App ([ADR-027](../adr/027-platform-native-api-authentication.md)). The consumer secret lives in the External Client App and in **two** External Credential principals:

- `Portfolio_API_Principal` of `Portfolio_API_Auth` (OAuth), used by the `Portfolio_API` Named Credential for the API Lab proxy and the `PAPIHealth` credential check;
- `Portfolio_API_Token_Principal` of `Portfolio_API_Token_Auth` (Custom), whose `Client_Id` and `Client_Secret` parameters `TokenExchangeService.exchangeToken` sends to the token endpoint to vend evaluator tokens ([ADR-028 amendment](../adr/028-evaluator-access-via-token-vending.md#amendment-2026-10-21)).

- **Rotation Schedule:** every 90 days, or immediately on suspected exposure.
- **Blast radius:** rotating the secret invalidates both principals until they are updated; tokens already issued keep working until their 30-minute session expires.

**Procedure**

1. Setup → **External Client App Manager** → **Portfolio API** → **Settings** → **OAuth Settings** → **Consumer Key and Secret** → **Rotate** (or **Regenerate**). Copy the new secret once.
2. Setup → **Named Credentials** → **External Credentials** → **Portfolio_API_Auth** → principal **Portfolio_API_Principal** → **Edit** → paste the new secret → **Save**.
3. Setup → **Named Credentials** → **External Credentials** → **Portfolio_API_Token_Auth** → principal **Portfolio_API_Token_Principal** → **Edit** → set the `Client_Secret` parameter to the new secret (and `Client_Id`, if the consumer key changed) → **Save**.
4. Verify the outbound credential: call `GET /papi/v1/health` (from the site's API Lab, or with a Bearer token) and check `dependencies.credential` is `UP`. `PAPIHealth.checkCredential` makes one GET through `Portfolio_API` to `/sapi/v1/health` and reports `UP` only on HTTP 200; on failure `details.credential` holds the HTTP status or exception type. It needs the caller to have principal access to `Portfolio_API_Auth-Portfolio_API_Principal` (granted to the integration user by `Integration_Access`).
5. Verify token vending: run `scripts/api-smoke.sh` with your own email; the token request must return 200.
6. Record the rotation date in `Portfolio_Config__mdt.Ryan_Bumstead.Last_Secret_Rotation__c`.

**Revocation (kill switch)**

- Setup → **External Client App Manager** → **Portfolio API** → **Deactivate**. Every outstanding Bearer token, including evaluator tokens issued by `POST /papi/v1/auth/token` ([ADR-028](../adr/028-evaluator-access-via-token-vending.md)), stops working immediately. Reactivate after rotating.

## 2. Environment Hygiene (The "Clean Sweep")

The Developer Edition org shares space with Trailhead challenges and standard Salesforce metadata. To prevent "Pollution" from failing the CI/CD pipeline, strict separation is enforced.

### 2.1 Organization Rules

- **Authorized Code:** Only metadata present in `packages/` is authorized.
- **Standard Sites:** The "Portfolio" site must **not** utilize standard controllers (e.g., SiteLogin, CommunitiesSelfReg) as Authenticated Users are Out of Scope.

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

- **`npm run scan`**: Executes the Salesforce Code Analyzer (PMD/ESLint) and outputs a human-readable scan-results.html report (visualized in browser). _Success Criteria: 0 Critical Violations_
- **`npm run delta`**: Generates the incremental package.xml in the `changed/` folder by comparing local changes against origin/main.
- **`npm run validate`**: The "Golden Command". It runs the delta generation and immediately triggers a check-only deployment to the org.
  - _Note:_ Uses scripts/validate.js to handle "Empty Package" scenarios gracefully on Windows.

### 3.2 Pipeline Triggers

- **PR Validation (pr.yml):** Runs on Pull Requests modifying `packages/**`.
  - _Quality Gate:_ Apex Coverage > 90% (Hard Gate).
  - _Security Gate:_ Zero Critical PMD Violations.
- **Production Deploy (deploy.yml):** Runs on Push to main modifying `packages/**`.

### 3.3 Pipeline Strategy: Delta Deployment

To ensure efficiency and avoid hitting Salesforce Metadata API limits, the pipeline utilizes a "Delta Deployment" strategy using sfdx-git-delta.

- **Validation (pr.yml):** Calculates the diff between the PR branch and origin/main. It generates a temporary package of _only_ the changed components and runs a "Dry Run" deployment with RunLocalTests to ensure validity without altering the org.
- **Production (deploy.yml):** Calculates the diff between the current commit and the previous commit (HEAD~1). It deploys strictly the changed metadata to the Production environment.
- **Destructive Changes:** The pipeline is configured to respect `destructiveChanges.xml`. If metadata is deleted from the repo, sfdx-git-delta will generate the destructive manifest, and the pipeline will automatically delete those components from the Org during deployment.
- **Cross-Platform Compatibility:** The `package.json` scripts leverage `shx` and `rimraf` to ensure all shell commands (mkdir, rm) execute consistently on both Windows (Local Development) and Ubuntu Linux (GitHub Actions Runners).

### 3.4 Org Persistence

- **Heartbeat (keep-alive.yml):** Runs daily at 08:00 UTC to execute a SOQL query against the org.
- _Purpose:_ Prevents the Developer Edition from being marked inactive and deleted by Salesforce.

## 4. Disaster Recovery

### 4.1 Scenario: Deployment Failure

1. Revert main branch to previous commit SHA.
2. Trigger fresh deployment.
3. Verify site health via Smoke Test suite / Manual Verification.

### 4.2 Scenario: Security Misconfiguration (Guest User)

- **Symptom:** PMD Scan or Health Check fails due to "Guest User Open Access".
- **Mitigation:**
  1. **Immediate Rollback:** Revert the guest permission set `Portfolio_Guest` (`packages/portfolio-site/main/default/permissionsets/Portfolio_Guest.permissionset-meta.xml`) to the previous commit. It must grant only what [Technical Guide §1.4, prerequisite 6](./04-Technical-Guide.md#14-system-api-security-the-twin-pattern) lists: class access to the seven site controllers and the token endpoint, read on the six portfolio objects, create on `Testimonial__c`, read on `UserExternalCredential`, and the `Portfolio_API_Auth`, `Portfolio_API_Token_Auth` and `Gemini_Auth` principals. Never a GitHub or Jira principal, and never Contact or Account access.
  2. **Nuke & Rebuild:** If unsure, delete the Permission Set from the org (`sf project delete source`) and redeploy the `main` branch version.

### 4.3 Scenario: GitHub Rate Limit Exhaustion

- Visitors never call GitHub. `GitHubCacheRefreshJob` refreshes `Github_Cache__c` every 15 minutes, and a failed refresh (429, 500 or a timeout) inserts nothing, so the changelog keeps showing the last good list with its age. Three failures in a row open the `github` breaker for 30 minutes, and refreshes are skipped until it closes.

### 4.4 Scenario: Token Vending Abuse

- **Symptom:** spike in `API_Access_Request__c` records, `429`/`503` responses from `/papi/v1/auth/token`, or Developer Edition API request usage trending toward the 15,000/day limit (Setup → System Overview).
- **Immediate mitigation:**
  1. Deactivate the **Portfolio API** External Client App (see §1.2). All issued tokens die.
  2. Lower `Token_Daily_Cap__c` on the `Ryan_Bumstead` `Portfolio_Config__mdt` record (default 50 when blank) or set it to 0 to pause vending: `TokenExchangeService.dailyCap` reads it and a cap of 0 answers every token request with 503.
- **Reading the audit trail:** `API_Access_Request__c` rows (one per token attempt) and the daily cap count are readable by users holding `Portfolio_Admin`, which grants read and View All on `API_Access_Request__c` and `API_Rate_Window__c` and read on their fields. Without it the fields are not readable, so reports and SOQL fail.
- **Recovery:** rotate the secret (§1.2), review the audit rows (`Email__c`, `Source_IP__c`, `Outcome__c`, `Channel__c`) for the offending email/IP, reactivate the app, restore the cap.
- **Per-caller limits already in place:** 15 token requests per minute per email and source IP, and the PAPI tier limits (`RateWindowLimiter`, [ADR-025](../adr/025-papi-fan-out-throttling-capacity-planning.md#amendment-2026-10-21)).
- **Why this is enough:** tokens run as the integration user, whose only permissions are read-only on public portfolio data. The asset at risk is the API quota, not the data.

## 5. Observability & Monitoring

### 5.1 Quota Monitoring (Not Built)

The design was a scheduled job that read a Gemini usage counter from a Platform Cache partition (`local.AIMetrics`) and emailed the owner above a threshold. **It is not built:** the org has no Platform Cache partition, and no class keeps such a counter. What exists today:

- The Gemini API key's own limits for Gemma 4 31B: 30 requests per minute, 16,000 tokens per minute, 14,400 requests per day (AI Studio). Past them, `/papi/v1/ai/generate` falls back to the local template for cover letters and answers 503 `ALL_PROVIDERS_UNAVAILABLE` otherwise.
- The `papi-ai` rate tier, 10 requests per minute (`RateWindowLimiter`). The site cover letter and `/papi/v1/ai/generate` both count against it, and every evaluator token is the same session, so evaluators share one bucket.
- The footer's "AI requests today" line (`FooterController.getSystemSnapshot`), the sum of today's `papi-ai` counts. It counts requests, not Gemini calls.
- The audit object `API_Access_Request__c` for evaluator token requests.
- Setup → System Overview for the org's daily API request usage (15,000 per day in Developer Edition).

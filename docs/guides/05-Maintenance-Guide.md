# Maintenance & Operations Guide

**Table of Contents**

- [1. Security Rotation Policy (CI/CD)](#1-security-rotation-policy-cicd)
  - [1.1 Rotation Procedure](#11-rotation-procedure)
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
- [5. Observability & Monitoring](#5-observability--monitoring)
  - [5.1 Quota Monitoring (Automated)](#51-quota-monitoring-automated)

---

Project: Salesforce Platform Architect Portfolio

Owner: Ryan Bumstead

Version: 1.0

Date: MVP – Q1 2026

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
  1. **Immediate Rollback:** Revert `force-app/main/default/permissionsets/Guest_User.permissionset-meta.xml` to the previous commit.
  2. **Nuke & Rebuild:** If unsure, delete the Permission Set from the org (`sf project delete source`) and redeploy the `main` branch version.

### 4.3 Scenario: GitHub Rate Limit Exhaustion

- The system uses `GitHub_Cache__c` to store API responses. If the API fails (429/500), the Apex `GitHubService` will automatically serve cached data.

## 5. Observability & Monitoring

### 5.1 Quota Monitoring (Automated)

- Scheduled Apex Job runs at 23:00 UTC.
- Logic: Checks `local.AIMetrics`.
- Alert: Emails `Owner_Email__c` if Gemini usage > 1,000 requests.

```apex
// Check Org Cache for Gemini usage
Cache.Org orgCache = Cache.Org.getPartition('local.AIMetrics');
Integer todayCount = (Integer) orgCache.get('GeminiDailyCount_' + System.today().format());

if (todayCount != null && todayCount > 1200) {
    Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
    mail.setToAddresses(new String[]{ Portfolio_Config__mdt.getInstance('Default').Owner_Email__c });
    mail.setSubject('Gemini Quota Alert: ' + todayCount + ' requests today');
    Messaging.sendEmail(new Messaging.SingleEmailMessage[]{ mail });
}
```

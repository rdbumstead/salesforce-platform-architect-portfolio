# Executive Overview

**Table of Contents**

- [Strategic Intent](#strategic-intent)
- [Business Value: Why Build This Complexity?](#business-value-why-build-this-complexity)
- [Success Criteria (Definition of Done)](#success-criteria-definition-of-done)
  - [1. Portfolio Impact](#1-portfolio-impact)
  - [2. Functional Acceptance – MVP (Live at Q1 2026 Launch)](#2-functional-acceptance--mvp-live-at-q1-2026-launch)
  - [3. Target State Acceptance – Phase 8 (Q2 2026)](#3-target-state-acceptance--phase-8-q2-2026)
  - [4. Technical Acceptance (Required for MVP)](#4-technical-acceptance-required-for-mvp)

---

Project: Salesforce Platform Architect Portfolio

Version: 1.0

Owner: Ryan Bumstead

Date: MVP — Q1 2026

## Strategic Intent

This Program Charter defines the strategic intent and delivery plan for the Salesforce Platform Architect Portfolio. It serves as the authoritative reference for project scope, business value, and timeline.

## Business Value: Why Build This Complexity?

The primary problem this portfolio solves is that Recruiters and Hiring Managers struggle to verify an architect's hands-on skills through static PDFs.

- **The Need:** A verified, interactive demonstration of complex capabilities like API design, LWC, and AI.
- **The Value:** This system intentionally mirrors a real enterprise architecture so evaluators can see architecture quality, integration patterns, DevOps discipline, and multi-cloud strategy — all within a controlled, demonstrable environment. It proves that "Enterprise Grade" is a mindset, not just a license tier.

## Success Criteria (Definition of Done)

To define the "Definition of Done" for this portfolio, the following metrics must be met:

### 1. Portfolio Impact

- [ ] LinkedIn post regarding launch generates > 100 views
- [ ] Interview requests received from 3+ companies within 30 days of launch

### 2. Functional Acceptance — MVP (Live at Q1 2026 Launch)

- [ ] All 5 pillars accessible via guided navigation
- [ ] API tester successfully calls ≥ 3 native endpoints (REST + Salesforce GraphQL)
- [ ] Skill Graph, Roadmap Viewer, and Project Gallery load via lightning/uiGraphQLApi wire adapter
- [ ] Resume generates in both ATS (Plain Text) and Creative (PDF) modes
- [ ] Dynamic ERD renders all 5 core Custom Objects without hardcoding
- [ ] "Smart Docs" component receives test Platform Event and updates UI without refresh
- [ ] Mobile responsive layout passes manual verification on iOS Safari and Android Chrome

### 3. Target State Acceptance — Phase 8 (Q2 2026)

- [ ] API Lab toggle switches to "Enterprise Mode" (AWS Lambda Function URL)
- [ ] Live payload counter shows ≥ 85% reduction vs native mode
- [ ] Glass Box footer shows real-time API key usage, rate-limit counters, and "$0.00 forever"
- [ ] Resume Engine runs serverless on Lambda (perfect PDF fidelity)

### 4. Technical Acceptance (Required for MVP)

- [ ] LCP < 2.5s measured via Lighthouse Mobile Audit
- [ ] All Apex tests > 75% coverage (Target: 90% for critical paths)
- [ ] CI/CD pipeline passing (Green build badge on Repo)
- [ ] Zero critical security warnings from PMD Scanner
- [ ] Network Tab screenshot confirms G6 lazy-load occurs >2s after LCP

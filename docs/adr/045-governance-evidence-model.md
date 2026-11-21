# ADR-045: The Governance Evidence Model

## Status

- **Decision:** Accepted.
- **Build:** In progress (SPAP-99). The fields and read are in [GovernanceController.cls](../../packages/portfolio-site/main/default/classes/GovernanceController.cls), the drills are in [drill.yml](../../.github/workflows/drill.yml) and the page is the `/governance` route. None of it is deployed to production yet.

It builds on [ADR-044](044-glassops-makes-the-production-deploy.md) and the event model in [ADR-019](019-executable-governance-platform-events-for-documentation-logic.md).

## Context

- **A permit id alone is thin.** [ADR-044](044-glassops-makes-the-production-deploy.md) made GlassOps the gate for every production deploy with a metadata change, and the deploy event carries the PERMIT id. A visitor who wants to check one deploy needs more: who approved it, and which rules the gate ran.
- **The run log is the wrong place to keep it.** A GitHub run log shows that steps ran, and it ages out. The evidence should live with the deploy record in the org, where the site already reads its pipeline results.
- **Retention is short.** The event handler keeps only the newest 60 `Pipeline_Run__c` rows per workflow to protect the Developer Edition's data storage. A count taken from the rows would fall as old rows were pruned.
- **A control is shown by what it blocks.** A page that lists only passing deploys proves little. The gate saying no is the evidence, and it needs a safe way to be produced and shown.
- **No certification.** I hold no audit report and no framework mapping, and the page must not suggest one.

## Decision

**Each governed deploy stores who approved it and which checks the gate ran. The gate's refusals are recorded as drill runs that never count as deploys. The `/governance` page reads all of it and claims no certification.**

1. **What is stored per deploy run.** `Pipeline_Run__c` and `Governance_Event__e` gain `Approver__c` (Text 39, a GitHub login) and `Gate_Checks__c` (Long Text 4000, a JSON array of at most 30 `{rule, outcome}` pairs, outcome `pass`, `fail` or `skipped`). The permit id was already stored. `deploy.yml` sends the approver from the signed PERMIT, with the run's approvals as the fallback, and the checks from `.glassops/permit.json`, only when GlassOps deployed. The handler keeps an approver only when it is a valid GitHub login, and keeps the checks only as a whole valid list, else null. Together the three let a reader name the approval, the rules and the permit for one deploy, and open the run that proves it.
2. **The running total never falls.** The count of governed deploys is the `Glassops_Deploy` sum in `Usage_Counter__c`, the same figure the GlassOps card shows, incremented once per permit. Pruning old `Pipeline_Run__c` rows never lowers it. The page shows the newest 25 governed deploys beside the total, so the list is a sample and the total is the whole.
3. **Drills are Denied rows.** A drill is a rehearsal of the gate saying no, stored as workflow `drill` with status `Denied`. It keeps the signed deny id in `Permit_Id__c`, carries the failed checks in `Gate_Checks__c`, has no approver and is never counted as a governed deploy. The Delivery success rate and the production deploy count read `deploy` rows only. The read returns every drill row beside the 25 deploys.
4. **Drills run against scratch orgs, with `gate --no-connect` and a throwaway key.** A drill is run by hand from a short lived `drill/*` branch that carries one deliberate fault, and it deploys nothing anywhere. GlassOps treats a scratch org as ephemeral when `gate` logs in to it and allows it with no rule, so a drill would pass for the wrong reason. `gate --no-connect` skips that login, records the configured tier and runs every rule. The deny is signed with a key made inside the job and never stored, so a drill PERMIT can never pass the production deploy, which checks the real key. The production PERMIT key never enters the job.
5. **A drill passes only on the right deny.** The workflow requires gate exit 1 with a PERMIT whose `allow` is false, the rule under test among the failed checks, and no check whose rule starts with `evidence.`. An allow means the rule did not fire. Exit 2 is an error, not a deny. A missing fact, such as no commit or an API error, also denies, and that would put a false drill result on the page. Each of the three drills (`failing-test`, `low-coverage`, `no-approval`) turns on only the rule it tests, in `.github/glassops/drill-*.yaml`.
6. **Statuses and workflows.** Workflow is `deploy`, `heartbeat`, `smoke`, `site` or `drill`. Status is `Success`, `Failure` or `Denied`. The handler's other rules stay: a permit is kept only on a successful deploy run, and a replayed event writes nothing.
7. **The read.** `GovernanceController.getGovernanceEvidence()` is cacheable and on the static export allowlist. It returns `governedTotal` (null when it cannot be read) and the runs, newest first. Its two reads are `Query_Definition__mdt` records ([ADR-033](033-queries-in-custom-metadata.md)).
8. **No certification claim.** The page names what an IT auditor would test in change management and links the record, test or run that shows each control. It says the owner is the only person on the project, so the approval is a deliberate recorded step and not a second reviewer. It names no framework and claims no audit.

## Alternatives considered

- **Keep only the permit id.** The gate's PERMIT is signed, but a visitor cannot read it. Storing the approver and the checks makes each deploy checkable from the page.
- **Link the GitHub run log for the checks.** Logs age out and show steps, not rules. The stored pairs stay with the deploy.
- **Count deploys from the rows.** The count would fall each time the handler pruned. The counter keeps it.
- **Run drills against production.** A drill with a real fault must not touch the site, and a scratch org holds nothing a visitor reads.
- **Let `gate` connect to the scratch org.** The gate would treat it as ephemeral and allow it with no rule, so every drill would pass.
- **Drill on `main` or in a pull request.** A drill needs a deliberate fault that must never merge, so it runs only from a branch that is never merged.
- **Show only passing deploys.** It reads well and proves less. The denied drills are the evidence that the gate refuses.

## Implications

- **The first production deploy after this carries the new fields.** Earlier deploys have a permit id and no approver or checks, and the page shows each missing value as not recorded and never invents one.
- **A drill costs a scratch org.** Each drill takes one of the Dev Hub's daily scratch orgs and some of the production API reserve, so the workflow checks the reserve first and deletes the org on every exit.
- **Drill rows are pruned like any other.** They sit in the retention of their own workflow, and the page lists those still held.
- **The static site shows the list as of its last build,** and the page says so.
- **A GlassOps change can change the checks.** The rule names on the page are whatever the pinned release writes in the PERMIT.

## Related

[ADR-019](019-executable-governance-platform-events-for-documentation-logic.md), [ADR-033](033-queries-in-custom-metadata.md), [ADR-041](041-headless-static-front-end-on-cloudflare-pages.md), [ADR-044](044-glassops-makes-the-production-deploy.md), [Technical Guide §2.27](../guides/04-Technical-Guide.md#227-the-governance-page-c-governancestory-and-c-governanceevidence), [Maintenance Guide §3.15](../guides/05-Maintenance-Guide.md#315-running-a-governance-drill).

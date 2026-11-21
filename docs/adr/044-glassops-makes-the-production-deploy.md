# ADR-044: GlassOps Makes the Production Deploy

## Status

- **Decision:** Accepted.
- **Build:** [Live](../../.github/workflows/deploy.yml). Every production deploy with a metadata change has gone through GlassOps since November 18, 2026. The config is [prod.yaml](../../.github/glassops/prod.yaml).

It supplements [ADR-006](006-jwt-bearer-flow-for-ci-cd.md). The JWT sign in stays as it is.

## Context

- **No recorded decision.** `deploy.yml` deployed each push to `main` with raw `sf` commands. The deploy was atomic, but nothing recorded why it was allowed.
- **A shadow run came first.** A GlassOps shadow gate ran after each deploy, validated the same change check only, and wrote a signed PERMIT. It blocked nothing and deployed nothing. Its first verified allow was run 44354892958.
- **One owner.** The author and the person who merges are the same, so a second reviewer cannot satisfy separation of duties. An approval on a GitHub environment can.

## Decision

**In delta mode GlassOps makes the production deploy. A merge that changes metadata waits for my approval, and a signed PERMIT is the record that the change was allowed.**

1. **Plan first, with no environment.** On a push to `main`, and on a hand run in delta mode, a plan job runs `glassops plan`. A push with no metadata change finds nothing to deploy and asks for no approval.
2. **One approved job does the rest.** The `glassops` job runs in the `glassops-deploy` environment and waits for my Approve click. It checks the API reserve, then runs plan, validate (check only, `RunLocalTests`), gate, deploy, verify and report. The `GLASSOPS_PERMIT_KEY` secret lives only in that environment.
3. **The gate.** Coverage must be 75% or more, and separation of duties is satisfied by the environment approval. The PERMIT is tied to the config file by its hash and is valid for two hours.
4. **Deploy and verify.** Deploy is a quick deploy of the validation when Salesforce allows it. Verify checks that production holds what the plan says. It also fails on any other real deploy to production inside the deploy window, because the `deploy-production` queue serialises production deploys.
5. **The deployed tag.** GlassOps moves the git tag `glassops/deployed/prod` to the deployed commit after a deploy, and the workflow pushes it, including after a deploy that verify then fails, because production changed. The next plan starts at the tag. When the tag is missing, it starts where `main` stood before the push.
6. **The image is pinned by digest.** The first GlassOps deploy ran on `v1.0.0-rc.3`, and the pin is now `v1.0.1`. A new release is a deliberate change to the workflow. The pull request's check only validation against production runs on the same image (`pr.yml`).
7. **What stays outside GlassOps.** The Mermaid drawings deploy, the Apex and Jest runs, the site publish, the Governance events, the smoke test, the docs cache and the static site stay plain workflow steps after the GlassOps job. The hand run `full` and `destructive` modes stay on raw `sf` as a break glass path and do not move the tag.
8. **The shadow gate workflow is deleted.**

## Alternatives considered

- **Keep the shadow gate.** It proves the gate works but decides nothing. The deploy would still not depend on it.
- **Gate in the pull request only.** The pull request already validates check only against production. It cannot cover the state of production at merge time, and it leaves no PERMIT for the deploy.
- **Branch protection with a second reviewer.** There is no second person. It would only be a click that meant nothing.

## Implications

- **One Approve click per metadata merge.** An unapproved run holds the `deploy-production` queue. Later pushes wait behind it, in order, until it is approved or rejected.
- **Every GlassOps deploy runs every local test.** Validate uses `RunLocalTests` even when the change has no Apex, where Salesforce's default for such a change ran none before. A metadata only merge now takes the time of a full test run, and the run counts against the org's API use.
- **The API reserve can stop a deploy before anything is sent.** The job checks the daily API reserve for the public site first. When the reserve is reached, the run stops, and I run Deploy to Production by hand in delta mode later.
- **The pull request check runs through GlassOps too.** `pr.yml` plans the pull request's delta and validates it check only against production with its own config, `.github/glassops/pr.yaml`, at `RunRelevantTests`. It has no gate and no PERMIT key, so nothing in a pull request can deploy.
- **A failed validate, gate or deploy leaves the tag where it was.** The next run plans the same change again. A deploy that verify fails has moved the tag, so the next run does not redeploy those components. I fix forward with a new commit or use full mode.
- **GlassOps is a dependency.** A GlassOps fault stops delta deploys. The break glass modes are the way round it, and the release stays pinned until I move it.

## Related

[ADR-006](006-jwt-bearer-flow-for-ci-cd.md), [ADR-019](019-executable-governance-platform-events-for-documentation-logic.md), [Maintenance Guide §3.13](../guides/05-Maintenance-Guide.md#313-operating-the-glassops-production-deploy).

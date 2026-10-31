# Pillar seed data

Seed records for the pillar pages, for walking the site in a scratch org. One plan per pillar. Pillar A is `plan-a.json`, Pillar B is `plan-b.json` (added by its own stream).

## What `plan-a.json` holds

| Object             | Records                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Project__c`       | 1: "Employer Hub for an education provider", Pillar A, with a proposed Challenge, Solution and Business Value                                    |
| `Project_Asset__c` | 4: Image rows pointing at the images in the `EH_Assets` static resource (`resource:EH_Assets/<file>.svg`, sort order 1 to 4, each with alt text) |

The four images are redrawn for the portfolio from the original Employer Hub demo deck, step for step for the two flows and chart for chart for the two dashboards. They carry no names, and the dashboard values are samples, which each image says.

## Copy for the owner's review

The project name and the three text fields are proposals. The owner judges the copy (Round 6 plan §2, reading R11). The text describes the Employer Hub demo design only, nothing about a client's own org, data or later requests. The same text is in the owner's production script for the home case studies, so a change to any of them is made in both places. Pillar A is described as "an education provider" everywhere, so one search for "education provider" finds every place to change.

- **Name:** "Employer Hub for an education provider". No client name.
- **Challenge:** "Several departments at an education provider worked with the same employer partners, each from its own inbox and spreadsheet. Partners repeated themselves, and nobody could see the whole relationship. Leadership had no shared numbers for engagement, investment or hiring."
- **Solution:** "A working Employer Hub demo built on Salesforce. Every inquiry is captured once from a web form, matched to the partner's account and routed by the employer's industry. Service requests are fulfilled from the case, and monetary requests run through an opportunity to a contract. Operations and executive dashboards report from the same records."
- **Business Value:** "Designed so that employer partners get one front door and a faster answer, departments stop duplicating outreach and see each other's work with a partner, and leadership can report on the employer relationship as a whole."

## Load it

Into a scratch org only. Never into production.

```
sf data import tree --plan data/pillars/plan-a.json --target-org <scratch-alias> --json < /dev/null
```

Run it from Git Bash with stdin closed, or it can hang. The running user needs field access to the custom fields first. In a fresh scratch org assign `Portfolio_Admin` to the admin before the import.

## Production

Production records change only through the owner's scripts, run by hand from the owner's local checkout. `.claude/data-changes/2026-10-22-pillar-a-production.apex` (Round 5, already run) renamed the Pillar A project, removed the old deck asset and inserted the four image rows. `.claude/data-changes/2026-10-22-pillar-a-reword.apex` (Round 6) set the name, Challenge, Solution and Business Value to their earlier wording. The demo only Solution and Business Value above reach production through the owner's home case study script. No deck row is published.

## Pillar B

`plan-b.json` loads one `Project__c` for Pillar B, named "Literacy program platform for an adult literacy nonprofit", with proposed `Challenge__c`, `Solution__c` and `Business_Value__c` text marked for the owner's review (N1). It loads no `Project_Asset__c` rows, because there is no video prototype (D8). Load it into a scratch org only, with stdin closed: `sf data import tree --plan data/pillars/plan-b.json --target-org <scratch-alias> --json < /dev/null`. Production changes go through `.claude/data-changes/2026-10-22-pillar-b-production.apex`, which the owner runs.

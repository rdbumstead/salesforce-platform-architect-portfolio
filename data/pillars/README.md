# Pillar seed data

Seed records for the pillar pages, for walking the site in a scratch org. One plan per pillar. Pillar A is `plan-a.json`, Pillar B is `plan-b.json` (added by its own stream).

## What `plan-a.json` holds

| Object             | Records                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Project__c`       | 1: "Employer Hub for a community college", Pillar A, with a proposed Challenge, Solution and Business Value                                                                                                                  |
| `Project_Asset__c` | 5: four Image rows pointing at the placeholder images in the `EH_Assets` static resource (`resource:EH_Assets/<file>.svg`, sort order 1 to 4, each with alt text), and one Document row "Employer Hub demo deck" with no URL |

The four images are placeholders drawn for the portfolio. Each says so in the image. They are replaced when the sanitized material arrives.

## Copy for the owner's review

The project name and the three text fields are proposals. The owner judges the copy (Round 5 plan §0 item 6). The name and the Business Value are also in the production script, so a change to either is made in both places. The production script leaves Challenge and Solution as they are.

- **Name:** "Employer Hub for a community college". No client name.
- **Challenge:** "Several departments at a community college worked with the same employer partners, each from its own inbox and spreadsheet. Partners repeated themselves, and nobody could see the whole relationship. Leadership had no shared numbers for engagement, sponsorship or hiring."
- **Solution:** "One Employer Hub in Salesforce captures every inquiry once, triages it and routes it to the right department. Partner engagements, job postings, sponsorships and letters of support sit on the partner's account. Operations and executive dashboards report from the same records."
- **Business Value:** "Employer partners get one front door and a faster answer. Departments stop duplicating outreach and can see each other's work with a partner. Leadership can report on the employer relationship as a whole for the first time."

## Load it

Into a scratch org only. Never into production.

```
sf data import tree --plan data/pillars/plan-a.json --target-org <scratch-alias> --json < /dev/null
```

Run it from Git Bash with stdin closed, or it can hang. The running user needs field access to the custom fields first. In a fresh scratch org assign `Portfolio_Admin` to the admin before the import.

## Production

Production records change only through the owner's script, run by hand: `.claude\data-changes\2026-10-22-pillar-a-production.apex` in the owner's local checkout. It renames the existing Pillar A project, sets its Business Value, removes the old deck asset and inserts the same five asset rows as this plan.

## Pillar B

`plan-b.json` loads one `Project__c` for Pillar B, named "Literacy program platform for a regional adult literacy nonprofit", with proposed `Challenge__c`, `Solution__c` and `Business_Value__c` text marked for the owner's review (N1, D3). It loads no `Project_Asset__c` rows, because the video waits for D8. Load it into a scratch org only, with stdin closed: `sf data import tree --plan data/pillars/plan-b.json --target-org <scratch-alias> --json < /dev/null`. Production changes go through `.claude/data-changes/2026-10-22-pillar-b-production.apex`, which the owner runs.

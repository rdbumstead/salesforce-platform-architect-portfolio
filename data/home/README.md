# Home case study seed data

Three `Project__c` rows for walking the home page's case study cards in a scratch org. Each row has `Home_Sort__c` set (1, 2 and 3) and no `Pillar__c`, so `ProjectCardController.getHomeCaseStudies` shows them and `getPillarCards` never picks them up. None is featured, because the home cards are chosen by `Home_Sort__c` alone.

| Row               | Card title                                           | Number                                                  |
| ----------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| Home case study B | Choosing the right platform for a literacy nonprofit | `$0`, stored                                            |
| Home case study A | Designing an employer hub for an education provider  | the Employer Hub object count, computed from the ERD    |
| Home case study E | Building this site as a production org               | the newest successful run's passed Apex tests, computed |

The links are paths on the site (`/nonprofit-solutions`, `/business-architecture`, `/docs`), so they work in any scratch org. In production the same cards are the Pillar B, A and E rows, changed by the owner's script, and their links are the full `https://ryanbumstead.com/...` addresses the pillar cards already use.

## Copy for the owner's review

Every sentence here is a draft. The owner judges the copy. The same text is in the owner's production script for the home case studies, so a change is made in both places. No client name, no client data, no commercial terms. Card A describes the Employer Hub demo design only.

## Load it

Into a scratch org only. Never into production.

```
sf data import tree --plan data/home/plan.json --target-org <scratch-alias> --json < /dev/null
```

Run it from Git Bash with stdin closed, or it can hang. The running user needs field access to the new `Project__c` fields first: in a fresh scratch org assign `Portfolio_Admin` to the admin before the import. To check that the section disappears with no empty heading, clear `Home_Sort__c` on all three rows.

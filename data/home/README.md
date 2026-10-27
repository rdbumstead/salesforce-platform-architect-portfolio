# Home case study seed data

Three `Project__c` rows for walking the home page's case study cards in a scratch org. Each row has `Home_Sort__c` set and no `Pillar__c`, so `ProjectCardController.getHomeCaseStudies` shows them and `getPillarCards` never picks them up. None is featured, because the home cards are chosen by `Home_Sort__c` alone. The order is A, B, E, the same as production since Round 12.

| Order | Row               | Card title                                           | Number                                                  |
| ----- | ----------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| 1     | Home case study A | Designing an employer hub for an education provider  | the Employer Hub object count, computed from the ERD    |
| 2     | Home case study B | Choosing the right platform for a literacy nonprofit | `$0`, stored                                            |
| 3     | Home case study E | Building this site as a production org               | the newest successful run's passed Apex tests, computed |

A card shows only with a link, and the home page shows the number, the title and the client line. These rows still carry the problem, the call and the outcome, which the home cards no longer show. In production the same fields are on the pillar rows, which the build section's case studies read.

The links are paths on the site (`/business-architecture`, `/nonprofit-solutions`, `/delivery`), so they work in any scratch org. In production the same cards are the Pillar B, A and E rows, changed by the owner's script, and their links are the full `https://ryanbumstead.com/...` addresses the pillar cards already use.

## Copy for the owner's review

Every sentence here is a draft. The owner judges the copy. The same text is in the owner's production script for the home case studies, so a change is made in both places. No client name, no client data, no commercial terms. Card A describes the Employer Hub demo design only.

## Load it

Into a scratch org only. Never into production.

```
sf data import tree --plan data/home/plan.json --target-org <scratch-alias> --json < /dev/null
```

Run it from Git Bash with stdin closed, or it can hang. The running user needs field access to the new `Project__c` fields first: in a fresh scratch org assign `Portfolio_Admin` to the admin before the import. To check that the section disappears with no empty heading, clear `Home_Sort__c` on all three rows.

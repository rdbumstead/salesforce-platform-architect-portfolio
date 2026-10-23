# Site seed data

A small, known record graph for walking the public site in a scratch org. Every record name starts with "Seed " so a walk can look for exact strings.

## What it holds

| Object                    | Records                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Account`                 | 2: Seed Employer, Seed Institute                                                                                            |
| `Contact`                 | 1: Seed Owner, `Is_Portfolio_Owner__c` true, no email, no phone, no address                                                 |
| `Experience__c`           | 2: Seed Platform Architect (current, remote), Seed Salesforce Developer (2019 to 2022)                                      |
| `Experience_Highlight__c` | 8: one per persona (Admin, Developer, Architect) plus one shared by all three, on each role. None is locked across personas |
| `Skill__c`                | 6: three Backend (category order 1), three Frontend (category order 2)                                                      |
| `Experience_Skill__c`     | 2: one per role                                                                                                             |
| `Project__c`              | 2: Seed Project Alpha (Pillar C, featured), Seed Project Beta (Pillar E)                                                    |
| `Project_Skill__c`        | 3                                                                                                                           |
| `Project_Asset__c`        | 1: a link on Seed Project Alpha                                                                                             |
| `Certification__c`        | 2: Seed Platform Developer I (current), Seed Certified AI Associate (`Is_Retired__c` true)                                  |
| `Education__c`            | 1: Seed Bachelor of Science                                                                                                 |

The two projects also carry a pillar card headline number with its label and a card image with alt text (`Headline_Metric__c`, `Headline_Metric_Label__c`, `Hero_Image_URL__c`, `Hero_Image_Alt__c`), the image from the `Project_Card_Images` static resource.

## Load it

Into a scratch org only. Never into production.

```
sf data import tree --plan data/site/plan.json --target-org <scratch-alias> --json
```

The running user needs field access to the custom fields first. In a fresh scratch org assign `Portfolio_Admin` to the admin before the import.

`Lock_Sort_Across_Personas__c` defaults to true, and the `Sync_Experience_Highlight_Sort_Orders` flow then copies one sort value into every persona order. The highlights here set it to false so each persona keeps its own order.

## Layout

One folder per area. Later rounds add sibling folders (for example `data/delivery/` or `data/pillars/`) with their own plan, and never edit this one.

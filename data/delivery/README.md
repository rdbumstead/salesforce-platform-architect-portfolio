# Delivery seed data

One `Github_Cache__c` row and one `Jira_Cache__c` row for walking the Delivery page in a scratch org. Each `JSON_Payload__c` holds the `DeliveryController` payload, `{"schemaVersion":1,"items":[...]}` (pillar-e-design section 4.2).

## What it holds

| Object            | Payload items                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `Github_Cache__c` | 1 commit with the message "seed: delivery walk"                                                         |
| `Jira_Cache__c`   | 3 issues: `SPAP-901` (statusCategory `new`), `SPAP-902` (`indeterminate`), `SPAP-903` (`done`, an Epic) |

## Load it

Into a scratch org only. Never into production.

```
sf data import tree --plan data/delivery/plan.json --target-org <scratch-alias> --json
```

## Re-import right before a walk

`DeliveryController` reports `FRESH` only while the newest row is under 30 minutes old, by its `CreatedDate`. An import from earlier in the day shows `STALE`. To walk the `FRESH` state, run the import command again within 30 minutes of the walk. Each import adds a new row and the controller reads only the newest one, so older seed rows do no harm. To walk the `STALE` state, use a row older than 30 minutes. To walk `EMPTY`, use an org with no cache rows.

## Layout

One folder per area, next to `data/site/`. Later rounds add sibling folders and never edit this one.

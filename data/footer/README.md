# Footer seed data

One `Storage_Snapshot__c` row, so the footer's storage chip shows in a scratch org. Without it the footer has five chips there and the storage one is missing. With it the footer shows all six.

## What it holds

| Object                | Records                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `Storage_Snapshot__c` | 1: the `current` row, 12.4 of 512 MB data and 48.2 of 512 MB files, one data area, one file group |

The numbers are sample figures and describe no real org.

## Load it

Into a scratch org only. Never into production. The storage snapshot job keeps one `current` row, so a production import would collide with it.

```
sf data import tree --plan data/footer/plan.json --target-org <scratch-alias> --json
```

`scripts/scratch-ready.js` loads it with the other plans.

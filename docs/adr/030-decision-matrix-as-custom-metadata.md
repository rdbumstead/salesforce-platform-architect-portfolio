# ADR-030: Decision Matrix as Custom Metadata

## Status

Accepted (2026-10-22, Round 5). Note added 2026-10-22 (Round 6) on whose weights these are.

## Context

The Nonprofit Solutions page (Pillar B) tells a pre-sales story about a regional adult literacy nonprofit choosing a platform. Its centre is a decision matrix the visitor can reweight. The owner chose a three-way matrix (owner decision D2 b, 2026-10-22): NPSP with the Program Management Module, Education Cloud, and Nonprofit Cloud. The client's own decision was two-way, NPSP and PMM against Education Cloud, and it chose NPSP and PMM. That decision is the dated baseline, and Nonprofit Cloud is the option a reviewer would ask about today. The scores and weights are the owner's to set, and they are placeholders until he delivers them.

> **Note, 2026-10-22 (Round 6).** This record first called the starting weights the client's. No client weighting exists in any source. The starting weights are the owner's, set from what the client said mattered most, and the reset button now reads "Reset to the starting weights".

The matrix must be source controlled, deploy to production and to CI's scratch orgs with no managed package, use no data storage, and never ship with an empty cell.

## Decision

1. **Three Custom Metadata Types** in the `nonprofit-literacy` package:
   - `Decision_Option__mdt`: `Summary__c`, `Sort_Order__c`. Three records.
   - `Decision_Criterion__mdt`: `Description__c`, `Default_Weight__c` (the owner's starting weight, 0 to 10), `Sort_Order__c`. Ten records.
   - `Decision_Score__mdt`: `Option__c` and `Criterion__c` as metadata relationships, `Score__c` (1 to 5), `Rationale__c`, `Evidence__c`, `Is_Placeholder__c`. Thirty records, one per option and criterion pair.
2. **A placeholder flag.** Every score carries `Is_Placeholder__c` until the owner reviews it, and its rationale starts `PLACEHOLDER:`. While any score is flagged the page shows the banner "Scores and weights are provisional placeholders pending the owner's review."
3. **One cacheable read.** `DecisionMatrixController.getMatrix()` (`with sharing`, `@AuraEnabled(cacheable=true)`) returns the options, the criteria, every score and `hasPlaceholders` in one payload. It reads the types with SOQL, because `getAll()` returns only the first 255 characters of a long text field, and maps each score to its option and criterion through the related record Ids it has already read.
4. **Totals in the browser.** `c/decisionMatrix` computes every weighted total, the ranking and the sensitivity line (the single weight change that would first put the runner-up ahead), so moving a weight makes no server call. "Reset to the starting weights" restores each criterion's `Default_Weight__c`.
5. **No holes.** `DecisionMatrixControllerTest.shouldScoreEveryOptionAndCriterionPairExactlyOnce` fails when any option and criterion pair lacks a score or has two.

## Rationale

- Custom Metadata deploys with the code through CI, needs no data load and uses no data storage.
- Metadata relationships make each score name a real option and criterion, so a renamed row cannot leave an orphan.
- The site guest reads the three types through the controller with no custom metadata grant. Run as the real site guest (`DecisionMatrixControllerTest.shouldServeTheSameMatrixToTheSiteGuest`), it gets the same 3 options, 10 criteria and 30 scores as an administrator, cell for cell (Round 5 plan reading R3, established 2026-10-22).
- The placeholder flag keeps the owner's judgement visible. The banner disappears on its own once the last flag is cleared.

## Alternatives considered

| Option                                 | Rejected because                                                                                  |
| :------------------------------------- | :------------------------------------------------------------------------------------------------ |
| A static JSON resource read by the LWC | Simpler and needs no class access, but it hides the metadata pattern the pillar is meant to show. |
| Custom objects with records            | They use data storage and need a data load in every org, including CI's scratch orgs.             |
| A server call for each reweighting     | It costs a call per slider move for arithmetic the browser can do.                                |

## Implications

- The Apex class and both components (`c/decisionMatrix`, `c/pillarBStory`) live in `portfolio-site`, because Jest only runs there (Round 5 plan reading R1). The package holds the types, their 43 records and the `NL_Assets` static resource.
- Changing a score or weight is a metadata deploy. The owner reviews the scores and weights, clears each `Is_Placeholder__c` and commits the records.
- The cost and effort table on the page is built from public licence facts only, with a source per row (owner decision D9 a). No client rates or totals appear anywhere.

# ADR-029: Schema Visualizer Scope, Discovery and Caching Without Platform Cache

## Status

Accepted (2026-10-22).

## Context

The SAS promises a data model diagram that never drifts from the deployed org (section 5.1). The Business Architecture page (Pillar A) draws it live. The earlier design in the Technical Guide had two problems:

- It cached the describe result in Platform Cache. The org has no Platform Cache partition, and the project decided against it.
- It drew edges from child relationships. `Account` alone carries hundreds of standard child relationships, so walking them costs CPU and fills the diagram with noise.

The page also needs two schemas: the inert Employer Hub model of the demo (shown by default) and the portfolio's own model. The site guest, who has no read access on the Employer Hub objects, must see the same diagram as an administrator.

## Decision

`SchemaService.getSchemaGraph(scope)` (`public with sharing`, `@AuraEnabled(cacheable=true)`, API 64.0) builds the diagram for one scope, `portfolio` or `employerHub`. Any other scope throws an `AuraHandledException`.

1. **Discovery from the global describe keys only.** One `Schema.getGlobalDescribe()` per call, keys only. An object is a custom object of this org when its name ends in `__c` and has no namespace prefix (exactly one `__`). Names ending in `__mdt`, `__e`, `__b`, `__x`, `__Share`, `__History`, `__Feed` or `__ChangeEvent` are dropped, and so are custom settings (`DescribeSObjectResult.isCustomSetting()`).
2. **Scopes.** An object whose name starts with `EH_` belongs to `employerHub`. Every other custom object belongs to `portfolio`. Each scope adds a standard allowlist: `Account` and `Contact` for the portfolio, and `Account`, `Contact`, `Case`, `Opportunity` and `Contract` for the Employer Hub.
3. **Overrides in Custom Metadata.** `Schema_Visualizer_Object__mdt` rows (`Object_API_Name__c`, `Scope__c`, `Hidden__c`) move an object to a scope or hide it. Four shipped rows hide the internal objects `API_Rate_Window__c`, `API_Access_Request__c`, `Github_Cache__c` and `Jira_Cache__c` (my decision, 2026-10-22).
4. **Describe the filtered list only.** `Schema.describeSObjects(names, SObjectDescribeOptions.DEFERRED)` runs on the objects in scope, never on the whole org.
5. **Edges from reference fields.** An edge is a reference field whose target is in the same scope. It points from the object holding the field to its target. A field with a relationship order (`getRelationshipOrder() != null`) is master-detail, and every other reference is a lookup. Child relationships are not read.
6. **The only cache is the browser's.** `cacheable=true` lets Lightning Data Service cache the answer on the client. There is no Platform Cache and no server cache.
7. **The cost is shown.** The response carries the server CPU time of the call (`cpuMs`), and the page's caption shows it with the object count, for example "9 objects, described in 96 ms of server CPU".

## Rationale

- **It cannot drift.** A new custom object appears on its own in the portfolio scope, and hiding or moving one is a metadata deploy, not a code change.
- **The guest sees the same schema.** Run as the real site guest (`SchemaServiceTest.guestDescribeMatchesAdmin`), the global describe and `describeSObjects` return the same objects as for an administrator, the four `EH_` objects included, though the guest cannot read them. Describe does not filter by object permission, so the guest needs no object grant and no deploy-time snapshot (established 2026-10-22). Exposing names is acceptable because the repository is public.
- **It is cheap.** Uncached in a scratch org, the portfolio scope (14 objects, 21 edges, 10 master-detail) took 141 ms of CPU and the Employer Hub scope (9 objects, 23 edges, 1 master-detail) took 96 ms, against a budget of 1,000 ms per call and the SAS limit of 5,000 ms per request. `SchemaServiceTest.eachScopeStaysUnderTheCpuBudget` asserts the budget.

## Alternatives considered

| Option                                 | Rejected because                                                                                     |
| :------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| Platform Cache for the describe result | The org has no partition, and the project decided against Platform Cache.                            |
| Edges from `getChildRelationships()`   | Hundreds of standard child relationships on `Account` cost CPU and draw noise.                       |
| A schema snapshot taken at deploy time | It goes stale, which is what the diagram must not do. The guest describe result made it unnecessary. |
| A hard-coded list of objects           | It drifts the first time an object is added.                                                         |

## Implications

- `SchemaService` reads no records and exposes metadata only. The site guest holds class access to it through `Portfolio_Guest` and nothing else for the diagram.
- The `EH_Demo_Read` permission set (read on the four `EH_` objects) is optional for administrators and is not assigned to the guest.
- `c/schemaVisualizer` draws the result with the shared d3-force engine on desktop and tablet, and shows the object list on phones ([ADR-020 amendment](020-mobile-performance-static-svg-fallback-strategy.md#amendment-2026-10-22-matrix-first-the-graph-on-open-d3-force-as-the-engine)). Technical Guide section 2.4 describes it.
- The class stays on API 64.0. From 67.0 Apex runs in user context by default, which would change the describe.

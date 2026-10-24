# ADR-033: Queries in Custom Metadata

## Status

Accepted (2026-10-24).

## Context

Every content read was SOQL written into its Apex class. Changing a field list, a filter or a sort order meant a code change, a test run and a deploy, even when the change only narrowed what a page or an API path returns.

The owner chose whole queries in metadata for every content read, not only the parts of a query that change often. That has a risk the settings in [ADR-032](032-operational-settings-in-custom-metadata.md) do not have. A query decides which records and which fields leave the org, and several of these reads serve the site guest or a public API path. An edit to a record must never be able to return a field the class does not return today, drop a condition such as `Approved__c = true`, or put text from a request into a query.

## Decision

1. **One record per read.** `Query_Definition__mdt`, visibility Public. `Object__c` (Text 80), `Fields__c` (Long Text 4000, a comma list, relationship paths allowed), `Filter__c` (Long Text 4000, a WHERE body that may use only named binds), `Order_By__c` (Text 255), `Row_Limit__c` (Number 6,0), `Access_Mode__c` (`USER_MODE` or `SYSTEM_MODE`), `Active__c` (default true) and `Description__c`. The DeveloperName is `Class_Purpose`, for example `SAPISkill_List`.
2. **The code keeps its own query.** The calling class builds a `QueryDefinitions.QueryDefault`: the object, fields, filter, order, limit and access mode it would run anyway, plus the allowlist of fields the read may ever return and the fields the caller reads. `QueryDefinitions.run`, `runPage` and `count` take the record's name, the bind values and that default.
3. **A record is used only when it is safe.** It must be active, read the same object, ask only for fields in the allowlist and keep every field the caller reads, name only binds the caller supplies, run in an access mode no weaker than the default's (`USER_MODE` stays `USER_MODE`), hold a row limit from 1 to 50000, have balanced brackets outside its quoted literals, and parse. Otherwise the default runs. A record that fails to parse is not tried again in the same transaction.
4. **A record can narrow a read and never widen it.** The record's filter is joined to the default's filter with AND, and the smaller of the two row limits applies. Request values travel only as bind values, so no text from a request is ever added to a query.
5. **Optional filters never change the record's text.** A filter the request may leave out is written as `(IsDeleted = :hasX OR Field = :x)`. The class binds `hasX` to false when the parameter is blank, which matches every row the query can return, and to true when it is set, which leaves only `Field = :x`. SOQL refuses a bind on the left of a comparison, so the test needs a real field, and `IsDeleted` is false on every row a query returns without ALL ROWS. A bind inside INCLUDES matches no row, so the persona filter on experience highlights is three literal INCLUDES clauses, each with its own switch: `(IsDeleted = :adminOff AND Persona_Tag__c INCLUDES ('Admin'))`.
6. **One load per transaction.** The records are read once with `getAll()` and kept in a static map. `getAll()` returns only the first 255 characters of a long text field, so every record whose field list or filter reaches 255 characters is read again in full, all of them in one SOQL query.
7. **A bad record fails CI.** A field named only in a metadata record is not protected by the compiler or by the platform's delete check. Each class that owns reads implements `QueryDefinitions.Provider` and returns its defaults by record name. `QueryDefinitions.validateAll()` finds every provider, checks every record against its default and runs each record that passes once with sample binds, and a test fails when it returns anything (`SAPIQueryDefinitionsTest.everyDeployedRecordPassesValidation`, `ApiQueryDefinitionsTest.everyApiRecordPassesValidation`, `SiteQueryDefinitionsTest.everyDeployedRecordPassesValidation`).
8. **Behaviour unchanged on the day it ships.** Each record ships equal to its code default, and a test compares them field by field (`everySapiRecordShipsEqualToItsDefault`, `everyApiRecordShipsEqualToItsDefault` and `everySiteRecordShipsEqualToItsDefault` in the three test classes).
9. **Plumbing stays in code.** Reads that are locks, counters or caches used as plumbing, and reads of custom metadata or setup objects, keep their SOQL. A rate window read `FOR UPDATE` (`RateWindowLimiter`) must not be editable as data.

## Alternatives Considered

| Option                                         | Rejected because                                                                                                       |
| :--------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| Keep every query in code                       | Every field list or filter change is a code change and a full test run.                                                |
| Only the changeable parts in metadata          | The owner chose whole queries.                                                                                         |
| A record replaces the code's query outright    | An edit could drop `Approved__c = true` or add a field the guest must not see, and nothing would catch it.             |
| One record per combination of optional filters | Certifications alone would need 8 records, and the class would pick a record by the request, which is harder to check. |
| Read records with SOQL every time              | Every content read would spend a query on its own definition.                                                          |

## Rationale

- The allowlist, the required fields and the access mode stay in the class, so the class still says what it reads and the most a record can do is return less.
- The default is the fallback for every fault, so a deleted record, a typo or a field later removed from the schema degrades to the known query instead of an error (`QueryDefinitionsTest.fieldOutsideTheAllowlistFallsBack`, `weakerModeFallsBack`, `bracketEscapeCannotWidenTheRead`, `badParseFallsBackAndIsNotRetried`).
- `getAll()` runs no SOQL for records under 255 characters (`QueryDefinitionsTest.shortTextNeedsNoQuery`), and the records load once per transaction (`recordsLoadOncePerTransaction`).
- The rate check still runs before any data query. A rejected request loads no record, because the records are read only when a read runs.

## Implications

- 25 classes read through `QueryDefinitions`, with 61 records. The 13 SAPI list classes have 14 (one list read each, plus `SAPIProject_Detail` for a single project). The Process API and the API Lab options have 27: `PAPIProfile`, `PAPIResume`, `PAPIProjects`, `PAPITestimonialFeed` and `ApiLabOptionsController`. Seven site classes have 20: `ResumeController`, `PortfolioGroundingService`, `ProjectCardController`, `GovernanceController`, `DeliveryController`, `SourceController` and `TestimonialController`. Each guest facing read keeps its sharing and access mode, and its allowlist is the fields the class returned before.
- A record's field list cannot safely hold a child subquery, because an edit could move a top level field inside it. So the three reads that used one, the profile and resume experiences in `PAPIProfile` and `PAPIResume` and the roles in `ResumeController`, are two reads each: the parents, then their highlights by parent Id in sort order, grouped in code. The rows, order and payload are the same (`ApiQueryDefinitionsTest`, `SiteQueryDefinitionsTest.theSplitRoleReadBuildsTheSameRolesAsOneSubqueryRead`), at the cost of one more SOQL query per request on those paths.
- `PortfolioAgentService` keeps all its reads in code. It serializes nested child lists exactly as they come back, a split read could only rebuild them through a JSON round trip, and no site path or API calls it.
- Plumbing stays coded: the rate window read `FOR UPDATE` (`RateWindowLimiter`), the counters in `SubmissionGuard` and `TokenExchangeService`, `CircuitBreaker`, the cache cleanup batches, `GovernanceEventHandler`, `ContactFormLeadWriter`, `LeadReminderService`, and every read of custom metadata or a setup object. `ApiLabController`, `PAPIHealth`, `FooterController`, `DecisionMatrixController` and `SourceCacheRefreshJob` hold no content read, so they did not change.
- Two records, `SAPIProject_List` and `SAPIExperienceHighlight_List`, have a filter of 255 characters or more, so `/sapi/v1/projects` and `/sapi/v1/experience-highlights` spend one more SOQL query per request. No other record reaches 255 characters.
- The totals for `/sapi/v1/skills`, `/sapi/v1/experience`, `/sapi/v1/projects` and `/sapi/v1/testimonials` still ignore the request's filters, as they did before. `X-Total-Count` on those four paths counts every row the read can return, while the page is filtered. The inconsistency is kept on purpose so behaviour does not change, and it is named here. The count runs through the same record, so a record that narrows the read narrows the total too.
- `contactName` on `/sapi/v1/experience` and `/sapi/v1/projects`, and `projectName` on `/sapi/v1/projects`, are now applied. The spec listed them before and the code ignored them.
- A record changed in Setup takes effect on the next transaction. A full mode deploy writes every record in source, so a change has to be committed to source or a later deploy puts the shipped one back, as with [ADR-032](032-operational-settings-in-custom-metadata.md).
- A new content read adds a `QueryDefault` in its class and a record equal to it, and the class implements `QueryDefinitions.Provider`. `validateAll()` then covers it with no other change.

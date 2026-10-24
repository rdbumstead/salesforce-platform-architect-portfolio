# ADR-032: Operational Settings in Custom Metadata

## Status

Accepted (2026-10-23).

## Context

Operational values sat as constants in Apex and in two components: API page sizes, the three rate tiers, the token rate and the default daily cap, the circuit breaker threshold and open time, the contact and testimonial form limits, the source cache refresh limits, the governance freshness windows, the AI length bounds, the health check timeout and two display counts. Changing any of them meant a code change, a test run and a deploy, even when the change was only a number.

Some values already lived in custom metadata, each in a type of its own (`Cache_Cleanup_Settings__mdt`, `AI_Provider_Config__mdt`, and the token cap on `Portfolio_Config__mdt`). Adding one field per value to those types would spread settings across types that each mean something else, and a new field is a metadata change of its own.

A mistyped value must never break a request. A rate limit of 0 or a page size of 5,000 typed into a record would otherwise reach every caller.

## Decision

1. **One generic type.** `Portfolio_Setting__mdt`, visibility Public, one record per value. `Number_Value__c` (Number 18,4) or `Text_Value__c` (Text 255) holds the value, `Min_Value__c` and `Max_Value__c` hold its safe range, and `Description__c` says in plain words what it controls and what is safe. The label is the setting's plain name.
2. **One accessor.** `PortfolioSettings.getInteger(developerName, fallback)`, `getDecimal(developerName, fallback)` and `getText(developerName, fallback)`. Each caller passes its old constant as the fallback, so the code still states the default.
3. **The range is checked on every read.** A record that is missing, holds no value, or holds a number outside its range returns the fallback. `getInteger` also returns it for a number too large for an Integer, and drops a fraction.
4. **One read per transaction.** `Portfolio_Setting__mdt.getAll()` once, kept in a static map. It runs no SOQL, so a reader adds nothing to a request's query count, including the rate check that runs before any data query.
5. **Behaviour unchanged on the day it ships.** 23 records ship, each with the value the code used before.
6. **Existing settings keep their place.** `Portfolio_Config__mdt.Token_Daily_Cap__c` still wins over `Token_Daily_Cap_Default` when set. `Cache_Cleanup_Settings__mdt` and `AI_Provider_Config__mdt` are not moved.
7. **Contract values stay in code.** Field lengths, enum and key strings, spec names and layout constants (graph geometry, image sizes, label lengths) are part of a contract or a layout, not operations, and stay as constants.

## Alternatives Considered

| Option                                       | Rejected because                                                                                          |
| :------------------------------------------- | :-------------------------------------------------------------------------------------------------------- |
| Keep the constants                           | Every number change is a code change and a full test run.                                                 |
| A field per value on `Portfolio_Config__mdt` | Each new value is a new field, and the config type would mix owner details with operational limits.       |
| Hierarchy custom settings                    | Values are data, not metadata, so they do not deploy with the code to production or to CI's scratch orgs. |
| No range check                               | A typo such as a rate of 0 would reach every caller until someone noticed.                                |

## Rationale

- Custom metadata deploys with the code, so CI's scratch orgs and production start with the same values and need no data load.
- `getAll()` runs no SOQL (`PortfolioSettingsTest.recordsLoadOncePerTransaction`), so a setting costs nothing against the query limit.
- The fallback in code means a deleted record, a cleared value or a range mistake degrades to the known default instead of an error.
- The site guest reads a setting through Apex with no permission set (`PortfolioSettingsTest.siteGuestReadsASettingWithNoPermissionSet`).

## Implications

- Every record has a reader, and each reader keeps its constant as the fallback: `ApiRequestContext` (page sizes, rate tiers), `ApiLabController` (the site cover letter's AI tier), `TokenExchangeService`, `PAPIAiGenerate`, `PAPIHealth`, `CircuitBreaker`, `SubmissionGuard`, `SourceCacheRefreshJob`, `GovernanceController`, `DeliveryController` (the roadmap column count) and `ResumeController` (the timeline tab count). The list per record is in the [Technical Guide §1.6](../guides/04-Technical-Guide.md#16-operational-settings-portfolio_setting__mdt).
- A value changed in Setup takes effect on the next transaction. A full mode deploy writes every record in source, so the same value has to be committed to source or a later deploy can put the shipped one back ([Maintenance Guide §3.5](../guides/05-Maintenance-Guide.md#35-changing-an-operational-setting)).
- Two labels do not follow a changed value: the Delivery checklist reads "Org heartbeat today" and "Integration caches under 30 minutes old" from fixed text in `c/smartChecklist`, while `GovernanceController` applies the settings.
- The rate tiers of [ADR-025](025-papi-fan-out-throttling-capacity-planning.md) and the token rate and default cap of [ADR-028](028-evaluator-access-via-token-vending.md) are unchanged as decisions. Only where their numbers are kept has moved.

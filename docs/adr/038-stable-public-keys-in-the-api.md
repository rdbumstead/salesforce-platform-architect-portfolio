# ADR-038: Stable Public Keys in the API

## Status

Accepted and built (2026-10-28). In a scratch org `PublicKeyServiceTest`, `SAPIPublicKeyTest` and `PAPIPublicKeyTest` passed 55 of 55, and every local test, the existing SAPI and PAPI tests among them, passed 1292 of 1292. Rows that existed before the field get their keys when `scripts/backfill-public-keys.apex` runs once in production.

## Context

A reviewer noted that the API returns Salesforce record Ids. It is not a security problem. The API runs as a read only integration user, tokens are scoped, and an Id grants nothing by itself. It is a design smell all the same. A public API should expose keys it controls, not the internal row Ids of the system behind it. An Id ties every client to Salesforce, changes when a record is deleted and recreated in another org, and shows a reader the platform and the object from its first three characters.

I chose an additive change to v1, not a break. Nothing is removed. Removal would be v2.

## Decision

**Every object the API exposes gets a stable `Public_Key__c`. The API returns it beside `id`, accepts it anywhere an Id is accepted, and the specs mark `id` as deprecated.**

- **Field.** `Public_Key__c` on 13 objects. Text(24), External ID, unique, case insensitive, not required at the field level, because rows that existed before the field get their key from the backfill.
- **Format.** An object prefix, an underscore and 10 random characters from `abcdefghijkmnpqrstuvwxyz23456789`. The alphabet leaves out `l`, `o`, `0` and `1`, which are easy to misread. A key is 14 characters, for example `prj_8f3k2m9qtz`. It is opaque on purpose. It never encodes a name, so renaming a record never changes it and no personal detail leaks. The 10 characters carry 50 bits, so a collision is rare, and the unique index backs the check.
- **Prefixes.**

| Object                    | Prefix | Object                   | Prefix |
| :------------------------ | :----- | :----------------------- | :----- |
| `Account`                 | `acc`  | `Project_Asset__c`       | `pas`  |
| `Contact`                 | `con`  | `Project_Skill__c`       | `prs`  |
| `Skill__c`                | `skl`  | `Certification__c`       | `crt`  |
| `Experience__c`           | `exp`  | `Certification_Skill__c` | `cks`  |
| `Experience_Highlight__c` | `hlt`  | `Education__c`           | `edu`  |
| `Experience_Skill__c`     | `exs`  | `Testimonial__c`         | `tst`  |
| `Project__c`              | `prj`  |                          |        |

- **Assignment.** `PublicKeyService.assign` fills any blank key before insert. It draws a key, checks the draw against stored rows and the rest of the batch with one query, and draws again for each clash, up to five times, then raises `PublicKeyException`. A key a record arrives with is kept. `PublicKeyService.refuseChange` runs on update and adds an error when an existing key is changed or cleared, with the case compared exactly. Setting a key on a row that had none is allowed, which is how the backfill works. None of the 13 objects had a trigger, so each got one minimal trigger named `<Object>PublicKeyTrigger` that does nothing but call the service.
- **Existing rows.** `scripts/backfill-public-keys.apex` fills blank keys in batches of 200 and says how many rows remain. I run it once against production after the deploy. Writing to production data is mine.
- **API.** Every SAPI and PAPI object that carried `id` also carries `key`. Every reference carries its own pair: `projectKey`, `experienceKey`, `skillKey`, `certificationKey`, `contactKey`, `employerKey` and `issuerKey`. Each query parameter that took an Id (`projectId`, `experienceId`, `certificationId`) and the `/projects/{id}` path segment now take an Id or a key. A value that is a Salesforce Id is used as before. A value shaped like a key is looked up on that object, and a key with no record matches no rows, the way an Id with no record does. Anything else is a `400 BAD_REQUEST` on the three parameters. The path keeps its old behaviour for such a value, a `404`.
- **Query definitions.** The key fields are added to the code defaults and to the matching `Query_Definition__mdt` records together, so each record still ships equal to its default.
- **Specs.** Both specs move to 1.4.0, gain `key` and the reference keys, and mark `id` and each reference Id `deprecated: true` with a description that points at the key.

## Alternatives considered

| Option                                               | Why not                                                                                                                             |
| :--------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| Replace `id` with `key` in v1                        | It breaks every client that stores an Id. I chose the additive path.                                                                |
| Use the record Name or a slug                        | A rename would change the key, and names carry personal detail. Names are not unique on every object.                               |
| Use `Auto Number` or a sequence                      | It tells a reader how many records exist and in what order. It is guessable.                                                        |
| Use a UUID                                           | 36 characters is long for a URL, and it carries no hint of the object. The prefix makes a mistyped or misplaced key easy to spot.   |
| Fill the key in a Flow                               | A trigger can check a draw against the stored rows and the batch and redraw in one place, and the same service serves the backfill. |
| Add new `projectKey` style parameters beside the old | Two parameters for one meaning. The existing parameter takes both forms without a change to any client.                             |

## Implications

- **Deprecation, not removal.** `id` and the reference Ids stay in every v1 response and stay accepted. A client should move to `key`. A v2 would remove `id` and `xId` from the responses and the schemas, accept only keys in the parameters, make the field required, and drop the Id branch from `SAPITransformer.resolveReference`.
- **Keys are blank until the backfill runs.** Between the deploy and the backfill, an old row returns `key: null`. The new rows are keyed from their first insert. Run the backfill straight after the deploy.
- **A key is permanent.** Deleting and recreating a record makes a new key. The seed data plans in `data/**` create rows through the import, so the trigger keys them. A reseed after a delete gives new keys.
- **The path `/projects/{id}` is not in the spec.** The Apex serves it and has always done so. It takes a key now. Adding it to the spec is a separate change.
- **One more query per insert transaction.** The collision check reads the stored keys once per object per attempt. A bulk insert of 251 rows costs the same one query.
- **Field access.** `Integration_Access` reads the new fields and `Portfolio_Admin` edits them. `Portfolio_Guest` is not changed in this decision.
- **Not part of this decision.** The site's LWC components do not read the API responses and are not changed.

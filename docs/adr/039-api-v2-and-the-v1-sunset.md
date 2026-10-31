# ADR-039: API v2 and the v1 Sunset

## Status

Accepted and built (2026-10-29). In the integration scratch org `RunLocalTests` passed 1322 of 1322 with 97% org wide coverage, the existing SAPI and PAPI tests among them. A guest call to `/openapi?spec=sapi&version=v2` returned SAPI 2.0.0, `version=v1` returned 1.4.0, and `version=v9` returned 400. Both v1 dates ship blank, so nothing is deprecated or retired in production until I set them after the deploy.

## Context

[ADR-038](038-stable-public-keys-in-the-api.md) gave every record a stable `key` beside its `id` and said a v2 would remove `id` and each reference Id. The v1 SAPI spec also promised to drop the deprecated `accomplishments` HTML field in v2.0.0. [ADR-026](026-header-based-api-versioning-strategy.md) already chose the `X-API-Version` header over a version in the URL, and `ApiRequestContext` already reads it.

I decided that v2 is a breaking contract, selected by header, with keys only. v1 stays for one month so an evaluator can see both and a client has time to move, and then it answers 410.

## Decision

**The API serves two versions from the same URLs. `X-API-Version: v2` returns public keys only. A missing header is still v1, and v1 is deprecated for one month and then answers 410 Gone.**

- **Selection.** `ApiRequestContext.version()` returns `v1` or `v2` and `isV2()` is the shortcut. A missing header means v1. `v1` and `v2` are accepted in any letter case, so `V2` works, and anything else is a 400 "Unsupported X-API-Version". Every response carries `X-API-Version` in lower case with the version served, and `Vary: X-API-Version`. The version and sunset checks run before the rate limiter, so a request refused for an unsupported version or a 410 spends none of the rate limit quota.
- **The v2 shape.** For the record endpoints, `SAPITransformer.toV2` shapes a response body recursively. It drops `id`, drops each `xId` that has an `xKey` beside it, and drops `accomplishments`. `PAPITransformer.toV2` delegates to it, so both APIs shape the same way. The token, health, AI generate, resume generate and portfolio config bodies are not shaped (`UNSHAPED_PATHS`), because they are not lists of records. The v1 bodies are not touched, because v1 never calls `toV2`.
- **The v2 parameters.** The query parameters are `projectKey`, `experienceKey` and `certificationKey`, and each takes a public key only. A Salesforce Id there is a 400 "<parameter> must be a public key." The old `projectId`, `experienceId` or `certificationId` name sent with v2 is a 400 "Use projectKey in v2.", naming the new parameter. The `/projects/{id}` path keeps its name and takes a key in v2, and anything else is a 404. v1 keeps the old names and accepts an Id or a key, as ADR-038 built it.
- **The v1 headers.** Every v1 response carries `Deprecation` (RFC 9745, `@` and unix seconds) once a deprecation date is set, `Sunset` (RFC 8594, an HTTP date) once a sunset date is set, and `Link` with `rel="successor-version"` to `https://ryanbumstead.com/api-lab/reference?version=v2`, plus `rel="deprecation"` and `rel="sunset"` entries when those dates are set. The `Link` header is sent whether or not a date is set.
- **The 410.** From 00:00 UTC on the sunset date, every v1 call except the three below, including a call with no version header, is answered 410 in the existing error envelope with `errorCode` `GONE` and the message "API v1 has been retired. Send X-API-Version: v2. See https://ryanbumstead.com/api-lab/reference?version=v2". v2 never returns it. `GONE` is in the v1 SAPI `Error` enum. The three exceptions are `POST /papi/v1/auth/token`, `/sapi/v1/health` and `/papi/v1/health`. They keep their deprecation headers and are answered normally, so a client can still get a token and check that the API is up.
- **The dates are settings.** Two `Portfolio_Setting__mdt` records, `Api_V1_Deprecation_Date` and `Api_V1_Sunset_Date`, hold a `yyyy-MM-dd` date in **Text Value** and are read as 00:00 UTC. Blank sends no header and never answers 410, and a value that is not a date reads as blank. Both ship blank. I plan to set the sunset to the deploy date plus 30 days.
- **The specs.** `salesforce-sapi-v2.yaml` and `portfolio-papi-v2.yaml` at 2.0.0 sit beside the v1 files at 1.4.0, which are marked deprecated. `scripts/sync-specs.js` makes the YAML and JSON static resources for both, the API Lab catalog (which keeps `v1Params` and `v1Responses`) and the Postman collection, which is built from v2. `npm run specs:check` fails when a copy is stale.
- **The machine readable spec.** `OpenApiDocument` takes `version=v1|v2` beside `spec`, defaults to v2, answers 400 for an unknown version and 503 when the resource is missing. The v2 bodies are the `SAPI_OpenAPI_V2` and `PAPI_OpenAPI_V2` static resources.
- **The API Lab.** `ApiLabController.invokeVersioned(path, params, apiVersion)` sends the version the visitor picked and treats blank as v2. The older `invoke` stays and calls v1. The picker offers "v2" first and "v1 (deprecated)", the Lab sends the picked version's parameter names, and it shows `X-API-Version`, `Deprecation`, `Sunset` and `Link` in the response. The reference page opens v2 by default and honours `?version=v1|v2` beside `?spec=`. `ApiLabOptionsController.getOptions()` returns the same public key lists under the `*Id` names for v1 and the `*Key` names for v2.
- **The site's own calls.** The Agentforce cover letter call and the `PAPIHealth` self call send `X-API-Version: v2`, so the sunset cannot reach them.

## Alternatives considered

| Option                                     | Why not                                                                                                                         |
| :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| A version in the URL path                  | ADR-026 chose the header. A path version would move every URL, spec path and Postman request.                                   |
| Keep v1 with no end date                   | A deprecation with no date does not move anyone. The `Sunset` header says when.                                                 |
| Remove v1 on the day v2 ships              | An evaluator holding a v1 call would break at once, and the Lab could not show the deprecation headers live.                    |
| A hard coded sunset date in Apex           | A date change would be a code change. A setting is a record deploy.                                                             |
| Answer a retired v1 with 404 or a redirect | 410 Gone says the resource existed and is gone for good, and the body names the v2 link.                                        |
| One spec file with both versions           | v1 would stop being documented as a whole. Separate files keep v1 readable for its last month and are deleted after the sunset. |

## Implications

- **A missing header is v1.** After the sunset a call with no `X-API-Version` also gets 410, except on the token and health paths, so a client has to send `v2`.
- **`Vary: X-API-Version` is sent on every response**, because the body differs by version. I added it for any cache in front. It and the `Link` header are appended to a value already set, not replaced. Whether a given cache honours it is [unverified].
- **Both dates ship blank.** Until I set them, v1 carries only `X-API-Version`, `Vary` and the `Link` header, and nothing answers 410.
- **After the sunset** I delete the v1 spec files, the `V1_SPECS` list in `scripts/sync-specs.js`, the `SAPI_Spec`, `PAPI_Spec`, `SAPI_OpenAPI` and `PAPI_OpenAPI` static resources, the v1 option in the API Lab and API reference pickers, and the v1 mapping in `OpenApiDocument`. The Maintenance Guide lists the steps.
- **ADR-038 is carried out.** Its note that a v2 would remove `id` and each reference Id is what `toV2` does.
- **Not part of this decision.** The site's own LWC components do not read the API responses and are not changed.

## Amendment (2026-10-31)

[ADR-040](040-versionless-api-urls.md) removed the `/v1/` segment from the URLs the API is called at. The old `/v1/` URLs stay as aliases until a date I set, with their own two settings. The behaviour in this ADR is unchanged for every path, old and new: the exceptions are now matched on the versionless path, so each one covers both spellings. The alternatives table above rejected a version in the URL path, and that still holds. The URL now names the resource and the header names the version.

## Amendment (2026-10-31): the v1 dates are set

The dates no longer ship blank. On 2026-10-29 I set `Api_V1_Deprecation_Date` to 2026-10-30 and `Api_V1_Sunset_Date` to 2026-11-29, so v1 responses carry `Deprecation` and `Sunset`, and from 2026-11-29 v1 answers 410 except on the three paths listed above. The "Both dates ship blank" line under Implications describes the state when this ADR was accepted.

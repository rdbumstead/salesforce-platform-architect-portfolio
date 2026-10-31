<h1 id="portfolio-process-api-papi-">Portfolio Process API (PAPI) v2.2.0</h1>

> Scroll down for code samples, example requests and responses. Select a language for code samples from the tabs above or the mobile navigation menu.

**Version 2**, selected with `X-API-Version: v2`, returns public keys only. Version 1 is documented in `portfolio-papi.yaml` and is deprecated (section 2).

A Process API (PAPI) that combines, transforms and filters the portfolio's Salesforce data,
the same records the System API (SAPI) serves, into responses shaped for a client. PAPI
reads them in process, not through SAPI over HTTP (section 3).

### 1. Authentication Strategy
- **Callers → PAPI**: OAuth 2.0 **Client Credentials** issued by the Portfolio API External Client App; `Authorization: Bearer <token>` on every request (ADR-027). The platform rejects unauthenticated calls before Apex executes.
- **Site (API Lab)**: `c-api-tester` calls an Apex proxy that obtains its token through the `Portfolio_API` Named Credential; no secret reaches the browser.
- **External evaluators**: `POST /auth/token` vends a short-lived token (ADR-028). It is the only unauthenticated path, and the only path served on the Experience Cloud site domain (see its `servers` entry). Every other path is called on My Domain with the Bearer token.
- **PAPI → SAPI**: in-process Apex in the same transaction, not HTTP. See section 3 and ADR-025 for why fan out callouts were rejected.

### 2. Versioning Strategy
- **Pattern**: Header-based versioning takes precedence.
- **Header**: `X-API-Version: v2`. A missing header resolves to `v1`, which is deprecated; any other value returns `400 BAD_REQUEST` that says to send v1 or v2 (ADR-026). The URL has no version segment. The old URLs with `/v1/` (for example `/papi/v1/projects`) are aliases of the same calls and answer the same way, with `Deprecation`, `Sunset` and a `Link` header with `rel="canonical"` once their retirement dates are set (ADR-040). Use the URLs in this document.
- **Version 1 sunset**: every version 1 response carries `Deprecation` and `Link` headers, and `Sunset` once the sunset date is set, 30 days after version 2 reaches production. After the sunset date version 1 answers `410 Gone` with a message that gives the retirement date and says to send `X-API-Version: v2`, and the `help` field links to the entry in the Errors section.
- **Correlation**: a missing `X-Request-Id` is replaced by a generated UUID, and a present but non-UUID value returns `400 BAD_REQUEST`. On My Domain the platform injects its own 32-character hex id when the caller sends none, and PAPI treats that value as missing. Both headers are on every response (`ApiRequestContext.applyRequestRules`): the platform echoes whatever `X-Request-Id` the request carries, its own included, and Apex sets the header only when it generated the value and the request carried none, so the header appears once (ADR-026). When the platform injected its id, the header carries that id and an error body's `correlationId` carries the generated UUID. Send your own UUID to get one predictable id.
- **URL**: Version segments removed from base path to align with SAPI ADR.

### 3. Rate Limiting & Aggregation Math
- **SAPI Limit**: 120 requests/minute.
- **PAPI work per request**: PAPI never calls SAPI over HTTP. It reads the same records in process, in the same Apex transaction, through `QueryDefinitions` (ADR-033). One `/profile/full` request runs nine reads (owner, roles, highlights, skills, role skills, projects, certifications, education, testimonials) and builds one response.
- **PAPI Limit**: **15 requests/minute** (Standard Tier) against SAPI's 120. One PAPI request runs about eight data reads in one transaction, the same records about eight SAPI requests would return. Eight data reads are not eight HTTP requests, but the lower limit keeps one caller's PAPI load in step with what the same data costs through SAPI (ADR-025).
- **Why not HTTP** (ADR-025): making the reads HTTP requests to SAPI was rejected. The site's API Lab reaches PAPI through the `Portfolio_API` Named Credential, a callout into this same org, and a request that arrived as a same org callout may not call out again (ADR-015), so the fan out would fail on the site's own path. Each SAPI request would also be an inbound REST request counted against the org's daily API request allocation (15,000 on this Developer Edition), the callouts would run one after another inside the 120 second callout time a transaction allows, and they would all run as the one shared evaluator session, spending the SAPI limit every evaluator shares. So PAPI and SAPI stay distinct logical layers: PAPI reads the same records in process, through the query engine (`QueryDefinitions`) and request framework (`ApiRequestContext`) SAPI also uses, with its own query definitions and its own transformer (`PAPITransformer`). The deliberate exception is `/health`, which calls SAPI's `/sapi/health` through `Portfolio_API` to prove the credential works.
- **Enforcement**: `RateWindowLimiter` (ADR-025), one `API_Rate_Window__c` row per caller key per fixed UTC calendar minute. The caller key is `{tier}:{SHA-256 hex of the session id}`, or `{tier}:{user id}` when the session id is null. Tiers: `papi` 15, `papi-ai` (`/ai/*`) 10. Every token from `POST /auth/token` is the same session, so all evaluators share one key per tier and one limit (SAPI 120, PAPI 15, `/ai/*` 10 per minute, ADR-028). `POST /auth/token` is also limited to 15 requests per minute per email and source IP.

### 4. Caching Strategy (Aggregation Logic)
*Note: each section of a PAPI response takes the cache policy its SAPI endpoint sends for the same data (`PAPITransformer`), and the response takes the strictest of its sections.*
- **Rule**: Strictest policy wins.
  1. If *any* section's resource is `no-store` (e.g., Contact) → PAPI response is `no-store`.
  2. If *any* section's resource is `private` → PAPI response is `private`.
  3. Otherwise → PAPI response is `public` with the minimum `max-age`.

### 5. Identifiers (ADR-038)
Each record in a response carries a stable public `key`, for example `prj_8f3k2m9qtz`, and `key` is the only identifier. Version 2 returns no `id` field and no Salesforce Id anywhere. PAPI takes no Id parameters. SAPI takes the key wherever it takes a record, and only the key in version 2.

### 6. Field Mapping (Transformation Layer)
| Object | SAPI Field | PAPI Field | Logic |
| :--- | :--- | :--- | :--- |
| Contact | `name` | `fullName` | Rename |
| Experience | `name` | `role` | Semantic Rename |
| Certification | `earnedDate` | `dateEarned` | JS Convention |
| Project | `dateCompleted` | `completionDate` | JS Convention |
| Project | `heroImageUrl` | `heroImageUrl` | Passthrough |

## Errors

Every error this API sends itself is one JSON object with `httpStatus`, `errorCode`, `message`, `correlationId`, `retryable` and `help`. The `message` says what happened, what you need and how to get it. The `help` field links to the entry for the `errorCode` on this page. Program against `errorCode`, because the wording of a message can improve. `retryable` is true only when the same request can succeed later with no change, and every retryable 503 and 429 carries `Retry-After`. The `correlationId` is the `X-Request-Id` of the call, or the id the API made when you sent none. Quote it when you ask for help.

<a id="error-bad-request"></a>

### BAD_REQUEST (400)
The request was refused before any data was read. The message names the header, parameter or field to change and often shows a working example. It is not retryable, so send a corrected request. Example: `offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.`

<a id="error-unauthorized"></a>

### UNAUTHORIZED (401)
The caller reached the site address with no token. The answer carries `WWW-Authenticate: Bearer` and names the site's token URL: send `POST` to it with a JSON body holding your `email` and a `purpose`, then call the route on the `instance_url` from that answer with `Authorization: Bearer <access_token>`. A token that has ended is different. The platform answers it before our code runs, with a JSON array and the code `INVALID_SESSION_ID` (see Responses from the platform below).

<a id="error-forbidden"></a>

### FORBIDDEN (403)
A token holder asked the instance address for a token. Tokens are issued on the site address only, and the message gives the exact URL. Not retryable. A user with no access to the class behind a route is refused by the platform instead (see Responses from the platform below).

<a id="error-not-found"></a>

### NOT_FOUND (404)
The route does not exist, or the Api_Versionless_Urls switch is off and only the `/v1/` URLs answer. The message names the method and path, or the `/v1/` URL to use. Not retryable.

<a id="error-method-not-allowed"></a>

### METHOD_NOT_ALLOWED (405)
The route does not take that HTTP method. The `Allow` header lists the ones it takes, and the message adds the body to send for the two POST routes.

<a id="error-gone"></a>

### GONE (410)
API v1, or the old `/v1/` URL spelling, was retired on the date in the message. Send `X-API-Version: v2`, or call the same URL without `/v1/`. Nothing else about the request changes. The token and health routes are exempt and keep answering. Not retryable.

<a id="error-rate-limit-exceeded"></a>

### RATE_LIMIT_EXCEEDED (429)
One of three limits. The shared limit for the tier is used up, and the message names the tier and the limit. One email asked for too many tokens in the last minute. Or the counter row stayed locked for a moment, and the message says the API is busy. All three carry `Retry-After`, and all three are retryable after that many seconds with no change to the request.

<a id="error-internal-server-error"></a>

### INTERNAL_SERVER_ERROR (500)
Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is ever sent. Retryable: try again in a minute, and if it keeps happening send the id through the contact page.

<a id="error-service-unavailable"></a>

### SERVICE_UNAVAILABLE (503)
The token route could not issue a token, or the OpenAPI document is missing from the site. When the day's tokens are all issued the message says how many hours until new ones. When the token credential is missing the message says it is a setup problem on our side and gives the correlation id, and the answer is not retryable and has no `Retry-After`. When the token service did not answer, wait a minute. Every retryable 503 carries `Retry-After`.

<a id="error-all-providers-unavailable"></a>

### ALL_PROVIDERS_UNAVAILABLE (503)
`POST /ai/generate` got no text from any AI provider. With `provider` left out, wait five minutes (`Retry-After: 300`). With `provider` set to `Agentforce` and its hourly budget spent, `Retry-After` is the seconds to the end of the hour, and the message says to leave `provider` out to let another provider answer. Retryable.

<a id="error-platform"></a>

### Responses from the platform
Two refusals come from the platform before any of our code runs, so they cannot carry our fields or wording. Each is a JSON array holding objects with `errorCode` and `message`. A token that has ended or was never valid is `401` with `[{"message":"Session expired or invalid","errorCode":"INVALID_SESSION_ID"}]`. A user with no access to the class behind a route is `403` with `[{"errorCode":"FORBIDDEN","message":"You do not have access to the Apex class named: ..."}]`. An ended token is the usual cause of the first: tokens end after 30 minutes without use, and `POST /papi/auth/token` gives a new one.

Base URLs:

* <a href="https://{domain}/services/apexrest/papi">https://{domain}/services/apexrest/papi</a>

    * **domain** - The org's My Domain host. Default: ryan-bumstead-dev-ed.develop.my.salesforce.com

        * ryan-bumstead-dev-ed.develop.my.salesforce.com

Email: <a href="mailto:ryan@ryanbumstead.com">Ryan Bumstead</a> Web: <a href="https://ryanbumstead.com">Ryan Bumstead</a> 
License: <a href="https://opensource.org/licenses/MIT">MIT</a>

# Authentication

- oAuth2 authentication. OAuth 2.0 Client Credentials flow issued by the Portfolio API External Client App (ADR-027).
Tokens run as the read-only integration user. External evaluators obtain a short-lived token
from `POST /auth/token` (ADR-028) instead of holding the consumer secret. Every
evaluator receives the same session, so all evaluators share one rate limit per tier.

    - Flow: clientCredentials

    - Token URL = [https://ryan-bumstead-dev-ed.develop.my.salesforce.com/services/oauth2/token](https://ryan-bumstead-dev-ed.develop.my.salesforce.com/services/oauth2/token)

|Scope|Scope Description|
|---|---|
|api|Access Salesforce REST APIs as the integration user|

<h1 id="portfolio-process-api-papi--default">Default</h1>

## servers__auth_token

> Code samples

```javascript

const headers = {
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/auth/token',
{
  method: 'SERVERS',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

`SERVERS /auth/token`

<h3 id="servers__auth_token-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

<h1 id="portfolio-process-api-papi--orchestration">Orchestration</h1>

Endpoints that combine several reads into one response

## getFullPortfolio

<a id="opIdgetFullPortfolio"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'X-API-Version':'v2',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/profile/full',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

`GET /profile/full`

*Get Complete Portfolio State*

The "Hydration" endpoint. Returns the entire portfolio state in a single call.

**How it is built**: nine reads in process, in one Apex transaction, through `QueryDefinitions`, not SAPI calls over HTTP (see the description's section 3). The reads are the owner, roles, highlights, skills (at most 100), the skills of each role, projects, certifications, education and approved testimonials. Each read returns its records whole, so there is no paging.

**Partial failure**: each section is read on its own. A section that fails comes back empty, the response is still `200 OK`, `X-Data-Integrity` is `partial` and `integrityNote` names the section.

**Caching**: the strictest cache policy of the sections read.

<h3 id="getfullportfolio-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-Request-Id|header|string(uuid)|false|Correlation ID. When missing, or when it is the platform's own 32-character hex id, a generated UUID is used as the correlation id. A present but non-UUID value returns 400 BAD_REQUEST (ADR-026).|
|X-API-Version|header|string|false|API Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|

#### Enumerated Values

|Parameter|Value|
|---|---|
|X-API-Version|v1|
|X-API-Version|v2|

> Example responses

> 200 Response

```json
{
  "config": {
    "linkedInUrl": "https://linkedin.com/in/ryanbumstead",
    "calendlyUrl": "https://example.com/schedule",
    "githubUrl": "https://example.com/source",
    "trailheadUrl": "https://example.com/trailhead",
    "personalWebsiteUrl": "https://ryanbumstead.com",
    "careerObjective": "Driving digital transformation through architecture."
  },
  "contactInfo": {
    "key": "con_7c5j3w9sfa",
    "fullName": "Ryan Bumstead",
    "title": "Platform Architect",
    "linkedIn": "https://linkedin.com/in/ryanbumstead",
    "github": "https://example.com/source",
    "trailhead": "https://example.com/trailhead",
    "portfolioUrl": "https://ryanbumstead.com",
    "bio": "Specializing in API-led connectivity..."
  },
  "summary": "Salesforce Platform Architect with nearly a decade on the platform, focused on higher education",
  "skills": [
    {
      "key": "skl_3m9x5b2rkt",
      "name": "Apex",
      "displayName": "Salesforce Apex",
      "category": "Backend",
      "proficiency": 5,
      "iconName": "utility:code",
      "colorHex": "#0070d2"
    },
    {
      "key": "skl_8d2q6v4nwc",
      "name": "LWC",
      "displayName": "Lightning Web Components",
      "category": "Frontend",
      "proficiency": 5,
      "iconName": "standard:lightning_component",
      "colorHex": "#00A1E0"
    }
  ],
  "experience": [
    {
      "key": "exp_4h7n2c8wpd",
      "employer": "Salesforce",
      "role": "Senior Technical Architect",
      "dateRange": "Jan 2023 - Present",
      "isCurrent": true,
      "isRemote": true,
      "skillsUsed": [
        "Apex",
        "LWC",
        "Event Bus"
      ],
      "highlights": [
        "Designed multi-cloud architectures",
        "Led DevOps transformation"
      ]
    }
  ],
  "projects": [
    {
      "key": "prj_8f3k2m9qtz",
      "title": "Portfolio Site",
      "challenge": "Display skills dynamically",
      "solution": "Built on LWR with SAPI/PAPI architecture",
      "businessValue": "Increased interview rate by 40%",
      "status": "Live – In Production",
      "completionDate": "2025-12-01",
      "heroImageUrl": "https://example.com/images/hero.png",
      "liveUrl": "https://example.com/portfolio",
      "repositoryUrl": "https://example.com/source",
      "technologies": [
        "LWR",
        "Apex"
      ],
      "assets": []
    }
  ],
  "certifications": [
    {
      "key": "crt_6q2v8d4nhz",
      "name": "Certified Application Architect",
      "issuer": "Salesforce",
      "dateEarned": "2024-05-15",
      "skillsUsed": [
        "Security"
      ]
    }
  ],
  "education": [
    {
      "key": "edu_6b4c8j2rvq",
      "school": "Creighton University",
      "degree": "B.S. Computer Science",
      "fieldOfStudy": "Computer Science",
      "year": "2018",
      "gpa": 3.8
    }
  ],
  "testimonials": [
    {
      "key": "tst_2y7a5d9wmh",
      "author": "Jane Doe",
      "title": "VP of Engineering",
      "relationship": "Manager",
      "quote": "Ryan is a beast at architecture.",
      "vibe": "Professional",
      "avatarUrl": "https://example.com/images/avatar.jpg"
    }
  ],
  "integrityNote": "complete"
}
```

> The request was refused before any data was read. The message names the header, parameter or field to change.

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-API-Version must be v1 or v2. Send X-API-Version: v2 for the current version.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "mode must be professional or casual.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send a JSON object with two text fields, email and purpose, for example {\"email\":\"you@example.com\",\"purpose\":\"Evaluating the API\"}.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Enter a working email address like name@example.com. It is only used to count tokens.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "type must be one of BioSummary, CoverLetter, SkillDescription.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /papi/projects on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-unauthorized"
}
```

```json
[
  {
    "errorCode": "INVALID_SESSION_ID",
    "message": "Session expired or invalid"
  }
]
```

> The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.

```json
{
  "httpStatus": 403,
  "errorCode": "FORBIDDEN",
  "message": "This address does not issue tokens. Send POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token without an Authorization header to get one.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-forbidden"
}
```

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: PAPIProjects"
  }
]
```

> The route does not exist.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /papi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/papi/v1/projects.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

> The route does not take this HTTP method. The Allow header lists the methods it does take.

```json
{
  "httpStatus": 405,
  "errorCode": "METHOD_NOT_ALLOWED",
  "message": "/papi/projects takes GET or HEAD, not POST.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-method-not-allowed"
}
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/papi/projects instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 15 requests a minute on PAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "Too many token requests for this email in the last minute. Wait 42 seconds and try again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

> Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Something went wrong on our side, and it has been logged as 123e4567-e89b-12d3-a456-426614174000. Try again in a minute. If it keeps happening, send that id through ryanbumstead.com/contact.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-internal-server-error"
}
```

<h3 id="getfullportfolio-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|The complete portfolio payload|[FullPortfolioPayload](#schemafullportfoliopayload)|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.|Inline|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|The route does not take this HTTP method. The Allow header lists the methods it does take.|[Error](#schemaerror)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getfullportfolio-responseschema">Response Schema</h3>

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|Cache-Control|string||The strictest policy of the sections read. The contact section makes it no-store.|
|200|X-Data-Integrity|string||Indicates if the payload is complete or has partial missing data.|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|404|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getProfileSummary

<a id="opIdgetProfileSummary"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'X-API-Version':'v2',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/profile/summary',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

`GET /profile/summary`

*Get Employment Profile Only*

Reads the owner, roles, skills, certifications and education in process, in one
Apex transaction, and attaches each role's skills to it. The same records SAPI's
`/contacts`, `/experience`, `/experience-skills`, `/skills`, `/certifications`
and `/education` serve, without calling them over HTTP.

**Use Case**: Resume page, profile cards

**Caching**: Cache-Control is fixed at `max-age=300, private` by decision, an explicit exception to
strictest-policy-wins.

<h3 id="getprofilesummary-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-Request-Id|header|string(uuid)|false|Correlation ID. When missing, or when it is the platform's own 32-character hex id, a generated UUID is used as the correlation id. A present but non-UUID value returns 400 BAD_REQUEST (ADR-026).|
|X-API-Version|header|string|false|API Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|

#### Enumerated Values

|Parameter|Value|
|---|---|
|X-API-Version|v1|
|X-API-Version|v2|

> Example responses

> 200 Response

```json
{
  "contactInfo": {
    "key": "con_7c5j3w9sfa",
    "fullName": "Ryan Bumstead",
    "title": "Platform Architect",
    "linkedIn": "https://linkedin.com/in/ryanbumstead",
    "github": "https://example.com/source",
    "trailhead": "https://example.com/trailhead",
    "portfolioUrl": "https://ryanbumstead.com",
    "bio": "Specializing in API-led connectivity..."
  },
  "summary": "Salesforce Platform Architect with nearly a decade on the platform, focused on higher education",
  "skills": [
    {
      "key": "skl_3m9x5b2rkt",
      "name": "Apex",
      "displayName": "Salesforce Apex",
      "category": "Backend",
      "proficiency": 5,
      "iconName": "utility:code",
      "colorHex": "#0070d2",
      "categoryOrder": 10
    }
  ],
  "experience": [
    {
      "key": "exp_4h7n2c8wpd",
      "employer": "Salesforce",
      "role": "Senior Technical Architect",
      "dateRange": "Jan 2023 - Present",
      "isCurrent": true,
      "isRemote": true,
      "skillsUsed": [
        "LWC"
      ],
      "highlights": [
        "Implemented CI/CD pipelines using GitHub Actions"
      ]
    }
  ],
  "certifications": [
    {
      "key": "crt_6q2v8d4nhz",
      "name": "Certified Application Architect",
      "issuer": "Salesforce",
      "dateEarned": "2024-05-15",
      "skillsUsed": [
        "Security"
      ]
    }
  ],
  "education": [
    {
      "key": "edu_6b4c8j2rvq",
      "school": "Creighton University",
      "degree": "B.S. Computer Science",
      "fieldOfStudy": "Computer Science",
      "year": "2018",
      "gpa": 3.8
    }
  ],
  "integrityNote": "complete"
}
```

> The request was refused before any data was read. The message names the header, parameter or field to change.

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-API-Version must be v1 or v2. Send X-API-Version: v2 for the current version.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "mode must be professional or casual.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send a JSON object with two text fields, email and purpose, for example {\"email\":\"you@example.com\",\"purpose\":\"Evaluating the API\"}.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Enter a working email address like name@example.com. It is only used to count tokens.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "type must be one of BioSummary, CoverLetter, SkillDescription.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /papi/projects on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-unauthorized"
}
```

```json
[
  {
    "errorCode": "INVALID_SESSION_ID",
    "message": "Session expired or invalid"
  }
]
```

> The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.

```json
{
  "httpStatus": 403,
  "errorCode": "FORBIDDEN",
  "message": "This address does not issue tokens. Send POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token without an Authorization header to get one.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-forbidden"
}
```

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: PAPIProjects"
  }
]
```

> The route does not exist.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /papi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/papi/v1/projects.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

> The route does not take this HTTP method. The Allow header lists the methods it does take.

```json
{
  "httpStatus": 405,
  "errorCode": "METHOD_NOT_ALLOWED",
  "message": "/papi/projects takes GET or HEAD, not POST.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-method-not-allowed"
}
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/papi/projects instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 15 requests a minute on PAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "Too many token requests for this email in the last minute. Wait 42 seconds and try again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

> Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Something went wrong on our side, and it has been logged as 123e4567-e89b-12d3-a456-426614174000. Try again in a minute. If it keeps happening, send that id through ryanbumstead.com/contact.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-internal-server-error"
}
```

<h3 id="getprofilesummary-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|A unified profile object|[ProfileSummary](#schemaprofilesummary)|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.|Inline|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|The route does not take this HTTP method. The Allow header lists the methods it does take.|[Error](#schemaerror)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getprofilesummary-responseschema">Response Schema</h3>

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|X-Data-Integrity|string||none|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|404|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getFeaturedProjects

<a id="opIdgetFeaturedProjects"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'X-API-Version':'v2',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/projects/featured',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

`GET /projects/featured`

*Get Featured Projects (Enriched)*

Retrieves projects marked as 'Featured' with nested Skills and Assets.

**Reads**, in process in one Apex transaction: the featured projects, then their skills
and their assets, each in one query for every project at once.

**Use Case**: Home page project showcase, portfolio gallery

<h3 id="getfeaturedprojects-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-Request-Id|header|string(uuid)|false|Correlation ID. When missing, or when it is the platform's own 32-character hex id, a generated UUID is used as the correlation id. A present but non-UUID value returns 400 BAD_REQUEST (ADR-026).|
|X-API-Version|header|string|false|API Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|

#### Enumerated Values

|Parameter|Value|
|---|---|
|X-API-Version|v1|
|X-API-Version|v2|

> Example responses

> 200 Response

```json
[
  {
    "key": "prj_8f3k2m9qtz",
    "title": "Portfolio Site",
    "challenge": "Display skills dynamically to recruiters",
    "solution": "Built on LWR with SAPI/PAPI architecture",
    "businessValue": "Increased interview rate by 40%",
    "status": "Live – In Production",
    "completionDate": "2025-12-01",
    "heroImageUrl": "https://example.com/images/hero.png",
    "liveUrl": "https://example.com/portfolio",
    "repositoryUrl": "https://example.com/source",
    "technologies": [
      "Apex"
    ],
    "pillarLabel": "Pillar A: Business Architecture",
    "assets": [
      {
        "type": "Image",
        "url": "https://example.com/images/diagram.png",
        "caption": "System Architecture Diagram"
      }
    ]
  }
]
```

> The request was refused before any data was read. The message names the header, parameter or field to change.

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-API-Version must be v1 or v2. Send X-API-Version: v2 for the current version.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "mode must be professional or casual.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send a JSON object with two text fields, email and purpose, for example {\"email\":\"you@example.com\",\"purpose\":\"Evaluating the API\"}.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Enter a working email address like name@example.com. It is only used to count tokens.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "type must be one of BioSummary, CoverLetter, SkillDescription.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /papi/projects on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-unauthorized"
}
```

```json
[
  {
    "errorCode": "INVALID_SESSION_ID",
    "message": "Session expired or invalid"
  }
]
```

> The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.

```json
{
  "httpStatus": 403,
  "errorCode": "FORBIDDEN",
  "message": "This address does not issue tokens. Send POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token without an Authorization header to get one.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-forbidden"
}
```

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: PAPIProjects"
  }
]
```

> The route does not exist.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /papi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/papi/v1/projects.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

> The route does not take this HTTP method. The Allow header lists the methods it does take.

```json
{
  "httpStatus": 405,
  "errorCode": "METHOD_NOT_ALLOWED",
  "message": "/papi/projects takes GET or HEAD, not POST.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-method-not-allowed"
}
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/papi/projects instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 15 requests a minute on PAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "Too many token requests for this email in the last minute. Wait 42 seconds and try again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

> Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Something went wrong on our side, and it has been logged as 123e4567-e89b-12d3-a456-426614174000. Try again in a minute. If it keeps happening, send that id through ryanbumstead.com/contact.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-internal-server-error"
}
```

<h3 id="getfeaturedprojects-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|A list of enriched project records|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.|Inline|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|The route does not take this HTTP method. The Allow header lists the methods it does take.|[Error](#schemaerror)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getfeaturedprojects-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[EnrichedProject](#schemaenrichedproject)]|false|none|[Project enriched with Skills and Assets]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» title|string¦null|false|none|none|
|» challenge|string|false|none|none|
|» solution|string|false|none|none|
|» businessValue|string|false|none|none|
|» status|string¦null|false|none|Project Status (e.g., Live, Archived)|
|» completionDate|string(date)¦null|false|none|Mapped from SAPI dateCompleted|
|» heroImageUrl|string(uri)|false|none|URL of the main display image. Matches SAPI field name.|
|» liveUrl|string(uri)|false|none|none|
|» repositoryUrl|string(uri)|false|none|none|
|» technologies|[string]|false|none|Skill names from ProjectSkill junction|
|» pillarLabel|string¦null|false|none|The strategic pillar and pillar description (e.g. Pillar A: Business Architecture)|
|» assets|[object]|false|none|Images, videos, or links related to the project|
|»» type|string|true|none|none|
|»» url|string(uri)|true|none|none|
|»» caption|string|false|none|none|

#### Enumerated Values

|Property|Value|
|---|---|
|type|Image|
|type|Video|
|type|Document|
|type|Link|

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|X-Total-Count|integer||none|
|200|X-Data-Integrity|string||none|
|200|X-Integrity-Note|string||Present only when partial; names the failed sub-queries in a sentence, for example "Some sections could not be read this time: project-skills. Everything else is complete. Try again in a minute for the full result."|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|404|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

<h1 id="portfolio-process-api-papi--transformation">Transformation</h1>

Endpoints that transform SAPI data into new formats

## generateResume

<a id="opIdgenerateResume"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'X-API-Version':'v2',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/resume/generate',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

`GET /resume/generate`

*Generate Plain Text Resume*

Generates an ATS-optimized plain text resume. 

**Reads**, in process in one Apex transaction: the owner, roles, highlights (by persona),
skills, certifications and education. The same records SAPI serves, without calling it.

**Transformation Logic**:
- Formats dates as "MMM YYYY - MMM YYYY" or "MMM YYYY - Present"
- Lists the skills linked to the printed roles, each once, grouped by category in category order and strongest first within a category
- Prints up to 10 roles, current first
- Prints at most 5 highlights per role, in sort order, as stored

**Persona Filtering**:
- `Admin`: System Admin highlights only
- `Developer`: Development highlights only
- `Architect`: Architecture/Design highlights only
- Skills follow the same persona: a skill prints when its persona tags include the persona, and a skill with no persona tag prints under every persona. With no persona, every linked skill prints. The site's resume page uses the same rule.

**Persona values**:
- `Admin`, `Developer` or `Architect`. Any other value returns 400 BAD_REQUEST.
- If persona is omitted, all highlights are returned (no filtering)

**Response format**:
- When the first media type in the `Accept` header is `text/plain`, a 200 answer is the generated text alone, with `Content-Type: text/plain; charset=UTF-8`. Parameters after a semicolon are ignored and the header name matches in any case.
- With no `Accept` header, `*/*`, `application/json` or any other first type, the answer is the JSON object below.
- Every other response header, the rate count and the cache directive are the same in both forms. Errors are always JSON, whatever `Accept` says.

For example, with your token in TOKEN and the instance URL in INSTANCE_URL:

```bash
curl -H "Authorization: Bearer $TOKEN" -H "Accept: text/plain" "$INSTANCE_URL/services/apexrest/papi/resume/generate?persona=Architect"
```

<h3 id="generateresume-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-Request-Id|header|string(uuid)|false|Correlation ID. When missing, or when it is the platform's own 32-character hex id, a generated UUID is used as the correlation id. A present but non-UUID value returns 400 BAD_REQUEST (ADR-026).|
|X-API-Version|header|string|false|API Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|persona|query|string|false|Target audience for the resume. Omit for all highlights and all skills. With a persona, skills tagged for it and every untagged skill are kept.|

#### Detailed descriptions

**persona**: Target audience for the resume. Omit for all highlights and all skills. With a persona, skills tagged for it and every untagged skill are kept.

**Note**: Highlights are filtered by their persona tag in process.

#### Enumerated Values

|Parameter|Value|
|---|---|
|X-API-Version|v1|
|X-API-Version|v2|
|persona|Admin|
|persona|Developer|
|persona|Architect|

> Example responses

> 200 Response

```json
{
  "integrityNote": "complete",
  "generatedText": "Ryan Bumstead\nSalesforce Platform Architect\n\nEXPERIENCE\n\nSalesforce | Senior Technical Architect\nJan 2023 - Present\n- Designed multi-cloud solutions...\n- Led DevOps transformation...\n",
  "persona": "Architect",
  "generatedAt": "2019-08-24T14:15:22Z"
}
```

```
"Ryan Bumstead Salesforce Platform Architect\nEXPERIENCE\nSalesforce | Senior Technical Architect Jan 2023 - Present - Designed multi-cloud solutions... - Led DevOps transformation..."
```

> The request was refused before any data was read. The message names the header, parameter or field to change.

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-API-Version must be v1 or v2. Send X-API-Version: v2 for the current version.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "mode must be professional or casual.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send a JSON object with two text fields, email and purpose, for example {\"email\":\"you@example.com\",\"purpose\":\"Evaluating the API\"}.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Enter a working email address like name@example.com. It is only used to count tokens.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "type must be one of BioSummary, CoverLetter, SkillDescription.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /papi/projects on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-unauthorized"
}
```

```json
[
  {
    "errorCode": "INVALID_SESSION_ID",
    "message": "Session expired or invalid"
  }
]
```

> The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.

```json
{
  "httpStatus": 403,
  "errorCode": "FORBIDDEN",
  "message": "This address does not issue tokens. Send POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token without an Authorization header to get one.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-forbidden"
}
```

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: PAPIProjects"
  }
]
```

> The route does not exist.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /papi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/papi/v1/projects.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

> The route does not take this HTTP method. The Allow header lists the methods it does take.

```json
{
  "httpStatus": 405,
  "errorCode": "METHOD_NOT_ALLOWED",
  "message": "/papi/projects takes GET or HEAD, not POST.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-method-not-allowed"
}
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/papi/projects instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 15 requests a minute on PAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "Too many token requests for this email in the last minute. Wait 42 seconds and try again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

> Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Something went wrong on our side, and it has been logged as 123e4567-e89b-12d3-a456-426614174000. Try again in a minute. If it keeps happening, send that id through ryanbumstead.com/contact.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-internal-server-error"
}
```

<h3 id="generateresume-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|The formatted resume text, as a JSON object by default, or as plain text when the first media type in `Accept` is `text/plain`|string|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.|Inline|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|The route does not take this HTTP method. The Allow header lists the methods it does take.|[Error](#schemaerror)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="generateresume-responseschema">Response Schema</h3>

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|X-Data-Integrity|string||none|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|404|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

<h1 id="portfolio-process-api-papi--logic">Logic</h1>

Endpoints that apply business rules and filtering

## getTestimonialFeed

<a id="opIdgetTestimonialFeed"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'X-API-Version':'v2',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/testimonials/feed',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

`GET /testimonials/feed`

*Get Curated Testimonials*

Retrieves testimonials with "Vibe Control" logic applied.

**Reads**, in process: approved testimonials only (`Approved__c = true`), at most 200.

**Filtering Logic**:
- `professional`: Filters result set to only include records where `relationship` IN ('Manager', 'Client', 'Peer') AND `vibe` = 'Professional'.
- `casual`: Returns all approved testimonials, regardless of relationship type or vibe (includes 'Casual' vibe and 'Fan' relationships).

**Use Case**: About page testimonials section

`mode` is matched case-insensitively (the VibeMode values `Professional` and `Casual` are accepted);
any other value returns 400 BAD_REQUEST. Ordered by sort order, then newest first; at most 200.

<h3 id="gettestimonialfeed-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-Request-Id|header|string(uuid)|false|Correlation ID. When missing, or when it is the platform's own 32-character hex id, a generated UUID is used as the correlation id. A present but non-UUID value returns 400 BAD_REQUEST (ADR-026).|
|X-API-Version|header|string|false|API Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|mode|query|string|false|Filter testimonials by vibe|

#### Enumerated Values

|Parameter|Value|
|---|---|
|X-API-Version|v1|
|X-API-Version|v2|
|mode|professional|
|mode|casual|

> Example responses

> 200 Response

```json
[
  {
    "key": "tst_2y7a5d9wmh",
    "author": "Jane Doe",
    "title": "VP of Engineering",
    "relationship": "Manager",
    "quote": "Ryan is a beast at architecture",
    "vibe": "Professional",
    "avatarUrl": "https://example.com/images/avatar.jpg"
  }
]
```

> The request was refused before any data was read. The message names the header, parameter or field to change.

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-API-Version must be v1 or v2. Send X-API-Version: v2 for the current version.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "mode must be professional or casual.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send a JSON object with two text fields, email and purpose, for example {\"email\":\"you@example.com\",\"purpose\":\"Evaluating the API\"}.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Enter a working email address like name@example.com. It is only used to count tokens.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "type must be one of BioSummary, CoverLetter, SkillDescription.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /papi/projects on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-unauthorized"
}
```

```json
[
  {
    "errorCode": "INVALID_SESSION_ID",
    "message": "Session expired or invalid"
  }
]
```

> The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.

```json
{
  "httpStatus": 403,
  "errorCode": "FORBIDDEN",
  "message": "This address does not issue tokens. Send POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token without an Authorization header to get one.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-forbidden"
}
```

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: PAPIProjects"
  }
]
```

> The route does not exist.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /papi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/papi/v1/projects.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

> The route does not take this HTTP method. The Allow header lists the methods it does take.

```json
{
  "httpStatus": 405,
  "errorCode": "METHOD_NOT_ALLOWED",
  "message": "/papi/projects takes GET or HEAD, not POST.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-method-not-allowed"
}
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/papi/projects instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 15 requests a minute on PAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "Too many token requests for this email in the last minute. Wait 42 seconds and try again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

> Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Something went wrong on our side, and it has been logged as 123e4567-e89b-12d3-a456-426614174000. Try again in a minute. If it keeps happening, send that id through ryanbumstead.com/contact.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-internal-server-error"
}
```

<h3 id="gettestimonialfeed-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|A filtered list of testimonials|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.|Inline|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|The route does not take this HTTP method. The Allow header lists the methods it does take.|[Error](#schemaerror)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="gettestimonialfeed-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[EnrichedTestimonial](#schemaenrichedtestimonial)]|false|none|none|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» author|string|true|none|none|
|» title|string|false|none|none|
|» relationship|string|false|none|none|
|» quote|string|true|none|none|
|» vibe|string|false|none|none|
|» avatarUrl|string(uri)|false|none|none|

#### Enumerated Values

|Property|Value|
|---|---|
|relationship|Manager|
|relationship|Peer|
|relationship|Client|
|relationship|Recruiter|
|relationship|Fan|
|vibe|Professional|
|vibe|Casual|

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|X-Total-Count|integer||none|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|404|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## generateAiContent

<a id="opIdgenerateAiContent"></a>

> Code samples

```javascript
const inputBody = '{
  "type": "CoverLetter",
  "context": {
    "jobDescription": "We are seeking a Senior Salesforce Architect...",
    "companyName": "Acme Corp",
    "role": "Senior Technical Architect",
    "skills": [
      "Apex",
      "LWC",
      "Integration Architecture"
    ],
    "experienceSummary": "Nearly a decade on the Salesforce platform"
  },
  "tone": "Professional",
  "maxLength": 500,
  "provider": "Agentforce"
}';
const headers = {
  'Content-Type':'application/json',
  'Accept':'application/json',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'X-API-Version':'v2',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/ai/generate',
{
  method: 'POST',
  body: inputBody,
  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

`POST /ai/generate`

*Generate AI Content*

Generates content through `PAPIAiGenerate.generate`, which calls the one provider chain,
`ContentGenerationController.dispatch`.

**Provider chain**:
1. Agentforce, only when its switch (`AI_Provider_Config__mdt` record `Agentforce`) is on.
   It ships on and runs a Prompt Builder template as the caller. It has a 20 second
   timeout and an hourly budget (`Hourly_Budget__c`, 120 calls per UTC hour). Past the
   budget its attempt is `budget_exhausted` and the chain moves on.
2. Gemini 2.5 Flash (`gemini-2.5-flash`, the model set on the `Gemini` record) through the Gemini API (`Gemini_API` Named Credential),
   with a 60 second timeout. The code default model is `gemma-4-31b-it`, used only when the
   record names none.
3. Local template (`Local`), CoverLetter only.

A CoverLetter prompt also carries facts from featured projects and experience highlights,
chosen by keywords from `role` and `jobDescription`. No email address, phone number or
owner field is ever included. The site's cover letter page calls this endpoint with
`provider` set to `Agentforce` through the `Portfolio_API` Named Credential, and runs
Gemini and the template in process when it gets no letter, because a request that arrives
as a callout from the same org may not call out again (ADR-015). Outside callers use it
with a Bearer token.

**Asking for Agentforce only**: send `provider` set to `Agentforce`. Only Agentforce is
tried, with no Gemini and no template. A failure is 503 `ALL_PROVIDERS_UNAVAILABLE` with
a message that says Agentforce did not answer, or that its hourly budget is used. Both say to leave
`provider` out to let another provider answer. A CoverLetter asked of Agentforce uses the site's cover letter prompt
and comes back whole unless `maxLength` is sent.

**Rate limit**: 10 requests per minute (ai tier). Upstream, the Gemini API key allowed Gemini 2.5 Flash
5 requests per minute and 20 requests per day when it was read on 2026-10-20, a recorded reading and not a live one. When the Gemini API
refuses or fails, CoverLetter falls back to the local template and the other types answer
503 `ALL_PROVIDERS_UNAVAILABLE`.

**Validation**: `type` and `tone` must be enum values, `provider` only `Agentforce`, `maxLength` an integer 100 to 1000;
CoverLetter requires `context.companyName` and `context.role`. Content longer than `maxLength` is cut.

> Body parameter

```json
{
  "type": "CoverLetter",
  "context": {
    "jobDescription": "We are seeking a Senior Salesforce Architect...",
    "companyName": "Acme Corp",
    "role": "Senior Technical Architect",
    "skills": [
      "Apex",
      "LWC",
      "Integration Architecture"
    ],
    "experienceSummary": "Nearly a decade on the Salesforce platform"
  },
  "tone": "Professional",
  "maxLength": 500,
  "provider": "Agentforce"
}
```

<h3 id="generateaicontent-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-Request-Id|header|string(uuid)|false|Correlation ID. When missing, or when it is the platform's own 32-character hex id, a generated UUID is used as the correlation id. A present but non-UUID value returns 400 BAD_REQUEST (ADR-026).|
|X-API-Version|header|string|false|API Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|body|body|object|true|none|
|» type|body|string|true|The type of content to generate|
|» context|body|object|true|Contextual data for generation|
|»» jobDescription|body|string|false|Full text of job posting (for cover letters)|
|»» companyName|body|string|false|none|
|»» role|body|string|false|none|
|»» skills|body|[string]|false|Skills to emphasize|
|»» experienceSummary|body|string|false|Brief professional summary|
|» tone|body|string|false|Desired tone of generated content|
|» maxLength|body|integer|false|Maximum character count|
|» provider|body|string|false|Optional. When sent, only Agentforce is tried: no Gemini and no template, and a|

#### Detailed descriptions

**» provider**: Optional. When sent, only Agentforce is tried: no Gemini and no template, and a
failure is 503 `ALL_PROVIDERS_UNAVAILABLE`.

#### Enumerated Values

|Parameter|Value|
|---|---|
|X-API-Version|v1|
|X-API-Version|v2|
|» type|CoverLetter|
|» type|BioSummary|
|» type|SkillDescription|
|» tone|Professional|
|» tone|Enthusiastic|
|» tone|Technical|
|» tone|Casual|
|» provider|Agentforce|

> Example responses

> 200 Response

```json
{
  "content": "Dear Hiring Manager,\n\nI am writing to express my strong interest in the Senior Technical Architect position at Acme Financial...\n",
  "provider": "Gemini",
  "model": "gemini-2.5-flash",
  "type": "CoverLetter",
  "tone": "Professional",
  "generatedAt": "2019-08-24T14:15:22Z",
  "fallbackOccurred": false,
  "latencyMs": 1240,
  "attempts": [
    {
      "provider": "Agentforce",
      "outcome": "skipped_off",
      "ms": 0
    },
    {
      "provider": "Gemini",
      "outcome": "served",
      "ms": 1236
    }
  ],
  "promptShown": "Write a cover letter for Ryan Bumstead in a professional tone, no longer than 500 characters."
}
```

> The request was refused before any data was read. The message names the header, parameter or field to change.

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-API-Version must be v1 or v2. Send X-API-Version: v2 for the current version.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "mode must be professional or casual.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send a JSON object with two text fields, email and purpose, for example {\"email\":\"you@example.com\",\"purpose\":\"Evaluating the API\"}.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Enter a working email address like name@example.com. It is only used to count tokens.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "type must be one of BioSummary, CoverLetter, SkillDescription.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /papi/projects on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-unauthorized"
}
```

```json
[
  {
    "errorCode": "INVALID_SESSION_ID",
    "message": "Session expired or invalid"
  }
]
```

> The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.

```json
{
  "httpStatus": 403,
  "errorCode": "FORBIDDEN",
  "message": "This address does not issue tokens. Send POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token without an Authorization header to get one.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-forbidden"
}
```

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: PAPIProjects"
  }
]
```

> The route does not exist.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /papi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/papi/v1/projects.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

> The route does not take this HTTP method. The Allow header lists the methods it does take.

```json
{
  "httpStatus": 405,
  "errorCode": "METHOD_NOT_ALLOWED",
  "message": "/papi/projects takes GET or HEAD, not POST.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-method-not-allowed"
}
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/papi/projects instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 15 requests a minute on PAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "Too many token requests for this email in the last minute. Wait 42 seconds and try again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

> Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Something went wrong on our side, and it has been logged as 123e4567-e89b-12d3-a456-426614174000. Try again in a minute. If it keeps happening, send that id through ryanbumstead.com/contact.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-internal-server-error"
}
```

<h3 id="generateaicontent-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successfully generated content|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.|Inline|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|The route does not take this HTTP method. The Allow header lists the methods it does take.|[Error](#schemaerror)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|
|503|[Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)|No AI provider returned text. Retry-After is 300 seconds when every provider failed, the seconds to the end of the hour when the Agentforce budget is spent, and 60 otherwise.|[Error](#schemaerror)|

<h3 id="generateaicontent-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|» content|string|true|none|The generated text content|
|» provider|string|true|none|Provider that served the request|
|» model|string|false|none|Model identifier (`local-template` when the local template served it)|
|» type|string|false|none|The requested content type, echoed|
|» tone|string|false|none|The applied tone, echoed|
|» generatedAt|string(date-time)|true|none|none|
|» fallbackOccurred|boolean|false|none|True when the local template served the request or an earlier provider failed|
|» latencyMs|integer(int64)|true|none|Time the provider chain took, in milliseconds|
|» attempts|[object]|true|none|Every provider the chain considered, in order, with what happened|
|»» provider|string|true|none|none|
|»» outcome|string|true|none|`served` wrote the content, `skipped_off` was switched off or unavailable,<br>`skipped_open_circuit` was passed over because its circuit breaker is open,<br>`budget_exhausted` is Agentforce past its hourly budget,<br>`failed` threw or returned no usable text.|
|»» ms|integer(int64)|true|none|Time spent on this provider, in milliseconds|
|» promptShown|string¦null|true|none|The prompt sent to the provider that served, as built by Apex, including the<br>portfolio facts for a CoverLetter. Null when the local template served, because<br>it uses no prompt.|

#### Enumerated Values

|Property|Value|
|---|---|
|provider|Agentforce|
|provider|Gemini|
|provider|Local|
|provider|Agentforce|
|provider|Gemini|
|provider|Local|
|outcome|served|
|outcome|skipped_off|
|outcome|skipped_open_circuit|
|outcome|budget_exhausted|
|outcome|failed|

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|X-AI-Provider|string||Which provider served the request|
|200|X-Generation-Time-Ms|integer||Time taken to generate content in milliseconds|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|404|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|Retry-After|integer||Seconds to wait before the same request can succeed.|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

<h1 id="portfolio-process-api-papi--monitoring">Monitoring</h1>

Health checks and observability

## getHealth

<a id="opIdgetHealth"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/health',
{
  method: 'GET',

  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

`GET /health`

*PAPI Health Check*

Deep health check (`PAPIHealth.getHealth`). Reads SAPI health in-process (`SAPIHealth.buildPayload`),
exercises the `Portfolio_API` Named Credential with one GET to `/sapi/health` (`credential` is UP
only on HTTP 200), and reports presence of the `Jira_API`, `GitHub_API` and `Gemini_API` Named
Credentials without calling them. `status` is DOWN when SAPI is down, DEGRADED when the credential is
down or any Named Credential is not CONFIGURED, otherwise UP. Always returns 200.

> Example responses

> 200 Response

```json
{
  "status": "UP",
  "checkType": "DEEP",
  "timestamp": "2019-08-24T14:15:22Z",
  "dependencies": {
    "sapi": "UP",
    "credential": "UP",
    "jira": "CONFIGURED",
    "github": "CONFIGURED",
    "gemini": "CONFIGURED"
  },
  "details": {
    "property1": "string",
    "property2": "string"
  }
}
```

> The request was refused before any data was read. The message names the header, parameter or field to change.

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-API-Version must be v1 or v2. Send X-API-Version: v2 for the current version.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "mode must be professional or casual.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send a JSON object with two text fields, email and purpose, for example {\"email\":\"you@example.com\",\"purpose\":\"Evaluating the API\"}.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Enter a working email address like name@example.com. It is only used to count tokens.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "type must be one of BioSummary, CoverLetter, SkillDescription.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /papi/projects on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-unauthorized"
}
```

```json
[
  {
    "errorCode": "INVALID_SESSION_ID",
    "message": "Session expired or invalid"
  }
]
```

> The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.

```json
{
  "httpStatus": 403,
  "errorCode": "FORBIDDEN",
  "message": "This address does not issue tokens. Send POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token without an Authorization header to get one.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-forbidden"
}
```

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: PAPIProjects"
  }
]
```

> The route does not exist.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /papi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/papi/v1/projects.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

> The route does not take this HTTP method. The Allow header lists the methods it does take.

```json
{
  "httpStatus": 405,
  "errorCode": "METHOD_NOT_ALLOWED",
  "message": "/papi/projects takes GET or HEAD, not POST.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-method-not-allowed"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 15 requests a minute on PAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "Too many token requests for this email in the last minute. Wait 42 seconds and try again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

> Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Something went wrong on our side, and it has been logged as 123e4567-e89b-12d3-a456-426614174000. Try again in a minute. If it keeps happening, send that id through ryanbumstead.com/contact.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-internal-server-error"
}
```

<h3 id="gethealth-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Service is healthy|[HealthStatus](#schemahealthstatus)|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.|Inline|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|The route does not take this HTTP method. The Allow header lists the methods it does take.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="gethealth-responseschema">Response Schema</h3>

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|404|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|Allow|string||The methods the route takes.|
|429|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

<h1 id="portfolio-process-api-papi--access">Access</h1>

Evaluator token vending (ADR-028)

## requestEvaluatorToken

<a id="opIdrequestEvaluatorToken"></a>

> Code samples

```javascript
const inputBody = '{
  "email": "reviewer@example.com",
  "purpose": "Evaluating API contract parity"
}';
const headers = {
  'Content-Type':'application/json',
  'Accept':'application/json',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'X-API-Version':'v2'
};

fetch('https://{domain}/services/apexrest/papi/auth/token',
{
  method: 'POST',
  body: inputBody,
  headers: headers
})
.then(function(res) {
    return res.json();
}).then(function(body) {
    console.log(body);
});

```

`POST /auth/token`

*Request an evaluator access token*

Vends a short-lived OAuth 2.0 Bearer token so external reviewers can call the SAPI and PAPI
without holding the External Client App consumer secret (ADR-028). `PAPIAuthToken.requestToken`
hands the attempt to `TokenExchangeService.requestToken`, which validates it, applies the limits,
then runs the client-credentials exchange server-side through the `Portfolio_API_Token` Named
Credential (`TokenExchangeService.exchangeToken`). Tokens run as the read-only integration user
and end with its session, after 30 minutes without use. While that session is valid, every
exchange returns the same token, so all evaluators share one token and one rate limit per tier
(SAPI 120, PAPI 15, `/ai/*` 10 per minute). The response has no `expires_in`: the token
endpoint reports no expiry, and the session's end depends on use.

- **400 BAD_REQUEST**: the body is not a JSON object of strings; `email` is blank, longer than 254
  characters or not an address; `purpose` is blank or longer than 280 characters; or a header rule
  from `ApiRequestContext` fails.
- **429 RATE_LIMIT_EXCEEDED** with `Retry-After`: the PAPI tier limit (15 per minute per caller
  key), or 15 requests per minute per email and source IP
  (key `papi-token:{SHA-256 hex of lowercase(email)|sourceIp}`). On the email and IP limit,
  `X-RateLimit-Limit` and `X-RateLimit-Remaining` describe that limit.
- **503 SERVICE_UNAVAILABLE**: the daily cap is reached (retryable, and `Retry-After` is the seconds to
  the next midnight in the running user's time zone. The cap counts audit rows with outcome
  `Issued` created today, from `Portfolio_Config__mdt.Token_Daily_Cap__c`, default 50). The
  credential is missing or not granted (not retryable, with no `Retry-After`, because waiting cannot
  fix a setup problem). Or the token endpoint fails (retryable, `Retry-After: 60`).
- Every attempt writes one `API_Access_Request__c` row. Every response is `no-store, no-cache`.

This is the only path served on the Experience Cloud site domain, not on My Domain:
`POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token`.

> Body parameter

```json
{
  "email": "reviewer@example.com",
  "purpose": "Evaluating API contract parity"
}
```

<h3 id="requestevaluatortoken-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-Request-Id|header|string(uuid)|false|Correlation ID. When missing, or when it is the platform's own 32-character hex id, a generated UUID is used as the correlation id. A present but non-UUID value returns 400 BAD_REQUEST (ADR-026).|
|X-API-Version|header|string|false|API Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|body|body|[TokenRequest](#schematokenrequest)|true|none|

#### Enumerated Values

|Parameter|Value|
|---|---|
|X-API-Version|v1|
|X-API-Version|v2|

> Example responses

> 200 Response

```json
{
  "access_token": "string",
  "token_type": "Bearer",
  "instance_url": "https://ryan-bumstead-dev-ed.develop.my.salesforce.com",
  "docs": "https://rdbumstead.github.io/salesforce-platform-architect-portfolio/api/oas/salesforce-sapi"
}
```

> The request was refused before any data was read. The message names the header, parameter or field to change.

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-API-Version must be v1 or v2. Send X-API-Version: v2 for the current version.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "mode must be professional or casual.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send a JSON object with two text fields, email and purpose, for example {\"email\":\"you@example.com\",\"purpose\":\"Evaluating the API\"}.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Enter a working email address like name@example.com. It is only used to count tokens.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "type must be one of BioSummary, CoverLetter, SkillDescription.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}
```

> The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.

```json
{
  "httpStatus": 403,
  "errorCode": "FORBIDDEN",
  "message": "This address does not issue tokens. Send POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token without an Authorization header to get one.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-forbidden"
}
```

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: PAPIProjects"
  }
]
```

> The route does not exist.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /papi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/papi/v1/projects.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-not-found"
}
```

> The route does not take this HTTP method. The Allow header lists the methods it does take.

```json
{
  "httpStatus": 405,
  "errorCode": "METHOD_NOT_ALLOWED",
  "message": "/papi/projects takes GET or HEAD, not POST.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-method-not-allowed"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 15 requests a minute on PAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "Too many token requests for this email in the last minute. Wait 42 seconds and try again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-rate-limit-exceeded"
}
```

> Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Something went wrong on our side, and it has been logged as 123e4567-e89b-12d3-a456-426614174000. Try again in a minute. If it keeps happening, send that id through ryanbumstead.com/contact.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-internal-server-error"
}
```

> POST /auth/token could not issue a token. Retry-After is set when waiting can help. A missing credential is not retryable.

```json
{
  "httpStatus": 503,
  "errorCode": "SERVICE_UNAVAILABLE",
  "message": "Today's 50 evaluator tokens are used up. New tokens are available again in about 5 hours. The API Lab on the site still works meanwhile.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-service-unavailable"
}
```

```json
{
  "httpStatus": 503,
  "errorCode": "SERVICE_UNAVAILABLE",
  "message": "Tokens cannot be issued right now because of a setup problem on our side. The API Lab on the site still works, and this has been logged as 123e4567-e89b-12d3-a456-426614174000.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-service-unavailable"
}
```

```json
{
  "httpStatus": 503,
  "errorCode": "SERVICE_UNAVAILABLE",
  "message": "The token service did not answer. Wait a minute and try again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-service-unavailable"
}
```

<h3 id="requestevaluatortoken-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Token issued|[TokenResponse](#schematokenresponse)|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not use this route. The platform refuses a user with no access to the class that serves it and answers a JSON array. On PAPI, a token holder who asks the instance address for a token gets our error object.|Inline|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|The route does not take this HTTP method. The Allow header lists the methods it does take.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|
|503|[Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)|POST /auth/token could not issue a token. Retry-After is set when waiting can help. A missing credential is not retryable.|[Error](#schemaerror)|

<h3 id="requestevaluatortoken-responseschema">Response Schema</h3>

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|403|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|404|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|405|Allow|string||The methods the route takes.|
|429|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|Retry-After|integer||Seconds to wait before the same request can succeed.|

<aside class="success">
This operation does not require authentication
</aside>

# Schemas

<h2 id="tocS_Error">Error</h2>
<!-- backwards compatibility -->
<a id="schemaerror"></a>
<a id="schema_Error"></a>
<a id="tocSerror"></a>
<a id="tocserror"></a>

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=papi&version=v2#error-bad-request"
}

```

The error object this API sends. The platform sends a JSON array instead for two refusals, see PlatformErrorList.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|httpStatus|integer|true|none|none|
|errorCode|string|true|none|Machine readable code. Program against this, not against the message.|
|message|string|true|none|What happened, what you need and how to get it, in plain sentences.|
|correlationId|string(uuid)|true|none|Matches X-Request-Id, or the id the API made when none was sent.|
|retryable|boolean|true|none|True only when the same request can succeed later with no change by the caller.|
|help|string(uri)|false|none|Link to this error code's entry in the Errors section of the API reference.|

#### Enumerated Values

|Property|Value|
|---|---|
|errorCode|BAD_REQUEST|
|errorCode|UNAUTHORIZED|
|errorCode|FORBIDDEN|
|errorCode|NOT_FOUND|
|errorCode|METHOD_NOT_ALLOWED|
|errorCode|GONE|
|errorCode|RATE_LIMIT_EXCEEDED|
|errorCode|INTERNAL_SERVER_ERROR|
|errorCode|SERVICE_UNAVAILABLE|
|errorCode|ALL_PROVIDERS_UNAVAILABLE|

<h2 id="tocS_PlatformErrorList">PlatformErrorList</h2>
<!-- backwards compatibility -->
<a id="schemaplatformerrorlist"></a>
<a id="schema_PlatformErrorList"></a>
<a id="tocSplatformerrorlist"></a>
<a id="tocsplatformerrorlist"></a>

```json
[
  {
    "errorCode": "INVALID_SESSION_ID",
    "message": "Session expired or invalid"
  }
]

```

What the platform sends for a refusal that happens before our code runs: an ended token (401) or no access to the class (403). Not our error object.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|errorCode|string|true|none|none|
|message|string|true|none|none|

<h2 id="tocS_HealthStatus">HealthStatus</h2>
<!-- backwards compatibility -->
<a id="schemahealthstatus"></a>
<a id="schema_HealthStatus"></a>
<a id="tocShealthstatus"></a>
<a id="tocshealthstatus"></a>

```json
{
  "status": "UP",
  "checkType": "DEEP",
  "timestamp": "2019-08-24T14:15:22Z",
  "dependencies": {
    "sapi": "UP",
    "credential": "UP",
    "jira": "CONFIGURED",
    "github": "CONFIGURED",
    "gemini": "CONFIGURED"
  },
  "details": {
    "property1": "string",
    "property2": "string"
  }
}

```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|status|string|false|none|none|
|checkType|string|false|none|none|
|timestamp|string(date-time)|false|none|none|
|dependencies|object|false|none|none|
|» sapi|string|false|none|none|
|» credential|string|false|none|UP only when a GET through the Portfolio_API Named Credential to /sapi/health returns HTTP 200.|
|» jira|string|false|none|Presence of the Jira_API Named Credential; UNKNOWN when NamedCredential cannot be read.|
|» github|string|false|none|Presence of the GitHub_API Named Credential.|
|» gemini|string|false|none|Presence of the Gemini_API Named Credential.|
|details|object|false|none|Diagnostic per dependency in plain words, for example credential: "answered HTTP 401", "could not connect" or "not set up". No exception type or text is sent.|
|» **additionalProperties**|string|false|none|none|

#### Enumerated Values

|Property|Value|
|---|---|
|status|UP|
|status|DOWN|
|status|DEGRADED|
|checkType|SHALLOW|
|checkType|DEEP|
|sapi|UP|
|sapi|DOWN|
|credential|UP|
|credential|DOWN|
|jira|CONFIGURED|
|jira|MISSING|
|jira|UNKNOWN|
|github|CONFIGURED|
|github|MISSING|
|github|UNKNOWN|
|gemini|CONFIGURED|
|gemini|MISSING|
|gemini|UNKNOWN|

<h2 id="tocS_FullPortfolioPayload">FullPortfolioPayload</h2>
<!-- backwards compatibility -->
<a id="schemafullportfoliopayload"></a>
<a id="schema_FullPortfolioPayload"></a>
<a id="tocSfullportfoliopayload"></a>
<a id="tocsfullportfoliopayload"></a>

```json
{
  "config": {
    "linkedInUrl": "https://linkedin.com/in/ryanbumstead",
    "calendlyUrl": "https://example.com/schedule",
    "githubUrl": "https://example.com/source",
    "trailheadUrl": "https://example.com/trailhead",
    "personalWebsiteUrl": "https://ryanbumstead.com",
    "careerObjective": "Driving digital transformation through architecture.",
    "jiraProjectKey": "SPAP",
    "gitHubRepoPath": "rdbumstead/salesforce-portfolio"
  },
  "contactInfo": {
    "key": "con_7c5j3w9sfa",
    "fullName": "Ryan Bumstead",
    "title": "Platform Architect",
    "linkedIn": "https://linkedin.com/in/ryanbumstead",
    "github": "https://example.com/source",
    "trailhead": "https://example.com/trailhead",
    "portfolioUrl": "https://ryanbumstead.com",
    "bio": "Specializing in API-led connectivity..."
  },
  "summary": "Salesforce Platform Architect with nearly a decade on the platform, focused on higher education",
  "skills": [
    {
      "key": "skl_3m9x5b2rkt",
      "name": "Apex",
      "displayName": "Salesforce Apex",
      "category": "Backend",
      "proficiency": 5,
      "iconName": "utility:code",
      "colorHex": "#0070d2",
      "categoryOrder": 10
    }
  ],
  "experience": [
    {
      "key": "exp_4h7n2c8wpd",
      "employer": "Salesforce",
      "role": "Senior Technical Architect",
      "dateRange": "Jan 2023 - Present",
      "isCurrent": true,
      "isRemote": true,
      "skillsUsed": [
        "LWC"
      ],
      "highlights": [
        "Implemented CI/CD pipelines using GitHub Actions"
      ]
    }
  ],
  "projects": [
    {
      "key": "prj_8f3k2m9qtz",
      "title": "Portfolio Site",
      "challenge": "Display skills dynamically to recruiters",
      "solution": "Built on LWR with SAPI/PAPI architecture",
      "businessValue": "Increased interview rate by 40%",
      "status": "Live – In Production",
      "completionDate": "2025-12-01",
      "heroImageUrl": "https://example.com/images/hero.png",
      "liveUrl": "https://example.com/portfolio",
      "repositoryUrl": "https://example.com/source",
      "technologies": [
        "Apex"
      ],
      "pillarLabel": "Pillar A: Business Architecture",
      "assets": [
        {
          "type": "Image",
          "url": "https://example.com/images/diagram.png",
          "caption": "System Architecture Diagram"
        }
      ]
    }
  ],
  "certifications": [
    {
      "key": "crt_6q2v8d4nhz",
      "name": "Certified Application Architect",
      "issuer": "Salesforce",
      "dateEarned": "2024-05-15",
      "skillsUsed": [
        "Security"
      ]
    }
  ],
  "education": [
    {
      "key": "edu_6b4c8j2rvq",
      "school": "Creighton University",
      "degree": "B.S. Computer Science",
      "fieldOfStudy": "Computer Science",
      "year": "2018",
      "gpa": 3.8
    }
  ],
  "testimonials": [
    {
      "key": "tst_2y7a5d9wmh",
      "author": "Jane Doe",
      "title": "VP of Engineering",
      "relationship": "Manager",
      "quote": "Ryan is a beast at architecture",
      "vibe": "Professional",
      "avatarUrl": "https://example.com/images/avatar.jpg"
    }
  ],
  "integrityNote": "complete"
}

```

The master payload for initial app load

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|config|[PortfolioConfig](#schemaportfolioconfig)|true|none|Public configuration. The owner's email and phone are never returned.|
|contactInfo|[ContactDetail](#schemacontactdetail)|true|none|Simplified contact information for the header. No email or phone is returned.|
|summary|string|false|none|Auto-generated professional summary|
|skills|[[SkillSummary](#schemaskillsummary)]|true|none|[Lightweight skill object for list views]|
|experience|[[EnrichedExperience](#schemaenrichedexperience)]|true|none|[Work Experience enriched with related Skills and Highlights]|
|projects|[[EnrichedProject](#schemaenrichedproject)]|true|none|[Project enriched with Skills and Assets]|
|certifications|[[EnrichedCertification](#schemaenrichedcertification)]|true|none|[Certification with associated skills]|
|education|[[SimpleEducation](#schemasimpleeducation)]|true|none|[Educational background]|
|testimonials|[[EnrichedTestimonial](#schemaenrichedtestimonial)]|true|none|none|
|integrityNote|string|false|none|"complete", or a sentence that names each section that could not be read, for example "Some sections could not be read this time: certifications. Everything else is complete. Try again in a minute for the full result."|

<h2 id="tocS_ProfileSummary">ProfileSummary</h2>
<!-- backwards compatibility -->
<a id="schemaprofilesummary"></a>
<a id="schema_ProfileSummary"></a>
<a id="tocSprofilesummary"></a>
<a id="tocsprofilesummary"></a>

```json
{
  "contactInfo": {
    "key": "con_7c5j3w9sfa",
    "fullName": "Ryan Bumstead",
    "title": "Platform Architect",
    "linkedIn": "https://linkedin.com/in/ryanbumstead",
    "github": "https://example.com/source",
    "trailhead": "https://example.com/trailhead",
    "portfolioUrl": "https://ryanbumstead.com",
    "bio": "Specializing in API-led connectivity..."
  },
  "summary": "Salesforce Platform Architect with nearly a decade on the platform, focused on higher education",
  "skills": [
    {
      "key": "skl_3m9x5b2rkt",
      "name": "Apex",
      "displayName": "Salesforce Apex",
      "category": "Backend",
      "proficiency": 5,
      "iconName": "utility:code",
      "colorHex": "#0070d2",
      "categoryOrder": 10
    }
  ],
  "experience": [
    {
      "key": "exp_4h7n2c8wpd",
      "employer": "Salesforce",
      "role": "Senior Technical Architect",
      "dateRange": "Jan 2023 - Present",
      "isCurrent": true,
      "isRemote": true,
      "skillsUsed": [
        "LWC"
      ],
      "highlights": [
        "Implemented CI/CD pipelines using GitHub Actions"
      ]
    }
  ],
  "certifications": [
    {
      "key": "crt_6q2v8d4nhz",
      "name": "Certified Application Architect",
      "issuer": "Salesforce",
      "dateEarned": "2024-05-15",
      "skillsUsed": [
        "Security"
      ]
    }
  ],
  "education": [
    {
      "key": "edu_6b4c8j2rvq",
      "school": "Creighton University",
      "degree": "B.S. Computer Science",
      "fieldOfStudy": "Computer Science",
      "year": "2018",
      "gpa": 3.8
    }
  ],
  "integrityNote": "complete"
}

```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|contactInfo|[ContactDetail](#schemacontactdetail)|true|none|Simplified contact information for the header. No email or phone is returned.|
|summary|string|false|none|Calculated summary based on experience|
|skills|[[SkillSummary](#schemaskillsummary)]|true|none|[Lightweight skill object for list views]|
|experience|[[EnrichedExperience](#schemaenrichedexperience)]|true|none|[Work Experience enriched with related Skills and Highlights]|
|certifications|[[EnrichedCertification](#schemaenrichedcertification)]|true|none|[Certification with associated skills]|
|education|[[SimpleEducation](#schemasimpleeducation)]|true|none|[Educational background]|
|integrityNote|string|false|none|"complete", or a sentence that names each section that could not be read, for example "Some sections could not be read this time: certifications. Everything else is complete. Try again in a minute for the full result."|

<h2 id="tocS_EnrichedExperience">EnrichedExperience</h2>
<!-- backwards compatibility -->
<a id="schemaenrichedexperience"></a>
<a id="schema_EnrichedExperience"></a>
<a id="tocSenrichedexperience"></a>
<a id="tocsenrichedexperience"></a>

```json
{
  "key": "exp_4h7n2c8wpd",
  "employer": "Salesforce",
  "role": "Senior Technical Architect",
  "dateRange": "Jan 2023 - Present",
  "isCurrent": true,
  "isRemote": true,
  "skillsUsed": [
    "LWC"
  ],
  "highlights": [
    "Implemented CI/CD pipelines using GitHub Actions"
  ]
}

```

Work Experience enriched with related Skills and Highlights

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|employer|string|true|none|none|
|role|string¦null|false|none|none|
|dateRange|string|true|none|Formatted as "MMM YYYY - MMM YYYY" or "MMM YYYY - Present"|
|isCurrent|boolean¦null|false|none|none|
|isRemote|boolean¦null|false|none|none|
|skillsUsed|[string]|false|none|Skills derived from ExperienceSkill junction|
|highlights|[string]|false|none|Selected bullet points (filtered by persona if applicable)|

<h2 id="tocS_EnrichedProject">EnrichedProject</h2>
<!-- backwards compatibility -->
<a id="schemaenrichedproject"></a>
<a id="schema_EnrichedProject"></a>
<a id="tocSenrichedproject"></a>
<a id="tocsenrichedproject"></a>

```json
{
  "key": "prj_8f3k2m9qtz",
  "title": "Portfolio Site",
  "challenge": "Display skills dynamically to recruiters",
  "solution": "Built on LWR with SAPI/PAPI architecture",
  "businessValue": "Increased interview rate by 40%",
  "status": "Live – In Production",
  "completionDate": "2025-12-01",
  "heroImageUrl": "https://example.com/images/hero.png",
  "liveUrl": "https://example.com/portfolio",
  "repositoryUrl": "https://example.com/source",
  "technologies": [
    "Apex"
  ],
  "pillarLabel": "Pillar A: Business Architecture",
  "assets": [
    {
      "type": "Image",
      "url": "https://example.com/images/diagram.png",
      "caption": "System Architecture Diagram"
    }
  ]
}

```

Project enriched with Skills and Assets

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|title|string¦null|false|none|none|
|challenge|string|false|none|none|
|solution|string|false|none|none|
|businessValue|string|false|none|none|
|status|string¦null|false|none|Project Status (e.g., Live, Archived)|
|completionDate|string(date)¦null|false|none|Mapped from SAPI dateCompleted|
|heroImageUrl|string(uri)|false|none|URL of the main display image. Matches SAPI field name.|
|liveUrl|string(uri)|false|none|none|
|repositoryUrl|string(uri)|false|none|none|
|technologies|[string]|false|none|Skill names from ProjectSkill junction|
|pillarLabel|string¦null|false|none|The strategic pillar and pillar description (e.g. Pillar A: Business Architecture)|
|assets|[object]|false|none|Images, videos, or links related to the project|
|» type|string|true|none|none|
|» url|string(uri)|true|none|none|
|» caption|string|false|none|none|

#### Enumerated Values

|Property|Value|
|---|---|
|type|Image|
|type|Video|
|type|Document|
|type|Link|

<h2 id="tocS_EnrichedTestimonial">EnrichedTestimonial</h2>
<!-- backwards compatibility -->
<a id="schemaenrichedtestimonial"></a>
<a id="schema_EnrichedTestimonial"></a>
<a id="tocSenrichedtestimonial"></a>
<a id="tocsenrichedtestimonial"></a>

```json
{
  "key": "tst_2y7a5d9wmh",
  "author": "Jane Doe",
  "title": "VP of Engineering",
  "relationship": "Manager",
  "quote": "Ryan is a beast at architecture",
  "vibe": "Professional",
  "avatarUrl": "https://example.com/images/avatar.jpg"
}

```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|author|string|true|none|none|
|title|string|false|none|none|
|relationship|string|false|none|none|
|quote|string|true|none|none|
|vibe|string|false|none|none|
|avatarUrl|string(uri)|false|none|none|

#### Enumerated Values

|Property|Value|
|---|---|
|relationship|Manager|
|relationship|Peer|
|relationship|Client|
|relationship|Recruiter|
|relationship|Fan|
|vibe|Professional|
|vibe|Casual|

<h2 id="tocS_PortfolioConfig">PortfolioConfig</h2>
<!-- backwards compatibility -->
<a id="schemaportfolioconfig"></a>
<a id="schema_PortfolioConfig"></a>
<a id="tocSportfolioconfig"></a>
<a id="tocsportfolioconfig"></a>

```json
{
  "linkedInUrl": "https://linkedin.com/in/ryanbumstead",
  "calendlyUrl": "https://example.com/schedule",
  "githubUrl": "https://example.com/source",
  "trailheadUrl": "https://example.com/trailhead",
  "personalWebsiteUrl": "https://ryanbumstead.com",
  "careerObjective": "Driving digital transformation through architecture.",
  "jiraProjectKey": "SPAP",
  "gitHubRepoPath": "rdbumstead/salesforce-portfolio"
}

```

Public configuration. The owner's email and phone are never returned.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|linkedInUrl|string(uri)|false|none|none|
|calendlyUrl|string(uri)|false|none|none|
|githubUrl|string(uri)|false|none|none|
|trailheadUrl|string(uri)|false|none|none|
|personalWebsiteUrl|string(uri)|false|none|none|
|careerObjective|string|false|none|Short professional bio/objective|
|jiraProjectKey|string|false|none|Key for Jira integration|
|gitHubRepoPath|string|false|none|GitHub Owner/Repo path|

<h2 id="tocS_ContactDetail">ContactDetail</h2>
<!-- backwards compatibility -->
<a id="schemacontactdetail"></a>
<a id="schema_ContactDetail"></a>
<a id="tocScontactdetail"></a>
<a id="tocscontactdetail"></a>

```json
{
  "key": "con_7c5j3w9sfa",
  "fullName": "Ryan Bumstead",
  "title": "Platform Architect",
  "linkedIn": "https://linkedin.com/in/ryanbumstead",
  "github": "https://example.com/source",
  "trailhead": "https://example.com/trailhead",
  "portfolioUrl": "https://ryanbumstead.com",
  "bio": "Specializing in API-led connectivity..."
}

```

Simplified contact information for the header. No email or phone is returned.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|fullName|string|true|none|none|
|title|string¦null|false|none|none|
|linkedIn|string(uri)|false|none|none|
|github|string(uri)|false|none|none|
|trailhead|string(uri)|false|none|none|
|portfolioUrl|string(uri)|false|none|none|
|bio|string|false|none|The 'Career Objective' from Salesforce|

<h2 id="tocS_SkillSummary">SkillSummary</h2>
<!-- backwards compatibility -->
<a id="schemaskillsummary"></a>
<a id="schema_SkillSummary"></a>
<a id="tocSskillsummary"></a>
<a id="tocsskillsummary"></a>

```json
{
  "key": "skl_3m9x5b2rkt",
  "name": "Apex",
  "displayName": "Salesforce Apex",
  "category": "Backend",
  "proficiency": 5,
  "iconName": "utility:code",
  "colorHex": "#0070d2",
  "categoryOrder": 10
}

```

Lightweight skill object for list views

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|name|string|true|none|none|
|displayName|string|false|none|Prefer this over 'name' for UI rendering if present|
|category|string|true|none|none|
|proficiency|number|true|none|1-5 score|
|iconName|string|false|none|SLDS Icon reference|
|colorHex|string|false|none|Brand color for the category|
|categoryOrder|number|false|none|Order to display the category in the UI|

<h2 id="tocS_EnrichedCertification">EnrichedCertification</h2>
<!-- backwards compatibility -->
<a id="schemaenrichedcertification"></a>
<a id="schema_EnrichedCertification"></a>
<a id="tocSenrichedcertification"></a>
<a id="tocsenrichedcertification"></a>

```json
{
  "key": "crt_6q2v8d4nhz",
  "name": "Certified Application Architect",
  "issuer": "Salesforce",
  "dateEarned": "2024-05-15",
  "skillsUsed": [
    "Security"
  ]
}

```

Certification with associated skills

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|name|string|true|none|none|
|issuer|string|true|none|none|
|dateEarned|string(date)|true|none|none|
|skillsUsed|[string]|false|none|Derived from CertificationSkill junction|

<h2 id="tocS_SimpleEducation">SimpleEducation</h2>
<!-- backwards compatibility -->
<a id="schemasimpleeducation"></a>
<a id="schema_SimpleEducation"></a>
<a id="tocSsimpleeducation"></a>
<a id="tocssimpleeducation"></a>

```json
{
  "key": "edu_6b4c8j2rvq",
  "school": "Creighton University",
  "degree": "B.S. Computer Science",
  "fieldOfStudy": "Computer Science",
  "year": "2018",
  "gpa": 3.8
}

```

Educational background

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|school|string|true|none|none|
|degree|string|true|none|none|
|fieldOfStudy|string|false|none|none|
|year|string|true|none|Graduation Year derived from Graduation Date|
|gpa|number¦null|false|none|none|

<h2 id="tocS_TokenRequest">TokenRequest</h2>
<!-- backwards compatibility -->
<a id="schematokenrequest"></a>
<a id="schema_TokenRequest"></a>
<a id="tocStokenrequest"></a>
<a id="tocstokenrequest"></a>

```json
{
  "email": "reviewer@example.com",
  "purpose": "Evaluating API contract parity"
}

```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|email|string(email)|true|none|none|
|purpose|string|true|none|Free-text reason, stored on the audit record.|

<h2 id="tocS_TokenResponse">TokenResponse</h2>
<!-- backwards compatibility -->
<a id="schematokenresponse"></a>
<a id="schema_TokenResponse"></a>
<a id="tocStokenresponse"></a>
<a id="tocstokenresponse"></a>

```json
{
  "access_token": "string",
  "token_type": "Bearer",
  "instance_url": "https://ryan-bumstead-dev-ed.develop.my.salesforce.com",
  "docs": "https://rdbumstead.github.io/salesforce-platform-architect-portfolio/api/oas/salesforce-sapi"
}

```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|access_token|string|true|none|OAuth 2.0 Bearer token bound to the read-only integration user. It is the integration user's current session, shared by every evaluator, and it ends after 30 minutes without use (the integration profile's idle timeout). The response carries no expires_in, because the token endpoint reports no expiry and a fixed number would be a guess.|
|token_type|string|true|none|none|
|instance_url|string(uri)|true|none|The My Domain root, as returned by the token endpoint. Append `/services/apexrest/sapi/...` or `/services/apexrest/papi/...` and send the token as a Bearer credential.|
|docs|string(uri)|false|none|Link to the rendered API documentation.|

#### Enumerated Values

|Property|Value|
|---|---|
|token_type|Bearer|


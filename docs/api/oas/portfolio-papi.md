<h1 id="portfolio-process-api-papi-">Portfolio Process API (PAPI) v1.4.0</h1>

> Scroll down for code samples, example requests and responses. Select a language for code samples from the tabs above or the mobile navigation menu.

A Process API (PAPI) that combines, transforms and filters the portfolio's Salesforce data,
the same records the System API (SAPI) serves, into responses shaped for a client. PAPI
reads them in process, not through SAPI over HTTP (section 3).

### Deprecation of version 1
**Version 1 is deprecated and has a sunset date.** Use version 2 (`X-API-Version: v2`, documented in `portfolio-papi-v2.yaml`), which returns public keys only. The sunset date is 30 days after version 2 reaches production.
- **Before the sunset date**: every version 1 response carries a `Deprecation` header (RFC 9745), a `Link` header pointing at the version 2 reference, `https://ryanbumstead.com/api-lab/reference?version=v2`, and, once the sunset date is set, a `Sunset` header (RFC 8594) with that date. The body is unchanged.
- **After the sunset date**: every version 1 call returns `410 Gone` in the standard error envelope with `errorCode` `GONE`, a short message and the link to the version 2 reference. No data is returned.

### 1. Authentication Strategy
- **Callers → PAPI**: OAuth 2.0 **Client Credentials** issued by the Portfolio API External Client App; `Authorization: Bearer <token>` on every request (ADR-027). The platform rejects unauthenticated calls before Apex executes.
- **Site (API Lab)**: `c-api-tester` calls an Apex proxy that obtains its token through the `Portfolio_API` Named Credential; no secret reaches the browser.
- **External evaluators**: `POST /auth/token` vends a short-lived token (ADR-028). It is the only unauthenticated path, and the only path served on the Experience Cloud site domain (see its `servers` entry). Every other path is called on My Domain with the Bearer token.
- **PAPI → SAPI**: in-process Apex in the same transaction, not HTTP. See section 3 and ADR-025 for why fan out callouts were rejected.

### 2. Versioning Strategy
- **Pattern**: Header-based versioning takes precedence.
- **Header**: `X-API-Version: v1`. A missing header resolves to `v1`; any other value returns `400 BAD_REQUEST` with message `Unsupported X-API-Version` (ADR-026).
- **Correlation**: a missing `X-Request-Id` is replaced by a generated UUID, and a present but non-UUID value returns `400 BAD_REQUEST`. On My Domain the platform injects its own 32-character hex id when the caller sends none, and PAPI treats that value as missing. Both headers are on every response (`ApiRequestContext.applyRequestRules`): the platform echoes whatever `X-Request-Id` the request carries, its own included, and Apex sets the header only when it generated the value and the request carried none, so the header appears once (ADR-026). When the platform injected its id, the header carries that id and an error body's `correlationId` carries the generated UUID. Send your own UUID to get one predictable id.
- **URL**: Version segments removed from base path to align with SAPI ADR.

### 3. Rate Limiting & Aggregation Math
- **SAPI Limit**: 120 requests/minute.
- **PAPI work per request**: PAPI never calls SAPI over HTTP. It reads the same records in process, in the same Apex transaction, through `QueryDefinitions` (ADR-033). One `/profile/full` request runs nine reads (owner, roles, highlights, skills, role skills, projects, certifications, education, testimonials) and builds one response.
- **PAPI Limit**: **15 requests/minute** (Standard Tier) against SAPI's 120. One PAPI request runs about eight data reads in one transaction, the same records about eight SAPI requests would return. Eight data reads are not eight HTTP requests, but the lower limit keeps one caller's PAPI load in step with what the same data costs through SAPI (ADR-025).
- **Why not HTTP** (ADR-025): making the reads HTTP requests to SAPI was rejected. The site's API Lab reaches PAPI through the `Portfolio_API` Named Credential, a callout into this same org, and a request that arrived as a same org callout may not call out again (ADR-015), so the fan out would fail on the site's own path. Each SAPI request would also be an inbound REST request counted against the org's daily API request allocation (15,000 on this Developer Edition), the callouts would run one after another inside the 120 second callout time a transaction allows, and they would all run as the one shared evaluator session, spending the SAPI limit every evaluator shares. So PAPI and SAPI stay distinct logical layers: PAPI reads the same records in process, through the query engine (`QueryDefinitions`) and request framework (`ApiRequestContext`) SAPI also uses, with its own query definitions and its own transformer (`PAPITransformer`). The deliberate exception is `/health`, which calls SAPI's `/sapi/v1/health` through `Portfolio_API` to prove the credential works.
- **Enforcement**: `RateWindowLimiter` (ADR-025), one `API_Rate_Window__c` row per caller key per fixed UTC calendar minute. The caller key is `{tier}:{SHA-256 hex of the session id}`, or `{tier}:{user id}` when the session id is null. Tiers: `papi` 15, `papi-ai` (`/ai/*`) 10. Every token from `POST /auth/token` is the same session, so all evaluators share one key per tier and one limit (SAPI 120, PAPI 15, `/ai/*` 10 per minute, ADR-028). `POST /auth/token` is also limited to 15 requests per minute per email and source IP.

### 4. Caching Strategy (Aggregation Logic)
*Note: each section of a PAPI response takes the cache policy its SAPI endpoint sends for the same data (`PAPITransformer`), and the response takes the strictest of its sections.*
- **Rule**: Strictest policy wins.
  1. If *any* section's resource is `no-store` (e.g., Contact) → PAPI response is `no-store`.
  2. If *any* section's resource is `private` → PAPI response is `private`.
  3. Otherwise → PAPI response is `public` with the minimum `max-age`.

### 5. Identifiers (ADR-038)
Each record in a response carries a stable public `key`, for example `prj_8f3k2m9qtz`, beside `id`. Use `key`. The `id` field is the Salesforce Id, kept in v1 and **deprecated**. PAPI takes no Id parameters. SAPI takes the key wherever it takes an Id.

### 6. Field Mapping (Transformation Layer)
| Object | SAPI Field | PAPI Field | Logic |
| :--- | :--- | :--- | :--- |
| Contact | `name` | `fullName` | Rename |
| Experience | `name` | `role` | Semantic Rename |
| Certification | `earnedDate` | `dateEarned` | JS Convention |
| Project | `dateCompleted` | `completionDate` | JS Convention |
| Project | `heroImageUrl` | `heroImageUrl` | Passthrough |

Base URLs:

* <a href="https://{domain}/services/apexrest/papi/v1">https://{domain}/services/apexrest/papi/v1</a>

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

fetch('https://{domain}/services/apexrest/papi/v1/auth/token',
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
  'X-API-Version':'v1',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/v1/profile/full',
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
|X-API-Version|header|string|false|API Version. Missing resolves to v1; any other value returns 400 BAD_REQUEST with message 'Unsupported X-API-Version' (ADR-026).|

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
    "id": "0035e00000B2O3DAAV",
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
      "id": "a075e00000B2O3DAAV",
      "name": "Apex",
      "displayName": "Salesforce Apex",
      "category": "Backend",
      "proficiency": 5,
      "iconName": "utility:code",
      "colorHex": "#0070d2"
    },
    {
      "id": "a075e00000B2O3DAAX",
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
      "id": "a025e00000B2O3DAAV",
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
      "id": "a015e00000B2O3DAAV",
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
      "id": "a105e00000B2O3DAAV",
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
      "id": "a115e00000B2O3DAAV",
      "school": "Creighton University",
      "degree": "B.S. Computer Science",
      "fieldOfStudy": "Computer Science",
      "year": "2018",
      "gpa": 3.8
    }
  ],
  "testimonials": [
    {
      "id": "a055e00000B2O3DAAV",
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

> 400 Response

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Invalid persona value.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 401 Response

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "Missing or invalid Bearer token",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Failed to aggregate profile data. Partial SAPI failure.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "details": {
    "failedSapiCalls": [
      {
        "endpoint": "/experience-skills",
        "error": "Connection timeout"
      }
    ]
  }
}
```

> 503 Response

```json
{
  "httpStatus": 503,
  "errorCode": "SERVICE_UNAVAILABLE",
  "message": "Downstream SAPI is currently unavailable",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getfullportfolio-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|The complete portfolio payload|[FullPortfolioPayload](#schemafullportfoliopayload)|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|Invalid request parameters|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|Missing, expired, or invalid Bearer token (rejected by the platform before Apex executes)|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Internal PAPI error or SAPI communication failure|[Error](#schemaerror)|
|503|[Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)|PAPI or downstream SAPI is unavailable|[Error](#schemaerror)|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|Cache-Control|string||The strictest policy of the sections read. The contact section makes it no-store.|
|200|X-Data-Integrity|string||Indicates if the payload is complete or has partial missing data.|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|Retry-After|integer||Seconds until service may be available|

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
  'X-API-Version':'v1',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/v1/profile/summary',
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
|X-API-Version|header|string|false|API Version. Missing resolves to v1; any other value returns 400 BAD_REQUEST with message 'Unsupported X-API-Version' (ADR-026).|

> Example responses

> 200 Response

```json
{
  "contactInfo": {
    "id": "0035e00000B2O3DAAV",
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
      "id": "a075e00000B2O3DAAV",
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
      "id": "a025e00000B2O3DAAV",
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
      "id": "a105e00000B2O3DAAV",
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
      "id": "a115e00000B2O3DAAV",
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

> 400 Response

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Invalid persona value.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 401 Response

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "Missing or invalid Bearer token",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Failed to aggregate profile data. Partial SAPI failure.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "details": {
    "failedSapiCalls": [
      {
        "endpoint": "/experience-skills",
        "error": "Connection timeout"
      }
    ]
  }
}
```

> 503 Response

```json
{
  "httpStatus": 503,
  "errorCode": "SERVICE_UNAVAILABLE",
  "message": "Downstream SAPI is currently unavailable",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getprofilesummary-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|A unified profile object|[ProfileSummary](#schemaprofilesummary)|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|Invalid request parameters|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|Missing, expired, or invalid Bearer token (rejected by the platform before Apex executes)|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Internal PAPI error or SAPI communication failure|[Error](#schemaerror)|
|503|[Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)|PAPI or downstream SAPI is unavailable|[Error](#schemaerror)|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|X-Data-Integrity|string||none|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|Retry-After|integer||Seconds until service may be available|

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
  'X-API-Version':'v1',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/v1/projects/featured',
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
|X-API-Version|header|string|false|API Version. Missing resolves to v1; any other value returns 400 BAD_REQUEST with message 'Unsupported X-API-Version' (ADR-026).|

> Example responses

> 200 Response

```json
[
  {
    "id": "a015e00000B2O3DAAV",
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

> 400 Response

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Invalid persona value.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 401 Response

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "Missing or invalid Bearer token",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Failed to aggregate profile data. Partial SAPI failure.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "details": {
    "failedSapiCalls": [
      {
        "endpoint": "/experience-skills",
        "error": "Connection timeout"
      }
    ]
  }
}
```

> 503 Response

```json
{
  "httpStatus": 503,
  "errorCode": "SERVICE_UNAVAILABLE",
  "message": "Downstream SAPI is currently unavailable",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getfeaturedprojects-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|A list of enriched project records|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|Invalid request parameters|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|Missing, expired, or invalid Bearer token (rejected by the platform before Apex executes)|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Internal PAPI error or SAPI communication failure|[Error](#schemaerror)|
|503|[Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)|PAPI or downstream SAPI is unavailable|[Error](#schemaerror)|

<h3 id="getfeaturedprojects-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[EnrichedProject](#schemaenrichedproject)]|false|none|[Project enriched with Skills and Assets]|
|» id|string|true|none|Deprecated, use key.|
|» key|string|false|read-only|Stable public key of the record. Use it in place of id. It is set once and never changes.|
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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|X-Total-Count|integer||none|
|200|X-Data-Integrity|string||none|
|200|X-Integrity-Note|string||Present only when partial; names the failed sub-queries, e.g. "partial: project-skills unavailable".|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|Retry-After|integer||Seconds until service may be available|

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
  'X-API-Version':'v1',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/v1/resume/generate',
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
curl -H "Authorization: Bearer $TOKEN" -H "Accept: text/plain" "$INSTANCE_URL/services/apexrest/papi/v1/resume/generate?persona=Architect"
```

<h3 id="generateresume-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-Request-Id|header|string(uuid)|false|Correlation ID. When missing, or when it is the platform's own 32-character hex id, a generated UUID is used as the correlation id. A present but non-UUID value returns 400 BAD_REQUEST (ADR-026).|
|X-API-Version|header|string|false|API Version. Missing resolves to v1; any other value returns 400 BAD_REQUEST with message 'Unsupported X-API-Version' (ADR-026).|
|persona|query|string|false|Target audience for the resume. Omit for all highlights and all skills. With a persona, skills tagged for it and every untagged skill are kept.|

#### Detailed descriptions

**persona**: Target audience for the resume. Omit for all highlights and all skills. With a persona, skills tagged for it and every untagged skill are kept.

**Note**: Highlights are filtered by their persona tag in process.

#### Enumerated Values

|Parameter|Value|
|---|---|
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

> 400 Response

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Invalid persona value.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 401 Response

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "Missing or invalid Bearer token",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Failed to aggregate profile data. Partial SAPI failure.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "details": {
    "failedSapiCalls": [
      {
        "endpoint": "/experience-skills",
        "error": "Connection timeout"
      }
    ]
  }
}
```

> 503 Response

```json
{
  "httpStatus": 503,
  "errorCode": "SERVICE_UNAVAILABLE",
  "message": "Downstream SAPI is currently unavailable",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="generateresume-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|The formatted resume text, as a JSON object by default, or as plain text when the first media type in `Accept` is `text/plain`|string|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|Invalid request parameters|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|Missing, expired, or invalid Bearer token (rejected by the platform before Apex executes)|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Internal PAPI error or SAPI communication failure|[Error](#schemaerror)|
|503|[Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)|PAPI or downstream SAPI is unavailable|[Error](#schemaerror)|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|X-Data-Integrity|string||none|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|Retry-After|integer||Seconds until service may be available|

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
  'X-API-Version':'v1',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/v1/testimonials/feed',
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
|X-API-Version|header|string|false|API Version. Missing resolves to v1; any other value returns 400 BAD_REQUEST with message 'Unsupported X-API-Version' (ADR-026).|
|mode|query|string|false|Filter testimonials by vibe|

#### Enumerated Values

|Parameter|Value|
|---|---|
|mode|professional|
|mode|casual|

> Example responses

> 200 Response

```json
[
  {
    "id": "a055e00000B2O3DAAV",
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

> 400 Response

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Invalid persona value.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 401 Response

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "Missing or invalid Bearer token",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Failed to aggregate profile data. Partial SAPI failure.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "details": {
    "failedSapiCalls": [
      {
        "endpoint": "/experience-skills",
        "error": "Connection timeout"
      }
    ]
  }
}
```

> 503 Response

```json
{
  "httpStatus": 503,
  "errorCode": "SERVICE_UNAVAILABLE",
  "message": "Downstream SAPI is currently unavailable",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="gettestimonialfeed-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|A filtered list of testimonials|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|Invalid request parameters|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|Missing, expired, or invalid Bearer token (rejected by the platform before Apex executes)|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Internal PAPI error or SAPI communication failure|[Error](#schemaerror)|
|503|[Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)|PAPI or downstream SAPI is unavailable|[Error](#schemaerror)|

<h3 id="gettestimonialfeed-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[EnrichedTestimonial](#schemaenrichedtestimonial)]|false|none|none|
|» id|string|true|none|Deprecated, use key.|
|» key|string|false|read-only|Stable public key of the record. Use it in place of id. It is set once and never changes.|
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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|X-Total-Count|integer||none|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|Retry-After|integer||Seconds until service may be available|

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
  'X-API-Version':'v1',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/papi/v1/ai/generate',
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
the message "Agentforce currently unavailable", or "Agentforce hourly budget used" when
the budget is spent. A CoverLetter asked of Agentforce uses the site's cover letter prompt
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
|X-API-Version|header|string|false|API Version. Missing resolves to v1; any other value returns 400 BAD_REQUEST with message 'Unsupported X-API-Version' (ADR-026).|
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

> 400 Response

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Invalid persona value.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 401 Response

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "Missing or invalid Bearer token",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 429 Response

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Retry after 60 seconds.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Failed to aggregate profile data. Partial SAPI failure.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "details": {
    "failedSapiCalls": [
      {
        "endpoint": "/experience-skills",
        "error": "Connection timeout"
      }
    ]
  }
}
```

> 503 Response

```json
{
  "httpStatus": 503,
  "errorCode": "ALL_PROVIDERS_UNAVAILABLE",
  "message": "All AI providers currently unavailable",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="generateaicontent-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successfully generated content|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|Invalid request parameters|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|Missing, expired, or invalid Bearer token (rejected by the platform before Apex executes)|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|Rate limit exceeded (ai tier, 10 requests per minute)|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Internal PAPI error or SAPI communication failure|[Error](#schemaerror)|
|503|[Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)|All AI providers unavailable|[Error](#schemaerror)|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|X-AI-Provider|string||Which provider served the request|
|200|X-Generation-Time-Ms|integer||Time taken to generate content in milliseconds|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|401|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|Retry-After|integer||none|
|500|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|

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

fetch('https://{domain}/services/apexrest/papi/v1/health',
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
exercises the `Portfolio_API` Named Credential with one GET to `/sapi/v1/health` (`credential` is UP
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

<h3 id="gethealth-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Service is healthy|[HealthStatus](#schemahealthstatus)|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|Cache-Control|string||none|

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
  'X-API-Version':'v1'
};

fetch('https://{domain}/services/apexrest/papi/v1/auth/token',
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
- **503 SERVICE_UNAVAILABLE** (retryable): the daily cap is reached (`Retry-After` is the seconds to
  the next midnight in the running user's time zone; the cap counts audit rows with outcome
  `Issued` created today, from `Portfolio_Config__mdt.Token_Daily_Cap__c`, default 50); the
  credential is missing or not granted ("Token issuance is not configured."); or the token endpoint
  fails ("Token issuance is temporarily unavailable.").
- Every attempt writes one `API_Access_Request__c` row. Every response is `no-store, no-cache`.

This is the only path served on the Experience Cloud site domain, not on My Domain:
`POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/v1/auth/token`.

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
|X-API-Version|header|string|false|API Version. Missing resolves to v1; any other value returns 400 BAD_REQUEST with message 'Unsupported X-API-Version' (ADR-026).|
|body|body|[TokenRequest](#schematokenrequest)|true|none|

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

> 400 Response

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Invalid persona value.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 429 Response

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Retry after 42 seconds.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

> 503 Response

```json
{
  "httpStatus": 503,
  "errorCode": "SERVICE_UNAVAILABLE",
  "message": "Downstream SAPI is currently unavailable",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="requestevaluatortoken-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Token issued|[TokenResponse](#schematokenresponse)|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|Invalid request parameters|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|Rate limit exceeded (ADR-025, ADR-028)|[Error](#schemaerror)|
|503|[Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)|PAPI or downstream SAPI is unavailable|[Error](#schemaerror)|

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|200|Cache-Control|string||none|
|400|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|429|Retry-After|integer||Seconds left in the current calendar minute, or 1 when the counter row stayed locked past the platform wait.|
|503|X-Request-Id|string|uuid|Correlation ID for distributed tracing. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value.|
|503|Retry-After|integer||Seconds until service may be available|

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
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "An unexpected error occurred",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "details": {}
}

```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|httpStatus|integer|true|none|none|
|errorCode|string|true|none|none|
|message|string|true|none|none|
|correlationId|string(uuid)|true|none|none|
|retryable|boolean|true|none|Indicates if the client should retry the request|
|details|object|false|none|Additional error context (optional)|

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
|» credential|string|false|none|UP only when a GET through the Portfolio_API Named Credential to /sapi/v1/health returns HTTP 200.|
|» jira|string|false|none|Presence of the Jira_API Named Credential; UNKNOWN when NamedCredential cannot be read.|
|» github|string|false|none|Presence of the GitHub_API Named Credential.|
|» gemini|string|false|none|Presence of the Gemini_API Named Credential.|
|details|object|false|none|Diagnostic per dependency, e.g. credential: "HTTP 401" or an exception type name.|
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
    "id": "0035e00000B2O3DAAV",
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
      "id": "a075e00000B2O3DAAV",
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
      "id": "a025e00000B2O3DAAV",
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
      "id": "a015e00000B2O3DAAV",
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
      "id": "a105e00000B2O3DAAV",
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
      "id": "a115e00000B2O3DAAV",
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
      "id": "a055e00000B2O3DAAV",
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
|integrityNote|string|false|none|"complete", or "partial: <sections> unavailable" naming each upstream section that could not be read (e.g. "partial: certifications unavailable").|

<h2 id="tocS_ProfileSummary">ProfileSummary</h2>
<!-- backwards compatibility -->
<a id="schemaprofilesummary"></a>
<a id="schema_ProfileSummary"></a>
<a id="tocSprofilesummary"></a>
<a id="tocsprofilesummary"></a>

```json
{
  "contactInfo": {
    "id": "0035e00000B2O3DAAV",
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
      "id": "a075e00000B2O3DAAV",
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
      "id": "a025e00000B2O3DAAV",
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
      "id": "a105e00000B2O3DAAV",
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
      "id": "a115e00000B2O3DAAV",
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
|integrityNote|string|false|none|"complete", or "partial: <sections> unavailable" naming each upstream section that could not be read (e.g. "partial: certifications unavailable").|

<h2 id="tocS_EnrichedExperience">EnrichedExperience</h2>
<!-- backwards compatibility -->
<a id="schemaenrichedexperience"></a>
<a id="schema_EnrichedExperience"></a>
<a id="tocSenrichedexperience"></a>
<a id="tocsenrichedexperience"></a>

```json
{
  "id": "a025e00000B2O3DAAV",
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
|id|string|true|none|Salesforce Record ID (18-char). Deprecated, use key.|
|key|string|false|read-only|Stable public key of the record. Use it in place of id. It is set once and never changes.|
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
  "id": "a015e00000B2O3DAAV",
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
|id|string|true|none|Deprecated, use key.|
|key|string|false|read-only|Stable public key of the record. Use it in place of id. It is set once and never changes.|
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
  "id": "a055e00000B2O3DAAV",
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
|id|string|true|none|Deprecated, use key.|
|key|string|false|read-only|Stable public key of the record. Use it in place of id. It is set once and never changes.|
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
  "id": "0035e00000B2O3DAAV",
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
|id|string|false|none|Deprecated, use key.|
|key|string|false|read-only|Stable public key of the record. Use it in place of id. It is set once and never changes.|
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
  "id": "a075e00000B2O3DAAV",
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
|id|string|true|none|Deprecated, use key.|
|key|string|false|read-only|Stable public key of the record. Use it in place of id. It is set once and never changes.|
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
  "id": "a105e00000B2O3DAAV",
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
|id|string|true|none|Deprecated, use key.|
|key|string|false|read-only|Stable public key of the record. Use it in place of id. It is set once and never changes.|
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
  "id": "a115e00000B2O3DAAV",
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
|id|string|true|none|Deprecated, use key.|
|key|string|false|read-only|Stable public key of the record. Use it in place of id. It is set once and never changes.|
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
|instance_url|string(uri)|true|none|The My Domain root, as returned by the token endpoint. Append `/services/apexrest/sapi/v1/...` or `/services/apexrest/papi/v1/...` and send the token as a Bearer credential.|
|docs|string(uri)|false|none|Link to the rendered API documentation.|

#### Enumerated Values

|Property|Value|
|---|---|
|token_type|Bearer|


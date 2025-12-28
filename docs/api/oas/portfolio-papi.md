<h1 id="portfolio-process-api-papi-">Portfolio Process API (PAPI) v1.1.0</h1>

> Scroll down for code samples, example requests and responses. Select a language for code samples from the tabs above or the mobile navigation menu.

A Process API (PAPI) responsible for orchestrating, transforming, and filtering data
from the Salesforce System API (SAPI) for consumption by the Portfolio frontend.

### Key Capabilities

- Aggregates disparate SAPI objects into a unified "Employment Profile"
- Generates ATS-friendly plain text resumes based on specific personas
- Applies business logic filtering (e.g., "Vibe Mode") to social proof
- Handles SAPI authentication and error handling transparently

### SAPI Version Compatibility

- **PAPI Version**: 1.1.0
- **Target SAPI Version**: 1.2.0
- **Implementation**: All upstream SAPI calls use the header `X-API-Version: v1`.

### SAPI Integration & Authentication

- **Authentication**: PAPI authenticates to SAPI using OAuth2 Client Credentials (`client_id`, `client_secret`) retrieved securely from **AWS Secrets Manager**.
- **Rotation**: Credentials are rotated every 90 days via automated Lambda functions; PAPI refreshes its local cache automatically.

### Caching Strategy

- **Aggregation Logic**: The PAPI response adopts the **strictest** cache policy of its upstream dependencies.
  - If _any_ SAPI endpoint returns `no-store` or `private`, the entire PAPI response is marked `no-store`.
  - Otherwise, it uses the minimum `max-age` found (e.g., min(300, 120) = 120s).
- **Static Data** (Skills, Config): Baseline 5 minutes.
- **Semi-Static** (Projects): Baseline 2 minutes.
- **Invalidation**: All caches invalidated on SAPI 5xx errors.

### Error Handling & Resilience

- **Graceful Degradation**: If SAPI returns partial data (e.g., Certifications timeout), PAPI returns `200 OK` with an empty array for that section and an `integrityNote`.
- **Circuit Breaker**: After 3 consecutive SAPI failures, PAPI returns cached data only.
- **Pagination**: Implements recursive fetching for SAPI resources exceeding the default page limit (200 records).
- **Tracing**: Correlation IDs (`X-Request-Id`) are propagated to all downstream SAPI calls.

Base URLs:

- <a href="https://api.portfolio.ryanbumstead.com/papi/v1">https://api.portfolio.ryanbumstead.com/papi/v1</a>

Email: <a href="mailto:ryan@ryanbumstead.com">Ryan Bumstead</a> Web: <a href="https://ryanbumstead.com">Ryan Bumstead</a>
License: <a href="https://opensource.org/licenses/MIT">MIT</a>

# Authentication

- API Key (ApiKeyAuth) - Parameter Name: **X-API-Key**, in: header. API Key for authenticating to PAPI.
  PAPI internally manages SAPI credentials (`client_id`, `client_secret`).

<h1 id="portfolio-process-api-papi--orchestration">Orchestration</h1>

Endpoints that aggregate multiple SAPI calls

## getFullPortfolio

<a id="opIdgetFullPortfolio"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  "X-API-Version": "v1",
  "X-API-Key": "API_KEY"
};

fetch("https://api.portfolio.ryanbumstead.com/papi/v1/profile/full", {
  method: "GET",

  headers: headers
})
  .then(function (res) {
    return res.json();
  })
  .then(function (body) {
    console.log(body);
  });
```

`GET /profile/full`

_Get Complete Portfolio State_

The "Hydration" endpoint. Returns the entire portfolio state in a single call.

**Parallel Execution Strategy**:
The following groups are executed in parallel:

1. **Config Group**: `/portfolio-config`, `/contacts`
2. **Work History Group**: `/experience`, `/education`, `/certifications`
3. **Portfolio Group**: `/projects`, `/skills`, `/testimonials`

_Note_: Junction object calls (e.g., `/project-skills`) are dependent on their parent calls and execute sequentially _within_ their group.

**Architecture Strategies**:

1. **Recursive Pagination**: Consumes `X-Has-More` from SAPI to fetch all pages.
2. **Partial Failure Tolerance**: "Best Effort" aggregation.
   - **Timeout**: 3 seconds per group.
   - If a group fails, the main response returns `200 OK` with empty arrays for that section and `X-Data-Integrity: partial`.
3. **Smart Caching**: Applies strictest upstream cache policy.

<h3 id="getfullportfolio-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                       |
| ------------- | ------ | ------------ | -------- | ----------------------------------------------------------------- |
| X-Request-Id  | header | string(uuid) | false    | Optional correlation ID. If not provided, PAPI will generate one. |
| X-API-Version | header | string       | false    | PAPI version. Defaults to v1 if not specified.                    |

#### Detailed descriptions

**X-Request-Id**: Optional correlation ID. If not provided, PAPI will generate one.
This ID is propagated to all downstream SAPI calls.

> Example responses

> 200 Response

```json
{
  "config": {
    "ownerEmail": "bumsteadryan@gmail.com",
    "linkedInUrl": "https://linkedin.com/in/ryanbumstead",
    "calendlyUrl": "https://calendly.com/ryanbumstead",
    "githubUrl": "https://github.com/ryanbumstead",
    "trailheadUrl": "https://trailblazer.me/id/ryanbumstead"
  },
  "contactInfo": {
    "fullName": "Ryan Bumstead",
    "email": "bumsteadryan@gmail.com",
    "phone": "555-0199",
    "linkedIn": "https://linkedin.com/in/ryanbumstead",
    "github": "https://github.com/ryanbumstead"
  },
  "summary": "7+ Years of Experience as a Salesforce Platform Architect specializing in API-led connectivity and DevOps.",
  "skills": [
    {
      "id": "a075e00000B2O3DAAV",
      "name": "Apex",
      "category": "Backend",
      "proficiency": 5
    },
    {
      "id": "a075e00000B2O3DAAX",
      "name": "LWC",
      "category": "Frontend",
      "proficiency": 5
    }
  ],
  "experience": [
    {
      "id": "a025e00000B2O3DAAV",
      "employer": "Salesforce",
      "role": "Senior Technical Architect",
      "dateRange": "Jan 2023 - Present",
      "isCurrent": true,
      "skillsUsed": ["Apex", "LWC", "Event Bus"],
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
      "heroImageUrl": "https://assets.portfolio.com/hero.png",
      "technologies": ["LWR", "Apex"],
      "assets": []
    }
  ],
  "certifications": [],
  "education": [
    {
      "id": "a115e00000B2O3DAAV",
      "school": "Creighton University",
      "degree": "B.S. Computer Science",
      "year": "2018"
    }
  ],
  "testimonials": [
    {
      "id": "a055e00000B2O3DAAV",
      "author": "Jane Doe",
      "title": "VP of Engineering",
      "relationship": "Manager",
      "quote": "Ryan is a beast at architecture.",
      "vibe": "Professional"
    }
  ],
  "integrityNote": "Partial data: Certifications service unavailable."
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
  "message": "Invalid or missing X-API-Key header",
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

| Status | Meaning                                                                    | Description                                       | Schema                                              |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | The complete portfolio payload                    | [FullPortfolioPayload](#schemafullportfoliopayload) |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters                        | [ErrorResponse](#schemaerrorresponse)               |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Missing or invalid API key                        | [ErrorResponse](#schemaerrorresponse)               |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal PAPI error or SAPI communication failure | [ErrorResponse](#schemaerrorresponse)               |
| 503    | [Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)   | PAPI or downstream SAPI is unavailable            | [ErrorResponse](#schemaerrorresponse)               |

### Response Headers

| Status | Header           | Type    | Format | Description                                                       |
| ------ | ---------------- | ------- | ------ | ----------------------------------------------------------------- |
| 200    | X-Request-Id     | string  | uuid   | Correlation ID for distributed tracing                            |
| 200    | Cache-Control    | string  |        | Derived from upstream SAPI resources.                             |
| 200    | X-Data-Integrity | string  |        | Indicates if the payload is complete or has partial missing data. |
| 400    | X-Request-Id     | string  | uuid   | Correlation ID for distributed tracing                            |
| 401    | X-Request-Id     | string  | uuid   | Correlation ID for distributed tracing                            |
| 500    | X-Request-Id     | string  | uuid   | Correlation ID for distributed tracing                            |
| 503    | X-Request-Id     | string  | uuid   | Correlation ID for distributed tracing                            |
| 503    | Retry-After      | integer |        | Seconds until service may be available                            |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiKeyAuth
</aside>

## getProfileSummary

<a id="opIdgetProfileSummary"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  "X-API-Version": "v1",
  "X-API-Key": "API_KEY"
};

fetch("https://api.portfolio.ryanbumstead.com/papi/v1/profile/summary", {
  method: "GET",

  headers: headers
})
  .then(function (res) {
    return res.json();
  })
  .then(function (body) {
    console.log(body);
  });
```

`GET /profile/summary`

_Get Employment Profile Only_

Orchestrates calls to Contact, Work Experience, Skills, Education, and Certifications.
Stitches junction objects (ExperienceSkill, CertificationSkill) to their parents.

**SAPI Calls**:

- `GET /contacts`
- `GET /experience` → `GET /experience-skills?experienceId={id}` for each
- `GET /skills`
- `GET /certifications` → `GET /certification-skills?certificationId={id}` for each
- `GET /education`

**Use Case**: Resume page, profile cards

<h3 id="getprofilesummary-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                       |
| ------------- | ------ | ------------ | -------- | ----------------------------------------------------------------- |
| X-Request-Id  | header | string(uuid) | false    | Optional correlation ID. If not provided, PAPI will generate one. |
| X-API-Version | header | string       | false    | PAPI version. Defaults to v1 if not specified.                    |

#### Detailed descriptions

**X-Request-Id**: Optional correlation ID. If not provided, PAPI will generate one.
This ID is propagated to all downstream SAPI calls.

> Example responses

> 200 Response

```json
{
  "contactInfo": {
    "id": "0035e00000B2O3DAAV",
    "fullName": "Ryan Bumstead",
    "email": "ryan@ryanbumstead.com",
    "phone": "+1 555-0199",
    "title": "Platform Architect",
    "linkedIn": "https://linkedin.com/in/ryanbumstead",
    "github": "https://github.com/ryanbumstead",
    "trailhead": "https://trailblazer.me/id/ryanbumstead",
    "portfolioUrl": "https://ryanbumstead.com",
    "bio": "Specializing in API-led connectivity..."
  },
  "summary": "7+ years of experience as a Salesforce Platform Architect",
  "skills": [
    {
      "id": "a075e00000B2O3DAAV",
      "name": "Apex",
      "displayName": "Salesforce Apex",
      "category": "Backend",
      "proficiency": 5,
      "iconName": "utility:code",
      "colorHex": "#0070d2"
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
      "skillsUsed": ["LWC"],
      "highlights": ["Implemented CI/CD pipelines using GitHub Actions"]
    }
  ],
  "certifications": [
    {
      "id": "a105e00000B2O3DAAV",
      "name": "Certified Application Architect",
      "issuer": "Salesforce",
      "dateEarned": "2024-05-15",
      "skillsUsed": ["Security"]
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
  ]
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
  "message": "Invalid or missing X-API-Key header",
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

| Status | Meaning                                                                    | Description                                       | Schema                                  |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | A unified profile object                          | [ProfileSummary](#schemaprofilesummary) |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters                        | [ErrorResponse](#schemaerrorresponse)   |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Missing or invalid API key                        | [ErrorResponse](#schemaerrorresponse)   |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal PAPI error or SAPI communication failure | [ErrorResponse](#schemaerrorresponse)   |
| 503    | [Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)   | PAPI or downstream SAPI is unavailable            | [ErrorResponse](#schemaerrorresponse)   |

### Response Headers

| Status | Header        | Type    | Format | Description                            |
| ------ | ------------- | ------- | ------ | -------------------------------------- |
| 200    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 200    | Cache-Control | string  |        | none                                   |
| 400    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 401    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 500    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 503    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 503    | Retry-After   | integer |        | Seconds until service may be available |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiKeyAuth
</aside>

## getFeaturedProjects

<a id="opIdgetFeaturedProjects"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  "X-API-Version": "v1",
  "X-API-Key": "API_KEY"
};

fetch("https://api.portfolio.ryanbumstead.com/papi/v1/projects/featured", {
  method: "GET",

  headers: headers
})
  .then(function (res) {
    return res.json();
  })
  .then(function (body) {
    console.log(body);
  });
```

`GET /projects/featured`

_Get Featured Projects (Enriched)_

Retrieves projects marked as 'Featured' with nested Skills and Assets.

**SAPI Calls**:

- `GET /projects?isFeatured=true`
- For each project:
  - `GET /project-skills?projectId={id}`
  - `GET /project-assets?projectId={id}`

**Use Case**: Home page project showcase, portfolio gallery

<h3 id="getfeaturedprojects-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                       |
| ------------- | ------ | ------------ | -------- | ----------------------------------------------------------------- |
| X-Request-Id  | header | string(uuid) | false    | Optional correlation ID. If not provided, PAPI will generate one. |
| X-API-Version | header | string       | false    | PAPI version. Defaults to v1 if not specified.                    |

#### Detailed descriptions

**X-Request-Id**: Optional correlation ID. If not provided, PAPI will generate one.
This ID is propagated to all downstream SAPI calls.

> Example responses

> 200 Response

```json
[
  {
    "id": "a015e00000B2O3DAAV",
    "title": "Portfolio Site",
    "challenge": "Display skills dynamically to recruiters",
    "solution": "Built on LWR with SAPI/PAPI architecture",
    "businessValue": "Increased interview rate by 40%",
    "status": "Live – In Production",
    "heroImageUrl": "https://assets.portfolio.com/hero.png",
    "liveUrl": "https://portfolio.ryanbumstead.com",
    "repositoryUrl": "https://github.com/ryanbumstead/portfolio",
    "technologies": ["Apex"],
    "assets": [
      {
        "type": "Image",
        "url": "https://assets.portfolio.com/diagram.png",
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
  "message": "Invalid or missing X-API-Key header",
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

| Status | Meaning                                                                    | Description                                       | Schema                                |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | A list of enriched project records                | Inline                                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters                        | [ErrorResponse](#schemaerrorresponse) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Missing or invalid API key                        | [ErrorResponse](#schemaerrorresponse) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal PAPI error or SAPI communication failure | [ErrorResponse](#schemaerrorresponse) |
| 503    | [Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)   | PAPI or downstream SAPI is unavailable            | [ErrorResponse](#schemaerrorresponse) |

<h3 id="getfeaturedprojects-responseschema">Response Schema</h3>

Status Code **200**

| Name            | Type                                        | Required | Restrictions | Description                                             |
| --------------- | ------------------------------------------- | -------- | ------------ | ------------------------------------------------------- |
| _anonymous_     | [[EnrichedProject](#schemaenrichedproject)] | false    | none         | [Project enriched with Skills and Assets]               |
| » id            | string                                      | true     | none         | none                                                    |
| » title         | string                                      | true     | none         | none                                                    |
| » challenge     | string                                      | false    | none         | none                                                    |
| » solution      | string                                      | false    | none         | none                                                    |
| » businessValue | string                                      | false    | none         | none                                                    |
| » status        | string                                      | true     | none         | none                                                    |
| » heroImageUrl  | string(uri)                                 | false    | none         | URL of the main display image. Matches SAPI field name. |
| » liveUrl       | string(uri)                                 | false    | none         | none                                                    |
| » repositoryUrl | string(uri)                                 | false    | none         | none                                                    |
| » technologies  | [string]                                    | false    | none         | Skill names from ProjectSkill junction                  |
| » assets        | [object]                                    | false    | none         | Images, videos, or links related to the project         |
| »» type         | string                                      | true     | none         | none                                                    |
| »» url          | string(uri)                                 | true     | none         | none                                                    |
| »» caption      | string                                      | false    | none         | none                                                    |

#### Enumerated Values

| Property | Value                   |
| -------- | ----------------------- |
| status   | Live – In Production    |
| status   | Live – Demo / Reference |
| status   | Active Development      |
| status   | On Hold                 |
| status   | Archived                |
| type     | Image                   |
| type     | Video                   |
| type     | Document                |
| type     | Link                    |

### Response Headers

| Status | Header        | Type    | Format | Description                            |
| ------ | ------------- | ------- | ------ | -------------------------------------- |
| 200    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 200    | X-Total-Count | integer |        | none                                   |
| 200    | Cache-Control | string  |        | none                                   |
| 400    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 401    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 500    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 503    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 503    | Retry-After   | integer |        | Seconds until service may be available |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiKeyAuth
</aside>

<h1 id="portfolio-process-api-papi--transformation">Transformation</h1>

Endpoints that transform SAPI data into new formats

## generateResume

<a id="opIdgenerateResume"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  "X-API-Version": "v1",
  "X-API-Key": "API_KEY"
};

fetch("https://api.portfolio.ryanbumstead.com/papi/v1/resume/generate", {
  method: "GET",

  headers: headers
})
  .then(function (res) {
    return res.json();
  })
  .then(function (body) {
    console.log(body);
  });
```

`GET /resume/generate`

_Generate Plain Text Resume_

Generates an ATS-optimized plain text resume.

**SAPI Calls**:

- `GET /contacts`
- `GET /experience`
- `GET /experience-highlights?persona={persona}` - Filters bullets by target audience
- `GET /skills`
- `GET /certifications`
- `GET /education`

**Transformation Logic**:

- Formats dates as "MMM YYYY - MMM YYYY" or "MMM YYYY - Present"
- Groups skills by category
- Limits to top 5 proficiency skills per category
- Strips HTML from accomplishments using regex
- Applies 80-character line wrapping

**Persona Filtering**:

- `admin`: Shows System Admin highlights only
- `developer`: Shows Development highlights only
- `architect`: Shows Architecture/Design highlights only
- `general`: Shows all highlights (no persona filter)

<h3 id="generateresume-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                       |
| ------------- | ------ | ------------ | -------- | ----------------------------------------------------------------- |
| X-Request-Id  | header | string(uuid) | false    | Optional correlation ID. If not provided, PAPI will generate one. |
| X-API-Version | header | string       | false    | PAPI version. Defaults to v1 if not specified.                    |
| persona       | query  | string       | false    | The target audience for the resume                                |

#### Detailed descriptions

**X-Request-Id**: Optional correlation ID. If not provided, PAPI will generate one.
This ID is propagated to all downstream SAPI calls.

#### Enumerated Values

| Parameter | Value     |
| --------- | --------- |
| persona   | Admin     |
| persona   | Developer |
| persona   | Architect |
| persona   | general   |

> Example responses

> 200 Response

```json
{
  "generatedText": "Ryan Bumstead\nSalesforce Platform Architect\n\nEXPERIENCE\n\nSalesforce | Senior Technical Architect\nJan 2023 - Present\n- Designed multi-cloud solutions...\n- Led DevOps transformation...\n",
  "persona": "Architect",
  "generatedAt": "2019-08-24T14:15:22Z"
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
  "message": "Invalid or missing X-API-Key header",
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

| Status | Meaning                                                                    | Description                                        | Schema                                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | A JSON object containing the formatted resume text | Inline                                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters                         | [ErrorResponse](#schemaerrorresponse) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Missing or invalid API key                         | [ErrorResponse](#schemaerrorresponse) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal PAPI error or SAPI communication failure  | [ErrorResponse](#schemaerrorresponse) |
| 503    | [Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)   | PAPI or downstream SAPI is unavailable             | [ErrorResponse](#schemaerrorresponse) |

<h3 id="generateresume-responseschema">Response Schema</h3>

Status Code **200**

| Name            | Type              | Required | Restrictions | Description                                                    |
| --------------- | ----------------- | -------- | ------------ | -------------------------------------------------------------- |
| » generatedText | string            | true     | none         | The complete, formatted resume string ready for clipboard copy |
| » persona       | string            | true     | none         | The persona filter applied                                     |
| » generatedAt   | string(date-time) | true     | none         | ISO 8601 timestamp of generation                               |

### Response Headers

| Status | Header        | Type    | Format | Description                            |
| ------ | ------------- | ------- | ------ | -------------------------------------- |
| 200    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 200    | Cache-Control | string  |        | none                                   |
| 400    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 401    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 500    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 503    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 503    | Retry-After   | integer |        | Seconds until service may be available |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiKeyAuth
</aside>

<h1 id="portfolio-process-api-papi--logic">Logic</h1>

Endpoints that apply business rules and filtering

## getTestimonialFeed

<a id="opIdgetTestimonialFeed"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  "X-API-Version": "v1",
  "X-API-Key": "API_KEY"
};

fetch("https://api.portfolio.ryanbumstead.com/papi/v1/testimonials/feed", {
  method: "GET",

  headers: headers
})
  .then(function (res) {
    return res.json();
  })
  .then(function (body) {
    console.log(body);
  });
```

`GET /testimonials/feed`

_Get Curated Testimonials_

Retrieves testimonials with "Vibe Control" logic applied.

**SAPI Calls**:

- `GET /testimonials?limit=200` (returns only `Approved__c = true`)

**Filtering Logic**:

- `professional`: Only shows `Relationship_Type__c IN ('Manager', 'Client')` AND `Vibe_Mode__c = 'Professional'`
- `casual`: Shows all approved testimonials including `Vibe_Mode__c = 'Casual'`

**Use Case**: About page testimonials section

<h3 id="gettestimonialfeed-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                       |
| ------------- | ------ | ------------ | -------- | ----------------------------------------------------------------- |
| X-Request-Id  | header | string(uuid) | false    | Optional correlation ID. If not provided, PAPI will generate one. |
| X-API-Version | header | string       | false    | PAPI version. Defaults to v1 if not specified.                    |
| mode          | query  | string       | false    | Filter testimonials by vibe                                       |

#### Detailed descriptions

**X-Request-Id**: Optional correlation ID. If not provided, PAPI will generate one.
This ID is propagated to all downstream SAPI calls.

#### Enumerated Values

| Parameter | Value        |
| --------- | ------------ |
| mode      | professional |
| mode      | casual       |

> Example responses

> 200 Response

```json
[
  {
    "id": "a055e00000B2O3DAAV",
    "author": "Jane Doe",
    "title": "VP of Engineering",
    "relationship": "Manager",
    "quote": "Ryan is a beast at architecture",
    "vibe": "Professional",
    "avatarUrl": "https://linkedin.com/in/janedoe/photo"
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
  "message": "Invalid or missing X-API-Key header",
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

| Status | Meaning                                                                    | Description                                       | Schema                                |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | A filtered list of testimonials                   | Inline                                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters                        | [ErrorResponse](#schemaerrorresponse) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Missing or invalid API key                        | [ErrorResponse](#schemaerrorresponse) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal PAPI error or SAPI communication failure | [ErrorResponse](#schemaerrorresponse) |
| 503    | [Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)   | PAPI or downstream SAPI is unavailable            | [ErrorResponse](#schemaerrorresponse) |

<h3 id="gettestimonialfeed-responseschema">Response Schema</h3>

Status Code **200**

| Name           | Type                                                | Required | Restrictions | Description |
| -------------- | --------------------------------------------------- | -------- | ------------ | ----------- |
| _anonymous_    | [[EnrichedTestimonial](#schemaenrichedtestimonial)] | false    | none         | none        |
| » id           | string                                              | true     | none         | none        |
| » author       | string                                              | true     | none         | none        |
| » title        | string                                              | false    | none         | none        |
| » relationship | string                                              | false    | none         | none        |
| » quote        | string                                              | true     | none         | none        |
| » vibe         | string                                              | false    | none         | none        |
| » avatarUrl    | string(uri)                                         | false    | none         | none        |

#### Enumerated Values

| Property     | Value        |
| ------------ | ------------ |
| relationship | Manager      |
| relationship | Peer         |
| relationship | Client       |
| relationship | Recruiter    |
| relationship | Fan          |
| vibe         | Professional |
| vibe         | Casual       |

### Response Headers

| Status | Header        | Type    | Format | Description                            |
| ------ | ------------- | ------- | ------ | -------------------------------------- |
| 200    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 200    | X-Total-Count | integer |        | none                                   |
| 200    | Cache-Control | string  |        | none                                   |
| 400    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 401    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 500    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 503    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 503    | Retry-After   | integer |        | Seconds until service may be available |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiKeyAuth
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
    "experienceSummary": "7+ years as Salesforce Architect"
  },
  "tone": "Professional",
  "maxLength": 500
}';
const headers = {
  'Content-Type':'application/json',
  'Accept':'application/json',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'X-API-Version':'v1',
  'X-API-Key':'API_KEY'
};

fetch('https://api.portfolio.ryanbumstead.com/papi/v1/ai/generate',
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

_Generate AI Content (Multi-Cloud Resilience)_

Proxies generative AI requests to LLM providers with circuit breaker pattern.

**Provider Priority Chain**:

1. **Primary**: Salesforce Agentforce (if available)
2. **Fallback 1**: Google Gemini Flash 2.0 (via AWS Lambda)
3. **Fallback 2**: OpenAI GPT-4o-mini (via AWS Lambda)

**Circuit Breaker & Limits**:

- **Rate Limit**: 10 requests per minute (User)
- **Timeouts**: 2 seconds per provider, 5 seconds total max execution.
- **Threshold**: Circuit opens after 3 consecutive failures.
- **Reset**: Circuit attempts reset after 30 seconds.

**Security**:

- API keys for Gemini/OpenAI stored in AWS Secrets Manager
- Never exposed to frontend or Salesforce
- Rotated every 90 days via automated Lambda

> Body parameter

```json
{
  "type": "CoverLetter",
  "context": {
    "jobDescription": "We are seeking a Senior Salesforce Architect...",
    "companyName": "Acme Corp",
    "role": "Senior Technical Architect",
    "skills": ["Apex", "LWC", "Integration Architecture"],
    "experienceSummary": "7+ years as Salesforce Architect"
  },
  "tone": "Professional",
  "maxLength": 500
}
```

<h3 id="generateaicontent-parameters">Parameters</h3>

| Name                 | In     | Type         | Required | Description                                                       |
| -------------------- | ------ | ------------ | -------- | ----------------------------------------------------------------- |
| X-Request-Id         | header | string(uuid) | false    | Optional correlation ID. If not provided, PAPI will generate one. |
| X-API-Version        | header | string       | false    | PAPI version. Defaults to v1 if not specified.                    |
| body                 | body   | object       | true     | none                                                              |
| » type               | body   | string       | true     | The type of content to generate                                   |
| » context            | body   | object       | true     | Contextual data for generation                                    |
| »» jobDescription    | body   | string       | false    | Full text of job posting (for cover letters)                      |
| »» companyName       | body   | string       | false    | none                                                              |
| »» role              | body   | string       | false    | none                                                              |
| »» skills            | body   | [string]     | false    | Skills to emphasize                                               |
| »» experienceSummary | body   | string       | false    | Brief professional summary                                        |
| » tone               | body   | string       | false    | Desired tone of generated content                                 |
| » maxLength          | body   | integer      | false    | Maximum character count                                           |

#### Detailed descriptions

**X-Request-Id**: Optional correlation ID. If not provided, PAPI will generate one.
This ID is propagated to all downstream SAPI calls.

#### Enumerated Values

| Parameter | Value            |
| --------- | ---------------- |
| » type    | CoverLetter      |
| » type    | BioSummary       |
| » type    | SkillDescription |
| » tone    | Professional     |
| » tone    | Enthusiastic     |
| » tone    | Technical        |
| » tone    | Casual           |

> Example responses

> 200 Response

```json
{
  "content": "Dear Hiring Manager,\n\nI am writing to express my strong interest in the Senior Technical Architect position at Acme Financial...\n",
  "provider": "Gemini Flash 2.0",
  "model": "gemini-2.0-flash-exp",
  "generatedAt": "2019-08-24T14:15:22Z",
  "tokensUsed": 487,
  "fallbackOccurred": false
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
  "message": "Invalid or missing X-API-Key header",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false
}
```

> 429 Response

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "LLM provider quota exceeded. Retry after 60 seconds.",
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

| Status | Meaning                                                                    | Description                                       | Schema                                |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successfully generated content                    | Inline                                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters                        | [ErrorResponse](#schemaerrorresponse) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Missing or invalid API key                        | [ErrorResponse](#schemaerrorresponse) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | Rate limit exceeded (LLM provider quota)          | [ErrorResponse](#schemaerrorresponse) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal PAPI error or SAPI communication failure | [ErrorResponse](#schemaerrorresponse) |
| 503    | [Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4)   | All AI providers unavailable                      | [ErrorResponse](#schemaerrorresponse) |

<h3 id="generateaicontent-responseschema">Response Schema</h3>

Status Code **200**

| Name               | Type              | Required | Restrictions | Description                                 |
| ------------------ | ----------------- | -------- | ------------ | ------------------------------------------- |
| » content          | string            | true     | none         | The generated text content                  |
| » provider         | string            | true     | none         | LLM provider used                           |
| » model            | string            | false    | none         | Specific model version                      |
| » generatedAt      | string(date-time) | true     | none         | none                                        |
| » tokensUsed       | integer           | false    | none         | Approximate token count (for cost tracking) |
| » fallbackOccurred | boolean           | false    | none         | True if primary provider failed             |

### Response Headers

| Status | Header               | Type    | Format | Description                                    |
| ------ | -------------------- | ------- | ------ | ---------------------------------------------- |
| 200    | X-Request-Id         | string  | uuid   | Correlation ID for distributed tracing         |
| 200    | X-AI-Provider        | string  |        | Which LLM provider was used                    |
| 200    | X-Generation-Time-Ms | integer |        | Time taken to generate content in milliseconds |
| 400    | X-Request-Id         | string  | uuid   | Correlation ID for distributed tracing         |
| 401    | X-Request-Id         | string  | uuid   | Correlation ID for distributed tracing         |
| 429    | X-Request-Id         | string  | uuid   | Correlation ID for distributed tracing         |
| 429    | Retry-After          | integer |        | none                                           |
| 500    | X-Request-Id         | string  | uuid   | Correlation ID for distributed tracing         |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiKeyAuth
</aside>

<h1 id="portfolio-process-api-papi--monitoring">Monitoring</h1>

## getHealth

<a id="opIdgetHealth"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json"
};

fetch("https://api.portfolio.ryanbumstead.com/papi/v1/health", {
  method: "GET",

  headers: headers
})
  .then(function (res) {
    return res.json();
  })
  .then(function (body) {
    console.log(body);
  });
```

`GET /health`

_PAPI Health Check_

Performs a shallow health check (runtime only). Does not validate SAPI connectivity.

> Example responses

> 200 Response

```json
{
  "status": "UP",
  "timestamp": "2019-08-24T14:15:22Z",
  "dependencies": {
    "sapi": "not_checked"
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

<h3 id="gethealth-responses">Responses</h3>

| Status | Meaning                                                                  | Description                            | Schema                                |
| ------ | ------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                  | Service is healthy                     | [HealthStatus](#schemahealthstatus)   |
| 503    | [Service Unavailable](https://tools.ietf.org/html/rfc7231#section-6.6.4) | PAPI or downstream SAPI is unavailable | [ErrorResponse](#schemaerrorresponse) |

### Response Headers

| Status | Header        | Type    | Format | Description                            |
| ------ | ------------- | ------- | ------ | -------------------------------------- |
| 200    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 200    | Cache-Control | string  |        | none                                   |
| 503    | X-Request-Id  | string  | uuid   | Correlation ID for distributed tracing |
| 503    | Retry-After   | integer |        | Seconds until service may be available |

<aside class="success">
This operation does not require authentication
</aside>

# Schemas

<h2 id="tocS_ErrorResponse">ErrorResponse</h2>
<!-- backwards compatibility -->
<a id="schemaerrorresponse"></a>
<a id="schema_ErrorResponse"></a>
<a id="tocSerrorresponse"></a>
<a id="tocserrorresponse"></a>

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

| Name          | Type         | Required | Restrictions | Description                                      |
| ------------- | ------------ | -------- | ------------ | ------------------------------------------------ |
| httpStatus    | integer      | true     | none         | none                                             |
| errorCode     | string       | true     | none         | none                                             |
| message       | string       | true     | none         | none                                             |
| correlationId | string(uuid) | true     | none         | none                                             |
| retryable     | boolean      | true     | none         | Indicates if the client should retry the request |
| details       | object       | false    | none         | Additional error context (optional)              |

<h2 id="tocS_HealthStatus">HealthStatus</h2>
<!-- backwards compatibility -->
<a id="schemahealthstatus"></a>
<a id="schema_HealthStatus"></a>
<a id="tocShealthstatus"></a>
<a id="tocshealthstatus"></a>

```json
{
  "status": "UP",
  "timestamp": "2019-08-24T14:15:22Z",
  "dependencies": {
    "sapi": "not_checked"
  }
}
```

### Properties

| Name         | Type              | Required | Restrictions | Description |
| ------------ | ----------------- | -------- | ------------ | ----------- |
| status       | string            | false    | none         | none        |
| timestamp    | string(date-time) | false    | none         | none        |
| dependencies | object            | false    | none         | none        |
| » sapi       | string            | false    | none         | none        |

#### Enumerated Values

| Property | Value    |
| -------- | -------- |
| status   | UP       |
| status   | DOWN     |
| status   | DEGRADED |

<h2 id="tocS_FullPortfolioPayload">FullPortfolioPayload</h2>
<!-- backwards compatibility -->
<a id="schemafullportfoliopayload"></a>
<a id="schema_FullPortfolioPayload"></a>
<a id="tocSfullportfoliopayload"></a>
<a id="tocsfullportfoliopayload"></a>

```json
{
  "config": {
    "ownerEmail": "bumsteadryan@gmail.com",
    "ownerPhone": "+1 555-0199",
    "linkedInUrl": "https://linkedin.com/in/ryanbumstead",
    "calendlyUrl": "https://calendly.com/ryanbumstead",
    "githubUrl": "https://github.com/ryanbumstead",
    "trailheadUrl": "https://trailblazer.me/id/ryanbumstead",
    "personalWebsiteUrl": "https://ryanbumstead.com",
    "careerObjective": "Driving digital transformation through architecture."
  },
  "contactInfo": {
    "id": "0035e00000B2O3DAAV",
    "fullName": "Ryan Bumstead",
    "email": "ryan@ryanbumstead.com",
    "phone": "+1 555-0199",
    "title": "Platform Architect",
    "linkedIn": "https://linkedin.com/in/ryanbumstead",
    "github": "https://github.com/ryanbumstead",
    "trailhead": "https://trailblazer.me/id/ryanbumstead",
    "portfolioUrl": "https://ryanbumstead.com",
    "bio": "Specializing in API-led connectivity..."
  },
  "summary": "7+ years of experience as a Salesforce Platform Architect",
  "skills": [
    {
      "id": "a075e00000B2O3DAAV",
      "name": "Apex",
      "displayName": "Salesforce Apex",
      "category": "Backend",
      "proficiency": 5,
      "iconName": "utility:code",
      "colorHex": "#0070d2"
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
      "skillsUsed": ["LWC"],
      "highlights": ["Implemented CI/CD pipelines using GitHub Actions"]
    }
  ],
  "projects": [
    {
      "id": "a015e00000B2O3DAAV",
      "title": "Portfolio Site",
      "challenge": "Display skills dynamically to recruiters",
      "solution": "Built on LWR with SAPI/PAPI architecture",
      "businessValue": "Increased interview rate by 40%",
      "status": "Live – In Production",
      "heroImageUrl": "https://assets.portfolio.com/hero.png",
      "liveUrl": "https://portfolio.ryanbumstead.com",
      "repositoryUrl": "https://github.com/ryanbumstead/portfolio",
      "technologies": ["Apex"],
      "assets": [
        {
          "type": "Image",
          "url": "https://assets.portfolio.com/diagram.png",
          "caption": "System Architecture Diagram"
        }
      ]
    }
  ],
  "certifications": [
    {
      "id": "a105e00000B2O3DAAV",
      "name": "Certified Application Architect",
      "issuer": "Salesforce",
      "dateEarned": "2024-05-15",
      "skillsUsed": ["Security"]
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
      "quote": "Ryan is a beast at architecture",
      "vibe": "Professional",
      "avatarUrl": "https://linkedin.com/in/janedoe/photo"
    }
  ],
  "integrityNote": "string"
}
```

The master payload for initial app load

### Properties

| Name           | Type                                                    | Required | Restrictions | Description                                                                     |
| -------------- | ------------------------------------------------------- | -------- | ------------ | ------------------------------------------------------------------------------- |
| config         | [PortfolioConfig](#schemaportfolioconfig)               | true     | none         | none                                                                            |
| contactInfo    | [ContactDetail](#schemacontactdetail)                   | true     | none         | Simplified contact information for the header                                   |
| summary        | string                                                  | false    | none         | Auto-generated professional summary                                             |
| skills         | [[SkillSummary](#schemaskillsummary)]                   | true     | none         | [Lightweight skill object for list views]                                       |
| experience     | [[EnrichedExperience](#schemaenrichedexperience)]       | true     | none         | [Work Experience enriched with related Skills and Highlights]                   |
| projects       | [[EnrichedProject](#schemaenrichedproject)]             | true     | none         | [Project enriched with Skills and Assets]                                       |
| certifications | [[EnrichedCertification](#schemaenrichedcertification)] | true     | none         | [Certification with associated skills]                                          |
| education      | [[SimpleEducation](#schemasimpleeducation)]             | true     | none         | [Educational background]                                                        |
| testimonials   | [[EnrichedTestimonial](#schemaenrichedtestimonial)]     | true     | none         | none                                                                            |
| integrityNote  | string¦null                                             | false    | none         | Debug info if partial data returned (e.g. 'Certifications Service Unavailable') |

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
    "fullName": "Ryan Bumstead",
    "email": "ryan@ryanbumstead.com",
    "phone": "+1 555-0199",
    "title": "Platform Architect",
    "linkedIn": "https://linkedin.com/in/ryanbumstead",
    "github": "https://github.com/ryanbumstead",
    "trailhead": "https://trailblazer.me/id/ryanbumstead",
    "portfolioUrl": "https://ryanbumstead.com",
    "bio": "Specializing in API-led connectivity..."
  },
  "summary": "7+ years of experience as a Salesforce Platform Architect",
  "skills": [
    {
      "id": "a075e00000B2O3DAAV",
      "name": "Apex",
      "displayName": "Salesforce Apex",
      "category": "Backend",
      "proficiency": 5,
      "iconName": "utility:code",
      "colorHex": "#0070d2"
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
      "skillsUsed": ["LWC"],
      "highlights": ["Implemented CI/CD pipelines using GitHub Actions"]
    }
  ],
  "certifications": [
    {
      "id": "a105e00000B2O3DAAV",
      "name": "Certified Application Architect",
      "issuer": "Salesforce",
      "dateEarned": "2024-05-15",
      "skillsUsed": ["Security"]
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
  ]
}
```

### Properties

| Name           | Type                                                    | Required | Restrictions | Description                                                   |
| -------------- | ------------------------------------------------------- | -------- | ------------ | ------------------------------------------------------------- |
| contactInfo    | [ContactDetail](#schemacontactdetail)                   | true     | none         | Simplified contact information for the header                 |
| summary        | string                                                  | false    | none         | Calculated summary based on experience                        |
| skills         | [[SkillSummary](#schemaskillsummary)]                   | true     | none         | [Lightweight skill object for list views]                     |
| experience     | [[EnrichedExperience](#schemaenrichedexperience)]       | true     | none         | [Work Experience enriched with related Skills and Highlights] |
| certifications | [[EnrichedCertification](#schemaenrichedcertification)] | true     | none         | [Certification with associated skills]                        |
| education      | [[SimpleEducation](#schemasimpleeducation)]             | true     | none         | [Educational background]                                      |

<h2 id="tocS_EnrichedExperience">EnrichedExperience</h2>
<!-- backwards compatibility -->
<a id="schemaenrichedexperience"></a>
<a id="schema_EnrichedExperience"></a>
<a id="tocSenrichedexperience"></a>
<a id="tocsenrichedexperience"></a>

```json
{
  "id": "a025e00000B2O3DAAV",
  "employer": "Salesforce",
  "role": "Senior Technical Architect",
  "dateRange": "Jan 2023 - Present",
  "isCurrent": true,
  "isRemote": true,
  "skillsUsed": ["LWC"],
  "highlights": ["Implemented CI/CD pipelines using GitHub Actions"]
}
```

Work Experience enriched with related Skills and Highlights

### Properties

| Name       | Type     | Required | Restrictions | Description                                                |
| ---------- | -------- | -------- | ------------ | ---------------------------------------------------------- |
| id         | string   | true     | none         | Salesforce Record ID (18-char)                             |
| employer   | string   | true     | none         | none                                                       |
| role       | string   | true     | none         | none                                                       |
| dateRange  | string   | true     | none         | Formatted as "MMM YYYY - MMM YYYY" or "MMM YYYY - Present" |
| isCurrent  | boolean  | true     | none         | none                                                       |
| isRemote   | boolean  | false    | none         | none                                                       |
| skillsUsed | [string] | false    | none         | Skills derived from ExperienceSkill junction               |
| highlights | [string] | false    | none         | Selected bullet points (filtered by persona if applicable) |

<h2 id="tocS_EnrichedProject">EnrichedProject</h2>
<!-- backwards compatibility -->
<a id="schemaenrichedproject"></a>
<a id="schema_EnrichedProject"></a>
<a id="tocSenrichedproject"></a>
<a id="tocsenrichedproject"></a>

```json
{
  "id": "a015e00000B2O3DAAV",
  "title": "Portfolio Site",
  "challenge": "Display skills dynamically to recruiters",
  "solution": "Built on LWR with SAPI/PAPI architecture",
  "businessValue": "Increased interview rate by 40%",
  "status": "Live – In Production",
  "heroImageUrl": "https://assets.portfolio.com/hero.png",
  "liveUrl": "https://portfolio.ryanbumstead.com",
  "repositoryUrl": "https://github.com/ryanbumstead/portfolio",
  "technologies": ["Apex"],
  "assets": [
    {
      "type": "Image",
      "url": "https://assets.portfolio.com/diagram.png",
      "caption": "System Architecture Diagram"
    }
  ]
}
```

Project enriched with Skills and Assets

### Properties

| Name          | Type        | Required | Restrictions | Description                                             |
| ------------- | ----------- | -------- | ------------ | ------------------------------------------------------- |
| id            | string      | true     | none         | none                                                    |
| title         | string      | true     | none         | none                                                    |
| challenge     | string      | false    | none         | none                                                    |
| solution      | string      | false    | none         | none                                                    |
| businessValue | string      | false    | none         | none                                                    |
| status        | string      | true     | none         | none                                                    |
| heroImageUrl  | string(uri) | false    | none         | URL of the main display image. Matches SAPI field name. |
| liveUrl       | string(uri) | false    | none         | none                                                    |
| repositoryUrl | string(uri) | false    | none         | none                                                    |
| technologies  | [string]    | false    | none         | Skill names from ProjectSkill junction                  |
| assets        | [object]    | false    | none         | Images, videos, or links related to the project         |
| » type        | string      | true     | none         | none                                                    |
| » url         | string(uri) | true     | none         | none                                                    |
| » caption     | string      | false    | none         | none                                                    |

#### Enumerated Values

| Property | Value                   |
| -------- | ----------------------- |
| status   | Live – In Production    |
| status   | Live – Demo / Reference |
| status   | Active Development      |
| status   | On Hold                 |
| status   | Archived                |
| type     | Image                   |
| type     | Video                   |
| type     | Document                |
| type     | Link                    |

<h2 id="tocS_EnrichedTestimonial">EnrichedTestimonial</h2>
<!-- backwards compatibility -->
<a id="schemaenrichedtestimonial"></a>
<a id="schema_EnrichedTestimonial"></a>
<a id="tocSenrichedtestimonial"></a>
<a id="tocsenrichedtestimonial"></a>

```json
{
  "id": "a055e00000B2O3DAAV",
  "author": "Jane Doe",
  "title": "VP of Engineering",
  "relationship": "Manager",
  "quote": "Ryan is a beast at architecture",
  "vibe": "Professional",
  "avatarUrl": "https://linkedin.com/in/janedoe/photo"
}
```

### Properties

| Name         | Type        | Required | Restrictions | Description |
| ------------ | ----------- | -------- | ------------ | ----------- |
| id           | string      | true     | none         | none        |
| author       | string      | true     | none         | none        |
| title        | string      | false    | none         | none        |
| relationship | string      | false    | none         | none        |
| quote        | string      | true     | none         | none        |
| vibe         | string      | false    | none         | none        |
| avatarUrl    | string(uri) | false    | none         | none        |

#### Enumerated Values

| Property     | Value        |
| ------------ | ------------ |
| relationship | Manager      |
| relationship | Peer         |
| relationship | Client       |
| relationship | Recruiter    |
| relationship | Fan          |
| vibe         | Professional |
| vibe         | Casual       |

<h2 id="tocS_PortfolioConfig">PortfolioConfig</h2>
<!-- backwards compatibility -->
<a id="schemaportfolioconfig"></a>
<a id="schema_PortfolioConfig"></a>
<a id="tocSportfolioconfig"></a>
<a id="tocsportfolioconfig"></a>

```json
{
  "ownerEmail": "bumsteadryan@gmail.com",
  "ownerPhone": "+1 555-0199",
  "linkedInUrl": "https://linkedin.com/in/ryanbumstead",
  "calendlyUrl": "https://calendly.com/ryanbumstead",
  "githubUrl": "https://github.com/ryanbumstead",
  "trailheadUrl": "https://trailblazer.me/id/ryanbumstead",
  "personalWebsiteUrl": "https://ryanbumstead.com",
  "careerObjective": "Driving digital transformation through architecture."
}
```

### Properties

| Name               | Type          | Required | Restrictions | Description                      |
| ------------------ | ------------- | -------- | ------------ | -------------------------------- |
| ownerEmail         | string(email) | true     | none         | none                             |
| ownerPhone         | string        | false    | none         | none                             |
| linkedInUrl        | string(uri)   | false    | none         | none                             |
| calendlyUrl        | string(uri)   | false    | none         | none                             |
| githubUrl          | string(uri)   | false    | none         | none                             |
| trailheadUrl       | string(uri)   | false    | none         | none                             |
| personalWebsiteUrl | string(uri)   | false    | none         | none                             |
| careerObjective    | string        | false    | none         | Short professional bio/objective |

<h2 id="tocS_ContactDetail">ContactDetail</h2>
<!-- backwards compatibility -->
<a id="schemacontactdetail"></a>
<a id="schema_ContactDetail"></a>
<a id="tocScontactdetail"></a>
<a id="tocscontactdetail"></a>

```json
{
  "id": "0035e00000B2O3DAAV",
  "fullName": "Ryan Bumstead",
  "email": "ryan@ryanbumstead.com",
  "phone": "+1 555-0199",
  "title": "Platform Architect",
  "linkedIn": "https://linkedin.com/in/ryanbumstead",
  "github": "https://github.com/ryanbumstead",
  "trailhead": "https://trailblazer.me/id/ryanbumstead",
  "portfolioUrl": "https://ryanbumstead.com",
  "bio": "Specializing in API-led connectivity..."
}
```

Simplified contact information for the header

### Properties

| Name         | Type          | Required | Restrictions | Description                            |
| ------------ | ------------- | -------- | ------------ | -------------------------------------- |
| id           | string        | false    | none         | none                                   |
| fullName     | string        | true     | none         | none                                   |
| email        | string(email) | true     | none         | none                                   |
| phone        | string        | false    | none         | none                                   |
| title        | string        | true     | none         | none                                   |
| linkedIn     | string(uri)   | false    | none         | none                                   |
| github       | string(uri)   | false    | none         | none                                   |
| trailhead    | string(uri)   | false    | none         | none                                   |
| portfolioUrl | string(uri)   | false    | none         | none                                   |
| bio          | string        | false    | none         | The 'Career Objective' from Salesforce |

<h2 id="tocS_SkillSummary">SkillSummary</h2>
<!-- backwards compatibility -->
<a id="schemaskillsummary"></a>
<a id="schema_SkillSummary"></a>
<a id="tocSskillsummary"></a>
<a id="tocsskillsummary"></a>

```json
{
  "id": "a075e00000B2O3DAAV",
  "name": "Apex",
  "displayName": "Salesforce Apex",
  "category": "Backend",
  "proficiency": 5,
  "iconName": "utility:code",
  "colorHex": "#0070d2"
}
```

Lightweight skill object for list views

### Properties

| Name        | Type   | Required | Restrictions | Description                                         |
| ----------- | ------ | -------- | ------------ | --------------------------------------------------- |
| id          | string | true     | none         | none                                                |
| name        | string | true     | none         | none                                                |
| displayName | string | false    | none         | Prefer this over 'name' for UI rendering if present |
| category    | string | true     | none         | none                                                |
| proficiency | number | true     | none         | 1-5 score                                           |
| iconName    | string | false    | none         | SLDS Icon reference                                 |
| colorHex    | string | false    | none         | Brand color for the category                        |

<h2 id="tocS_EnrichedCertification">EnrichedCertification</h2>
<!-- backwards compatibility -->
<a id="schemaenrichedcertification"></a>
<a id="schema_EnrichedCertification"></a>
<a id="tocSenrichedcertification"></a>
<a id="tocsenrichedcertification"></a>

```json
{
  "id": "a105e00000B2O3DAAV",
  "name": "Certified Application Architect",
  "issuer": "Salesforce",
  "dateEarned": "2024-05-15",
  "skillsUsed": ["Security"]
}
```

Certification with associated skills

### Properties

| Name       | Type         | Required | Restrictions | Description                              |
| ---------- | ------------ | -------- | ------------ | ---------------------------------------- |
| id         | string       | true     | none         | none                                     |
| name       | string       | true     | none         | none                                     |
| issuer     | string       | true     | none         | none                                     |
| dateEarned | string(date) | true     | none         | none                                     |
| skillsUsed | [string]     | false    | none         | Derived from CertificationSkill junction |

<h2 id="tocS_SimpleEducation">SimpleEducation</h2>
<!-- backwards compatibility -->
<a id="schemasimpleeducation"></a>
<a id="schema_SimpleEducation"></a>
<a id="tocSsimpleeducation"></a>
<a id="tocssimpleeducation"></a>

```json
{
  "id": "a115e00000B2O3DAAV",
  "school": "Creighton University",
  "degree": "B.S. Computer Science",
  "fieldOfStudy": "Computer Science",
  "year": "2018",
  "gpa": 3.8
}
```

Educational background

### Properties

| Name         | Type        | Required | Restrictions | Description                                  |
| ------------ | ----------- | -------- | ------------ | -------------------------------------------- |
| id           | string      | true     | none         | none                                         |
| school       | string      | true     | none         | none                                         |
| degree       | string      | true     | none         | none                                         |
| fieldOfStudy | string      | false    | none         | none                                         |
| year         | string      | true     | none         | Graduation Year derived from Graduation Date |
| gpa          | number¦null | false    | none         | none                                         |

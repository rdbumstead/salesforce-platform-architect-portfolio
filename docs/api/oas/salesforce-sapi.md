<h1 id="salesforce-system-api-sapi-">Salesforce System API (SAPI) v1.2.0</h1>

> Scroll down for code samples, example requests and responses. Select a language for code samples from the tabs above or the mobile navigation menu.

System API exposing core Salesforce objects for the Portfolio.

### Authentication Layers

1. **System API Authentication**: System-to-system authentication using explicit API Key headers (`client_id`, `client_secret`).
   - **Enforcement**: Enforced by MuleSoft API Manager policies or Salesforce Apex Custom Metadata validation logic.
   - **Rationale**: See **ADR-017 (SAS.md)**. API Key enforcement was selected over OAuth2 for parity across implementation stacks and simplified zero-budget governance.
2. **Backend Integration**: OAuth2 Client Credentials used for API-to-Salesforce connectivity.
   - **Management**: Managed internally within the runtime engine (MuleSoft/AWS Lambda); credentials are never exposed or stored client-side.

### Architecture & Governance

- **Read-Only Design**: This System API is strictly read-only (GET methods only) by design to minimize attack surface and enforce unidirectional data flow.
- **ID Strategy**: All `id` fields utilize strictly **18-character Salesforce Case-Insensitive IDs**.
- **Traceability**: Each API resource maps 1:1 to a corresponding DataWeave Logic (DWL) file.

### Non-Functional Requirements (NFRs)

- **Observability**: `X-Request-Id` **mandatory** in Request/Response for distributed tracing.
- **Latency**: Target < 500ms for internal processing.
- **Resilience**: Rate Limits defined with `429` responses and `Retry-After` headers.
- **Caching Strategy**:
  - **Public Data** (Skills, Projects, Junctions): `Cache-Control: max-age=300, public`.
  - **Private Data** (Contact, Config): `Cache-Control: max-age=300, private` or `no-store`.

### Design Constraints & Trade-offs

- **Pagination**: Offset-based pagination implemented for simplicity (<200 records).
  - _Enterprise Note_: For volumes >2,000, this would be refactored to **Keyset/Cursor Pagination** (`WHERE Id > lastSeenId`).
- **Versioning**: Header version (`X-API-Version`) takes precedence over URL versioning.

Base URLs:

- <a href="https://{domain}/services/apexrest/sapi/v1">https://{domain}/services/apexrest/sapi/v1</a>
  - **domain** - The Salesforce Experience Cloud domain. Default: rbumstead-dev-ed.develop.my.site.com
    - rbumstead-dev-ed.develop.my.site.com

Email: <a href="mailto:ryan@ryanbumstead.com">Ryan Bumstead</a>
License: <a href="https://opensource.org/licenses/MIT">MIT</a>

# Authentication

- API Key (ApiClientId) - Parameter Name: **client_id**, in: header. API Client Identifier. Not to be confused with OAuth2 Client ID.
  Enforced via API Manager policies or Salesforce Custom Metadata.

- API Key (ApiClientSecret)
  - Parameter Name: **client_secret**, in: header. API Client Secret. Used in conjunction with `client_id` for system-to-system authentication.

<h1 id="salesforce-system-api-sapi--monitoring">Monitoring</h1>

Health checks and observability endpoints.

## getHealth

<a id="opIdgetHealth"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json"
};

fetch("https://{domain}/services/apexrest/sapi/v1/health", {
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

_Health Check_

Current Implementation: Shallow connectivity check (Runtime availability).
Future Roadmap: Deep dependency check (Salesforce Connectivity, Cache Availability).

> Example responses

> 200 Response

```json
{
  "status": "UP",
  "checkType": "SHALLOW",
  "timestamp": "2019-08-24T14:15:22Z",
  "dependencies": {
    "salesforce": "deferred"
  }
}
```

<h3 id="gethealth-responses">Responses</h3>

| Status | Meaning                                                 | Description    | Schema                              |
| ------ | ------------------------------------------------------- | -------------- | ----------------------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1) | Service is UP. | [HealthStatus](#schemahealthstatus) |

### Response Headers

| Status | Header        | Type   | Format | Description                                                      |
| ------ | ------------- | ------ | ------ | ---------------------------------------------------------------- |
| 200    | X-Request-Id  | string | uuid   | Echoed correlation ID for distributed tracing and observability. |
| 200    | Cache-Control | string |        | No-cache for health checks.                                      |

<aside class="success">
This operation does not require authentication
</aside>

<h1 id="salesforce-system-api-sapi--profile">Profile</h1>

Core candidate information (Contact, Experience, Education).

## getContacts

<a id="opIdgetContacts"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/contacts", {
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

`GET /contacts`

_Get Contact records_

Retrieves the primary contact details for the portfolio owner.

<h3 id="getcontacts-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                         |
| ------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id  | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| contactName   | query  | string       | false    | Filter by Contact Name.                                             |
| limit         | query  | integer      | false    | Maximum number of records to return.                                |
| offset        | query  | integer      | false    | Pagination offset.                                                  |

> Example responses

> 200 Response

```json
[
  {
    "id": "0035e00000B2O3DAAV",
    "name": "Ryan Bumstead",
    "email": "ryan@ryanbumstead.com",
    "phone": "+1 555-0199",
    "accountId": "0015e00000A1O3DAAV",
    "accountName": "Salesforce",
    "title": "Platform Architect",
    "trailhead": "https://trailblazer.me/id/rbumstead",
    "careerObjective": "Driving digital transformation...",
    "linkedIn": "https://linkedin.com/in/ryanbumstead",
    "portfolio": "https://ryanbumstead.com"
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getcontacts-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Contact records.                 | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure. | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).           | [Error](#schemaerror) |

<h3 id="getcontacts-responseschema">Response Schema</h3>

Status Code **200**

| Name              | Type                        | Required | Restrictions | Description                   |
| ----------------- | --------------------------- | -------- | ------------ | ----------------------------- |
| _anonymous_       | [[Contact](#schemacontact)] | false    | none         | [Contact Information Schema.] |
| » id              | string                      | false    | read-only    | Salesforce Record ID          |
| » name            | string                      | false    | none         | Full Name                     |
| » email           | string(email)               | false    | none         | Email Address                 |
| » phone           | string                      | false    | none         | Phone Number                  |
| » accountId       | string                      | false    | none         | Related Account ID            |
| » accountName     | string                      | false    | none         | Related Account Name          |
| » title           | string                      | false    | none         | Job Title                     |
| » trailhead       | string(uri)¦null            | false    | none         | Trailhead Profile URL         |
| » careerObjective | string¦null                 | false    | none         | Short Professional Summary    |
| » linkedIn        | string(uri)¦null            | false    | none         | LinkedIn Profile URL          |
| » portfolio       | string(uri)¦null            | false    | none         | Portfolio Website URL         |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directive to prevent caching of sensitive/dynamic data.            |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

## getExperience

<a id="opIdgetExperience"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/experience", {
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

`GET /experience`

_Get Experience records_

Retrieves professional experience history.

<h3 id="getexperience-parameters">Parameters</h3>

| Name              | In     | Type         | Required | Description                                                         |
| ----------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version     | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id      | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| contactName       | query  | string       | false    | Filter by Contact Name.                                             |
| employerName      | query  | string       | false    | Filter by Employer Name.                                            |
| currentlyEmployed | query  | boolean      | false    | Filter by active employment status.                                 |
| limit             | query  | integer      | false    | Maximum number of records to return.                                |
| offset            | query  | integer      | false    | Pagination offset.                                                  |

> Example responses

> 200 Response

```json
[
  {
    "id": "a025e00000B2O3DAAV",
    "employerName": "Salesforce",
    "employerId": "0015e00000A1O3DAAV",
    "name": "Technical Architect",
    "startDate": "2023-01-01",
    "endDate": "2025-01-01",
    "isCurrentRole": true,
    "isRemote": true,
    "accomplishments": "<ul><li>Led 5 successful deployments</li></ul>",
    "contactId": "0035e00000B2O3DAAV",
    "contactName": "Ryan Bumstead",
    "sortOrder": 10
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getexperience-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Experience records.              | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure. | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).           | [Error](#schemaerror) |

<h3 id="getexperience-responseschema">Response Schema</h3>

Status Code **200**

| Name              | Type                              | Required | Restrictions | Description                                                                                         |
| ----------------- | --------------------------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------- |
| _anonymous_       | [[Experience](#schemaexperience)] | false    | none         | [Professional Experience Schema.]                                                                   |
| » id              | string                            | false    | read-only    | Salesforce Record ID                                                                                |
| » employerName    | string                            | false    | none         | Employer Name                                                                                       |
| » employerId      | string                            | false    | none         | Employer Account ID                                                                                 |
| » name            | string                            | false    | none         | Role Title                                                                                          |
| » startDate       | string(date)                      | false    | none         | Start Date                                                                                          |
| » endDate         | string(date)¦null                 | false    | none         | End Date (null if current)                                                                          |
| » isCurrentRole   | boolean                           | false    | read-only    | Is Current Role Flag                                                                                |
| » isRemote        | boolean                           | false    | none         | Remote Work Flag                                                                                    |
| » accomplishments | string¦null                       | false    | none         | DEPRECATED: Use /experience-highlights endpoint instead. This field will be removed in SAPI v2.0.0. |
| » contactId       | string                            | false    | none         | Contact ID                                                                                          |
| » contactName     | string                            | false    | none         | Contact Name                                                                                        |
| » sortOrder       | number¦null                       | false    | none         | Sort Order                                                                                          |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directive to prevent caching of sensitive/dynamic data.            |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

## getExperienceHighlights

<a id="opIdgetExperienceHighlights"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/experience-highlights", {
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

`GET /experience-highlights`

_Get Experience Highlights_

Fetches resume bullets. Supports Persona filtering for PAPI optimization.

<h3 id="getexperiencehighlights-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                                                       |
| ------------- | ------ | ------------ | -------- | ------------------------------------------------------------------------------------------------- |
| X-API-Version | header | string       | true     | API Contract Version (e.g., v1).                                                                  |
| X-Request-Id  | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID.                               |
| experienceId  | query  | string       | false    | Filter by Experience Salesforce ID.                                                               |
| persona       | query  | any          | false    | Filters records where the target field (Multi-Select Picklist) includes the specified persona(s). |
| limit         | query  | integer      | false    | Maximum number of records to return.                                                              |
| offset        | query  | integer      | false    | Pagination offset.                                                                                |

#### Detailed descriptions

**persona**: Filters records where the target field (Multi-Select Picklist) includes the specified persona(s).
Can be a single value or multiple values (comma-separated or repeated parameters).

Examples:

- Single: `?persona=Admin`
- Multiple (comma): `?persona=Admin,Developer`
- Multiple (repeated): `?persona=Admin&persona=Developer`

> Example responses

> 200 Response

```json
[
  {
    "id": "a035e00000B2O3DAAV",
    "experienceId": "a025e00000B2O3DAAV",
    "experienceName": "Technical Architect",
    "name": "DevOps Transformation",
    "description": "Implemented CI/CD pipelines reducing deployment time by 80%.",
    "sortOrder": 1,
    "personaTag": "Architect"
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getexperiencehighlights-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Experience Highlights.           | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure. | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).           | [Error](#schemaerror) |

<h3 id="getexperiencehighlights-responseschema">Response Schema</h3>

Status Code **200**

| Name             | Type                                                | Required | Restrictions | Description                            |
| ---------------- | --------------------------------------------------- | -------- | ------------ | -------------------------------------- |
| _anonymous_      | [[ExperienceHighlight](#schemaexperiencehighlight)] | false    | none         | [Experience Bullet Point Schema.]      |
| » id             | string                                              | false    | read-only    | Salesforce Record ID                   |
| » experienceId   | string                                              | false    | none         | Parent Experience ID                   |
| » experienceName | string                                              | false    | none         | Parent Experience Name                 |
| » name           | string                                              | false    | none         | Highlight Title                        |
| » description    | string                                              | false    | none         | Detailed Description                   |
| » sortOrder      | number                                              | false    | none         | Sort Order                             |
| » personaTag     | [Persona](#schemapersona)                           | false    | none         | Target audience for content filtering. |

#### Enumerated Values

| Property   | Value     |
| ---------- | --------- |
| personaTag | Admin     |
| personaTag | Developer |
| personaTag | Architect |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directive to prevent caching of sensitive/dynamic data.            |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

<h1 id="salesforce-system-api-sapi--objects">Objects</h1>

Portfolio entities (Projects, Skills, Certifications).

## getProjects

<a id="opIdgetProjects"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/projects", {
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

`GET /projects`

_Get Project records_

Retrieves portfolio projects.
Example Usage: `/projects?isFeatured=true`

<h3 id="getprojects-parameters">Parameters</h3>

| Name          | In     | Type                                  | Required | Description                                                         |
| ------------- | ------ | ------------------------------------- | -------- | ------------------------------------------------------------------- |
| X-API-Version | header | string                                | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id  | header | string(uuid)                          | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| status        | query  | [ProjectStatus](#schemaprojectstatus) | false    | Filter by Project Status.                                           |
| limit         | query  | integer                               | false    | Maximum number of records to return.                                |
| offset        | query  | integer                               | false    | Pagination offset.                                                  |
| contactName   | query  | string                                | false    | Filter by Contact Name.                                             |
| projectName   | query  | string                                | false    | Filter by Project Name.                                             |
| isFeatured    | query  | boolean                               | false    | Filter only featured projects.                                      |

#### Enumerated Values

| Parameter | Value                   |
| --------- | ----------------------- |
| status    | Live – In Production    |
| status    | Live – Demo / Reference |
| status    | Active Development      |
| status    | On Hold                 |
| status    | Archived                |

> Example responses

> 200 Response

```json
[
  {
    "id": "a015e00000B2O3DAAV",
    "name": "Global CRM Migration",
    "challenge": "Legacy system had 5M duplicate records.",
    "solution": "Implemented MDM strategy using Data 360.",
    "businessValue": "Reduced data storage costs by 40%.",
    "status": "Active Development",
    "dateCompleted": "2025-12-01",
    "heroImageUrl": "https://assets.ryanbumstead.com/hero.jpg",
    "liveUrl": "https://project-demo.com",
    "repositoryUrl": "https://github.com/rdbumstead/project",
    "pillar": "Data Architecture",
    "isFeatured": true,
    "contactName": "Ryan Bumstead",
    "contactId": "0035e00000B2O3DAAV",
    "sortOrder": 10
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getprojects-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Project records.                 | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure. | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).           | [Error](#schemaerror) |

<h3 id="getprojects-responseschema">Response Schema</h3>

Status Code **200**

| Name            | Type                                  | Required | Restrictions | Description                 |
| --------------- | ------------------------------------- | -------- | ------------ | --------------------------- |
| _anonymous_     | [[Project](#schemaproject)]           | false    | none         | [Portfolio Project Schema.] |
| » id            | string                                | false    | read-only    | Salesforce Record ID        |
| » name          | string                                | false    | none         | Project Name                |
| » challenge     | string¦null                           | false    | none         | STAR Method: Situation/Task |
| » solution      | string¦null                           | false    | none         | STAR Method: Action         |
| » businessValue | string¦null                           | false    | none         | STAR Method: Result         |
| » status        | [ProjectStatus](#schemaprojectstatus) | false    | none         | Project Lifecycle Status    |
| » dateCompleted | string(date)¦null                     | false    | none         | Completion Date             |
| » heroImageUrl  | string(uri)¦null                      | false    | none         | Banner Image URL            |
| » liveUrl       | string(uri)¦null                      | false    | none         | Live Demo URL               |
| » repositoryUrl | string(uri)¦null                      | false    | none         | Code Repository URL         |
| » pillar        | string¦null                           | false    | none         | Architectural Pillar        |
| » isFeatured    | boolean                               | false    | none         | Featured Flag for Home Page |
| » contactName   | string                                | false    | none         | Owner Name                  |
| » contactId     | string                                | false    | none         | Owner ID                    |
| » sortOrder     | number¦null                           | false    | none         | Display Sort Order          |

#### Enumerated Values

| Property | Value                   |
| -------- | ----------------------- |
| status   | Live – In Production    |
| status   | Live – Demo / Reference |
| status   | Active Development      |
| status   | On Hold                 |
| status   | Archived                |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directives for caching mechanisms in both requests and responses.  |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

## getProjectAssets

<a id="opIdgetProjectAssets"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/project-assets", {
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

`GET /project-assets`

_Get Project Assets_

Retrieves assets (images, links) associated with a project.

<h3 id="getprojectassets-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                         |
| ------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id  | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| projectId     | query  | string       | false    | Filter by Project Salesforce ID.                                    |
| limit         | query  | integer      | false    | Maximum number of records to return.                                |
| offset        | query  | integer      | false    | Pagination offset.                                                  |

> Example responses

> 200 Response

```json
[
  {
    "id": "a045e00000B2O3DAAV",
    "name": "Architecture Diagram",
    "projectId": "a015e00000B2O3DAAV",
    "projectName": "Global CRM Migration",
    "type": "Image",
    "externalUrl": "https://assets.ryanbumstead.com/arch.png",
    "altText": "C4 Model System Context Diagram",
    "sortOrder": 1
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getprojectassets-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                                                | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Project Assets. Returns empty array if none found. | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure.                   | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.                                 | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                                  | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                                   | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).                             | [Error](#schemaerror) |

<h3 id="getprojectassets-responseschema">Response Schema</h3>

Status Code **200**

| Name          | Type                                  | Required | Restrictions | Description                           |
| ------------- | ------------------------------------- | -------- | ------------ | ------------------------------------- |
| _anonymous_   | [[ProjectAsset](#schemaprojectasset)] | false    | none         | [Project Asset (Image/Video) Schema.] |
| » id          | string                                | false    | read-only    | Salesforce Record ID                  |
| » name        | string                                | false    | none         | Asset Name                            |
| » projectId   | string                                | false    | none         | Parent Project ID                     |
| » projectName | string                                | false    | none         | Parent Project Name                   |
| » type        | [AssetType](#schemaassettype)         | false    | none         | Asset Type                            |
| » externalUrl | string(uri)                           | false    | none         | Asset URL                             |
| » altText     | string¦null                           | false    | none         | Accessibility Alt Text                |
| » sortOrder   | number                                | false    | none         | Sort Order                            |

#### Enumerated Values

| Property | Value    |
| -------- | -------- |
| type     | Image    |
| type     | Video    |
| type     | Document |
| type     | Link     |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directives for caching mechanisms in both requests and responses.  |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

## getTestimonials

<a id="opIdgetTestimonials"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/testimonials", {
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

`GET /testimonials`

_Get Testimonials_

Retrieves received testimonials. Returns only records where Approved\_\_c = true.

<h3 id="gettestimonials-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                         |
| ------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id  | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| limit         | query  | integer      | false    | Maximum number of records to return.                                |
| offset        | query  | integer      | false    | Pagination offset.                                                  |

> Example responses

> 200 Response

```json
[
  {
    "id": "a055e00000B2O3DAAV",
    "name": "Testimonial from Jane Doe",
    "authorName": "Jane Doe",
    "authorTitle": "CTO, Tech Corp",
    "avatarUrl": "https://linkedin.com/image/jane.jpg",
    "relationshipType": "Manager",
    "vibeMode": "Professional",
    "context": "Worked together on the Q1 digital transformation."
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="gettestimonials-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Testimonials. Returns empty array if none found. | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure.                 | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.                               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).                           | [Error](#schemaerror) |

<h3 id="gettestimonials-responseschema">Response Schema</h3>

Status Code **200**

| Name               | Type                                        | Required | Restrictions | Description               |
| ------------------ | ------------------------------------------- | -------- | ------------ | ------------------------- |
| _anonymous_        | [[Testimonial](#schematestimonial)]         | false    | none         | [Social Proof Schema.]    |
| » id               | string                                      | false    | read-only    | Salesforce Record ID      |
| » name             | string                                      | false    | none         | Testimonial Name          |
| » authorName       | string                                      | false    | none         | Author Name               |
| » authorTitle      | string¦null                                 | false    | none         | Author Title              |
| » avatarUrl        | string(uri)¦null                            | false    | none         | Author Avatar URL         |
| » relationshipType | [RelationshipType](#schemarelationshiptype) | false    | none         | Professional Relationship |
| » vibeMode         | [VibeMode](#schemavibemode)                 | false    | none         | Tone/Style Category       |
| » context          | string¦null                                 | false    | none         | Context of Work           |

#### Enumerated Values

| Property         | Value        |
| ---------------- | ------------ |
| relationshipType | Manager      |
| relationshipType | Peer         |
| relationshipType | Client       |
| relationshipType | Recruiter    |
| relationshipType | Fan          |
| vibeMode         | Professional |
| vibeMode         | Casual       |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directive to prevent caching of sensitive/dynamic data.            |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

## getAccounts

<a id="opIdgetAccounts"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/accounts", {
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

`GET /accounts`

_Get Account records_

Retrieves related account/employer records.

<h3 id="getaccounts-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                         |
| ------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id  | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| accountName   | query  | string       | false    | Filter by Account Name.                                             |
| limit         | query  | integer      | false    | Maximum number of records to return.                                |
| offset        | query  | integer      | false    | Pagination offset.                                                  |

> Example responses

> 200 Response

```json
[
  {
    "id": "0015e00000A1O3DAAV",
    "name": "Salesforce",
    "industry": "Technology",
    "abbreviation": "SFDC"
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getaccounts-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Account records.                 | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure. | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).           | [Error](#schemaerror) |

<h3 id="getaccounts-responseschema">Response Schema</h3>

Status Code **200**

| Name           | Type                        | Required | Restrictions | Description                |
| -------------- | --------------------------- | -------- | ------------ | -------------------------- |
| _anonymous_    | [[Account](#schemaaccount)] | false    | none         | [Account/Employer Schema.] |
| » id           | string                      | false    | read-only    | Salesforce Record ID       |
| » name         | string                      | false    | none         | Account Name               |
| » industry     | string¦null                 | false    | none         | Industry                   |
| » abbreviation | string¦null                 | false    | none         | Abbreviation               |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directives for caching mechanisms in both requests and responses.  |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

## getSkills

<a id="opIdgetSkills"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/skills", {
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

`GET /skills`

_Get Skill records_

Retrieves technical skills and proficiency scores.

<h3 id="getskills-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                         |
| ------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id  | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| category      | query  | string       | false    | Filter skills by Category (e.g., 'Development', 'Architecture')     |
| limit         | query  | integer      | false    | Maximum number of records to return.                                |
| offset        | query  | integer      | false    | Pagination offset.                                                  |

> Example responses

> 200 Response

```json
[
  {
    "id": "a075e00000B2O3DAAV",
    "name": "Apex",
    "displayName": "Salesforce Apex",
    "category": "Development",
    "proficiencyScore": 5,
    "iconName": "utility:code",
    "svgPathData": "M10...",
    "colorHex": "#0070d2"
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getskills-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Skill records.                   | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure. | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).           | [Error](#schemaerror) |

<h3 id="getskills-responseschema">Response Schema</h3>

Status Code **200**

| Name               | Type                    | Required | Restrictions | Description               |
| ------------------ | ----------------------- | -------- | ------------ | ------------------------- |
| _anonymous_        | [[Skill](#schemaskill)] | false    | none         | [Skill Schema.]           |
| » id               | string                  | false    | read-only    | Salesforce Record ID      |
| » name             | string                  | false    | none         | Skill Name                |
| » displayName      | string¦null             | false    | none         | Display Name              |
| » category         | string                  | false    | none         | Skill Category            |
| » proficiencyScore | number                  | false    | none         | Self-Reported Proficiency |
| » iconName         | string¦null             | false    | none         | Icon Name                 |
| » svgPathData      | string¦null             | false    | none         | SVG Path Data             |
| » colorHex         | string¦null             | false    | none         | Category Color Hex        |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directives for caching mechanisms in both requests and responses.  |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

## getCertifications

<a id="opIdgetCertifications"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/certifications", {
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

`GET /certifications`

_Get Certification records_

Retrieves professional certifications.

<h3 id="getcertifications-parameters">Parameters</h3>

| Name              | In     | Type         | Required | Description                                                         |
| ----------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version     | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id      | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| contactName       | query  | string       | false    | Filter by Contact Name.                                             |
| issuerName        | query  | string       | false    | Filter by Issuer Name.                                              |
| certificationName | query  | string       | false    | Filter by Certification Name.                                       |
| limit             | query  | integer      | false    | Maximum number of records to return.                                |
| offset            | query  | integer      | false    | Pagination offset.                                                  |

> Example responses

> 200 Response

```json
[
  {
    "id": "a105e00000B2O3DAAV",
    "name": "Application Architect",
    "contactId": "0035e00000B2O3DAAV",
    "contactName": "Ryan Bumstead",
    "issuerId": "0015e00000A1O3DAAV",
    "issuerName": "Salesforce",
    "earnedDate": "2024-05-15"
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getcertifications-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Certification records.           | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure. | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).           | [Error](#schemaerror) |

<h3 id="getcertifications-responseschema">Response Schema</h3>

Status Code **200**

| Name          | Type                                    | Required | Restrictions | Description             |
| ------------- | --------------------------------------- | -------- | ------------ | ----------------------- |
| _anonymous_   | [[Certification](#schemacertification)] | false    | none         | [Certification Schema.] |
| » id          | string                                  | false    | read-only    | Salesforce Record ID    |
| » name        | string                                  | false    | none         | Certification Name      |
| » contactId   | string                                  | false    | none         | Contact ID              |
| » contactName | string                                  | false    | none         | Contact Name            |
| » issuerId    | string                                  | false    | none         | Issuer Account ID       |
| » issuerName  | string                                  | false    | none         | Issuer Name             |
| » earnedDate  | string(date)                            | false    | none         | Date Earned             |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directives for caching mechanisms in both requests and responses.  |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

## getEducation

<a id="opIdgetEducation"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/education", {
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

`GET /education`

_Get Education records_

Retrieves educational background.

<h3 id="geteducation-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                         |
| ------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id  | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| contactName   | query  | string       | false    | Filter by Contact Name.                                             |
| issuerName    | query  | string       | false    | Filter by Issuer Name.                                              |
| limit         | query  | integer      | false    | Maximum number of records to return.                                |
| offset        | query  | integer      | false    | Pagination offset.                                                  |

> Example responses

> 200 Response

```json
[
  {
    "id": "a115e00000B2O3DAAV",
    "name": "Bachelor of Science",
    "contactId": "0035e00000B2O3DAAV",
    "contactName": "Ryan Bumstead",
    "issuerId": "0015e00000A1O3DAAV",
    "issuerName": "University of Technology",
    "fieldOfStudy": "Computer Science",
    "graduationDate": "2018-05-01",
    "gpa": 3.8
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="geteducation-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Education records.               | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure. | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).           | [Error](#schemaerror) |

<h3 id="geteducation-responseschema">Response Schema</h3>

Status Code **200**

| Name             | Type                            | Required | Restrictions | Description           |
| ---------------- | ------------------------------- | -------- | ------------ | --------------------- |
| _anonymous_      | [[Education](#schemaeducation)] | false    | none         | [Education Schema.]   |
| » id             | string                          | false    | read-only    | Salesforce Record ID  |
| » name           | string                          | false    | none         | Degree Name           |
| » contactId      | string                          | false    | none         | Contact ID            |
| » contactName    | string                          | false    | none         | Contact Name          |
| » issuerId       | string                          | false    | none         | University Account ID |
| » issuerName     | string                          | false    | none         | University Name       |
| » fieldOfStudy   | string                          | false    | none         | Field of Study        |
| » graduationDate | string(date)                    | false    | none         | Graduation Date       |
| » gpa            | number¦null                     | false    | none         | GPA                   |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directives for caching mechanisms in both requests and responses.  |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

<h1 id="salesforce-system-api-sapi--junctions">Junctions</h1>

Many-to-many relationships (Project-Skills, Experience-Skills).

## getProjectSkills

<a id="opIdgetProjectSkills"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/project-skills", {
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

`GET /project-skills`

_Get Project-Skill Links_

Retrieves junction records linking Projects to Skills.

<h3 id="getprojectskills-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                         |
| ------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id  | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| projectId     | query  | string       | false    | Filter by Project Salesforce ID.                                    |
| limit         | query  | integer      | false    | Maximum number of records to return.                                |
| offset        | query  | integer      | false    | Pagination offset.                                                  |

> Example responses

> 200 Response

```json
[
  {
    "id": "a065e00000B2O3DAAV",
    "projectId": "a015e00000B2O3DAAV",
    "projectName": "Global CRM Migration",
    "skillId": "a075e00000B2O3DAAV",
    "skillName": "Apex",
    "skillCategory": "Backend Development",
    "skillProficiencyScore": 5
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getprojectskills-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Project-Skill junctions.         | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure. | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).           | [Error](#schemaerror) |

<h3 id="getprojectskills-responseschema">Response Schema</h3>

Status Code **200**

| Name                    | Type                                  | Required | Restrictions | Description                           |
| ----------------------- | ------------------------------------- | -------- | ------------ | ------------------------------------- |
| _anonymous_             | [[ProjectSkill](#schemaprojectskill)] | false    | none         | [Junction Object: Project <-> Skill.] |
| » id                    | string                                | false    | read-only    | Salesforce Record ID                  |
| » projectId             | string                                | false    | none         | Project ID                            |
| » projectName           | string                                | false    | none         | Project Name                          |
| » skillId               | string                                | false    | none         | Skill ID                              |
| » skillName             | string                                | false    | none         | Skill Name                            |
| » skillCategory         | string                                | false    | none         | Skill Category                        |
| » skillProficiencyScore | number                                | false    | none         | Proficiency Score                     |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directives for caching mechanisms in both requests and responses.  |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

## getExperienceSkills

<a id="opIdgetExperienceSkills"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/experience-skills", {
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

`GET /experience-skills`

_Get Experience-Skill Links_

Retrieves junction records linking Experiences to Skills.

<h3 id="getexperienceskills-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                         |
| ------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id  | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| experienceId  | query  | string       | false    | Filter by Experience Salesforce ID.                                 |
| limit         | query  | integer      | false    | Maximum number of records to return.                                |
| offset        | query  | integer      | false    | Pagination offset.                                                  |

> Example responses

> 200 Response

```json
[
  {
    "id": "a085e00000B2O3DAAV",
    "experienceId": "a025e00000B2O3DAAV",
    "experienceName": "Technical Architect",
    "skillId": "a075e00000B2O3DAAV",
    "skillName": "LWC",
    "skillCategory": "Frontend Development",
    "skillProficiencyScore": 4
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getexperienceskills-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Experience-Skill junctions.      | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure. | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).           | [Error](#schemaerror) |

<h3 id="getexperienceskills-responseschema">Response Schema</h3>

Status Code **200**

| Name                    | Type                                        | Required | Restrictions | Description                              |
| ----------------------- | ------------------------------------------- | -------- | ------------ | ---------------------------------------- |
| _anonymous_             | [[ExperienceSkill](#schemaexperienceskill)] | false    | none         | [Junction Object: Experience <-> Skill.] |
| » id                    | string                                      | false    | read-only    | Salesforce Record ID                     |
| » experienceId          | string                                      | false    | none         | Experience ID                            |
| » experienceName        | string                                      | false    | none         | Experience Name                          |
| » skillId               | string                                      | false    | none         | Skill ID                                 |
| » skillName             | string                                      | false    | none         | Skill Name                               |
| » skillCategory         | string                                      | false    | none         | Skill Category                           |
| » skillProficiencyScore | number                                      | false    | none         | Proficiency Score                        |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directives for caching mechanisms in both requests and responses.  |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

## getCertificationSkills

<a id="opIdgetCertificationSkills"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/certification-skills", {
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

`GET /certification-skills`

_Get Certification-Skill Links_

Retrieves junction records linking Certifications to Skills.

<h3 id="getcertificationskills-parameters">Parameters</h3>

| Name            | In     | Type         | Required | Description                                                         |
| --------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version   | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id    | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |
| certificationId | query  | string       | false    | Filter by Certification Salesforce ID.                              |
| limit           | query  | integer      | false    | Maximum number of records to return.                                |
| offset          | query  | integer      | false    | Pagination offset.                                                  |

> Example responses

> 200 Response

```json
[
  {
    "id": "a095e00000B2O3DAAV",
    "certificationId": "a105e00000B2O3DAAV",
    "certificationName": "Salesforce Certified Application Architect",
    "skillId": "a075e00000B2O3DAAV",
    "skillName": "Security",
    "skillCategory": "Architecture",
    "skillProficiencyScore": 5
  }
]
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getcertificationskills-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                              | Schema                |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Certification-Skill junctions.   | Inline                |
| 400    | [Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)           | Invalid request parameters or schema validation failure. | [Error](#schemaerror) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.               | [Error](#schemaerror) |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                                | [Error](#schemaerror) |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                                 | [Error](#schemaerror) |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault).           | [Error](#schemaerror) |

<h3 id="getcertificationskills-responseschema">Response Schema</h3>

Status Code **200**

| Name                    | Type                                              | Required | Restrictions | Description                                 |
| ----------------------- | ------------------------------------------------- | -------- | ------------ | ------------------------------------------- |
| _anonymous_             | [[CertificationSkill](#schemacertificationskill)] | false    | none         | [Junction Object: Certification <-> Skill.] |
| » id                    | string                                            | false    | read-only    | Salesforce Record ID                        |
| » certificationId       | string                                            | false    | none         | Certification ID                            |
| » certificationName     | string                                            | false    | none         | Certification Name                          |
| » skillId               | string                                            | false    | none         | Skill ID                                    |
| » skillName             | string                                            | false    | none         | Skill Name                                  |
| » skillCategory         | string                                            | false    | none         | Skill Category                              |
| » skillProficiencyScore | number                                            | false    | none         | Proficiency Score                           |

### Response Headers

| Status | Header        | Type    | Format | Description                                                        |
| ------ | ------------- | ------- | ------ | ------------------------------------------------------------------ |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 200    | X-Total-Count | integer |        | Total number of records available for this resource (Estimation).  |
| 200    | X-Has-More    | boolean |        | Boolean indicator if more records exist beyond the current offset. |
| 200    | Cache-Control | string  |        | Directives for caching mechanisms in both requests and responses.  |
| 400    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                               |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.   |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
</aside>

<h1 id="salesforce-system-api-sapi--configuration">Configuration</h1>

Global portfolio settings.

## getPortfolioConfig

<a id="opIdgetPortfolioConfig"></a>

> Code samples

```javascript
const headers = {
  Accept: "application/json",
  "X-API-Version": "v1",
  "X-Request-Id": "497f6eca-6276-4993-bfeb-53cbbbba6f08",
  client_id: "API_KEY",
  client_secret: "API_KEY"
};

fetch("https://{domain}/services/apexrest/sapi/v1/portfolio-config", {
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

`GET /portfolio-config`

_Get Portfolio Configuration_

Returns the singleton Global Configuration object (Metadata-driven). Not pageable.

<h3 id="getportfolioconfig-parameters">Parameters</h3>

| Name          | In     | Type         | Required | Description                                                         |
| ------------- | ------ | ------------ | -------- | ------------------------------------------------------------------- |
| X-API-Version | header | string       | true     | API Contract Version (e.g., v1).                                    |
| X-Request-Id  | header | string(uuid) | true     | Correlation ID for distributed tracing (Logs/Splunk). Must be UUID. |

> Example responses

> 200 Response

```json
{
  "ownerEmail": "ryan@ryanbumstead.com",
  "ownerPhone": "+1 555-0199",
  "linkedInUrl": "https://linkedin.com/in/ryanbumstead",
  "gitHubProfileUrl": "https://github.com/ryanbumstead",
  "calendlyUrl": "https://calendly.com/ryanbumstead",
  "trailblazerProfileUrl": "https://trailblazer.me/id/rbumstead",
  "personalWebsiteUrl": "https://ryanbumstead.com",
  "careerObjective": "Looking for Principal Architect roles."
}
```

> 500 Response

```json
{
  "httpStatus": 500,
  "errorCode": "INTERNAL_SERVER_ERROR",
  "message": "Upstream Salesforce processing failed.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true
}
```

<h3 id="getportfolioconfig-responses">Responses</h3>

| Status | Meaning                                                                    | Description                                    | Schema                                    |
| ------ | -------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| 200    | [OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)                    | Successful retrieval of Global Configuration.  | [PortfolioConfig](#schemaportfolioconfig) |
| 401    | [Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)            | Invalid or missing API Client Credentials.     | [Error](#schemaerror)                     |
| 403    | [Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)             | Insufficient permissions.                      | [Error](#schemaerror)                     |
| 404    | [Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)             | The requested resource ID was not found.       | [Error](#schemaerror)                     |
| 429    | [Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)         | API rate limit exceeded.                       | [Error](#schemaerror)                     |
| 500    | [Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1) | Internal platform error (Apex/MuleSoft Fault). | [Error](#schemaerror)                     |

### Response Headers

| Status | Header        | Type    | Format | Description                                                       |
| ------ | ------------- | ------- | ------ | ----------------------------------------------------------------- |
| 200    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.  |
| 200    | Cache-Control | string  |        | Directives for caching mechanisms in both requests and responses. |
| 401    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.  |
| 403    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.  |
| 404    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.  |
| 429    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.  |
| 429    | Retry-After   | integer |        | Seconds until the rate limit resets.                              |
| 500    | X-Request-Id  | string  | uuid   | Echoed correlation ID for distributed tracing and observability.  |

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
ApiClientId & ApiClientSecret
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
  "message": "Offset cannot be negative.",
  "retryable": false,
  "correlationId": "123e4567-e89b-12d3-a456-426614174000"
}
```

Standard Error Response Schema.

### Properties

| Name          | Type         | Required | Restrictions | Description                                           |
| ------------- | ------------ | -------- | ------------ | ----------------------------------------------------- |
| httpStatus    | integer      | true     | read-only    | Standard HTTP Status Code.                            |
| errorCode     | string       | true     | none         | Machine-readable error code constant.                 |
| message       | string       | true     | none         | Human-readable error message.                         |
| retryable     | boolean      | false    | none         | Indicates if the client should retry the request.     |
| correlationId | string(uuid) | true     | none         | Unique ID tracking the request. Matches X-Request-Id. |

#### Enumerated Values

| Property  | Value                  |
| --------- | ---------------------- |
| errorCode | BAD_REQUEST            |
| errorCode | UNAUTHORIZED           |
| errorCode | FORBIDDEN              |
| errorCode | NOT_FOUND              |
| errorCode | RATE_LIMIT_EXCEEDED    |
| errorCode | INTERNAL_SERVER_ERROR  |
| errorCode | SALESFORCE_UNAVAILABLE |
| errorCode | GATEWAY_TIMEOUT        |

<h2 id="tocS_Persona">Persona</h2>
<!-- backwards compatibility -->
<a id="schemapersona"></a>
<a id="schema_Persona"></a>
<a id="tocSpersona"></a>
<a id="tocspersona"></a>

```json
"Architect"
```

Target audience for content filtering.

### Properties

| Name        | Type   | Required | Restrictions | Description                            |
| ----------- | ------ | -------- | ------------ | -------------------------------------- |
| _anonymous_ | string | false    | none         | Target audience for content filtering. |

#### Enumerated Values

| Property    | Value     |
| ----------- | --------- |
| _anonymous_ | Admin     |
| _anonymous_ | Developer |
| _anonymous_ | Architect |

<h2 id="tocS_ProjectStatus">ProjectStatus</h2>
<!-- backwards compatibility -->
<a id="schemaprojectstatus"></a>
<a id="schema_ProjectStatus"></a>
<a id="tocSprojectstatus"></a>
<a id="tocsprojectstatus"></a>

```json
"Active Development"
```

Project Lifecycle Status

### Properties

| Name        | Type   | Required | Restrictions | Description              |
| ----------- | ------ | -------- | ------------ | ------------------------ |
| _anonymous_ | string | false    | none         | Project Lifecycle Status |

#### Enumerated Values

| Property    | Value                   |
| ----------- | ----------------------- |
| _anonymous_ | Live – In Production    |
| _anonymous_ | Live – Demo / Reference |
| _anonymous_ | Active Development      |
| _anonymous_ | On Hold                 |
| _anonymous_ | Archived                |

<h2 id="tocS_AssetType">AssetType</h2>
<!-- backwards compatibility -->
<a id="schemaassettype"></a>
<a id="schema_AssetType"></a>
<a id="tocSassettype"></a>
<a id="tocsassettype"></a>

```json
"Image"
```

Asset Type

### Properties

| Name        | Type   | Required | Restrictions | Description |
| ----------- | ------ | -------- | ------------ | ----------- |
| _anonymous_ | string | false    | none         | Asset Type  |

#### Enumerated Values

| Property    | Value    |
| ----------- | -------- |
| _anonymous_ | Image    |
| _anonymous_ | Video    |
| _anonymous_ | Document |
| _anonymous_ | Link     |

<h2 id="tocS_RelationshipType">RelationshipType</h2>
<!-- backwards compatibility -->
<a id="schemarelationshiptype"></a>
<a id="schema_RelationshipType"></a>
<a id="tocSrelationshiptype"></a>
<a id="tocsrelationshiptype"></a>

```json
"Manager"
```

Professional Relationship

### Properties

| Name        | Type   | Required | Restrictions | Description               |
| ----------- | ------ | -------- | ------------ | ------------------------- |
| _anonymous_ | string | false    | none         | Professional Relationship |

#### Enumerated Values

| Property    | Value     |
| ----------- | --------- |
| _anonymous_ | Manager   |
| _anonymous_ | Peer      |
| _anonymous_ | Client    |
| _anonymous_ | Recruiter |
| _anonymous_ | Fan       |

<h2 id="tocS_VibeMode">VibeMode</h2>
<!-- backwards compatibility -->
<a id="schemavibemode"></a>
<a id="schema_VibeMode"></a>
<a id="tocSvibemode"></a>
<a id="tocsvibemode"></a>

```json
"Professional"
```

Tone/Style Category

### Properties

| Name        | Type   | Required | Restrictions | Description         |
| ----------- | ------ | -------- | ------------ | ------------------- |
| _anonymous_ | string | false    | none         | Tone/Style Category |

#### Enumerated Values

| Property    | Value        |
| ----------- | ------------ |
| _anonymous_ | Professional |
| _anonymous_ | Casual       |

<h2 id="tocS_HealthStatus">HealthStatus</h2>
<!-- backwards compatibility -->
<a id="schemahealthstatus"></a>
<a id="schema_HealthStatus"></a>
<a id="tocShealthstatus"></a>
<a id="tocshealthstatus"></a>

```json
{
  "status": "UP",
  "checkType": "SHALLOW",
  "timestamp": "2019-08-24T14:15:22Z",
  "dependencies": {
    "salesforce": "deferred"
  }
}
```

API Health Status Schema.

### Properties

| Name         | Type              | Required | Restrictions | Description                                                      |
| ------------ | ----------------- | -------- | ------------ | ---------------------------------------------------------------- |
| status       | string            | false    | none         | Overall API Availability.                                        |
| checkType    | string            | false    | none         | SHALLOW = Runtime only. DEEP = Includes downstream dependencies. |
| timestamp    | string(date-time) | false    | none         | ISO 8601 Timestamp of the health check.                          |
| dependencies | object            | false    | none         | Status of downstream systems.                                    |
| » salesforce | string            | false    | none         | Status of Salesforce Core.                                       |

#### Enumerated Values

| Property  | Value    |
| --------- | -------- |
| status    | UP       |
| status    | DOWN     |
| status    | DEGRADED |
| checkType | SHALLOW  |
| checkType | DEEP     |

<h2 id="tocS_Contact">Contact</h2>
<!-- backwards compatibility -->
<a id="schemacontact"></a>
<a id="schema_Contact"></a>
<a id="tocScontact"></a>
<a id="tocscontact"></a>

```json
{
  "id": "0035e00000B2O3DAAV",
  "name": "Ryan Bumstead",
  "email": "ryan@ryanbumstead.com",
  "phone": "+1 555-0199",
  "accountId": "0015e00000A1O3DAAV",
  "accountName": "Salesforce",
  "title": "Platform Architect",
  "trailhead": "https://trailblazer.me/id/rbumstead",
  "careerObjective": "Driving digital transformation...",
  "linkedIn": "https://linkedin.com/in/ryanbumstead",
  "portfolio": "https://ryanbumstead.com"
}
```

Contact Information Schema.

### Properties

| Name            | Type             | Required | Restrictions | Description                |
| --------------- | ---------------- | -------- | ------------ | -------------------------- |
| id              | string           | false    | read-only    | Salesforce Record ID       |
| name            | string           | false    | none         | Full Name                  |
| email           | string(email)    | false    | none         | Email Address              |
| phone           | string           | false    | none         | Phone Number               |
| accountId       | string           | false    | none         | Related Account ID         |
| accountName     | string           | false    | none         | Related Account Name       |
| title           | string           | false    | none         | Job Title                  |
| trailhead       | string(uri)¦null | false    | none         | Trailhead Profile URL      |
| careerObjective | string¦null      | false    | none         | Short Professional Summary |
| linkedIn        | string(uri)¦null | false    | none         | LinkedIn Profile URL       |
| portfolio       | string(uri)¦null | false    | none         | Portfolio Website URL      |

<h2 id="tocS_Project">Project</h2>
<!-- backwards compatibility -->
<a id="schemaproject"></a>
<a id="schema_Project"></a>
<a id="tocSproject"></a>
<a id="tocsproject"></a>

```json
{
  "id": "a015e00000B2O3DAAV",
  "name": "Global CRM Migration",
  "challenge": "Legacy system had 5M duplicate records.",
  "solution": "Implemented MDM strategy using Data 360.",
  "businessValue": "Reduced data storage costs by 40%.",
  "status": "Active Development",
  "dateCompleted": "2025-12-01",
  "heroImageUrl": "https://assets.ryanbumstead.com/hero.jpg",
  "liveUrl": "https://project-demo.com",
  "repositoryUrl": "https://github.com/rdbumstead/project",
  "pillar": "Data Architecture",
  "isFeatured": true,
  "contactName": "Ryan Bumstead",
  "contactId": "0035e00000B2O3DAAV",
  "sortOrder": 10
}
```

Portfolio Project Schema.

### Properties

| Name          | Type                                  | Required | Restrictions | Description                 |
| ------------- | ------------------------------------- | -------- | ------------ | --------------------------- |
| id            | string                                | false    | read-only    | Salesforce Record ID        |
| name          | string                                | false    | none         | Project Name                |
| challenge     | string¦null                           | false    | none         | STAR Method: Situation/Task |
| solution      | string¦null                           | false    | none         | STAR Method: Action         |
| businessValue | string¦null                           | false    | none         | STAR Method: Result         |
| status        | [ProjectStatus](#schemaprojectstatus) | false    | none         | Project Lifecycle Status    |
| dateCompleted | string(date)¦null                     | false    | none         | Completion Date             |
| heroImageUrl  | string(uri)¦null                      | false    | none         | Banner Image URL            |
| liveUrl       | string(uri)¦null                      | false    | none         | Live Demo URL               |
| repositoryUrl | string(uri)¦null                      | false    | none         | Code Repository URL         |
| pillar        | string¦null                           | false    | none         | Architectural Pillar        |
| isFeatured    | boolean                               | false    | none         | Featured Flag for Home Page |
| contactName   | string                                | false    | none         | Owner Name                  |
| contactId     | string                                | false    | none         | Owner ID                    |
| sortOrder     | number¦null                           | false    | none         | Display Sort Order          |

<h2 id="tocS_Experience">Experience</h2>
<!-- backwards compatibility -->
<a id="schemaexperience"></a>
<a id="schema_Experience"></a>
<a id="tocSexperience"></a>
<a id="tocsexperience"></a>

```json
{
  "id": "a025e00000B2O3DAAV",
  "employerName": "Salesforce",
  "employerId": "0015e00000A1O3DAAV",
  "name": "Technical Architect",
  "startDate": "2023-01-01",
  "endDate": "2025-01-01",
  "isCurrentRole": true,
  "isRemote": true,
  "accomplishments": "<ul><li>Led 5 successful deployments</li></ul>",
  "contactId": "0035e00000B2O3DAAV",
  "contactName": "Ryan Bumstead",
  "sortOrder": 10
}
```

Professional Experience Schema.

### Properties

| Name            | Type              | Required | Restrictions | Description                                                                                         |
| --------------- | ----------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------- |
| id              | string            | false    | read-only    | Salesforce Record ID                                                                                |
| employerName    | string            | false    | none         | Employer Name                                                                                       |
| employerId      | string            | false    | none         | Employer Account ID                                                                                 |
| name            | string            | false    | none         | Role Title                                                                                          |
| startDate       | string(date)      | false    | none         | Start Date                                                                                          |
| endDate         | string(date)¦null | false    | none         | End Date (null if current)                                                                          |
| isCurrentRole   | boolean           | false    | read-only    | Is Current Role Flag                                                                                |
| isRemote        | boolean           | false    | none         | Remote Work Flag                                                                                    |
| accomplishments | string¦null       | false    | none         | DEPRECATED: Use /experience-highlights endpoint instead. This field will be removed in SAPI v2.0.0. |
| contactId       | string            | false    | none         | Contact ID                                                                                          |
| contactName     | string            | false    | none         | Contact Name                                                                                        |
| sortOrder       | number¦null       | false    | none         | Sort Order                                                                                          |

<h2 id="tocS_ExperienceHighlight">ExperienceHighlight</h2>
<!-- backwards compatibility -->
<a id="schemaexperiencehighlight"></a>
<a id="schema_ExperienceHighlight"></a>
<a id="tocSexperiencehighlight"></a>
<a id="tocsexperiencehighlight"></a>

```json
{
  "id": "a035e00000B2O3DAAV",
  "experienceId": "a025e00000B2O3DAAV",
  "experienceName": "Technical Architect",
  "name": "DevOps Transformation",
  "description": "Implemented CI/CD pipelines reducing deployment time by 80%.",
  "sortOrder": 1,
  "personaTag": "Architect"
}
```

Experience Bullet Point Schema.

### Properties

| Name           | Type                      | Required | Restrictions | Description                            |
| -------------- | ------------------------- | -------- | ------------ | -------------------------------------- |
| id             | string                    | false    | read-only    | Salesforce Record ID                   |
| experienceId   | string                    | false    | none         | Parent Experience ID                   |
| experienceName | string                    | false    | none         | Parent Experience Name                 |
| name           | string                    | false    | none         | Highlight Title                        |
| description    | string                    | false    | none         | Detailed Description                   |
| sortOrder      | number                    | false    | none         | Sort Order                             |
| personaTag     | [Persona](#schemapersona) | false    | none         | Target audience for content filtering. |

<h2 id="tocS_ProjectAsset">ProjectAsset</h2>
<!-- backwards compatibility -->
<a id="schemaprojectasset"></a>
<a id="schema_ProjectAsset"></a>
<a id="tocSprojectasset"></a>
<a id="tocsprojectasset"></a>

```json
{
  "id": "a045e00000B2O3DAAV",
  "name": "Architecture Diagram",
  "projectId": "a015e00000B2O3DAAV",
  "projectName": "Global CRM Migration",
  "type": "Image",
  "externalUrl": "https://assets.ryanbumstead.com/arch.png",
  "altText": "C4 Model System Context Diagram",
  "sortOrder": 1
}
```

Project Asset (Image/Video) Schema.

### Properties

| Name        | Type                          | Required | Restrictions | Description            |
| ----------- | ----------------------------- | -------- | ------------ | ---------------------- |
| id          | string                        | false    | read-only    | Salesforce Record ID   |
| name        | string                        | false    | none         | Asset Name             |
| projectId   | string                        | false    | none         | Parent Project ID      |
| projectName | string                        | false    | none         | Parent Project Name    |
| type        | [AssetType](#schemaassettype) | false    | none         | Asset Type             |
| externalUrl | string(uri)                   | false    | none         | Asset URL              |
| altText     | string¦null                   | false    | none         | Accessibility Alt Text |
| sortOrder   | number                        | false    | none         | Sort Order             |

<h2 id="tocS_Testimonial">Testimonial</h2>
<!-- backwards compatibility -->
<a id="schematestimonial"></a>
<a id="schema_Testimonial"></a>
<a id="tocStestimonial"></a>
<a id="tocstestimonial"></a>

```json
{
  "id": "a055e00000B2O3DAAV",
  "name": "Testimonial from Jane Doe",
  "authorName": "Jane Doe",
  "authorTitle": "CTO, Tech Corp",
  "avatarUrl": "https://linkedin.com/image/jane.jpg",
  "relationshipType": "Manager",
  "vibeMode": "Professional",
  "context": "Worked together on the Q1 digital transformation."
}
```

Social Proof Schema.

### Properties

| Name             | Type                                        | Required | Restrictions | Description               |
| ---------------- | ------------------------------------------- | -------- | ------------ | ------------------------- |
| id               | string                                      | false    | read-only    | Salesforce Record ID      |
| name             | string                                      | false    | none         | Testimonial Name          |
| authorName       | string                                      | false    | none         | Author Name               |
| authorTitle      | string¦null                                 | false    | none         | Author Title              |
| avatarUrl        | string(uri)¦null                            | false    | none         | Author Avatar URL         |
| relationshipType | [RelationshipType](#schemarelationshiptype) | false    | none         | Professional Relationship |
| vibeMode         | [VibeMode](#schemavibemode)                 | false    | none         | Tone/Style Category       |
| context          | string¦null                                 | false    | none         | Context of Work           |

<h2 id="tocS_ProjectSkill">ProjectSkill</h2>
<!-- backwards compatibility -->
<a id="schemaprojectskill"></a>
<a id="schema_ProjectSkill"></a>
<a id="tocSprojectskill"></a>
<a id="tocsprojectskill"></a>

```json
{
  "id": "a065e00000B2O3DAAV",
  "projectId": "a015e00000B2O3DAAV",
  "projectName": "Global CRM Migration",
  "skillId": "a075e00000B2O3DAAV",
  "skillName": "Apex",
  "skillCategory": "Backend Development",
  "skillProficiencyScore": 5
}
```

Junction Object: Project <-> Skill.

### Properties

| Name                  | Type   | Required | Restrictions | Description          |
| --------------------- | ------ | -------- | ------------ | -------------------- |
| id                    | string | false    | read-only    | Salesforce Record ID |
| projectId             | string | false    | none         | Project ID           |
| projectName           | string | false    | none         | Project Name         |
| skillId               | string | false    | none         | Skill ID             |
| skillName             | string | false    | none         | Skill Name           |
| skillCategory         | string | false    | none         | Skill Category       |
| skillProficiencyScore | number | false    | none         | Proficiency Score    |

<h2 id="tocS_ExperienceSkill">ExperienceSkill</h2>
<!-- backwards compatibility -->
<a id="schemaexperienceskill"></a>
<a id="schema_ExperienceSkill"></a>
<a id="tocSexperienceskill"></a>
<a id="tocsexperienceskill"></a>

```json
{
  "id": "a085e00000B2O3DAAV",
  "experienceId": "a025e00000B2O3DAAV",
  "experienceName": "Technical Architect",
  "skillId": "a075e00000B2O3DAAV",
  "skillName": "LWC",
  "skillCategory": "Frontend Development",
  "skillProficiencyScore": 4
}
```

Junction Object: Experience <-> Skill.

### Properties

| Name                  | Type   | Required | Restrictions | Description          |
| --------------------- | ------ | -------- | ------------ | -------------------- |
| id                    | string | false    | read-only    | Salesforce Record ID |
| experienceId          | string | false    | none         | Experience ID        |
| experienceName        | string | false    | none         | Experience Name      |
| skillId               | string | false    | none         | Skill ID             |
| skillName             | string | false    | none         | Skill Name           |
| skillCategory         | string | false    | none         | Skill Category       |
| skillProficiencyScore | number | false    | none         | Proficiency Score    |

<h2 id="tocS_CertificationSkill">CertificationSkill</h2>
<!-- backwards compatibility -->
<a id="schemacertificationskill"></a>
<a id="schema_CertificationSkill"></a>
<a id="tocScertificationskill"></a>
<a id="tocscertificationskill"></a>

```json
{
  "id": "a095e00000B2O3DAAV",
  "certificationId": "a105e00000B2O3DAAV",
  "certificationName": "Salesforce Certified Application Architect",
  "skillId": "a075e00000B2O3DAAV",
  "skillName": "Security",
  "skillCategory": "Architecture",
  "skillProficiencyScore": 5
}
```

Junction Object: Certification <-> Skill.

### Properties

| Name                  | Type   | Required | Restrictions | Description          |
| --------------------- | ------ | -------- | ------------ | -------------------- |
| id                    | string | false    | read-only    | Salesforce Record ID |
| certificationId       | string | false    | none         | Certification ID     |
| certificationName     | string | false    | none         | Certification Name   |
| skillId               | string | false    | none         | Skill ID             |
| skillName             | string | false    | none         | Skill Name           |
| skillCategory         | string | false    | none         | Skill Category       |
| skillProficiencyScore | number | false    | none         | Proficiency Score    |

<h2 id="tocS_PortfolioConfig">PortfolioConfig</h2>
<!-- backwards compatibility -->
<a id="schemaportfolioconfig"></a>
<a id="schema_PortfolioConfig"></a>
<a id="tocSportfolioconfig"></a>
<a id="tocsportfolioconfig"></a>

```json
{
  "ownerEmail": "ryan@ryanbumstead.com",
  "ownerPhone": "+1 555-0199",
  "linkedInUrl": "https://linkedin.com/in/ryanbumstead",
  "gitHubProfileUrl": "https://github.com/ryanbumstead",
  "calendlyUrl": "https://calendly.com/ryanbumstead",
  "trailblazerProfileUrl": "https://trailblazer.me/id/rbumstead",
  "personalWebsiteUrl": "https://ryanbumstead.com",
  "careerObjective": "Looking for Principal Architect roles."
}
```

Global Config Schema (Custom Metadata).

### Properties

| Name                  | Type             | Required | Restrictions | Description           |
| --------------------- | ---------------- | -------- | ------------ | --------------------- |
| ownerEmail            | string(email)    | false    | none         | Owner Email           |
| ownerPhone            | string¦null      | false    | none         | Owner Phone           |
| linkedInUrl           | string(uri)¦null | false    | none         | LinkedIn URL          |
| gitHubProfileUrl      | string(uri)¦null | false    | none         | GitHub URL            |
| calendlyUrl           | string(uri)¦null | false    | none         | Calendly URL          |
| trailblazerProfileUrl | string(uri)¦null | false    | none         | Trailhead URL         |
| personalWebsiteUrl    | string(uri)¦null | false    | none         | Personal Website URL  |
| careerObjective       | string¦null      | false    | none         | Career Objective Text |

<h2 id="tocS_Account">Account</h2>
<!-- backwards compatibility -->
<a id="schemaaccount"></a>
<a id="schema_Account"></a>
<a id="tocSaccount"></a>
<a id="tocsaccount"></a>

```json
{
  "id": "0015e00000A1O3DAAV",
  "name": "Salesforce",
  "industry": "Technology",
  "abbreviation": "SFDC"
}
```

Account/Employer Schema.

### Properties

| Name         | Type        | Required | Restrictions | Description          |
| ------------ | ----------- | -------- | ------------ | -------------------- |
| id           | string      | false    | read-only    | Salesforce Record ID |
| name         | string      | false    | none         | Account Name         |
| industry     | string¦null | false    | none         | Industry             |
| abbreviation | string¦null | false    | none         | Abbreviation         |

<h2 id="tocS_Skill">Skill</h2>
<!-- backwards compatibility -->
<a id="schemaskill"></a>
<a id="schema_Skill"></a>
<a id="tocSskill"></a>
<a id="tocsskill"></a>

```json
{
  "id": "a075e00000B2O3DAAV",
  "name": "Apex",
  "displayName": "Salesforce Apex",
  "category": "Development",
  "proficiencyScore": 5,
  "iconName": "utility:code",
  "svgPathData": "M10...",
  "colorHex": "#0070d2"
}
```

Skill Schema.

### Properties

| Name             | Type        | Required | Restrictions | Description               |
| ---------------- | ----------- | -------- | ------------ | ------------------------- |
| id               | string      | false    | read-only    | Salesforce Record ID      |
| name             | string      | false    | none         | Skill Name                |
| displayName      | string¦null | false    | none         | Display Name              |
| category         | string      | false    | none         | Skill Category            |
| proficiencyScore | number      | false    | none         | Self-Reported Proficiency |
| iconName         | string¦null | false    | none         | Icon Name                 |
| svgPathData      | string¦null | false    | none         | SVG Path Data             |
| colorHex         | string¦null | false    | none         | Category Color Hex        |

<h2 id="tocS_Certification">Certification</h2>
<!-- backwards compatibility -->
<a id="schemacertification"></a>
<a id="schema_Certification"></a>
<a id="tocScertification"></a>
<a id="tocscertification"></a>

```json
{
  "id": "a105e00000B2O3DAAV",
  "name": "Application Architect",
  "contactId": "0035e00000B2O3DAAV",
  "contactName": "Ryan Bumstead",
  "issuerId": "0015e00000A1O3DAAV",
  "issuerName": "Salesforce",
  "earnedDate": "2024-05-15"
}
```

Certification Schema.

### Properties

| Name        | Type         | Required | Restrictions | Description          |
| ----------- | ------------ | -------- | ------------ | -------------------- |
| id          | string       | false    | read-only    | Salesforce Record ID |
| name        | string       | false    | none         | Certification Name   |
| contactId   | string       | false    | none         | Contact ID           |
| contactName | string       | false    | none         | Contact Name         |
| issuerId    | string       | false    | none         | Issuer Account ID    |
| issuerName  | string       | false    | none         | Issuer Name          |
| earnedDate  | string(date) | false    | none         | Date Earned          |

<h2 id="tocS_Education">Education</h2>
<!-- backwards compatibility -->
<a id="schemaeducation"></a>
<a id="schema_Education"></a>
<a id="tocSeducation"></a>
<a id="tocseducation"></a>

```json
{
  "id": "a115e00000B2O3DAAV",
  "name": "Bachelor of Science",
  "contactId": "0035e00000B2O3DAAV",
  "contactName": "Ryan Bumstead",
  "issuerId": "0015e00000A1O3DAAV",
  "issuerName": "University of Technology",
  "fieldOfStudy": "Computer Science",
  "graduationDate": "2018-05-01",
  "gpa": 3.8
}
```

Education Schema.

### Properties

| Name           | Type         | Required | Restrictions | Description           |
| -------------- | ------------ | -------- | ------------ | --------------------- |
| id             | string       | false    | read-only    | Salesforce Record ID  |
| name           | string       | false    | none         | Degree Name           |
| contactId      | string       | false    | none         | Contact ID            |
| contactName    | string       | false    | none         | Contact Name          |
| issuerId       | string       | false    | none         | University Account ID |
| issuerName     | string       | false    | none         | University Name       |
| fieldOfStudy   | string       | false    | none         | Field of Study        |
| graduationDate | string(date) | false    | none         | Graduation Date       |
| gpa            | number¦null  | false    | none         | GPA                   |

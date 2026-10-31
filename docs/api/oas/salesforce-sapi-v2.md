<h1 id="salesforce-system-api-sapi-">Salesforce System API (SAPI) v2.2.0</h1>

> Scroll down for code samples, example requests and responses. Select a language for code samples from the tabs above or the mobile navigation menu.

System API exposing core Salesforce objects for the Portfolio. This is **version 2**, selected with `X-API-Version: v2`. It returns public keys only. Version 1 is documented in `salesforce-sapi.yaml` and is deprecated (see Versioning below).

### Authentication (ADR-027)
1. **Inbound**: OAuth 2.0 **Client Credentials** issued by the Portfolio API External Client App. Every request carries `Authorization: Bearer <access_token>`. The platform rejects missing, expired or invalid tokens before any Apex executes.
   - **Run-as identity**: a dedicated integration user holding a single read-only permission set (`Integration_Access`). Authorisation is bounded by that permission set, not by the token.
   - **Previous design**: `client_id`/`client_secret` headers validated in Apex against Custom Metadata (ADR-017, superseded). Retired when MuleSoft left the architecture.
2. **On-platform consumers**: the site API Lab proxy and the PAPI health check obtain tokens through the `Portfolio_API` Named Credential (External Credential, Client Credentials principal). No secret is stored in metadata, source, or the browser.
3. **External evaluators**: request a short-lived token from `POST /papi/auth/token` (see the PAPI specification, ADR-028), then call this API with it.

### Architecture & Governance
- **Read-Only Design**: This System API is strictly read-only (GET methods only) by design to minimize attack surface and enforce unidirectional data flow.
- **ID Strategy** (ADR-038): Every record carries a stable public `key`, for example `prj_8f3k2m9qtz`, and `key` is the only identifier. Version 2 returns no `id` field and no Salesforce Id anywhere. Each reference is a key field named for its Id field in version 1 with `Id` replaced by `Key` (`projectKey`, `contactKey`). Every filter that takes a record is named for its key (`projectKey`, `experienceKey` and `certificationKey`) and takes the key only, and a Salesforce Id is treated as an unknown key. The version 1 names (`projectId`, `experienceId`, `certificationId`) are not accepted in version 2 and return `400 BAD_REQUEST`. A key is set once, never changes, and never carries a name.
- **Traceability**: Each API resource maps 1:1 to an Apex `@RestResource` class (`SAPI<Resource>`), and every class runs through the shared `ApiRequestContext`.

### Non-Functional Requirements (NFRs)
- **Observability**: `X-Request-Id` **mandatory** in Request/Response for distributed tracing. A missing or non-UUID value returns `400 BAD_REQUEST` (`ApiRequestContext.applyRequestRules`). The platform echoes a caller-supplied value on every response; Apex sets the header only when it generated the value (ADR-026).
- **Latency**: Target < 500ms for internal processing.
- **Resilience**: 120 requests per minute per caller key, enforced by `RateWindowLimiter` (ADR-025), with `429` responses and `Retry-After` headers. Every vended evaluator token is the same session, so all evaluators share one key and one limit of 120 per minute (ADR-028).
- **Caching Strategy**: 
  - **Public Data** (Skills, Projects, Junctions): `Cache-Control: max-age=300, public`.
  - **Private Data** (Contact, Config): `Cache-Control: max-age=300, private` or `no-store`.

### Design Constraints & Trade-offs
- **Pagination**: Offset-based pagination implemented for simplicity (<200 records). 
  - *Enterprise Note*: For volumes >2,000, this would be refactored to **Keyset/Cursor Pagination** (`WHERE Id > lastSeenId`).
- **Versioning**: Header version (`X-API-Version`) takes precedence over URL versioning. The URL has no version segment. The old URLs with `/v1/` (for example `/sapi/v1/projects`) are aliases of the same calls and answer the same way, with `Deprecation`, `Sunset` and a `Link` header with `rel="canonical"` once their retirement dates are set (ADR-040). Use the URLs in this document. Send `X-API-Version: v2` for this contract. A missing header resolves to `v1`, and any other value returns `400 BAD_REQUEST` that says to send v1 or v2 (ADR-026). Both `X-Request-Id` and `X-API-Version` are echoed on every response.
- **Version 1 sunset**: every version 1 response carries `Deprecation` and `Link` headers, and `Sunset` once the sunset date is set, 30 days after version 2 reaches production. After the sunset date version 1 answers `410 Gone` with a message that gives the retirement date and says to send `X-API-Version: v2`, and the `help` field links to the entry in the Errors section.
- **Removed from version 1**: `accomplishments` on `/experience` is not returned in version 2. Read `/experience-highlights` instead.

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
The caller may not run the class behind the route. The platform refuses it and answers a JSON array (see Responses from the platform below). Not retryable.

<a id="error-not-found"></a>

### NOT_FOUND (404)
The route does not exist, a project key in the path matches no project, or the Api_Versionless_Urls switch is off and only the `/v1/` URLs answer. The message names the method and path, the key, or the `/v1/` URL to use. Not retryable.

<a id="error-method-not-allowed"></a>

### METHOD_NOT_ALLOWED (405)
SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array with an `Allow` header (see Responses from the platform below).

<a id="error-gone"></a>

### GONE (410)
API v1, or the old `/v1/` URL spelling, was retired on the date in the message. Send `X-API-Version: v2`, or call the same URL without `/v1/`. Nothing else about the request changes. The token and health routes are exempt and keep answering. Not retryable.

<a id="error-rate-limit-exceeded"></a>

### RATE_LIMIT_EXCEEDED (429)
One of three limits. The shared limit for the tier is used up, and the message names the tier and the limit. One email asked for too many tokens in the last minute. Or the counter row stayed locked for a moment, and the message says the API is busy. All three carry `Retry-After`, and all three are retryable after that many seconds with no change to the request.

<a id="error-internal-server-error"></a>

### INTERNAL_SERVER_ERROR (500)
Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is ever sent. Retryable: try again in a minute, and if it keeps happening send the id through the contact page.

<a id="error-platform"></a>

### Responses from the platform
Two refusals come from the platform before any of our code runs, so they cannot carry our fields or wording. Each is a JSON array holding objects with `errorCode` and `message`. A token that has ended or was never valid is `401` with `[{"message":"Session expired or invalid","errorCode":"INVALID_SESSION_ID"}]`. A user with no access to the class behind a route is `403` with `[{"errorCode":"FORBIDDEN","message":"You do not have access to the Apex class named: ..."}]`. A POST to a SAPI route is `405` with `[{"errorCode":"METHOD_NOT_ALLOWED","message":"HTTP Method 'POST' not allowed. Allowed are GET,HEAD"}]`. An ended token is the usual cause of the first: tokens end after 30 minutes without use, and `POST /papi/auth/token` gives a new one.

Base URLs:

* <a href="https://{domain}/services/apexrest/sapi">https://{domain}/services/apexrest/sapi</a>

    * **domain** - The org's My Domain host. Default: ryan-bumstead-dev-ed.develop.my.salesforce.com

        * ryan-bumstead-dev-ed.develop.my.salesforce.com

Email: <a href="mailto:ryan@ryanbumstead.com">Ryan Bumstead</a> 
License: <a href="https://opensource.org/licenses/MIT">MIT</a>

# Authentication

- oAuth2 authentication. OAuth 2.0 Client Credentials flow issued by the Portfolio API External Client App (ADR-027).
Tokens run as the read-only integration user. External evaluators obtain a short-lived token
from `POST /papi/auth/token` (ADR-028) instead of holding the consumer secret. Every
evaluator receives the same session, so all evaluators share one rate limit.

    - Flow: clientCredentials

    - Token URL = [https://ryan-bumstead-dev-ed.develop.my.salesforce.com/services/oauth2/token](https://ryan-bumstead-dev-ed.develop.my.salesforce.com/services/oauth2/token)

|Scope|Scope Description|
|---|---|
|api|Access Salesforce REST APIs as the integration user|

<h1 id="salesforce-system-api-sapi--monitoring">Monitoring</h1>

Health checks and observability endpoints.

## getHealth

<a id="opIdgetHealth"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/health',
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

*Health Check*

Shallow check: runtime availability, the current transaction's governor-limit snapshot and org time
(`SAPIHealth.getHealth`, payload from `SAPIHealth.buildPayload`). `checkType` is always SHALLOW.

> Example responses

> 200 Response

```json
{
  "status": "UP",
  "checkType": "SHALLOW",
  "timestamp": "2019-08-24T14:15:22Z",
  "orgTimeZone": "America/Chicago",
  "dependencies": {
    "salesforce": "UP"
  },
  "limits": {
    "queries": {
      "used": 1,
      "limit": 100
    },
    "dmlStatements": {
      "used": 1,
      "limit": 100
    },
    "callouts": {
      "used": 1,
      "limit": 100
    },
    "cpuTimeMs": {
      "used": 1,
      "limit": 100
    },
    "heapBytes": {
      "used": 1,
      "limit": 100
    }
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="gethealth-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Service is UP.|[HealthStatus](#schemahealthstatus)|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|Cache-Control|string||No-cache for health checks.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

<h1 id="salesforce-system-api-sapi--profile">Profile</h1>

Core candidate information (Contact, Experience, Education).

## getContacts

<a id="opIdgetContacts"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/contacts',
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

`GET /contacts`

*Get Contact records*

Retrieves the primary contact details for the portfolio owner. Returns only the Contact flagged as the portfolio owner (`Is_Portfolio_Owner__c`).

<h3 id="getcontacts-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|contactName|query|string|false|Filter by Contact Name.|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

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
    "key": "con_7c5j3w9sfa",
    "name": "Ryan Bumstead",
    "title": "Platform Architect",
    "trailhead": "https://trailblazer.me/id/rbumstead",
    "careerObjective": "Driving digital transformation...",
    "linkedIn": "https://linkedin.com/in/ryanbumstead",
    "portfolio": "https://ryanbumstead.com"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getcontacts-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Contact records.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getcontacts-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[Contact](#schemacontact)]|false|none|[Contact Information Schema. The contact's email and phone are never returned.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» name|string|false|none|Full Name|
|» title|string|false|none|Job Title|
|» trailhead|string(uri)¦null|false|none|Trailhead Profile URL|
|» careerObjective|string¦null|false|none|Short Professional Summary|
|» linkedIn|string(uri)¦null|false|none|LinkedIn Profile URL|
|» portfolio|string(uri)¦null|false|none|Portfolio Website URL|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directive to prevent caching of sensitive/dynamic data.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getExperience

<a id="opIdgetExperience"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/experience',
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

`GET /experience`

*Get Experience records*

Retrieves professional experience history.

<h3 id="getexperience-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|contactName|query|string|false|Filter by Contact Name.|
|employerName|query|string|false|Filter by Employer Name.|
|currentlyEmployed|query|boolean|false|Filter by active employment status.|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

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
    "key": "exp_4h7n2c8wpd",
    "employerName": "Salesforce",
    "employerKey": "acc_2t8e6y4mgb",
    "name": "Technical Architect",
    "startDate": "2023-01-01",
    "endDate": "2025-01-01",
    "isCurrentRole": true,
    "isRemote": true,
    "contactKey": "con_7c5j3w9sfa",
    "contactName": "Ryan Bumstead",
    "sortOrder": 10
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getexperience-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Experience records.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getexperience-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[Experience](#schemaexperience)]|false|none|[Professional Experience Schema.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» employerName|string|false|none|Employer Name|
|» employerKey|string|false|none|Public key of the employer.|
|» name|string|false|none|Role Title|
|» startDate|string(date)|false|none|Start Date|
|» endDate|string(date)¦null|false|none|End Date (null if current)|
|» isCurrentRole|boolean|false|read-only|Is Current Role Flag|
|» isRemote|boolean|false|none|Remote Work Flag|
|» contactKey|string|false|none|Public key of the contact.|
|» contactName|string|false|none|Contact Name|
|» sortOrder|number¦null|false|none|Sort Order|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directive to prevent caching of sensitive/dynamic data.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getExperienceHighlights

<a id="opIdgetExperienceHighlights"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/experience-highlights',
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

`GET /experience-highlights`

*Get Experience Highlights*

Fetches resume bullets. Supports Persona filtering for PAPI optimization. An unknown `persona` value returns 400. An `experienceKey` that is not a known key, a Salesforce Id included, is treated as an unknown key. The version 1 name `experienceId` is not accepted in version 2 and returns `400 BAD_REQUEST`.

<h3 id="getexperiencehighlights-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|experienceKey|query|string|false|Filter by Experience public key, for example `exp_4h7n2c8wpd`. A Salesforce Id is not accepted in v2 and is treated as an unknown key. The version 1 name `experienceId` returns 400.|
|persona|query|string|false|Filters records where the target field (Multi-Select Picklist) includes the specified persona(s).|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

#### Detailed descriptions

**persona**: Filters records where the target field (Multi-Select Picklist) includes the specified persona(s).
Takes a single value or a comma-separated list of Admin, Developer and Architect. An unknown value returns 400.

Examples:
- Single: `?persona=Admin`
- Multiple (comma): `?persona=Admin,Developer`

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
    "key": "hlt_9d3p7k5vxn",
    "experienceKey": "exp_4h7n2c8wpd",
    "experienceName": "Technical Architect",
    "name": "DevOps Transformation",
    "description": "Implemented CI/CD pipelines reducing deployment time by 80%.",
    "sortOrder": 1,
    "personaTag": "Developer;Architect"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getexperiencehighlights-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Experience Highlights.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getexperiencehighlights-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[ExperienceHighlight](#schemaexperiencehighlight)]|false|none|[Experience Bullet Point Schema.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» experienceKey|string|false|none|Public key of the experience.|
|» experienceName|string|false|none|Parent Experience Name|
|» name|string|false|none|Highlight Title|
|» description|string|false|none|Detailed Description|
|» sortOrder|number|false|none|Sort Order|
|» personaTag|string|false|none|Semicolon-separated Persona values from the Persona_Tag__c multi-select picklist (Admin, Developer, Architect).|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directive to prevent caching of sensitive/dynamic data.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

<h1 id="salesforce-system-api-sapi--objects">Objects</h1>

Portfolio entities (Projects, Skills, Certifications).

## getProjects

<a id="opIdgetProjects"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/projects',
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

`GET /projects`

*Get Project records*

Retrieves portfolio projects.
Example Usage: `/projects?isFeatured=true`

Add a project key to the path, as in `/projects/prj_8f3k2m9qtz`, to read one project. A key that
matches no project returns 404 NOT_FOUND, and the message says that this path takes a key and not
a Salesforce Id.

<h3 id="getprojects-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|status|query|[ProjectStatus](#schemaprojectstatus)|false|Filter by Project Status.|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|
|contactName|query|string|false|Filter by Contact Name.|
|projectName|query|string|false|Filter by Project Name.|
|isFeatured|query|boolean|false|Filter only featured projects.|

#### Enumerated Values

|Parameter|Value|
|---|---|
|X-API-Version|v1|
|X-API-Version|v2|
|status|Live – In Production|
|status|Live – Demo / Reference|
|status|Active Development|
|status|On Hold|
|status|Archived|

> Example responses

> 200 Response

```json
[
  {
    "key": "prj_8f3k2m9qtz",
    "name": "Global CRM Migration",
    "challenge": "Legacy system had 5M duplicate records.",
    "solution": "Implemented MDM strategy using Data Cloud.",
    "businessValue": "Reduced data storage costs by 40%.",
    "status": "Active Development",
    "dateCompleted": "2025-12-01",
    "heroImageUrl": "https://example.com/images/hero.jpg",
    "liveUrl": "https://example.com/demo",
    "repositoryUrl": "https://github.com/rdbumstead/project",
    "pillar": "A",
    "pillarLabel": "Pillar A: Business Architecture",
    "isFeatured": true,
    "contactName": "Ryan Bumstead",
    "contactKey": "con_7c5j3w9sfa",
    "sortOrder": 10
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getprojects-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Project records.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getprojects-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[Project](#schemaproject)]|false|none|[Portfolio Project Schema.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» name|string|false|none|Project Name|
|» challenge|string¦null|false|none|STAR Method: Situation/Task|
|» solution|string¦null|false|none|STAR Method: Action|
|» businessValue|string¦null|false|none|STAR Method: Result|
|» status|[ProjectStatus](#schemaprojectstatus)|false|none|Project Lifecycle Status|
|» dateCompleted|string(date)¦null|false|none|Completion Date|
|» heroImageUrl|string(uri)¦null|false|none|Banner Image URL|
|» liveUrl|string(uri)¦null|false|none|Live Demo URL|
|» repositoryUrl|string(uri)¦null|false|none|Code Repository URL|
|» pillar|string¦null|false|none|Architectural Pillar|
|» pillarLabel|string¦null|false|none|Architectural Pillar Label|
|» isFeatured|boolean|false|none|Featured Flag for Home Page|
|» contactName|string|false|none|Owner Name|
|» contactKey|string|false|none|Public key of the contact.|
|» sortOrder|number¦null|false|none|Display Sort Order|

#### Enumerated Values

|Property|Value|
|---|---|
|status|Live – In Production|
|status|Live – Demo / Reference|
|status|Active Development|
|status|On Hold|
|status|Archived|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directives for caching mechanisms in both requests and responses.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getProjectAssets

<a id="opIdgetProjectAssets"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/project-assets',
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

`GET /project-assets`

*Get Project Assets*

Retrieves assets (images, links) associated with a project. A filter that is not a known key, a Salesforce Id included, is treated as an unknown key.

<h3 id="getprojectassets-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|projectKey|query|string|false|Filter by Project public key, for example `prj_8f3k2m9qtz`. A Salesforce Id is not accepted in v2 and is treated as an unknown key. The version 1 name `projectId` returns 400.|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

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
    "key": "pas_4n7s3f9tdk",
    "name": "Architecture Diagram",
    "projectKey": "prj_8f3k2m9qtz",
    "projectName": "Global CRM Migration",
    "type": "Image",
    "externalUrl": "https://example.com/images/diagram.png",
    "altText": "C4 Model System Context Diagram",
    "sortOrder": 1
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getprojectassets-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Project Assets. Returns empty array if none found.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getprojectassets-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[ProjectAsset](#schemaprojectasset)]|false|none|[Project Asset (Image/Video) Schema.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» name|string|false|none|Asset Name|
|» projectKey|string|false|none|Public key of the project.|
|» projectName|string|false|none|Parent Project Name|
|» type|[AssetType](#schemaassettype)|false|none|Asset Type|
|» externalUrl|string(uri)|false|none|Asset URL|
|» altText|string¦null|false|none|Accessibility Alt Text|
|» sortOrder|number|false|none|Sort Order|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directives for caching mechanisms in both requests and responses.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getTestimonials

<a id="opIdgetTestimonials"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/testimonials',
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

`GET /testimonials`

*Get Testimonials*

Retrieves received testimonials. Returns only records where Approved__c = true.

<h3 id="gettestimonials-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

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
    "key": "tst_2y7a5d9wmh",
    "name": "Testimonial from Jane Doe",
    "authorName": "Jane Doe",
    "authorTitle": "CTO, Tech Corp",
    "avatarUrl": "https://example.com/images/avatar.jpg",
    "relationshipType": "Manager",
    "vibeMode": "Professional",
    "context": "Worked together on the Q1 digital transformation."
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="gettestimonials-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Testimonials. Returns empty array if none found.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="gettestimonials-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[Testimonial](#schematestimonial)]|false|none|[Social Proof Schema.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» name|string|false|none|Testimonial Name|
|» authorName|string|false|none|Author Name|
|» authorTitle|string¦null|false|none|Author Title|
|» avatarUrl|string(uri)¦null|false|none|Author Avatar URL|
|» relationshipType|[RelationshipType](#schemarelationshiptype)|false|none|Professional Relationship|
|» vibeMode|[VibeMode](#schemavibemode)|false|none|Tone/Style Category|
|» context|string¦null|false|none|Context of Work|

#### Enumerated Values

|Property|Value|
|---|---|
|relationshipType|Manager|
|relationshipType|Peer|
|relationshipType|Client|
|relationshipType|Recruiter|
|relationshipType|Fan|
|vibeMode|Professional|
|vibeMode|Casual|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directive to prevent caching of sensitive/dynamic data.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getAccounts

<a id="opIdgetAccounts"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/accounts',
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

`GET /accounts`

*Get Account records*

Retrieves related account/employer records.

<h3 id="getaccounts-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|accountName|query|string|false|Filter by Account Name.|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

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
    "key": "acc_2t8e6y4mgb",
    "name": "Salesforce",
    "industry": "Technology",
    "abbreviation": "SFDC"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getaccounts-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Account records.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getaccounts-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[Account](#schemaaccount)]|false|none|[Account/Employer Schema.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» name|string|false|none|Account Name|
|» industry|string¦null|false|none|Industry|
|» abbreviation|string¦null|false|none|Abbreviation|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directives for caching mechanisms in both requests and responses.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getSkills

<a id="opIdgetSkills"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/skills',
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

`GET /skills`

*Get Skill records*

Retrieves technical skills and proficiency scores.

<h3 id="getskills-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|category|query|string|false|Filter skills by Category, one of the Skill Category picklist values, for example 'Backend', 'Frontend' or 'Integration'.|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

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
    "key": "skl_3m9x5b2rkt",
    "name": "Apex",
    "displayName": "Salesforce Apex",
    "category": "Development",
    "proficiencyScore": 5,
    "iconName": "utility:code",
    "svgPathData": "M10...",
    "colorHex": "#0070d2",
    "categoryOrder": 10
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getskills-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Skill records.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getskills-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[Skill](#schemaskill)]|false|none|[Skill Schema.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» name|string|false|none|Skill Name|
|» displayName|string¦null|false|none|Display Name|
|» category|string|false|none|Skill Category|
|» proficiencyScore|number|false|none|Self-Reported Proficiency|
|» iconName|string¦null|false|none|Icon Name|
|» svgPathData|string¦null|false|none|SVG Path Data|
|» colorHex|string¦null|false|none|Category Color Hex|
|» categoryOrder|number|false|none|Category Order|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directives for caching mechanisms in both requests and responses.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getCertifications

<a id="opIdgetCertifications"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/certifications',
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

`GET /certifications`

*Get Certification records*

Retrieves professional certifications.

<h3 id="getcertifications-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|contactName|query|string|false|Filter by Contact Name.|
|issuerName|query|string|false|Filter by Issuer Name.|
|certificationName|query|string|false|Filter by Certification Name.|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

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
    "key": "crt_6q2v8d4nhz",
    "name": "Application Architect",
    "contactKey": "con_7c5j3w9sfa",
    "contactName": "Ryan Bumstead",
    "issuerKey": "acc_2t8e6y4mgb",
    "issuerName": "Salesforce",
    "earnedDate": "2024-05-15"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getcertifications-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Certification records.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getcertifications-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[Certification](#schemacertification)]|false|none|[Certification Schema.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» name|string|false|none|Certification Name|
|» contactKey|string|false|none|Public key of the contact.|
|» contactName|string|false|none|Contact Name|
|» issuerKey|string|false|none|Public key of the issuer.|
|» issuerName|string|false|none|Issuer Name|
|» earnedDate|string(date)|false|none|Date Earned|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directives for caching mechanisms in both requests and responses.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getEducation

<a id="opIdgetEducation"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/education',
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

`GET /education`

*Get Education records*

Retrieves educational background.

<h3 id="geteducation-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|contactName|query|string|false|Filter by Contact Name.|
|issuerName|query|string|false|Filter by Issuer Name.|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

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
    "key": "edu_6b4c8j2rvq",
    "name": "Bachelor of Science",
    "contactKey": "con_7c5j3w9sfa",
    "contactName": "Ryan Bumstead",
    "issuerKey": "acc_2t8e6y4mgb",
    "issuerName": "University of Technology",
    "fieldOfStudy": "Computer Science",
    "graduationDate": "2018-05-01",
    "gpa": 3.8
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="geteducation-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Education records.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="geteducation-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[Education](#schemaeducation)]|false|none|[Education Schema.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» name|string|false|none|Degree Name|
|» contactKey|string|false|none|Public key of the contact.|
|» contactName|string|false|none|Contact Name|
|» issuerKey|string|false|none|Public key of the issuer.|
|» issuerName|string|false|none|University Name|
|» fieldOfStudy|string|false|none|Field of Study|
|» graduationDate|string(date)|false|none|Graduation Date|
|» gpa|number¦null|false|none|GPA|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directives for caching mechanisms in both requests and responses.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

<h1 id="salesforce-system-api-sapi--junctions">Junctions</h1>

Many-to-many relationships (Project-Skills, Experience-Skills).

## getProjectSkills

<a id="opIdgetProjectSkills"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/project-skills',
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

`GET /project-skills`

*Get Project-Skill Links*

Retrieves junction records linking Projects to Skills. A filter that is not a known key, a Salesforce Id included, is treated as an unknown key.

<h3 id="getprojectskills-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|projectKey|query|string|false|Filter by Project public key, for example `prj_8f3k2m9qtz`. A Salesforce Id is not accepted in v2 and is treated as an unknown key. The version 1 name `projectId` returns 400.|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

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
    "key": "prs_8w2m6g4bha",
    "projectKey": "prj_8f3k2m9qtz",
    "projectName": "Global CRM Migration",
    "skillKey": "skl_3m9x5b2rkt",
    "skillName": "Apex",
    "skillCategory": "Backend Development",
    "skillProficiencyScore": 5
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getprojectskills-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Project-Skill junctions.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getprojectskills-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[ProjectSkill](#schemaprojectskill)]|false|none|[Junction Object: Project <-> Skill.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» projectKey|string|false|none|Public key of the project.|
|» projectName|string|false|none|Project Name|
|» skillKey|string|false|none|Public key of the skill.|
|» skillName|string|false|none|Skill Name|
|» skillCategory|string|false|none|Skill Category|
|» skillProficiencyScore|number|false|none|Proficiency Score|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directives for caching mechanisms in both requests and responses.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getExperienceSkills

<a id="opIdgetExperienceSkills"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/experience-skills',
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

`GET /experience-skills`

*Get Experience-Skill Links*

Retrieves junction records linking Experiences to Skills. A filter that is not a known key, a Salesforce Id included, is treated as an unknown key.

<h3 id="getexperienceskills-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|experienceKey|query|string|false|Filter by Experience public key, for example `exp_4h7n2c8wpd`. A Salesforce Id is not accepted in v2 and is treated as an unknown key. The version 1 name `experienceId` returns 400.|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

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
    "key": "exs_5r8h2q6cjw",
    "experienceKey": "exp_4h7n2c8wpd",
    "experienceName": "Technical Architect",
    "skillKey": "skl_3m9x5b2rkt",
    "skillName": "LWC",
    "skillCategory": "Frontend Development",
    "skillProficiencyScore": 4
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getexperienceskills-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Experience-Skill junctions.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getexperienceskills-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[ExperienceSkill](#schemaexperienceskill)]|false|none|[Junction Object: Experience <-> Skill.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» experienceKey|string|false|none|Public key of the experience.|
|» experienceName|string|false|none|Experience Name|
|» skillKey|string|false|none|Public key of the skill.|
|» skillName|string|false|none|Skill Name|
|» skillCategory|string|false|none|Skill Category|
|» skillProficiencyScore|number|false|none|Proficiency Score|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directives for caching mechanisms in both requests and responses.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

## getCertificationSkills

<a id="opIdgetCertificationSkills"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/certification-skills',
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

`GET /certification-skills`

*Get Certification-Skill Links*

Retrieves junction records linking Certifications to Skills. A filter that is not a known key, a Salesforce Id included, is treated as an unknown key.

<h3 id="getcertificationskills-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|
|certificationKey|query|string|false|Filter by Certification public key, for example `crt_6q2v8d4nhz`. A Salesforce Id is not accepted in v2 and is treated as an unknown key. The version 1 name `certificationId` returns 400.|
|limit|query|integer|false|Maximum number of records to return.|
|offset|query|integer|false|Pagination offset, from 0 to 2000. A larger value returns 400 BAD_REQUEST, because the platform allows no larger SOQL offset. The X-Total-Count header says how many records there are.|

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
    "key": "cks_3k9z5x7pne",
    "certificationKey": "crt_6q2v8d4nhz",
    "certificationName": "Salesforce Certified Application Architect",
    "skillKey": "skl_3m9x5b2rkt",
    "skillName": "Security",
    "skillCategory": "Architecture",
    "skillProficiencyScore": 5
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getcertificationskills-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Certification-Skill junctions.|Inline|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getcertificationskills-responseschema">Response Schema</h3>

Status Code **200**

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|[[CertificationSkill](#schemacertificationskill)]|false|none|[Junction Object: Certification <-> Skill.]|
|» key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|» certificationKey|string|false|none|Public key of the certification.|
|» certificationName|string|false|none|Certification Name|
|» skillKey|string|false|none|Public key of the skill.|
|» skillName|string|false|none|Skill Name|
|» skillCategory|string|false|none|Skill Category|
|» skillProficiencyScore|number|false|none|Proficiency Score|

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|X-Total-Count|integer||Total number of records that match the request, so a filtered list reports the filtered total. With no filter it is every record the resource can return. The total is the same on every page of one request.|
|200|X-Has-More|boolean||Boolean indicator if more records exist beyond the current offset.|
|200|Cache-Control|string||Directives for caching mechanisms in both requests and responses.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
</aside>

<h1 id="salesforce-system-api-sapi--configuration">Configuration</h1>

Global portfolio settings.

## getPortfolioConfig

<a id="opIdgetPortfolioConfig"></a>

> Code samples

```javascript

const headers = {
  'Accept':'application/json',
  'X-API-Version':'v2',
  'X-Request-Id':'497f6eca-6276-4993-bfeb-53cbbbba6f08',
  'Authorization':'Bearer {access-token}'
};

fetch('https://{domain}/services/apexrest/sapi/portfolio-config',
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

`GET /portfolio-config`

*Get Portfolio Configuration*

Returns the singleton Global Configuration object (Metadata-driven). Not pageable.

<h3 id="getportfolioconfig-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|X-API-Version|header|string|false|API Contract Version. Send v2 for this contract. Missing resolves to v1, which is deprecated; any other value returns 400 BAD_REQUEST that says to send v1 or v2 (ADR-026).|
|X-Request-Id|header|string(uuid)|true|Correlation ID for distributed tracing. Required on SAPI; missing or non-UUID returns 400 BAD_REQUEST (ADR-026).|

#### Enumerated Values

|Parameter|Value|
|---|---|
|X-API-Version|v1|
|X-API-Version|v2|

> Example responses

> 200 Response

```json
{
  "linkedInUrl": "https://linkedin.com/in/ryanbumstead",
  "gitHubProfileUrl": "https://example.com/source",
  "calendlyUrl": "https://example.com/schedule",
  "trailblazerProfileUrl": "https://trailblazer.me/id/rbumstead",
  "personalWebsiteUrl": "https://ryanbumstead.com",
  "careerObjective": "Looking for Principal Architect roles.",
  "jiraProjectKey": "SPAP",
  "gitHubRepoPath": "rdbumstead/salesforce-portfolio"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "X-Request-Id must be a UUID like 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. On /papi routes you can leave it out and one is made for you.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "offset must be a whole number from 0 to 2000. The X-Total-Count header says how many records there are.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "limit must be a whole number from 1 to 200. Leave it out to get the default page size.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "In v2 this filter is called projectKey, and it takes a public key. Rename projectId to projectKey.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "projectKey must be a public key, the key field of a record from GET /sapi/projects. A Salesforce Id does not work in v2.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "persona must be Admin, Developer or Architect. To ask for more than one, separate them with commas.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

```json
{
  "httpStatus": 400,
  "errorCode": "BAD_REQUEST",
  "message": "Send an X-Request-Id header holding a UUID, for example X-Request-Id: 3f1c9b2e-8d4a-4c1e-9b7f-2a6d5e4c3b1a. It lets a request be traced in the logs.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
}
```

> No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.

```json
{
  "httpStatus": 401,
  "errorCode": "UNAUTHORIZED",
  "message": "This route needs an evaluator token. Get one with POST https://ryan-bumstead-dev-ed.develop.my.site.com/portfoliovforcesite/services/apexrest/papi/auth/token and a JSON body with your email and a purpose. Then call /sapi/skills on the instance_url from that answer, with the header Authorization: Bearer <access_token>.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-unauthorized"
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

> The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.

```json
[
  {
    "errorCode": "FORBIDDEN",
    "message": "You do not have access to the Apex class named: SAPISkill"
  }
]
```

> The route does not exist, or the key in the path matches no record.

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "There is no GET /sapi/nothing in this API. The routes are listed in the API reference.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "Versionless URLs are switched off. Use /services/apexrest/sapi/v1/skills.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

```json
{
  "httpStatus": 404,
  "errorCode": "NOT_FOUND",
  "message": "No project has the key prj_nothere. GET /sapi/projects lists every project with its key. This path takes a key, not a Salesforce Id.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-not-found"
}
```

> SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.

```json
[
  {
    "errorCode": "METHOD_NOT_ALLOWED",
    "message": "HTTP Method 'POST' not allowed. Allowed are GET,HEAD"
  }
]
```

> API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "API v1 was retired on 2026-11-29. Send the header X-API-Version: v2 and call the same URL again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

```json
{
  "httpStatus": 410,
  "errorCode": "GONE",
  "message": "URLs with /v1/ were retired on 2026-11-29. Call /services/apexrest/sapi/skills instead. Nothing else about the request changes.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": false,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-gone"
}
```

> The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "This API allows 120 requests a minute on SAPI routes, shared by every evaluator. Wait 42 seconds and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
}
```

```json
{
  "httpStatus": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "message": "The API is busy for a moment. Wait 1 second and send the request again.",
  "correlationId": "123e4567-e89b-12d3-a456-426614174000",
  "retryable": true,
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-rate-limit-exceeded"
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-internal-server-error"
}
```

<h3 id="getportfolioconfig-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|[OK](https://tools.ietf.org/html/rfc7231#section-6.3.1)|Successful retrieval of Global Configuration. Returns an empty object when no configuration record exists.|[PortfolioConfig](#schemaportfolioconfig)|
|400|[Bad Request](https://tools.ietf.org/html/rfc7231#section-6.5.1)|The request was refused before any data was read. The message names the header, parameter or field to change.|[Error](#schemaerror)|
|401|[Unauthorized](https://tools.ietf.org/html/rfc7235#section-3.1)|No token, or a token that has ended. A caller on the site address with no token gets our error object with a Bearer challenge. A bad or ended token on the instance address is refused by the platform, which answers a JSON array and not our error object.|Inline|
|403|[Forbidden](https://tools.ietf.org/html/rfc7231#section-6.5.3)|The caller may not run the class that serves this route. The platform refuses the call before our code runs and answers a JSON array and not our error object.|[PlatformErrorList](#schemaplatformerrorlist)|
|404|[Not Found](https://tools.ietf.org/html/rfc7231#section-6.5.4)|The route does not exist, or the key in the path matches no record.|[Error](#schemaerror)|
|405|[Method Not Allowed](https://tools.ietf.org/html/rfc7231#section-6.5.5)|SAPI takes GET only. The platform refuses any other method before our code runs and answers a JSON array and not our error object, with an Allow header.|[PlatformErrorList](#schemaplatformerrorlist)|
|410|[Gone](https://tools.ietf.org/html/rfc7231#section-6.5.9)|API v1, or the old /v1/ URL, was retired. Send X-API-Version: v2, or call the versionless URL.|[Error](#schemaerror)|
|429|[Too Many Requests](https://tools.ietf.org/html/rfc6585#section-4)|The rate limit was used up (ADR-025, ADR-028). Retry-After says how many seconds to wait.|[Error](#schemaerror)|
|500|[Internal Server Error](https://tools.ietf.org/html/rfc7231#section-6.6.1)|Something failed that the API did not plan for. The message holds the correlation id, and the detail is in the log under that id. No exception text is sent.|[Error](#schemaerror)|

<h3 id="getportfolioconfig-responseschema">Response Schema</h3>

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

### Response Headers

|Status|Header|Type|Format|Description|
|---|---|---|---|---|
|200|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|200|Cache-Control|string||Private configuration data; shared caches must not store it.|
|400|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|401|WWW-Authenticate|string||Bearer, when the caller sent no token at all.|
|403|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|404|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|405|Allow|string||The methods the route takes.|
|410|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|
|429|Retry-After|integer||Seconds to wait before the same request can succeed.|
|500|X-Request-Id|string|uuid|Correlation ID. A valid caller-supplied value is echoed by the platform; Apex sets the header only when it generated the value (missing or non-UUID request header).|

<aside class="warning">
To perform this operation, you must be authenticated by means of one of the following methods:
OAuth2ClientCredentials ( Scopes: api )
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
  "help": "https://ryanbumstead.com/api-lab/reference?spec=sapi&version=v2#error-bad-request"
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

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|string|false|none|Target audience for content filtering.|

#### Enumerated Values

|Property|Value|
|---|---|
|*anonymous*|Admin|
|*anonymous*|Developer|
|*anonymous*|Architect|

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

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|string|false|none|Project Lifecycle Status|

#### Enumerated Values

|Property|Value|
|---|---|
|*anonymous*|Live – In Production|
|*anonymous*|Live – Demo / Reference|
|*anonymous*|Active Development|
|*anonymous*|On Hold|
|*anonymous*|Archived|

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

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|string|false|none|Asset Type|

#### Enumerated Values

|Property|Value|
|---|---|
|*anonymous*|Image|
|*anonymous*|Video|
|*anonymous*|Document|
|*anonymous*|Link|

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

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|string|false|none|Professional Relationship|

#### Enumerated Values

|Property|Value|
|---|---|
|*anonymous*|Manager|
|*anonymous*|Peer|
|*anonymous*|Client|
|*anonymous*|Recruiter|
|*anonymous*|Fan|

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

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|*anonymous*|string|false|none|Tone/Style Category|

#### Enumerated Values

|Property|Value|
|---|---|
|*anonymous*|Professional|
|*anonymous*|Casual|

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
  "orgTimeZone": "America/Chicago",
  "dependencies": {
    "salesforce": "UP"
  },
  "limits": {
    "queries": {
      "used": 1,
      "limit": 100
    },
    "dmlStatements": {
      "used": 1,
      "limit": 100
    },
    "callouts": {
      "used": 1,
      "limit": 100
    },
    "cpuTimeMs": {
      "used": 1,
      "limit": 100
    },
    "heapBytes": {
      "used": 1,
      "limit": 100
    }
  }
}

```

API Health Status Schema.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|status|string|false|none|Overall API Availability.|
|checkType|string|false|none|SHALLOW = Runtime only. DEEP = Includes downstream dependencies.|
|timestamp|string(date-time)|false|none|ISO 8601 Timestamp of the health check.|
|orgTimeZone|string|false|none|Time zone of the running user (org time).|
|dependencies|object|false|none|Status of downstream systems.|
|» salesforce|string|false|none|Status of Salesforce Core.|
|limits|object|false|none|Governor-limit snapshot of the current transaction (`SAPIHealth.buildPayload`).|
|» queries|[LimitUsage](#schemalimitusage)|false|none|none|
|» dmlStatements|[LimitUsage](#schemalimitusage)|false|none|none|
|» callouts|[LimitUsage](#schemalimitusage)|false|none|none|
|» cpuTimeMs|[LimitUsage](#schemalimitusage)|false|none|none|
|» heapBytes|[LimitUsage](#schemalimitusage)|false|none|none|

#### Enumerated Values

|Property|Value|
|---|---|
|status|UP|
|status|DOWN|
|status|DEGRADED|
|checkType|SHALLOW|
|checkType|DEEP|

<h2 id="tocS_LimitUsage">LimitUsage</h2>
<!-- backwards compatibility -->
<a id="schemalimitusage"></a>
<a id="schema_LimitUsage"></a>
<a id="tocSlimitusage"></a>
<a id="tocslimitusage"></a>

```json
{
  "used": 1,
  "limit": 100
}

```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|used|integer|false|none|none|
|limit|integer|false|none|none|

<h2 id="tocS_Contact">Contact</h2>
<!-- backwards compatibility -->
<a id="schemacontact"></a>
<a id="schema_Contact"></a>
<a id="tocScontact"></a>
<a id="tocscontact"></a>

```json
{
  "key": "con_7c5j3w9sfa",
  "name": "Ryan Bumstead",
  "title": "Platform Architect",
  "trailhead": "https://trailblazer.me/id/rbumstead",
  "careerObjective": "Driving digital transformation...",
  "linkedIn": "https://linkedin.com/in/ryanbumstead",
  "portfolio": "https://ryanbumstead.com"
}

```

Contact Information Schema. The contact's email and phone are never returned.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|name|string|false|none|Full Name|
|title|string|false|none|Job Title|
|trailhead|string(uri)¦null|false|none|Trailhead Profile URL|
|careerObjective|string¦null|false|none|Short Professional Summary|
|linkedIn|string(uri)¦null|false|none|LinkedIn Profile URL|
|portfolio|string(uri)¦null|false|none|Portfolio Website URL|

<h2 id="tocS_Project">Project</h2>
<!-- backwards compatibility -->
<a id="schemaproject"></a>
<a id="schema_Project"></a>
<a id="tocSproject"></a>
<a id="tocsproject"></a>

```json
{
  "key": "prj_8f3k2m9qtz",
  "name": "Global CRM Migration",
  "challenge": "Legacy system had 5M duplicate records.",
  "solution": "Implemented MDM strategy using Data Cloud.",
  "businessValue": "Reduced data storage costs by 40%.",
  "status": "Active Development",
  "dateCompleted": "2025-12-01",
  "heroImageUrl": "https://example.com/images/hero.jpg",
  "liveUrl": "https://example.com/demo",
  "repositoryUrl": "https://github.com/rdbumstead/project",
  "pillar": "A",
  "pillarLabel": "Pillar A: Business Architecture",
  "isFeatured": true,
  "contactName": "Ryan Bumstead",
  "contactKey": "con_7c5j3w9sfa",
  "sortOrder": 10
}

```

Portfolio Project Schema.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|name|string|false|none|Project Name|
|challenge|string¦null|false|none|STAR Method: Situation/Task|
|solution|string¦null|false|none|STAR Method: Action|
|businessValue|string¦null|false|none|STAR Method: Result|
|status|[ProjectStatus](#schemaprojectstatus)|false|none|Project Lifecycle Status|
|dateCompleted|string(date)¦null|false|none|Completion Date|
|heroImageUrl|string(uri)¦null|false|none|Banner Image URL|
|liveUrl|string(uri)¦null|false|none|Live Demo URL|
|repositoryUrl|string(uri)¦null|false|none|Code Repository URL|
|pillar|string¦null|false|none|Architectural Pillar|
|pillarLabel|string¦null|false|none|Architectural Pillar Label|
|isFeatured|boolean|false|none|Featured Flag for Home Page|
|contactName|string|false|none|Owner Name|
|contactKey|string|false|none|Public key of the contact.|
|sortOrder|number¦null|false|none|Display Sort Order|

<h2 id="tocS_Experience">Experience</h2>
<!-- backwards compatibility -->
<a id="schemaexperience"></a>
<a id="schema_Experience"></a>
<a id="tocSexperience"></a>
<a id="tocsexperience"></a>

```json
{
  "key": "exp_4h7n2c8wpd",
  "employerName": "Salesforce",
  "employerKey": "acc_2t8e6y4mgb",
  "name": "Technical Architect",
  "startDate": "2023-01-01",
  "endDate": "2025-01-01",
  "isCurrentRole": true,
  "isRemote": true,
  "contactKey": "con_7c5j3w9sfa",
  "contactName": "Ryan Bumstead",
  "sortOrder": 10
}

```

Professional Experience Schema.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|employerName|string|false|none|Employer Name|
|employerKey|string|false|none|Public key of the employer.|
|name|string|false|none|Role Title|
|startDate|string(date)|false|none|Start Date|
|endDate|string(date)¦null|false|none|End Date (null if current)|
|isCurrentRole|boolean|false|read-only|Is Current Role Flag|
|isRemote|boolean|false|none|Remote Work Flag|
|contactKey|string|false|none|Public key of the contact.|
|contactName|string|false|none|Contact Name|
|sortOrder|number¦null|false|none|Sort Order|

<h2 id="tocS_ExperienceHighlight">ExperienceHighlight</h2>
<!-- backwards compatibility -->
<a id="schemaexperiencehighlight"></a>
<a id="schema_ExperienceHighlight"></a>
<a id="tocSexperiencehighlight"></a>
<a id="tocsexperiencehighlight"></a>

```json
{
  "key": "hlt_9d3p7k5vxn",
  "experienceKey": "exp_4h7n2c8wpd",
  "experienceName": "Technical Architect",
  "name": "DevOps Transformation",
  "description": "Implemented CI/CD pipelines reducing deployment time by 80%.",
  "sortOrder": 1,
  "personaTag": "Developer;Architect"
}

```

Experience Bullet Point Schema.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|experienceKey|string|false|none|Public key of the experience.|
|experienceName|string|false|none|Parent Experience Name|
|name|string|false|none|Highlight Title|
|description|string|false|none|Detailed Description|
|sortOrder|number|false|none|Sort Order|
|personaTag|string|false|none|Semicolon-separated Persona values from the Persona_Tag__c multi-select picklist (Admin, Developer, Architect).|

<h2 id="tocS_ProjectAsset">ProjectAsset</h2>
<!-- backwards compatibility -->
<a id="schemaprojectasset"></a>
<a id="schema_ProjectAsset"></a>
<a id="tocSprojectasset"></a>
<a id="tocsprojectasset"></a>

```json
{
  "key": "pas_4n7s3f9tdk",
  "name": "Architecture Diagram",
  "projectKey": "prj_8f3k2m9qtz",
  "projectName": "Global CRM Migration",
  "type": "Image",
  "externalUrl": "https://example.com/images/diagram.png",
  "altText": "C4 Model System Context Diagram",
  "sortOrder": 1
}

```

Project Asset (Image/Video) Schema.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|name|string|false|none|Asset Name|
|projectKey|string|false|none|Public key of the project.|
|projectName|string|false|none|Parent Project Name|
|type|[AssetType](#schemaassettype)|false|none|Asset Type|
|externalUrl|string(uri)|false|none|Asset URL|
|altText|string¦null|false|none|Accessibility Alt Text|
|sortOrder|number|false|none|Sort Order|

<h2 id="tocS_Testimonial">Testimonial</h2>
<!-- backwards compatibility -->
<a id="schematestimonial"></a>
<a id="schema_Testimonial"></a>
<a id="tocStestimonial"></a>
<a id="tocstestimonial"></a>

```json
{
  "key": "tst_2y7a5d9wmh",
  "name": "Testimonial from Jane Doe",
  "authorName": "Jane Doe",
  "authorTitle": "CTO, Tech Corp",
  "avatarUrl": "https://example.com/images/avatar.jpg",
  "relationshipType": "Manager",
  "vibeMode": "Professional",
  "context": "Worked together on the Q1 digital transformation."
}

```

Social Proof Schema.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|name|string|false|none|Testimonial Name|
|authorName|string|false|none|Author Name|
|authorTitle|string¦null|false|none|Author Title|
|avatarUrl|string(uri)¦null|false|none|Author Avatar URL|
|relationshipType|[RelationshipType](#schemarelationshiptype)|false|none|Professional Relationship|
|vibeMode|[VibeMode](#schemavibemode)|false|none|Tone/Style Category|
|context|string¦null|false|none|Context of Work|

<h2 id="tocS_ProjectSkill">ProjectSkill</h2>
<!-- backwards compatibility -->
<a id="schemaprojectskill"></a>
<a id="schema_ProjectSkill"></a>
<a id="tocSprojectskill"></a>
<a id="tocsprojectskill"></a>

```json
{
  "key": "prs_8w2m6g4bha",
  "projectKey": "prj_8f3k2m9qtz",
  "projectName": "Global CRM Migration",
  "skillKey": "skl_3m9x5b2rkt",
  "skillName": "Apex",
  "skillCategory": "Backend Development",
  "skillProficiencyScore": 5
}

```

Junction Object: Project <-> Skill.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|projectKey|string|false|none|Public key of the project.|
|projectName|string|false|none|Project Name|
|skillKey|string|false|none|Public key of the skill.|
|skillName|string|false|none|Skill Name|
|skillCategory|string|false|none|Skill Category|
|skillProficiencyScore|number|false|none|Proficiency Score|

<h2 id="tocS_ExperienceSkill">ExperienceSkill</h2>
<!-- backwards compatibility -->
<a id="schemaexperienceskill"></a>
<a id="schema_ExperienceSkill"></a>
<a id="tocSexperienceskill"></a>
<a id="tocsexperienceskill"></a>

```json
{
  "key": "exs_5r8h2q6cjw",
  "experienceKey": "exp_4h7n2c8wpd",
  "experienceName": "Technical Architect",
  "skillKey": "skl_3m9x5b2rkt",
  "skillName": "LWC",
  "skillCategory": "Frontend Development",
  "skillProficiencyScore": 4
}

```

Junction Object: Experience <-> Skill.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|experienceKey|string|false|none|Public key of the experience.|
|experienceName|string|false|none|Experience Name|
|skillKey|string|false|none|Public key of the skill.|
|skillName|string|false|none|Skill Name|
|skillCategory|string|false|none|Skill Category|
|skillProficiencyScore|number|false|none|Proficiency Score|

<h2 id="tocS_CertificationSkill">CertificationSkill</h2>
<!-- backwards compatibility -->
<a id="schemacertificationskill"></a>
<a id="schema_CertificationSkill"></a>
<a id="tocScertificationskill"></a>
<a id="tocscertificationskill"></a>

```json
{
  "key": "cks_3k9z5x7pne",
  "certificationKey": "crt_6q2v8d4nhz",
  "certificationName": "Salesforce Certified Application Architect",
  "skillKey": "skl_3m9x5b2rkt",
  "skillName": "Security",
  "skillCategory": "Architecture",
  "skillProficiencyScore": 5
}

```

Junction Object: Certification <-> Skill.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|certificationKey|string|false|none|Public key of the certification.|
|certificationName|string|false|none|Certification Name|
|skillKey|string|false|none|Public key of the skill.|
|skillName|string|false|none|Skill Name|
|skillCategory|string|false|none|Skill Category|
|skillProficiencyScore|number|false|none|Proficiency Score|

<h2 id="tocS_PortfolioConfig">PortfolioConfig</h2>
<!-- backwards compatibility -->
<a id="schemaportfolioconfig"></a>
<a id="schema_PortfolioConfig"></a>
<a id="tocSportfolioconfig"></a>
<a id="tocsportfolioconfig"></a>

```json
{
  "linkedInUrl": "https://linkedin.com/in/ryanbumstead",
  "gitHubProfileUrl": "https://example.com/source",
  "calendlyUrl": "https://example.com/schedule",
  "trailblazerProfileUrl": "https://trailblazer.me/id/rbumstead",
  "personalWebsiteUrl": "https://ryanbumstead.com",
  "careerObjective": "Looking for Principal Architect roles.",
  "jiraProjectKey": "SPAP",
  "gitHubRepoPath": "rdbumstead/salesforce-portfolio"
}

```

Global Config Schema (Custom Metadata). The owner's email and phone are never returned.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|linkedInUrl|string(uri)¦null|false|none|LinkedIn URL|
|gitHubProfileUrl|string(uri)¦null|false|none|GitHub URL|
|calendlyUrl|string(uri)¦null|false|none|Calendly URL|
|trailblazerProfileUrl|string(uri)¦null|false|none|Trailhead URL|
|personalWebsiteUrl|string(uri)¦null|false|none|Personal Website URL|
|careerObjective|string¦null|false|none|Career Objective Text|
|jiraProjectKey|string|false|none|Jira Key for integration|
|gitHubRepoPath|string|false|none|GitHub Owner/Repo path for API calls|

<h2 id="tocS_Account">Account</h2>
<!-- backwards compatibility -->
<a id="schemaaccount"></a>
<a id="schema_Account"></a>
<a id="tocSaccount"></a>
<a id="tocsaccount"></a>

```json
{
  "key": "acc_2t8e6y4mgb",
  "name": "Salesforce",
  "industry": "Technology",
  "abbreviation": "SFDC"
}

```

Account/Employer Schema.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|name|string|false|none|Account Name|
|industry|string¦null|false|none|Industry|
|abbreviation|string¦null|false|none|Abbreviation|

<h2 id="tocS_Skill">Skill</h2>
<!-- backwards compatibility -->
<a id="schemaskill"></a>
<a id="schema_Skill"></a>
<a id="tocSskill"></a>
<a id="tocsskill"></a>

```json
{
  "key": "skl_3m9x5b2rkt",
  "name": "Apex",
  "displayName": "Salesforce Apex",
  "category": "Development",
  "proficiencyScore": 5,
  "iconName": "utility:code",
  "svgPathData": "M10...",
  "colorHex": "#0070d2",
  "categoryOrder": 10
}

```

Skill Schema.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|name|string|false|none|Skill Name|
|displayName|string¦null|false|none|Display Name|
|category|string|false|none|Skill Category|
|proficiencyScore|number|false|none|Self-Reported Proficiency|
|iconName|string¦null|false|none|Icon Name|
|svgPathData|string¦null|false|none|SVG Path Data|
|colorHex|string¦null|false|none|Category Color Hex|
|categoryOrder|number|false|none|Category Order|

<h2 id="tocS_Certification">Certification</h2>
<!-- backwards compatibility -->
<a id="schemacertification"></a>
<a id="schema_Certification"></a>
<a id="tocScertification"></a>
<a id="tocscertification"></a>

```json
{
  "key": "crt_6q2v8d4nhz",
  "name": "Application Architect",
  "contactKey": "con_7c5j3w9sfa",
  "contactName": "Ryan Bumstead",
  "issuerKey": "acc_2t8e6y4mgb",
  "issuerName": "Salesforce",
  "earnedDate": "2024-05-15"
}

```

Certification Schema.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|name|string|false|none|Certification Name|
|contactKey|string|false|none|Public key of the contact.|
|contactName|string|false|none|Contact Name|
|issuerKey|string|false|none|Public key of the issuer.|
|issuerName|string|false|none|Issuer Name|
|earnedDate|string(date)|false|none|Date Earned|

<h2 id="tocS_Education">Education</h2>
<!-- backwards compatibility -->
<a id="schemaeducation"></a>
<a id="schema_Education"></a>
<a id="tocSeducation"></a>
<a id="tocseducation"></a>

```json
{
  "key": "edu_6b4c8j2rvq",
  "name": "Bachelor of Science",
  "contactKey": "con_7c5j3w9sfa",
  "contactName": "Ryan Bumstead",
  "issuerKey": "acc_2t8e6y4mgb",
  "issuerName": "University of Technology",
  "fieldOfStudy": "Computer Science",
  "graduationDate": "2018-05-01",
  "gpa": 3.8
}

```

Education Schema.

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|key|string|true|read-only|Stable public key of the record. It is set once and never changes.|
|name|string|false|none|Degree Name|
|contactKey|string|false|none|Public key of the contact.|
|contactName|string|false|none|Contact Name|
|issuerKey|string|false|none|Public key of the issuer.|
|issuerName|string|false|none|University Name|
|fieldOfStudy|string|false|none|Field of Study|
|graduationDate|string(date)|false|none|Graduation Date|
|gpa|number¦null|false|none|GPA|


# ADR-007: GitHub API Server-Side Caching

## Status

Accepted. Amended 2026-10-21 (see below).

## Context

GitHub unauthenticated API limits (60 req/hr) are insufficient for public traffic.

## Decision

Implement Apex-based caching via Scheduled Jobs and Custom Metadata.

## Rationale

Prevents site failure by serving a GitHub_Cache\_\_c record when API limits are exhausted.

## Implications

Commits may appear with a "Last Updated" delay of up to 15 minutes.

## Amendment (2026-10-21): the cache objects and the scheduled refresh

The decision stands: guests read a server-side cache and never trigger a callout. The cache and the refresh are built as follows.

- **The cache is custom objects**, `Github_Cache__c` and `Jira_Cache__c`, not custom metadata or a custom setting. Each refresh inserts one row whose `JSON_Payload__c` holds the mapped item list (`{"schemaVersion":1,"items":[...]}`), not the raw API body. The newest row is the one served.
- **The refresh is Queueable.** Scheduled Apex cannot call out synchronously, so `IntegrationCacheRefreshScheduler`, scheduled at :00, :15, :30 and :45, enqueues `GitHubCacheRefreshJob` and `JiraCacheRefreshJob` (`Queueable`, `Database.AllowsCallouts`). They call out through the `GitHub_API` and `Jira_API` Named Credentials as the scheduling admin user, who holds the principal access through `Portfolio_Admin`. A failed refresh inserts nothing, so the last good row stays.
- **The read side** is `DeliveryController.getRecentCommits()` and `getRoadmap()` (cacheable Apex). Each returns the items with their age and a status: `FRESH` under 30 minutes, `STALE` older, `EMPTY` with no usable row, and `SIMULATED` or `DEGRADED` for the resilience toggle and an open breaker (ADR-022).
- **Cleanup keeps the newest row** per cache object and deletes only older rows past the age limit, so an outage never empties the page.
- **The roadmap** shows only `SPAP` issues labelled `portfolio-roadmap` (owner decision, 2026-10-21), so nothing private reaches the public page.
- **The authenticated GitHub limit** is 5,000 requests an hour, so the 60 an hour unauthenticated limit in the context no longer binds. Four refreshes an hour are far inside it.

## Amendment (2026-10-24): the docs refresh after a push

The documents on `/docs` no longer wait up to a day for the scheduled read. `SourceCacheRefreshJob.forceRefresh` reads the given paths, or every path of one source key, whatever their age, with the same upsert on `Path__c`, parts, stale row delete, circuit breaker and file cap as the scheduled run. When a push to `main` changes `docs/**`, the Deploy to Production workflow's `docs-cache` job runs after the deploy job, waits 60 seconds because the GitHub contents API caches for 60, runs `scripts/refresh-docs-cache.apex` in production as the workflow's signed in admin, and fails unless every docs record reads 200 since it started. The page still reads only the cache, never GitHub.

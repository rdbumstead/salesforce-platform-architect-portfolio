# ADR-004: Static Resource Code Rendering

## Status

Amended 2026-10-23 (Round 7, see the amendment below): built, with the source read from GitHub into an org cache, not from a static resource. Originally Accepted.

## Context

Requirement to display raw source code without triggering GitHub API rate limits.

## Decision

Perform client-side fetches of code stored in Static Resources.

## Rationale

Decouples code visualization from external API availability and prevents 429 errors during high traffic.

## Implications

Code snippets must be packaged and deployed as part of the Salesforce metadata.

## Amendment (2026-10-23, Round 7): source from GitHub, cached in the org

**As built (audit B1).** The code is not packaged into static resources. Each showcase component (the API Lab, the skills graph, the Pillar A data model, the Pillar B decision matrix, the resume builder and the Delivery roadmap) has a View source button. It opens a dialog with the component's JavaScript, HTML and main Apex class, highlighted by the shared Prism module (`c/prismHighlighter`), with a link to each file on GitHub.

- **Files:** listed in `Source_File__mdt` records, so they can change without a code change.
- **Fetch:** `SourceCacheRefreshJob` reads each file from GitHub through the `GitHub_API` Named Credential at most once a day per file, into `Source_Cache__c`, an admin only object. `IntegrationCacheRefreshScheduler` enqueues it on its existing schedule only when a file is due.
- **Read:** visitors read only the cache, through `SourceController.getSourceFiles`. No visitor request calls GitHub, which keeps the original goal of this ADR: no GitHub rate limit or outage reaches a page view.
- **Why not static resources:** a packaged copy goes stale with every commit and would need a deploy to refresh. The cache always shows `main` as of the last daily read, with its fetch time.

Details are in the Technical Guide section 2.14.

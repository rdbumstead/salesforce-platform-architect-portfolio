# ADR-021: Native GraphQL (Door 1) vs. Apex REST for UI

## Status

Accepted, with its scope narrowed (2026-10-23, see the amendment below). GraphQL is used by three components, not for core frontend orchestration. Amended 2026-10-30: the gallery's read moved into a lazy child.

## Context

LWR components require efficient, multi-object data fetching without multiple REST round-trips.

## Decision

Utilize native Salesforce GraphQL (lightning/uiGraphQLApi) for core frontend orchestration.

## Rationale

Provides automatic caching via Lightning Data Service (LDS) and reduces payload size by fetching only essential fields.

## Implications

Requires components to be built with wire adapters.

## Amendment (2026-10-23): scope

**As built, GraphQL is one path among two, not the main one.** Three components read through `lightning/uiGraphQLApi`:

- `c-skill-network`: skills, their junctions and the linked roles' dates for the skills matrix and graph.
- `c-project-asset-gallery`: a pillar's `Project__c` with its `Project_Assets__r`.
- `c-graphql-probe`: one small `Skill__c` read the footer times and reports as "GraphQL: live, N ms" or "unavailable".

Every other component reads through `@AuraEnabled` Apex: the resume and its timeline (`ResumeController`), the pillar cards (`ProjectCardController`), the Delivery page (`DeliveryController`, `GovernanceController`), the footer (`FooterController`), the ERD (`SchemaService`), the decision matrix (`DecisionMatrixController`), testimonials (`TestimonialController`) and the API Lab and cover letter (`ApiLabController`).

**Why Apex for those.** GraphQL reads only what the guest has object and field permission for. Much of what the site shows sits on records the guest cannot read: my Contact, experience highlights, the integration caches, custom metadata, and data that is computed rather than stored (the schema describe, the decision matrix ranking inputs, the governor limits). Those go through Apex controllers that read in system mode and return a fixed shape (SAS section 4.6). The Delivery page reads Apex because each cache is one JSON row per refresh, not one record per item (my decision, 2026-10-21). The hero and cards read Apex because the Apex adapter is already on the home page and the GraphQL adapter stack is kept off it until the page is idle (Technical Guide §2.11).

**What stays true.** Where a component reads plain records the guest may see, GraphQL is the default, and the footer measures that path on every visit.

## Amendment (2026-10-30): the gallery's read moved to a lazy child

The count stays at three components, but one of them changed. `c-project-asset-gallery` no longer imports `lightning/uiGraphQLApi`. Its read moved to a child, `c-project-asset-gallery-data`, which renders nothing and hands the result to the gallery in a `galleryread` event. The gallery loads the child with a literal `import()` after the page has loaded and gone idle, renders it through `lwc:component`, and shows a skeleton that holds the gallery's space until the read settles. A failed load or read renders the same empty state as before.

The three components that read through the adapter are now `c-skill-network`, `c-project-asset-gallery-data` and `c-graphql-probe`. The query, the fields and the guest's permissions are the same, so the scope argument above is unchanged.

**Why.** The adapter stack was about 1,165 KB uncompressed in each of the `/skills`, `/business-architecture` and `/nonprofit-solutions` view bundles (performance audit, 2026-10-29). The static import pulled it into the two pillar views before first render. The footer's probe had already been moved out for the same reason (Technical Guide §2.11). `/skills` still imports it statically, because the matrix is that page's content. I did not measure a load time gain for the gallery change, since run to run noise was about 1.5 s. The reason is the bytes removed from the first load.

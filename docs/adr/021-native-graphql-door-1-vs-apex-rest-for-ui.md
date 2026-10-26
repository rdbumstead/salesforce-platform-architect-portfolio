# ADR-021: Native GraphQL (Door 1) vs. Apex REST for UI

## Status

Accepted, with its scope narrowed (2026-10-23, see the amendment below). GraphQL is used by three components, not for core frontend orchestration.

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

**Why Apex for those.** GraphQL reads only what the guest has object and field permission for. Much of what the site shows sits on records the guest cannot read: the owner's Contact, experience highlights, the integration caches, custom metadata, and data that is computed rather than stored (the schema describe, the decision matrix ranking inputs, the governor limits). Those go through Apex controllers that read in system mode and return a fixed shape (SAS section 4.6). The Delivery page reads Apex because each cache is one JSON row per refresh, not one record per item (owner decision, 2026-10-21). The hero and cards read Apex because the Apex adapter is already on the home page and the GraphQL adapter stack is kept off it until the page is idle (Technical Guide §2.11).

**What stays true.** Where a component reads plain records the guest may see, GraphQL is the default, and the footer measures that path on every visit.

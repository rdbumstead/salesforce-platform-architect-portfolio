# ADR-014: Deferred Telemetry Loading (Performance)

## Status

Accepted

## Context

Real-time telemetry fetching during initialization risks violating the LCP < 2.5s performance budget.

## Decision

Implement Deferred Telemetry Loading for the system health dashboard.

## Rationale

Decouples non-essential limit checks from the critical rendering path.

## Implications

Employs requestIdleCallback() to fetch data only after the primary UI has painted.

## Amendment (2026-10-30): the same rule for the data model dialog and the gallery read

The deferral rule now covers two more loads. The data model dialog behind the live data marker loads its code the first time the dialog opens, and the project gallery's GraphQL read loads in a child after the page has loaded and gone idle (Technical Guide §2.11). Both use a literal `import()` rendered through `lwc:component`, with the `lightning__dynamicComponent` capability, the pattern the footer's probe already used. Rendering a child behind `lwc:if` is not enough, because the bundler still preloads it. A read that waits for idle holds its space with a skeleton so the page does not shift when it lands.

A load that must not wait is the other half of the rule. An early read of the header from the layout, tried so the hero's sentence would not wait on its own Apex call, added a call during boot on every route and made home slower, so I removed it. I claim no load time gain for the deferrals, because the lab noise of about 1.5 s is larger than they could show.

## Amendment (2026-11-02): the static front end

On the static site ([ADR-041](041-headless-static-front-end-on-cloudflare-pages.md)) the rule applies to what paints. The first section of each page paints first and the rest of the components load after that paint, so the page never waits on all of its components to download and run before showing its first text. Telemetry and the live footer readings stay deferred as before. The numbers behind this are in [Technical Guide §2.11](../guides/04-Technical-Guide.md#211-mobile-performance), and they are local lab numbers.

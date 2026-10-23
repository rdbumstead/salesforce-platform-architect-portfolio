# ADR-020: Mobile Performance – Static SVG Fallback Strategy

## Status

Accepted. Amended 2026-10-22 (Round 5), see the amendment below. Note added 2026-10-22 (Round 6) on the Lighthouse claim.

## Context

The animated AntV G6 skill graph violates performance budgets (LCP < 2.5s) on low-power mobile devices.

## Decision

Implement a Static SVG Fallback for small viewports.

## Rationale

Prevents heavy canvas rendering on mobile, ensuring the site passes Lighthouse performance audits on 4G networks.

> **Note, 2026-10-22 (Round 6).** The site does not pass the 2.5 s mobile LCP target. Removing the graph from phones took the graph engine off the mobile critical path, but the LWR framework and the platform's stylesheets alone keep mobile LCP above 2.5 s. The gate is now the best the LWR shell allows, measured: mobile LCP medians of {{L2_RANGE}} on the six main routes ([Technical Guide §2.11](../guides/04-Technical-Guide.md#211-mobile-performance)).

## Implications

Requires FORM_FACTOR detection in the c-skill-network LWC.

## Amendment (2026-10-22, Round 5): matrix first, the graph on open, D3 as the engine

The owner replaced the static SVG fallback and the G6 graph on 2026-10-22 (Round 5 plan section 2). The ERD on the Pillar A page follows the same rule (pillars design G5).

**Decision.**

- **The skills page shows a matrix by default.** One row per category, the skills as chips with their proficiency and "years used". Years used is worked out from the dates of the roles linked to the skill through `Experience_Skill__c`, with overlapping roles merged and a current role counted to today. A skill with no linked role shows no years.
- **The graph is a second view, loaded only when it is opened.** A "Matrix | Graph" switch sits above the matrix on desktop and tablet. The engine is requested the first time the graph view opens and never before.
- **Phones never request the engine.** On `FORM_FACTOR` `Small` or a viewport under 768 px the switch is hidden and the page shows the matrix only. The ERD on the Pillar A page shows its accessible list of objects and relationships as the visible view.
- **The engine is D3.** `d3-force` with its three dependencies (`d3-dispatch`, `d3-quadtree`, `d3-timer`), the official UMD builds concatenated into the `D3_Library` static resource, loaded through the shared module `c/graphEngine`. The simulation runs to completion and the components draw the positioned nodes and edges as SVG from their own templates, so nothing animates and reduced motion is honoured by construction.
- **G6 leaves the site.** The `G6_Library` static resource (1.57 MB) and the `c/g6Loader` module are removed in Round 5, with their entry in `THIRD_PARTY_NOTICES.md`.

**Why.**

- With 59 skills in production the G6 force layout packed every skill into one tangle (owner feedback, 2026-10-21). A matrix reads at a glance on any screen, and the graph clusters skills by category with the roles and projects on a ring, drawing edges only for the hovered or selected node.
- Size. `D3_Library` is about 18.5 KB (18,544 bytes as logged by the engine stream in log 190) against 1.57 MB for G6.
- One engine draws both diagrams, the skills graph and the ERD.
- A build-time SVG of live data goes stale, which the ERD must not do, and the matrix already serves phones from live data.

**Implications.** Planned in Round 5 and reconciled with the engine branch at merge. The engine contract is `loadGraphEngine(component)` and `layoutGraph(d3, nodes, edges, options)` in `c/graphEngine` (Technical Guide section 2.1). The Round 3 inline SVG for small screens is replaced by the matrix.

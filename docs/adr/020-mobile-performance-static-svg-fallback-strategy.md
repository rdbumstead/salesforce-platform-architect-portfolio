# ADR-020: Mobile Performance – Static SVG Fallback Strategy

## Status

Accepted. Amended 2026-10-22, see the amendment below. Note added 2026-10-22 on the Lighthouse claim.

## Context

The animated skill graph, drawn with the AntV graph library, violates performance budgets (LCP < 2.5s) on low-power mobile devices.

## Decision

Implement a Static SVG Fallback for small viewports.

## Rationale

Prevents heavy canvas rendering on mobile, ensuring the site passes Lighthouse performance audits on 4G networks.

> **Note, 2026-10-22.** The site does not pass the 2.5 s mobile LCP target. Removing the graph from phones took the graph engine off the mobile critical path, but most of the mobile LCP is render delay in the LWR framework's own script, which the site's files do not control, and it stays above 2.5 s. The gate is now the best the LWR shell allows, measured: mobile LCP medians of 7.5 to 9.6 s (Lighthouse 11 mobile, measured 2026-10-22) on the six main routes ([Technical Guide §2.11](../guides/04-Technical-Guide.md#211-mobile-performance)).

## Implications

Requires FORM_FACTOR detection in the c-skill-network LWC.

## Amendment (2026-10-22): matrix first, the graph on open, d3-force as the engine

I replaced the static SVG fallback and the AntV graph on 2026-10-22. The ERD on the Pillar A page follows the same rule.

**Decision.**

- **The skills page shows a matrix by default.** One row per category, the skills as chips with their proficiency and "years used". Years used is worked out from the dates of the roles linked to the skill through `Experience_Skill__c`, with overlapping roles merged and a current role counted to today. A skill with no linked role shows no years.
- **The graph is a second view, loaded only when it is opened.** A "Matrix | Graph" switch sits above the matrix on desktop and tablet. The engine is requested the first time the graph view opens and never before.
- **Phones never request the engine.** On `FORM_FACTOR` `Small` or a viewport under 768 px the switch is hidden and the page shows the matrix only. The ERD on the Pillar A page shows its accessible list of objects and relationships as the visible view.
- **The engine is d3-force.** `d3-force` with its three dependencies (`d3-dispatch`, `d3-quadtree`, `d3-timer`), the official UMD builds concatenated into the `D3_Library` static resource, loaded through the shared module `c/graphEngine`. The simulation runs to completion and the components draw the positioned nodes and edges as SVG from their own templates, so nothing animates and reduced motion is honoured by construction.
- **The AntV library leaves the site.** The `G6_Library` static resource (1.57 MB) and the `c/g6Loader` module are removed, with their entry in `THIRD_PARTY_NOTICES.md`.

**Why.**

- With the 59 skills production held in October 2026, the AntV force layout packed every skill into one tangle (my feedback, 2026-10-21). A matrix reads at a glance on any screen, and the graph clusters skills by category with the roles and projects on a ring, drawing edges only for the hovered or selected node.
- Size. `D3_Library` was 18,544 bytes on 2026-10-22 against 1.57 MB for the AntV library (81,502 bytes since 2026-10-23, see the amendment below).
- One engine draws both diagrams, the skills graph and the ERD.
- A build-time SVG of live data goes stale, which the ERD must not do, and the matrix already serves phones from live data.

**Implications.** Planned on 2026-10-22 and reconciled with the engine branch at merge. The engine contract is `loadGraphEngine(component)` and `layoutGraph(d3, nodes, edges, options)` in `c/graphEngine` (Technical Guide section 2.1). The earlier inline SVG for small screens is replaced by the matrix.

## Amendment (2026-10-23): pan, zoom and node drag

The graph view gains pan, zoom and node drag. `D3_Library` appends the official UMD builds of d3-selection, d3-color, d3-interpolate, d3-ease, d3-transition, d3-drag and d3-zoom, unchanged, so the resource grows from 18,544 to 81,502 bytes. The mobile rule stands: the resource still loads only when the graph view opens, and phones never request it. Zoom in, Zoom out and Reset view are buttons for keyboard users, and the zoom level is announced politely. Nothing animates on its own, so reduced motion still needs no special case (Technical Guide §2.1).

## Amendment (2026-10-23): the wheel scrolls the page, and the graph pans at every zoom

A plain mouse wheel over the graph now scrolls the page at every zoom level, and only Ctrl with the wheel, or a trackpad pinch, zooms, one step at a time. Before, a wheel up at 100% zoomed in. I chose that the wheel keeps scrolling the page at rest. A background drag or the arrow keys on the focused graph pan it at any zoom, 100% included, up to 120 units past the graph's edge, with a visible hint while it has focus. The buttons stay, and Reset view also returns dragged nodes. The mobile rule is unchanged: phones never request `D3_Library` (Technical Guide §2.1).

## Amendment (2026-10-26): evidence, a fitted view and an eased zoom on a button press

The skills graph gains three things, and the rule that nothing animates on its own stays as written.

- **Evidence.** Certifications join roles and projects as nodes, served by `SkillGraphController` because the guest cannot read them through GraphQL. Each skill's ring weighs the kinds of evidence behind it (a role, a project, a certification, never the number of rows), its lines step up the same way when shown, and a legend says what the weights mean.
- **A fitted view.** The graph opens fitted to its content. The ring radii follow the node counts, a label placement pass puts each label right, left, above or below its node where it covers nothing, and a Fit button and a Reset layout button join the zoom buttons. Dragged nodes stay where they were put for the visit, kept in `sessionStorage`. `c/graphEngine` gains an opt in `fitTo` and takes a minimum zoom from its caller, so the engine's defaults, and the ERD's pinned numbers that depend on them, do not move. The ERD opts in to the same fit.
- **Motion.** The view eases for about 250 ms, and only after the visitor presses Fit, Reset layout, Zoom in or Zoom out. Under the system "reduce motion" setting it moves at once. The layout still runs to completion before anything is drawn, and nothing moves on its own.

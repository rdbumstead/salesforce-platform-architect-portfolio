# ADR-010: Visualization Engine (Vis.js vs. the AntV Graph Library)

## Status

Superseded by the d3-force engine (2026-10-22, [ADR-020 amendment](020-mobile-performance-static-svg-fallback-strategy.md#amendment-2026-10-22-matrix-first-the-graph-on-open-d3-force-as-the-engine)). Originally Accepted. The Decision below records the original choice of the AntV graph library, which no longer holds: see the note at the end.

## Context

Requirement for animated, "IcePanel-style" flow lines in the skill network.

## Decision

Select the AntV graph library over Vis.js as the visualization engine. (Superseded: the site uses d3-force, and the AntV library was removed on 2026-10-22.)

## Rationale

The AntV library supports native "running line" animations that would require complex canvas hacks in Vis.js.

## Implications

Requires Lightning Web Security (LWS) to be enabled in the org.

## Note (2026-10-22): the engine is now d3-force

The engine choice was revisited on 2026-10-22. Neither Vis.js nor the AntV library is used: the site draws its graphs with `d3-force` and its three dependencies in the `D3_Library` static resource, and the AntV library is removed. The reasons were the size (1.57 MB for the AntV library against about 18.5 KB for the four d3 modules), the tangle the AntV force layout made of the 59 skills production held in October 2026, and the wish for one engine for two diagrams, the skills graph and the Pillar A ERD. The animated "running line" that motivated the AntV library is no longer a goal: the graph is drawn once as SVG and nothing animates. The decision and the mobile rule are in the [ADR-020 amendment (2026-10-22)](020-mobile-performance-static-svg-fallback-strategy.md#amendment-2026-10-22-matrix-first-the-graph-on-open-d3-force-as-the-engine).

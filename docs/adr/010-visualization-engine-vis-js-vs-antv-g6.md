# ADR-010: Visualization Engine (Vis.js vs. AntV G6)

## Status

Superseded by the D3 engine (2026-10-22, Round 5, [ADR-020 amendment](020-mobile-performance-static-svg-fallback-strategy.md#amendment-2026-10-22-round-5-matrix-first-the-graph-on-open-d3-as-the-engine)). Originally Accepted. The Decision below records the original G6 choice, which no longer holds: see the note at the end.

## Context

Requirement for animated, "IcePanel-style" flow lines in the skill network.

## Decision

Select AntV G6 over Vis.js as the visualization engine. (Superseded: the site uses D3, and G6 was removed in Round 5.)

## Rationale

G6 supports native "running line" animations that would require complex canvas hacks in Vis.js.

## Implications

Requires Lightning Web Security (LWS) to be enabled in the org.

## Note (2026-10-22, Round 5): the engine is now D3

The engine choice was revisited in Round 5. Neither Vis.js nor G6 is used: the site draws its graphs with D3 (`d3-force` and its three dependencies in the `D3_Library` static resource), and G6 is removed. The reasons were the size (1.57 MB for G6 against about 18.5 KB for the four D3 modules), the tangle G6's force layout made of the 59 skills production held in October 2026, and the wish for one engine for two diagrams, the skills graph and the Pillar A ERD. The animated "running line" that motivated G6 is no longer a goal: the graph is drawn once as SVG and nothing animates. The decision and the mobile rule are in the [ADR-020 amendment (2026-10-22)](020-mobile-performance-static-svg-fallback-strategy.md#amendment-2026-10-22-round-5-matrix-first-the-graph-on-open-d3-as-the-engine).

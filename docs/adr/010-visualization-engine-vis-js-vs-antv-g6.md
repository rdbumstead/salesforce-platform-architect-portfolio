# ADR-010: Visualization Engine (Vis.js vs. AntV G6)

## Status

Accepted

## Context

Requirement for animated, "IcePanel-style" flow lines in the skill network.

## Decision

Select AntV G6 over Vis.js as the visualization engine.

## Rationale

G6 supports native "running line" animations that would require complex canvas hacks in Vis.js.

## Implications

Requires Lightning Web Security (LWS) to be enabled in the org.

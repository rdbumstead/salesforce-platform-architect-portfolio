# ADR-009: Granular Resume Data Model

## Status

Accepted

## Context

The site must generate tailored content for different professional personas (e.g., Admin vs. Architect).

## Decision

Utilize a Master-Detail relationship (Experience**c → Experience_Highlight**c).

## Rationale

Enables persona-based filtering of granular bullet points rather than static text blocks.

## Implications

Requires parent-child query logic to assemble the final resume payload.

## Amendment (2026-10-23)

Skills now follow the persona too. For a chosen persona the resume keeps the skills whose `Skill__c.Persona_Tag__c` includes it, plus every skill with no tag, so a new skill nobody has tagged yet never disappears. With no persona it keeps every skill. The same rule runs in `ResumeController.getResume` (the resume page, its ATS text and its PDF) and in PAPI `GET /papi/v1/resume/generate` (`PAPIResume`).

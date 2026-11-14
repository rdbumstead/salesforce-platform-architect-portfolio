# ADR-009: Granular Resume Data Model

## Status

- **Decision:** Accepted
- **Build:** [Live](../../packages/portfolio-site/main/default/objects/Experience__c), also [Experience_Highlight\_\_c](../../packages/portfolio-site/main/default/objects/Experience_Highlight__c)

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

## Amendment (2026-11-14)

The model now also says what each resume line is evidence of. `Experience_Highlight__c`, `Skill__c`, `Project__c`, `Certification__c` and the new `Resume_Variant__c` (headline and summary wordings by title family) each carry Requirement Tags, Selection Priority, Verified and Visibility. `Experience__c.Is_Primary_Role__c` marks the one current role a tailored resume leads with. `ResumeSnapshotService` reads all of it into one snapshot for the build user only. The site guest reads none of these fields, and no public page shows them. The Technical Guide section 2.26 has the rules.

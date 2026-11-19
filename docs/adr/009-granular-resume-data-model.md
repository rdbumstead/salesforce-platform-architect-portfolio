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

The model now also says what each resume line is evidence of. `Experience_Highlight__c`, `Skill__c`, `Project__c`, `Certification__c` and the new `Resume_Variant__c` (headline and summary wordings by title family) each carry Requirement Tags, Selection Priority, Verified and Visibility. `Experience__c.Is_Primary_Role__c` marks the one current role a tailored resume leads with. `ResumeSnapshotService` reads all of it into one snapshot for the build user only. The site guest reads none of these fields, and no public page shows them. Verified still decides what a public page shows. Every public Apex read of highlights, skills, projects and certifications leaves out a record that is not verified, so a line I load unverified stays off the resume, the timeline and the public API until I verify it. That holds for the persona rule above too, so a new skill with no tag appears only once it is verified. The Technical Guide section 2.26 has the rules.

## Amendment (2026-11-14): the guest reads the skill priority

This replaces one sentence of the amendment above. The site guest now reads one of those fields, `Skill__c.Selection_Priority__c`, through `Portfolio_Guest`, and no other new field. The Skills page shows its skills in three tiers, "Core", "Extended" and "Full toolkit", and opens on Core. The tier comes from the priority and the links behind each skill, and the page reads the priority through GraphQL as the guest in user mode, so the guest needs field level read on it. Requirement Tags, Verified and Visibility stay hidden from the guest, and so does the priority on the other four objects. The build user already reads the field through `Portfolio_Site_Build`.

- **Why the guest and not Apex.** The skills page already reads skills through GraphQL as the guest. A separate Apex read for one picklist would add a call and a code path for a value that says only how strongly I lead with a skill, which the page shows anyway by where the skill appears.
- **What a visitor can learn.** Which tier a skill sits in, which the page shows by design. The raw value is in the GraphQL response, and it says no more than the tier does.
- **Proof.** `ResumeSnapshotServiceTest.shouldHideTheNewFieldsFromTheGuest` now expects exactly `Skill__c.Selection_Priority__c` among the new fields the guest can read, and `SiteExportTestimonialParityTest.graphqlRowsMatchTheGuest` compares the field as the guest and as the build user. The Technical Guide section 2.1 has the tier rules.

## Amendment (2026-11-18): the public focuses are Engineer, Architect and Consultant

The decision above stays as written, and the text of the context ("Admin vs. Architect") is the history of how this started. On 2026-11-14 I changed the focuses a visitor can pick. They were Architect, Developer and Admin. They are now **Engineer, Architect and Consultant**, shown as "Salesforce Engineer", "Platform Architect" and "Solution Consultant". The reason is that these three match the three title families of my summaries in `Resume_Variant__c` (engineer, architect and consultant), so each focus can lead with wording written for it. Architect stays the default focus.

- **What changed in the data model.** `Persona_Tag__c` on `Experience_Highlight__c` and on `Skill__c` gained two active values, Engineer and Consultant. `Experience_Highlight__c` gained `Engineer_Sort_Order__c` and `Consultant_Sort_Order__c`, beside the Admin, Developer and Architect sort fields, and the `Sync_Experience_Highlight_Sort_Orders` flow gained an Engineer branch and a Consultant branch. Both fields are restricted picklists, so a record can only carry a value the picklist lists as active.
- **Developer is replaced, in two steps.** A data step writes Engineer in place of Developer on every highlight and skill that carries it, and keeps every other tag. Developer is deactivated on both fields only after that, and only after the code that stopped asking for it has merged. A restricted picklist refuses an inactive value when a record is saved with it, so the order matters. Developer is now an inactive value on both fields, kept in the picklist so stored history stays valid, and the flow no longer has a Developer branch. `Developer_Sort_Order__c` stays on the object, unread. The Maintenance Guide section 3.14 has the steps.
- **Admin stays, as an internal value.** It is still an active value and still a title family for the cover letter and the agent, which tailor to jobs whatever the focus. It is no longer a focus a visitor can pick. `ResumeController.getResume` refuses Admin and Developer, and a highlight or skill tagged only Admin drops off the public resume until I retag it. A data step I approve record by record does that retag before the switch.
- **One summary per focus.** `ResumeController.getResume` now returns a top level `summary`. It is the Summary variant of `Resume_Variant__c` for the focus (the title family is the focus in lower case) that is Public and verified. When a focus has several, the lowest `Selection_Priority__c` wins and a blank priority comes last. When a focus has none, the summary is `Contact.Career_Objective__c`, and when that is blank the summary is null. The read is the query definition `ResumeController_Variants`, system mode like the other site reads. `header.careerObjective` is unchanged.
- **The sort fields.** `ResumeController` orders a focus's highlights by that focus's sort field, with blanks last, then by `Sort_Order__c`. A highlight with `Lock_Sort_Across_Personas__c` set, and every highlight when no focus is chosen, sorts by `Sort_Order__c` alone. Every highlight in production has the lock set, so the per focus fields do not change an order today and the new two needed no copied values.
- **The API.** v1 and v2 share one persona reader. Both accept Engineer, Architect and Consultant, and both still accept Developer (read as Engineer) and Admin, in any letter case, so a caller that sent Developer keeps working. The v2 specs document only the three focuses. The v1 specs document the three plus Developer and Admin as aliases. The API Lab offers the three focuses (`ApiLabOptionsController.ACCEPTED_PERSONAS`).
- **Analytics.** Reports read `developer` as `engineer`, with no backfill of past events.

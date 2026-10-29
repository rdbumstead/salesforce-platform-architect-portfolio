# ADR-005: Gamified Testimonial UI

## Status

Accepted, amended 2026-10-23 (see the amendment below).

## Context

Need to balance professional verification with my personal brand personality.

## Decision

Implement a "Vibe-Gated" Sentence Builder (Mad-Libs style) UI.

## Rationale

Ensures structured data entry while providing a unique, engaging experience for visitors.

## Implications

Requires custom LWC logic to handle dynamic sentence fragments and "Vibe" toggles.

## Amendment (2026-10-23): the accessible sentence builder

An earlier version of the form had replaced the sentence with plain labelled fields, and the vibe toggle chose nothing. This amendment brings the sentence back in an accessible form.

- **The sentence.** "I'm a [relationship], and Ryan [strength]. The result? [outcome]" sits inside one `fieldset` whose `legend` reads the sentence. Each blank is a labelled select. A polite live region previews the finished sentence, and an optional note follows.
- **The vibe chooses the fragments.** Strengths and outcomes are `Testimonial_Fragment__mdt` records with a vibe (Professional or Casual), a slot (Strength or Outcome), a sort order and an audience (Worked together or Anyone), so I edit them without a code change. A Recruiter, or a Fan or visitor, sees only the Anyone outcomes.
- **Server rules.** `TestimonialController` accepts only a known fragment of the chosen vibe, stores the composed sentence in `Context__c` (so it stays exactly as approved even if a fragment's wording changes later) and keeps the fragment names and the note in fields of their own. `SubmissionGuard` drops spam silently and applies the rate limit of 5 a minute across all visitors. `Approved__c` is never set by the form.
- **The wall.** Approved testimonials show on `/testimonials` with a "Professional / All" filter that uses the API feed's rule: the Professional vibe from a Manager, Client or Peer.

## Amendment (2026-10-24): each new testimonial goes to the owner for approval

The site guest who saves a testimonial cannot submit it for approval, so `TestimonialController` publishes one `Testimonial_Submission__e` after the save. `TestimonialSubmissionTrigger` runs as the Automated Process user and `TestimonialApprovalSubmitter` submits the record to the Testimonial Approval process on its owner's behalf. I am the site's default owner for guest records. The process allows only the record owner as submitter and assigns the record owner as approver, so no user is named in metadata.

- The approval request email (`Portfolio_Testimonial_Approval_Request`) shows the author, title, relationship, vibe, the quote and the note, with links to the request and the record. I approve or reject by replying with one word, or in Salesforce. Email approval response is turned on in source (`EmailAdministrationSettings`, `enableEmailWorkflowApproval`).
- Final approval sets `Approved__c` (field update `Testimonial_Set_Approved`). Rejection leaves it false, so the restriction rule keeps the testimonial off the site.
- A record that cannot be submitted stays saved and unapproved, and the visitor is thanked as usual. A testimonial saved before this hand off existed is not submitted on its own. I submit or approve it by hand.

## Amendment (2026-10-28): a review in the reviewer's own words

The sentence builder stays the default, and a visitor can now choose "Write my own" instead.

- **Why.** A quote someone wrote reads as more convincing than a sentence assembled from approved phrases, and some reviewers have more to say than three blanks allow. The builder was chosen for engagement and structured data, not for safety: every review is already saved unapproved and goes to me for approval, and `SubmissionGuard` already drops spam and applies the rate limit. Those protections now cover free text too.
- **What stays structured.** The relationship is still a required choice in both modes, and the vibe still applies, because the wall's Professional filter reads those two fields.
- **Where the words go.** `TestimonialController.submitOwnTestimonial` stores the review in `Context__c`, the field a built sentence uses, so the wall, the API feed and the approval email need no change. It sets no fragment fields and no note. The review has the room `Context__c` has, 255 characters, and the guard scans it as it scans a note.
- **Limits on screen.** Every box on the form shows its count against its limit and warns once it is close.

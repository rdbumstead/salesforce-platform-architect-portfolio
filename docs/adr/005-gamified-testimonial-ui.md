# ADR-005: Gamified Testimonial UI

## Status

Accepted, amended 2026-10-23 (see the amendment below).

## Context

Need to balance professional verification with the candidate's personal brand personality.

## Decision

Implement a "Vibe-Gated" Sentence Builder (Mad-Libs style) UI.

## Rationale

Ensures structured data entry while providing a unique, engaging experience for visitors.

## Implications

Requires custom LWC logic to handle dynamic sentence fragments and "Vibe" toggles.

## Amendment (2026-10-23): the accessible sentence builder

An earlier version of the form had replaced the sentence with plain labelled fields, and the vibe toggle chose nothing. This amendment brings the sentence back in an accessible form.

- **The sentence.** "I'm a [relationship], and Ryan [strength]. The result? [outcome]" sits inside one `fieldset` whose `legend` reads the sentence. Each blank is a labelled select. A polite live region previews the finished sentence, and an optional note follows.
- **The vibe chooses the fragments.** Strengths and outcomes are `Testimonial_Fragment__mdt` records with a vibe (Professional or Casual), a slot (Strength or Outcome), a sort order and an audience (Worked together or Anyone), so the owner edits them without a code change. A Recruiter, or a Fan or visitor, sees only the Anyone outcomes.
- **Server rules.** `TestimonialController` accepts only a known fragment of the chosen vibe, stores the composed sentence in `Context__c` (so it stays exactly as approved even if a fragment's wording changes later) and keeps the fragment names and the note in fields of their own. `SubmissionGuard` drops spam silently and applies the rate limit of 5 a minute across all visitors. `Approved__c` is never set by the form.
- **The wall.** Approved testimonials show on `/testimonials` with a "Professional / All" filter that uses the API feed's rule: the Professional vibe from a Manager, Client or Peer.

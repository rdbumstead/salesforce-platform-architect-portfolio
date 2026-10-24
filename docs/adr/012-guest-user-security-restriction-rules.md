# ADR-012: Guest User Security (Restriction Rules)

## Status

Accepted, made real on 2026-10-23 (see the amendment below).

## Context

Standard sharing rules are additive and prone to accidental over-exposure.

## Decision

Implement Restriction Rules on the Testimonial\_\_c object.

## Rationale

Enforces a "Block First" policy for unapproved content at the kernel level, adhering to Zero Trust principles.

## Implications

Operates as a hard filter on record visibility specifically for the Guest User profile.

## Amendment (2026-10-23): the rule now does the filtering

Until 2026-10-23 the guest could not read any testimonial, so `Block_Unapproved_Testimonials` filtered nothing. The testimonial wall needs the guest to read approved rows, so a guest sharing rule, `Guest_Read_Testimonials`, shares every testimonial read only with the guest, and the restriction rule alone hides the unapproved ones.

That this holds is proven, not assumed: `TestimonialGuestAccessTest.theGuestNeverReadsAnUnapprovedTestimonial` runs as the real site guest over the seeded rows. With the restriction rule deployed inactive it fails, because the guest reads the pending row, and with the rule active it passes. `TestimonialController.getApprovedTestimonials` also filters on `Approved__c = true`, so the wall would stay correct even without the rule, and the rule protects every other path a guest could take to the object.

# ADR-012: Guest User Security (Restriction Rules)

## Status

Accepted

## Context

Standard sharing rules are additive and prone to accidental over-exposure.

## Decision

Implement Restriction Rules on the Testimonial\_\_c object.

## Rationale

Enforces a "Block First" policy for unapproved content at the kernel level, adhering to Zero Trust principles.

## Implications

Operates as a hard filter on record visibility specifically for the Guest User profile.

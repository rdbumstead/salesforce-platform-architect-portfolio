# ADR-023: Client-Side PDF Generation (jsPDF) for MVP

## Status

Accepted (Transitionary)

## Context

The Resume Builder requires PDF export, but server-side generation is deferred to Phase 8.

## Decision

Utilize jsPDF (Client-Side) via Static Resource for the MVP.

## Rationale

Enables functional PDF generation without middleware costs or early Lambda complexity.

## Implications

Output fidelity may vary across browsers; must migrate to serverless Node.js in Phase 8.

## Amendment (2026-10-26): the PDF is drawn from the same spec as the preview

jsPDF stays, in one click with no print dialog. What changed is the layout. The preview and the PDF now read one layout spec, `resumeLayout.js`: fonts, sizes in points, spacing, colours, rules, labels and section order. The PDF writer uses it in points and the preview reads the same values as CSS custom properties, so a change to the spec changes both. A Jest test builds the preview's sections and the PDF's lines from one model and asserts the same sections, order and certification groups.

The PDF embeds Inter (the regular and bold weights, as TTF files in the `Portfolio_Fonts` static resource, loaded only on the first download, with a fallback font when they cannot be fetched), centres the header with clickable links side by side, drops the "Summary" heading, puts a role's title and dates on one row, and groups certifications as the preview does: current ones newest first with the verify link, then the retired ones. The text stays selectable and in reading order for tracking systems.

Rejected: printing the preview (a print dialog), showing the PDF itself as the preview (a large viewer library, and the preview stops being page content), drawing the page into the PDF with jsPDF's `html()` (it turns the text into an image, which tracking systems cannot read), and a server render (it needs the serverless work below, which is not built). The move to a serverless renderer remains the later plan.

# ADR-037: Native Form Controls Site Wide

## Status

- **Decision:** Accepted
- **Build:** [Live](../../packages/portfolio-site/main/default/lwc/nativeControls)

Accepted (2026-10-27). Checked against the merged code: `lwc/nativeControls/nativeControls.css`, `config/jest.config.js`, and the `.html` of `apiTester`, `coverLetterGenerator`, `resumeBuilder` and `codeViewer`.

## Context

Salesforce's base components (`lightning-input`, `lightning-combobox`, `lightning-textarea`, `lightning-button`) draw at 32 px. The site's own controls are 44 px, the touch target the site holds itself to. Where the two sat in one row, the row did not line up. The alignment audit of 2026-10-27 measured offsets of up to 46 px, and the API Lab's parameter grid was the worst case. The contact and testimonial forms already used native controls and measured clean.

The site also had two native looks, not one. The contact forms and the API Lab's parameter grid differ in fill, edge and focus colour. Several streams copying one of them would have made a third.

## Decision

**Replace the base form components outright with native controls, styled by one shared CSS only module, `c/nativeControls`.**

- **One module.** A component adds `@import "c/nativeControls";` at the top of its CSS and uses the classes `nc-control`, `nc-button`, `nc-field`, `nc-label`, `nc-hint`, `nc-error` and `nc-required`. The module sets the height (44 px), the fill, the edge and the focus ring from the `--pf-` tokens, so a control follows the visitor's theme. A component's own CSS may set layout (width, grid, gaps) and never a control's height, colours, edge or focus.
- **11 controls moved**, counted from the base component tags in the four components' markup before and after: the API Lab's endpoint combobox, Advanced query text, token Email and Purpose, and the grid's own inputs and selects now use `nc-control`. The AI Lab's Company Name, Job Title and job description. The resume's "Tailor for" combobox and its Download PDF and Copy ATS text buttons. The code viewer's copy button.
- **Kept from the base components.** A visible label tied to its control by `for` and `id`. A required mark (`required` on the control and an `aria-hidden` asterisk in the label). The email check with `aria-invalid` and `aria-describedby`, announced to screen readers. Keyboard use and a visible focus ring. `color-scheme` comes from a `--pf-color-scheme` token (light or dark) that the theme layout and the site's `styles.css` set in all three theme blocks, so a native `select` and its menu follow the theme.
- **Left as they are.** The resume's two checkboxes stayed as `lightning-input` when this was accepted (moved on 2026-10-30, see the amendment below). `lightning-card`, `lightning-spinner` and `lightning-icon` stay where they are used. The contact and testimonial forms are not moved. They already measure clean.

## Alternatives considered

| Option                                        | Why not                                                                                                                                                                                          |
| :-------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep the base components and restyle them     | Their height is drawn inside the component, which the site's CSS does not reach, so the 44 px target could not be set from outside. [unverified] against each component's current styling hooks. |
| Each component styles its own native controls | Two native looks already existed. A third copy is how the site got two.                                                                                                                          |

## Implications

- **One look everywhere.** A change to the module changes every replaced control, and there are no styling hooks to maintain.
- **WebKit draws a native `select` at 48 px** where Chromium draws 44. The alignment audit flags a row that pairs a select with a button in WebKit. The documents components have no such row (alignment audit, 2026-10-27).
- **A CSS only module needs a Jest mapping.** `config/jest.config.js` maps `c/nativeControls` to its CSS file. A second CSS only module needs its own line.
- **A script that finds a field by its old name misses it.** An AI Lab field's accessible name no longer carries "(required)", so a lookup by that text finds nothing.
- **Not measured on every device.** The look was checked in Chromium and WebKit on the integration site. A real phone is my check.

## Amendment (2026-10-30): the resume's checkboxes are native

The resume's two include toggles are now native `input type="checkbox"` elements inside a wrapping `label` with a visible focus ring (`.toggle-input:focus-visible`), in place of `lightning-input`. The reason is weight, not alignment. `lightning-input` carried about 240 KB uncompressed of component machinery into the resume view for two checkboxes (performance audit, 2026-10-29).

- **The count changes.** The 11 controls counted above were base component tags. The two checkboxes bring the total moved to 13. The count of 11 stays true for the date it was made.
- **`lightning-formatted-date-time` is gone as well.** `c-view-source` formats its fetch time with `Intl.DateTimeFormat` in a `time` element, so the site uses that base component nowhere. `lightning-card`, `lightning-spinner` and `lightning-icon` remain, and removing the platform stylesheets they depend on was tried and not shipped (Technical Guide §2.11).
- **The checkbox look** is the browser's. I did not check it on a real phone. That is my check.

## Amendment (2026-11-15): the contact and testimonial forms use the shared styles

The style audits of 2026-11-15 found the two forms were the last native fields with a look of their own: a 4 px corner where every other field has 8 px, a focus ring on `:focus` rather than `:focus-visible`, and no disabled look, which mattered once both forms could be paused before launch. The decision above left them alone because they measured clean for alignment. They now move onto the module like every other field.

- **13 more fields.** The contact form's First name, Last name, Email, Company and Message (5) and the testimonial form's name, title, the relationship, strength and result blanks, the relationship and review of "Write my own" and the note (8) use `nc-control`, with `nc-label`, `nc-hint` and `nc-error` around them. The honeypot fields keep no look, because nobody is meant to see them. The 13 controls counted above stay true for their dates.
- **What changes for a visitor.** The corner is 8 px. The ring shows on keyboard focus. A paused form now looks paused: its fields take the `--pf-subtle` fill and a `not-allowed` pointer, and its buttons take the chip fill.
- **The shared module grew.** Since 2026-11-15 `c/nativeControls` also holds `nc-toggle` and `nc-toggle-group` (any button with `aria-pressed`), `nc-tab` and `nc-tablist` (`role="tab"` with `aria-selected`) and `nc-button_ghost` (the quiet button, sized by a host through `--nc-ghost-size` and `--nc-ghost-padding`). Beside it, `c/panel` gives the panel look (`pf-panel`, and `pf-panel_subtle` for the home page's "Get in touch" alone) and `c/pill` the one pill. Technical Guide §2.21, "Shared styles", lists each class.
- **Toggles in the forms.** The testimonial form's "Build a sentence" and "Write my own" buttons and the wall's "All" and "Professional" filter are `nc-toggle` buttons in an `nc-toggle-group`.
- **One local look.** The module has no switch, so the testimonial form's vibe switch (`role="switch"` with `aria-checked`) is drawn in its own CSS from the tokens. It is the one control a component styles itself. Its button is now the 44 px target (it was 26 px high), with the shared focus ring and a disabled look. If a second switch appears, it moves into the module.
- **Checked** on fixture builds of the static site in Chromium at 1440 and 390 px, light and dark: every field at 44 px or taller with an 8 px corner, the keyboard ring present, the paused fields filled and `not-allowed`. Not checked in WebKit or on a real phone.

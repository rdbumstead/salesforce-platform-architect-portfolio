# ADR-037: Native Form Controls Site Wide

## Status

Accepted (2026-10-27). Checked against the merged code: `lwc/nativeControls/nativeControls.css`, `config/jest.config.js`, and the `.html` of `apiTester`, `coverLetterGenerator`, `resumeBuilder` and `codeViewer`.

## Context

Salesforce's base components (`lightning-input`, `lightning-combobox`, `lightning-textarea`, `lightning-button`) draw at 32 px. The site's own controls are 44 px, the touch target the site holds itself to. Where the two sat in one row, the row did not line up. The alignment audit of 2026-10-27 measured offsets of up to 46 px, and the API Lab's parameter grid was the worst case. The contact and testimonial forms already used native controls and measured clean.

The site also had two native looks, not one. The contact forms and the API Lab's parameter grid differ in fill, edge and focus colour. Several streams copying one of them would have made a third.

## Decision

**Replace the base form components outright with native controls, styled by one shared CSS only module, `c/nativeControls`.**

- **One module.** A component adds `@import "c/nativeControls";` at the top of its CSS and uses the classes `nc-control`, `nc-button`, `nc-field`, `nc-label`, `nc-hint`, `nc-error` and `nc-required`. The module sets the height (44 px), the fill, the edge and the focus ring from the `--pf-` tokens, so a control follows the visitor's theme. A component's own CSS may set layout (width, grid, gaps) and never a control's height, colours, edge or focus.
- **11 controls moved**, counted from the base component tags in the four components' markup before and after: the API Lab's endpoint combobox, Advanced query text, token Email and Purpose, and the grid's own inputs and selects now use `nc-control`. The AI Lab's Company Name, Job Title and job description. The resume's "Tailor for" combobox and its Download PDF and Copy ATS text buttons. The code viewer's copy button.
- **Kept from the base components.** A visible label tied to its control by `for` and `id`. A required mark (`required` on the control and an `aria-hidden` asterisk in the label). The email check with `aria-invalid` and `aria-describedby`, announced to screen readers. Keyboard use and a visible focus ring. `color-scheme` comes from a `--pf-color-scheme` token (light or dark) that the theme layout and the site's `styles.css` set in all three theme blocks, so a native `select` and its menu follow the theme.
- **Left as they are.** The resume's two checkboxes stay as `lightning-input`, and `lightning-card`, `lightning-spinner`, `lightning-icon` and `lightning-formatted-date-time` stay where they are used. The contact and testimonial forms are not moved. They already measure clean.

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
- **Not measured on every device.** The look was checked in Chromium and WebKit on the integration site. A real phone is the owner's check.

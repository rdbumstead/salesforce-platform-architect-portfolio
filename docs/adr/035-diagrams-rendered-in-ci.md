# ADR-035: Diagrams Rendered in CI, Not in the Browser

## Status

Accepted (2026-10-26). Checked against the merged code: `scripts/render-mermaid.js`, `lwc/docsViewer/diagramHash.js`, `docsRenderer.drawing`, `.github/workflows/pr.yml` and `deploy.yml`.

## Context

The `/docs` page showed every Mermaid block as its source in a figure captioned "Diagram source (Mermaid)". A reader saw code where the guides meant a picture. The guides hold seven Mermaid blocks, and GitHub draws them, so the source in the repository was right and only the site was behind.

Drawing in the browser needs the Mermaid runtime. Its minified bundle is 3.6 MB for version 11 and 5.5 MB for version 12 (jsDelivr, read 2026-10-26). The site's content security policy allows scripts of that kind (`'unsafe-eval'` and `'unsafe-inline'` are listed for `script-src`, and the bundle holds no `new Function` or `eval`). Whether Mermaid measures text correctly inside Lightning Web Security's sandbox was not proved, and a 5.5 MB file is over Salesforce's 5 MB limit for one static resource.

## Decision

**Draw the diagrams in CI and ship pictures.** `scripts/render-mermaid.js` finds every Mermaid block in `docs/`, renders each to a light and a dark SVG with `@mermaid-js/mermaid-cli`, and writes them to the `Mermaid_Diagrams` static resource folder with a `manifest.json`. A file is named by a hash of the block's source (`diagramHash.js`, the same function the viewer uses), so a drawing can never be shown for text it was not drawn from. A block whose source has no drawing shows its source.

- **CI, not the repository.** The drawings are never committed. Only `placeholder.txt` is, so the resource deploys before any render. The PR check renders every diagram, and the deploy renders them and then deploys the drawings on their own.
- **No `package.json` change.** `@mermaid-js/mermaid-cli@12.0.0` and `puppeteer@25.16.0` install under `$RUNNER_TEMP` with `--no-save`, and the workflows run on the runner's Chrome. No lockfile moves.
- **Both themes.** The dark drawing is rendered with Mermaid's dark theme, and the viewer shows the one for the visitor's theme.
- **A text alternative for each picture.** `scripts/render-mermaid-alt.json` holds one sentence per block, keyed by hash. `scripts/render-mermaid.test.js` fails when a block has no sentence, so changing a block means re-keying its sentence in the same commit. The source stays in a closed details element under the picture.

## Alternatives considered

| Option                                          | Why not                                                                                                                               |
| :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| Mermaid runtime in the browser                  | A 3.6 to 5.5 MB bundle on a page that otherwise loads a small renderer. Text measurement under Lightning Web Security was not proved. |
| Commit the SVGs                                 | A second copy of each diagram that drifts from the source, and a diff nobody reads.                                                   |
| Another diagram format (images, a drawing tool) | The source would stop being editable text that diffs in a pull request, and GitHub would stop drawing it.                             |

## Implications

- Editing a Mermaid block shows its source on the site until the next PR check or deploy renders it. That is the safe failure.
- The render needs a Chrome on the runner. A render that fails fails the PR check. In the deploy it is allowed to fail: the site then shows each diagram's source and the deploy goes on.
- The drawings are not in the repository, so a local `/docs` check shows sources unless the script has run.

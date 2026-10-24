# Third-party notices

This repository ships the third-party libraries and fonts below inside Salesforce static resources. Each one
keeps its own licence. The project's own code is under the licence in [LICENSE](LICENSE).

| Library                   | Version          | Licence                                              | Ships in                                                                                              |
| ------------------------- | ---------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Redoc (standalone bundle) | 2.5.4            | MIT                                                  | `packages/portfolio-site/main/default/staticresources/Redoc_Script.js`                                |
| d3 modules (11)           | 3.0.0 to 3.1.0   | ISC, and BSD 3-Clause for d3-ease's easing equations | `packages/portfolio-site/main/default/staticresources/D3_Library.js`                                  |
| jsPDF                     | 3.0.4            | MIT                                                  | `packages/portfolio-site/main/default/staticresources/jsPDF_Library.js`                               |
| PrismJS                   | 1.30.0           | MIT                                                  | `packages/portfolio-site/main/default/staticresources/Prism_JS/prism.js` and `prism.css`              |
| marked                    | 18.1.0           | MIT                                                  | `packages/portfolio-site/main/default/staticresources/Marked_Library.js`                              |
| Inter (font)              | fontsource 5.3.0 | SIL OFL 1.1                                          | `packages/portfolio-site/main/default/staticresources/Portfolio_Fonts/inter-latin-*-normal.woff2`     |
| Fira Code (font)          | fontsource 5.3.0 | SIL OFL 1.1                                          | `packages/portfolio-site/main/default/staticresources/Portfolio_Fonts/fira-code-latin-*-normal.woff2` |

## Redoc 2.5.4

- Copyright (c) 2015-present, Rebilly, Inc.
- Licence: MIT. Source: https://github.com/Redocly/redoc, package `redoc@2.5.4`.
- Licence text: https://unpkg.com/redoc@2.5.4/LICENSE
- The standalone bundle includes other open source modules. Their notices are in the file the
  bundle's first line points to, `redoc.standalone.js.LICENSE.txt`, which this repository does not
  copy. It is published with the package at
  https://unpkg.com/redoc@2.5.4/bundles/redoc.standalone.js.LICENSE.txt

## d3 modules

- Modules, as each banner line in `D3_Library.js` states them: d3-dispatch 3.0.1, d3-quadtree 3.0.1,
  d3-timer 3.0.1, d3-force 3.0.0, d3-selection 3.0.0, d3-color 3.1.0, d3-interpolate 3.0.1, d3-ease
  3.0.1, d3-transition 3.0.1, d3-drag 3.0.0 and d3-zoom 3.0.0. The official UMD builds
  (`dist/<name>.min.js` from each npm package), concatenated unchanged in dependency order.
- Copyright 2010-2021 Mike Bostock (d3-color: 2010-2022). d3-ease also: Copyright 2001 Robert Penner.
- Licence: ISC for every module. d3-ease also carries Robert Penner's easing equations under the BSD
  3-Clause licence. Source: https://github.com/d3, one npm package per module at the versions above.
- Licence text: both licences in full in the comment at the top of `D3_Library.js`, the ISC text
  below in this file, and each package's own file, for example https://unpkg.com/d3-force@3.0.0/LICENSE

## jsPDF 3.0.4

- Copyright (c) 2010-2025 James Hall, https://github.com/MrRio/jsPDF
- Copyright (c) 2015-2025 yWorks GmbH, https://www.yworks.com/
- Licence: MIT. Source: https://github.com/parallax/jsPDF
- Licence text: https://github.com/parallax/jsPDF/blob/v3.0.4/LICENSE
- The bundle keeps the full copyright header and the notices of the modules it includes at the top
  of `jsPDF_Library.js` and next to each module.

## PrismJS 1.30.0

- Copyright (c) 2012 Lea Verou
- Licence: MIT. Source: https://github.com/PrismJS/prism (download build with the `prism` theme
  and the markup, css, clike and javascript languages).
- Licence text: https://github.com/PrismJS/prism/blob/v1.30.0/LICENSE

## marked 18.1.0

- Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/)
- Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/)
- Licence: MIT. Source: https://github.com/markedjs/marked, package `marked@18.1.0`, the official UMD build
  `lib/marked.umd.js` copied unchanged. Only its lexer is used.
- Licence text: in the comment at the top of `Marked_Library.js`, the package's LICENSE file as
  published: the full MIT text, and the BSD style notice of John Gruber's original Markdown
  (Copyright 2004, John Gruber), which the package's licence file also carries.

## Inter

- Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)
- Licence: SIL Open Font License, Version 1.1. Packaged by Fontsource as `@fontsource/inter` 5.3.0.
  The repository ships the Latin subset, weights 400, 500, 600 and 700, as woff2.
- Licence text: shipped beside the fonts in
  `packages/portfolio-site/main/default/staticresources/Portfolio_Fonts/Inter-OFL.txt`, and at
  https://openfontlicense.org/open-font-license-official-text/

## Fira Code

- Copyright 2014-2020 The Fira Code Project Authors (https://github.com/tonsky/FiraCode)
- Licence: SIL Open Font License, Version 1.1. Packaged by Fontsource as `@fontsource/fira-code`
  5.3.0. The repository ships the Latin subset, weights 400 and 500, as woff2.
- Licence text: shipped beside the fonts in
  `packages/portfolio-site/main/default/staticresources/Portfolio_Fonts/FiraCode-OFL.txt`, and at
  https://openfontlicense.org/open-font-license-official-text/

## MIT licence text

Redoc, jsPDF and PrismJS use this text, each with its own copyright line.

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## ISC licence text

The four D3 modules use this text with the copyright line above.

```text
Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

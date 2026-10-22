# Third-party notices

This repository ships the third-party libraries and fonts below inside Salesforce static resources. Each one
keeps its own licence. The project's own code is under the licence in [LICENSE](LICENSE).

| Library                   | Version          | Licence     | Ships in                                                                                              |
| ------------------------- | ---------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| Redoc (standalone bundle) | 2.5.4            | MIT         | `packages/portfolio-site/main/default/staticresources/Redoc_Script.js`                                |
| AntV G6                   | 4.8.23           | MIT         | `packages/portfolio-site/main/default/staticresources/G6_Library.js`                                  |
| jsPDF                     | 3.0.4            | MIT         | `packages/portfolio-site/main/default/staticresources/jsPDF_Library.js`                               |
| PrismJS                   | 1.30.0           | MIT         | `packages/portfolio-site/main/default/staticresources/Prism_JS/prism.js` and `prism.css`              |
| Inter (font)              | fontsource 5.3.0 | SIL OFL 1.1 | `packages/portfolio-site/main/default/staticresources/Portfolio_Fonts/inter-latin-*-normal.woff2`     |
| Fira Code (font)          | fontsource 5.3.0 | SIL OFL 1.1 | `packages/portfolio-site/main/default/staticresources/Portfolio_Fonts/fira-code-latin-*-normal.woff2` |

## Redoc 2.5.4

- Copyright (c) 2015-present, Rebilly, Inc.
- Licence: MIT. Source: https://github.com/Redocly/redoc, package `redoc@2.5.4`.
- Licence text: https://unpkg.com/redoc@2.5.4/LICENSE
- The standalone bundle includes other open source modules. Their notices are in the file the
  bundle's first line points to, `redoc.standalone.js.LICENSE.txt`, which this repository does not
  copy. It is published with the package at
  https://unpkg.com/redoc@2.5.4/bundles/redoc.standalone.js.LICENSE.txt

## AntV G6 4.8.23

- Copyright (c) 2018 Alipay.inc
- Licence: MIT. Source: https://github.com/antvis/G6, package `@antv/g6@4.8.23` (the `license`
  field of its `package.json` reads `MIT`).
- Licence text: https://github.com/antvis/G6/blob/master/LICENSE

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

Redoc, AntV G6, jsPDF and PrismJS use this text, each with its own copyright line.

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

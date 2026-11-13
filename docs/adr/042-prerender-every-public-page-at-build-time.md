# ADR-042: Prerender Every Public Page at Build Time

## Status

- **Decision:** Accepted.
- **Build:** In progress (SPAP-98). The step is in [prerender.mjs](../../web/build/prerender.mjs) and the hand over in [mount.js](../../web/src/shims/mount.js), and it runs only when the build is given `--prerender`. [site.yml](../../.github/workflows/site.yml) does not pass the flag, so production serves the pages as before.

Accepted on 2026-11-12. The step is in the code and switched off. It amends [ADR-041](041-headless-static-front-end-on-cloudflare-pages.md). I switch it on when Lighthouse mobile LCP rises by 200 ms or less on each of the six audited routes against the current build. In the measurements below it rose by 541 to 876 ms, so the flag stays off until a change or a better measurement says otherwise.

## Context

ADR-041 moved the public front end to static pages, but each page is still an empty shell until JavaScript runs. A crawler, a link preview or an AI assistant reads only the first HTML response. That response holds the head, the Person data and a short summary, about 126 words on the home page, and none of the sections. `/llms.txt` covers AI assistants in the meantime. LWR server side rendering is discontinued (ADR-041), so a platform feature is not an option.

## Decision

**Every public page is rendered in headless Chrome after the build, and the result is written into the page's HTML, so Cloudflare can serve the complete page and the JavaScript takes over after load. The step runs only with `--prerender`, so a build without a browser still works.**

1. **Native shadow roots are serialized.** The browser creates each root serializable, and `getHTML({ serializableShadowRoots: true })` writes each one as a declarative shadow root. The browser does not serialize adopted style sheets, so each distinct sheet is written once to `assets/pr-<hash>.css` and every root links the sheets it adopted, in order.
2. **The data is the build's data.** The step serves `dist` on a private port and refuses every other host. Nothing reaches Salesforce. The local feature answer says every switch is live, so the forms are drawn the way the production host draws them.
3. **A swap with no jump.** `mount.js` builds the live page in a hidden stage beside the rendered one and swaps it in, in one task, once every component and the footer are in place. If the live page never finishes, the rendered copy stays. A page with no `data-prerendered` mounts exactly as before.
4. **The static summary stays, hidden,** after the rendered content, so a reader that skips shadow roots still finds the page links and the profile links.
5. **Rendered at phone width.** Components read the viewport once at load, so one rendering matches one form factor. It is made at 390 px, the audited profile and most visitors. On a desktop the first screen matches, and three blocks below it change height at the swap: the API Lab tester, the schema visualizer and the skills page.

## Alternatives considered

- **A copy per form factor.** Two renderings, one hidden by a media query. It removes the desktop resize but doubles the first response, crawlers read every section twice, and the measured load cost grows.
- **Components that read the viewport when they connect.** One rendering would then match both widths. It changes several components, so it is its own piece of work.
- **CSS copied into every root.** The first version did this. It made `/resume` 187 KB raw against 72 KB with shared files, and the LCP result was no better.

## Measured (fixture build, local, 2026-11-12 and 2026-11-13)

- Words in the first response: `/resume` 68 before and 824 after, the home page 118 before and 1050 after. With JavaScript off the full page shows at 390 and 1280 px.
- Cumulative layout shift on the six audited routes is 0.0003 or less before and after, and accessibility stays at 100.
- Lighthouse 12.6.1 mobile, simulated throttling, a brotli server, median of 3 runs with base and prerender alternating. LCP moved from 2340 to 2881 ms on `/`, 2017 to 2744 on `/resume`, 2032 to 2700 on `/skills`, 2171 to 2951 on `/api-lab`, 1972 to 2737 on `/business-architecture` and 1947 to 2823 on `/nonprofit-solutions`. Performance fell from 97 to 99 to 91 to 93.
- Without throttling, first paint is 256 to 504 ms on the base build and 304 to 536 ms with the prerender. With all CSS stripped from the rendered roots, which is not shippable, simulated first paint is still about 300 ms above the base. So the cost shows in Lighthouse's simulation, and the CSS is only part of it. I have not found the rest.
- A head preload for the shared files and skipping layout of the sections below the first screen did not change the result.
- The build gains about 21 s locally for 12 routes.

## Implications

- Nothing changes for visitors until the flag is on.
- The real test is a Lighthouse audit of a Cloudflare preview with the flag on, served over HTTP/2 with Cloudflare's compression. No job runs that today.
- The build needs Chrome and `playwright-core`, installed outside `web/package.json`, which `site.yml` would provide when the flag goes on.

## Rollback

Remove `--prerender` from the build command. A page without `data-prerendered` mounts exactly as it did before this decision.

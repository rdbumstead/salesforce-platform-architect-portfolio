/**
 * Fails when the home page project showcase breaks its layout rules (R28-11). It runs against
 * the fixture build, with the home read cut or padded to 3, 4, 5 and 8 projects, at 360, 390,
 * 768 and 1280 px wide, in light and dark.
 *
 *   node build/check-showcase.mjs [--dist dist] [--counts 3,4,5,8] [--widths 360,390,768,1280]
 *                                 [--schemes light,dark] [--json file]
 *
 * What it flags:
 *   scroll    the page scrolls sideways
 *   tap       a link or button in the showcase is under 24 by 24 px
 *   gap       at 390 wide, the heading is more than 80 px above the first card
 *   fold      at 1280 by 800, card 1 or card 2 has its title or Outcome number below the fold.
 *             "My part" may sit just below it (owner, 2026-11-21)
 *   lone      a card or row title ends with one word alone on its last line
 *   heading   the section heading takes more than one line, or is squeezed to no width
 *
 * Every request that is not to the local server is refused, so the page's analytics tag never
 * loads and no event can reach a real property. CHROME_PATH points at an installed Chrome, as
 * in the other checks, and without it Playwright uses its own browser.
 * It exits 1 when anything is flagged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serveDist } from "./check-overflow.mjs";

const WEB_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
export const DEFAULT_COUNTS = [3, 4, 5, 8];
export const DEFAULT_WIDTHS = [360, 390, 768, 1280];
export const DEFAULT_SCHEMES = ["light", "dark"];
export const MIN_TAP = 24;
export const MAX_GAP = 80;
export const PHONE_WIDTH = 390;
export const DESKTOP = { width: 1280, height: 800 };
const READ_KEY = "ProjectCardController.getHomeCaseStudies";

/**
 * The page's html with the home read cut or padded to `count` projects. Padding repeats the
 * saved rows with new keys and titles, so the page reads a list of exactly that length.
 */
export function withProjectCount(html, count) {
  const open = '<script type="application/json" id="site-data">';
  const start = html.indexOf(open);
  if (start < 0) throw new Error("The page has no site-data script");
  const from = start + open.length;
  const to = html.indexOf("</script>", from);
  const data = JSON.parse(html.slice(from, to));
  const reads = data.reads || data;
  const saved = reads[READ_KEY];
  if (!Array.isArray(saved) || saved.length === 0)
    throw new Error("The page has no saved home read");
  reads[READ_KEY] = Array.from({ length: count }, (_, i) => {
    const row = saved[i % saved.length];
    return i < saved.length
      ? row
      : { ...row, key: `${row.key}-copy${i}`, title: `${row.title} ${i + 1}` };
  });
  return html.slice(0, from) + JSON.stringify(data) + html.slice(to);
}

/**
 * Applies the rules to one measurement. The measurement comes from scanShowcase, and this part
 * has no browser in it, so the rules can be tested alone.
 */
export function judge(measure, context) {
  const findings = [];
  const add = (kind, detail) => findings.push({ kind, detail });
  if (measure.scrollWidth > measure.clientWidth + 1) {
    add(
      "scroll",
      `${measure.scrollWidth}px of content in a ${measure.clientWidth}px window`
    );
  }
  for (const tap of measure.taps) {
    if (tap.width < MIN_TAP || tap.height < MIN_TAP) {
      add(
        "tap",
        `${tap.name} is ${Math.round(tap.width)} by ${Math.round(tap.height)} px`
      );
    }
  }
  if (
    context.width === PHONE_WIDTH &&
    typeof measure.headingToCard === "number" &&
    measure.headingToCard > MAX_GAP
  ) {
    add(
      "gap",
      `the heading is ${Math.round(measure.headingToCard)} px above the first card, the limit is ${MAX_GAP}`
    );
  }
  if (context.width === DESKTOP.width && context.fold) {
    measure.foldCards.slice(0, 2).forEach((card, index) => {
      for (const part of ["number", "title"]) {
        if (typeof card[part] === "number" && card[part] > DESKTOP.height) {
          add(
            "fold",
            `card ${index + 1} ${part} ends at ${Math.round(card[part])} px, below the ${DESKTOP.height} px fold`
          );
        }
      }
    });
  }
  if (typeof measure.headingLines === "number" && measure.headingLines !== 1) {
    add(
      "heading",
      measure.headingLines === 0
        ? "the section heading has no width"
        : `the section heading takes ${measure.headingLines} lines`
    );
  }
  for (const title of measure.loneWordTitles) {
    add("lone", `"${title}" ends with one word alone on its last line`);
  }
  return findings;
}

/**
 * Runs in the page. It has no imports because Playwright serialises the function. It walks the
 * open shadow roots under the showcase host and returns the raw measurements.
 */
export function scanShowcase() {
  const host = document.querySelector("c-case-study-grid");
  const empty = {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    taps: [],
    headingToCard: null,
    headingLines: null,
    foldCards: [],
    loneWordTitles: [],
    cardCount: 0
  };
  if (!host || !host.shadowRoot) return empty;
  const root = host.shadowRoot;
  const top = (el) => el.getBoundingClientRect().top + window.scrollY;
  const bottom = (el) => el.getBoundingClientRect().bottom + window.scrollY;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const anchors = [];
  const collect = (scope) => {
    scope.querySelectorAll("a, button").forEach((el) => anchors.push(el));
    scope.querySelectorAll("*").forEach((el) => {
      if (el.shadowRoot) collect(el.shadowRoot);
    });
  };
  collect(root);
  const taps = anchors.filter(visible).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      name: `${el.localName}${el.dataset && el.dataset.id ? `[${el.dataset.id}]` : ""} "${(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30)}"`,
      width: r.width,
      height: r.height
    };
  });
  const cards = Array.from(root.querySelectorAll('[data-id="card"]'));
  const heading = root.querySelector('[data-id="case-heading"]');
  const headingToCard =
    heading && cards[0] ? top(cards[0]) - top(heading) : null;
  const headingLine = heading
    ? parseFloat(getComputedStyle(heading).lineHeight)
    : NaN;
  // A squeezed heading can be 0 px wide, so this measures it whether or not it shows.
  const headingLines =
    heading && headingLine > 0
      ? heading.getBoundingClientRect().width > 0
        ? Math.round(heading.getBoundingClientRect().height / headingLine)
        : 0
      : null;
  const foldCards = cards.slice(0, 2).map((card) => {
    const pick = (selector) => {
      const el = card.querySelector(selector);
      return el && visible(el) ? bottom(el) : null;
    };
    return {
      number: pick(".metric-number"),
      title: pick(".card-title, .row-title"),
      myPart: pick('[data-id="my-part"]')
    };
  });
  const loneWordTitles = [];
  root.querySelectorAll(".card-title, .row-title").forEach((title) => {
    if (!visible(title)) return;
    const textNode = title.firstChild;
    if (!textNode || textNode.nodeType !== 3) return;
    const text = textNode.textContent;
    const words = [];
    const pattern = /\S+/g;
    let match;
    while ((match = pattern.exec(text))) {
      const range = document.createRange();
      range.setStart(textNode, match.index);
      range.setEnd(textNode, match.index + match[0].length);
      const rects = range.getClientRects();
      if (rects.length) words.push(Math.round(rects[rects.length - 1].top));
    }
    if (words.length < 2) return;
    const lines = Array.from(new Set(words));
    if (lines.length < 2) return;
    const lastLine = words[words.length - 1];
    const onLast = words.filter((t) => t === lastLine).length;
    if (onLast === 1) loneWordTitles.push(text.trim());
  });
  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    taps,
    headingToCard,
    headingLines,
    foldCards,
    loneWordTitles,
    cardCount: cards.length
  };
}

/** The text report, one line per finding. */
export function formatReport(results) {
  if (!results.length) return "No showcase problems found.";
  return results
    .map(
      (r) =>
        `${r.count} projects  ${r.width}px ${r.scheme}  ${r.kind}  ${r.detail}`
    )
    .join("\n");
}

function parseArgs(argv) {
  const options = {
    dist: path.join(WEB_DIR, "dist"),
    counts: DEFAULT_COUNTS,
    widths: DEFAULT_WIDTHS,
    schemes: DEFAULT_SCHEMES
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dist") options.dist = path.resolve(argv[++i]);
    else if (arg === "--counts")
      options.counts = argv[++i].split(",").map(Number);
    else if (arg === "--widths")
      options.widths = argv[++i].split(",").map(Number);
    else if (arg === "--schemes") options.schemes = argv[++i].split(",");
    else if (arg === "--json") options.json = argv[++i];
    else throw new Error(`Unknown argument ${arg}`);
  }
  return options;
}

async function loadPlaywright() {
  try {
    if (process.env.PLAYWRIGHT_MODULE) {
      const { createRequire } = await import("node:module");
      return createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
    }
    return await import("playwright");
  } catch (error) {
    throw new Error(
      `Playwright is not available (${error.code || error.message}). Install it, or set PLAYWRIGHT_MODULE to its folder.`
    );
  }
}

/** Loads the home page at each size, count and scheme, and judges it. */
export async function runCheck(options) {
  const { chromium } = await loadPlaywright();
  const { server, base } = await serveDist(options.dist);
  const html = fs.readFileSync(path.join(options.dist, "index.html"), "utf8");
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined
  });
  const results = [];
  try {
    for (const count of options.counts) {
      const variant = withProjectCount(html, count);
      for (const width of options.widths) {
        for (const scheme of options.schemes) {
          const height = width === DESKTOP.width ? DESKTOP.height : 844;
          const context = await browser.newContext({
            viewport: { width, height },
            colorScheme: scheme
          });
          await context.route("**/*", (route) => {
            const url = route.request().url();
            if (!url.startsWith(base)) return route.abort();
            const pathname = new URL(url).pathname;
            if (pathname === "/" || pathname === "/index.html")
              return route.fulfill({
                status: 200,
                contentType: "text/html; charset=utf-8",
                body: variant
              });
            return route.continue();
          });
          const page = await context.newPage();
          await page.goto(`${base}/`, { waitUntil: "networkidle" });
          await page.waitForSelector("c-case-study-grid", { timeout: 5000 });
          await page.waitForTimeout(400);
          const measure = await page.evaluate(scanShowcase);
          const found = judge(measure, { width, fold: true });
          if (measure.cardCount !== count)
            found.push({
              kind: "count",
              detail: `the page drew ${measure.cardCount} cards, not ${count}`
            });
          found.forEach((finding) =>
            results.push({ count, width, scheme, ...finding })
          );
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const results = await runCheck(options);
  if (options.json)
    fs.writeFileSync(options.json, `${JSON.stringify(results, null, 2)}\n`);
  console.log(formatReport(results));
  console.log(
    `Counts ${options.counts.join(", ")}, widths ${options.widths.join(", ")}, schemes ${options.schemes.join(", ")}: ${results.length} flagged.`
  );
  process.exitCode = results.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}

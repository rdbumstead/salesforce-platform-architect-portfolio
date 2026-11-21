/**
 * Fails when text is aligned or cut in a way a visitor reads as a fault. R28-7: a hint wrapped
 * from the right edge under a button, and a build stamp ran past the edge of a phone, and no
 * automated check saw either. This is the check for those two kinds, run against the fixture
 * build.
 *
 *   node build/check-alignment.mjs [--dist dist] [--base http://localhost:8805]
 *                                  [--widths 360,390,768,1280] [--schemes light,dark]
 *                                  [--json file] [--no-docs] [--routes /,/contact]
 *
 * With no --base it serves --dist itself, with the _redirects rewrites that end in 200, the
 * same way check-overflow does. Every .html file under dist is a route.
 *
 * What it flags, for each width and colour scheme:
 *   aligned   a paragraph or text block of two or more lines whose text is right or centre
 *             aligned. A short label of one line, in a button or a table head, is not flagged.
 *             A block that is meant to read that way carries data-align-ok.
 *   cut off   text that is clipped by its own box or by an ancestor that clips (overflow hidden
 *             or clip), where the box is narrower than the text. An ellipsis the page draws on
 *             purpose (text-overflow: ellipsis) is not flagged.
 *   past edge text that reaches past the edge of the window with no scroll box around it.
 *   lone mark a wrapped line that holds only a mark: a separator dot, a bullet, an arrow or an
 *             empty box of icon size, such as a status dot left above its label (R29 mobile).
 *   mark at edge
 *             a line that ends on a separator dot or bullet with more lines after it, so the
 *             next item starts the line below without it.
 * Text that is out of sight on purpose (visually hidden, a skip link that waits for focus) is
 * not flagged, and the error pages (/404, /429, /503) are not scanned.
 * It exits 1 when anything is flagged and prints each route, width, scheme and element.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  routesFromDist,
  docKeysFromFixtures,
  serveDist
} from "./check-overflow.mjs";

const WEB_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
export const DEFAULT_WIDTHS = [360, 390, 768, 1280];
export const DEFAULT_SCHEMES = ["light", "dark"];
const DOCS_ROUTE = "/docs";
/** The error pages stand alone, with a centred message by design, and are not scanned. */
export const SKIPPED_ROUTES = ["/404", "/429", "/503"];

/**
 * Runs in the page. It walks the document and every open shadow root, and returns the
 * findings. It has no imports because Playwright serialises the function.
 */
export function scanAlignment() {
  const findings = [];
  const ALIGN_OK_HOSTS = ["c-credentials-band"];
  // Text inside these is a label of a control, so its alignment belongs to the control.
  const CONTROL =
    "button, [role='button'], summary, select, option, label.nc-button";
  const SKIP_TAGS = [
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "SVG",
    "CANVAS",
    "TEMPLATE"
  ];

  const all = [];
  const collect = (root) => {
    root.querySelectorAll("*").forEach((el) => {
      all.push(el);
      if (el.shadowRoot) collect(el.shadowRoot);
    });
  };
  collect(document);

  const parentOf = (el) =>
    el.parentElement || (el.getRootNode && el.getRootNode().host) || null;
  const className = (el) =>
    typeof el.className === "string"
      ? el.className
      : (el.className && el.className.baseVal) || "";
  const describe = (el) => {
    const parts = [];
    let node = el;
    for (let depth = 0; node && depth < 4; depth++, node = parentOf(node)) {
      const classes = className(node)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(".");
      parts.unshift(
        `${node.localName || "node"}${node.id ? `#${node.id}` : ""}${classes ? `.${classes}` : ""}`
      );
    }
    return parts.join(" > ");
  };
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    for (let node = el; node; node = parentOf(node)) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden")
        return false;
      if (node.hasAttribute && node.hasAttribute("hidden")) return false;
    }
    return true;
  };
  const ownText = (el) =>
    Array.from(el.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.nodeValue)
      .join("")
      .replace(/\s+/g, " ")
      .trim();
  const inside = (el, selector) => {
    for (let node = el; node; node = parentOf(node)) {
      if (node.matches && node.matches(selector)) return true;
    }
    return false;
  };
  // A component whose centred captions are deliberate: the credential tiles pair a badge with
  // a centred caption.
  const insideHost = (el) => {
    for (let node = el; node; node = parentOf(node)) {
      if (node.localName && ALIGN_OK_HOSTS.includes(node.localName))
        return true;
    }
    return false;
  };
  // The rectangles of the text itself, not of the box that holds it.
  const textRects = (el) => {
    const range = document.createRange();
    const rects = [];
    Array.from(el.childNodes)
      .filter((node) => node.nodeType === 3 && node.nodeValue.trim())
      .forEach((node) => {
        range.selectNodeContents(node);
        Array.from(range.getClientRects())
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .forEach((rect) => rects.push(rect));
      });
    return rects;
  };
  const lineCount = (rects) =>
    new Set(rects.map((rect) => Math.round(rect.top / 4))).size;
  const scrollBox = (el) => {
    for (let node = el; node; node = parentOf(node)) {
      if (node === document.documentElement) return null;
      const x = getComputedStyle(node).overflowX;
      if (x === "auto" || x === "scroll") return node;
    }
    return null;
  };
  const clipper = (el) => {
    for (let node = el; node; node = parentOf(node)) {
      if (node === document.documentElement || node === document.body)
        return null;
      const x = getComputedStyle(node).overflowX;
      if (x === "hidden" || x === "clip") return node;
      if (x === "auto" || x === "scroll") return null;
    }
    return null;
  };
  const add = (kind, el, detail) =>
    findings.push({ kind, element: describe(el), detail });

  const viewport = document.documentElement.clientWidth;
  for (const el of all) {
    if (SKIP_TAGS.includes(el.tagName.toUpperCase())) continue;
    if (inside(el, "svg, [data-align-ok]")) continue;
    if (!ownText(el) || !visible(el)) continue;
    const style = getComputedStyle(el);
    const rects = textRects(el);
    if (!rects.length) continue;
    // Text kept out of sight on purpose is not a fault: a box of one or two pixels (visually
    // hidden text, a collapsed table head) and text wholly outside the window (a skip link
    // that waits for focus, a trap field).
    const box0 = el.getBoundingClientRect();
    if (box0.width <= 2 || box0.height <= 2) continue;
    if (rects.every((rect) => rect.right <= 0 || rect.left >= viewport))
      continue;

    // Aligned: two or more lines, right or centre, outside a control.
    if (
      !insideHost(el) &&
      ["right", "end", "center"].includes(style.textAlign) &&
      style.display !== "inline" &&
      !inside(el, CONTROL) &&
      lineCount(rects) >= 2
    ) {
      add(
        "aligned",
        el,
        `${lineCount(rects)} lines, text-align ${style.textAlign}`
      );
    }

    // Cut off: a clipping box narrower than its text, unless the page draws an ellipsis.
    const box = clipper(el);
    if (box && style.textOverflow !== "ellipsis") {
      const edge = box.getBoundingClientRect();
      // A clipping box of a few pixels hides its text on purpose (a collapsed table head).
      if (edge.width < 4 || edge.height < 4) continue;
      const right = Math.max(...rects.map((rect) => rect.right));
      const left = Math.min(...rects.map((rect) => rect.left));
      if (right > edge.right + 1 || left < edge.left - 1) {
        add(
          "cut off",
          el,
          `text reaches ${Math.round(right)}px in a clipping box that ends at ${Math.round(edge.right)}px`
        );
        continue;
      }
    }

    // Past edge: text beyond the window with no scroll box around it.
    if (!scrollBox(el) && !box) {
      const right = Math.max(...rects.map((rect) => rect.right));
      const left = Math.min(...rects.map((rect) => rect.left));
      if (right > viewport + 1 || left < -1) {
        add(
          "past edge",
          el,
          `text spans ${Math.round(left)}px to ${Math.round(right)}px in a ${viewport}px window`
        );
      }
    }
  }

  // Lone mark and mark at edge: the pieces of a box (each word of its own text, each child
  // box) are set out in lines by their position. A wrapped line that holds only marks (a dot,
  // a separator, an arrow or an empty box such as a status dot) is a lone mark. A line that
  // ends on a separator, with more lines after it, is a mark at edge. Prose dashes and commas
  // are not marks, so ordinary text is never flagged.
  const MARK = /^[·•›»→]$/;
  const SEPARATOR = /^[·•]$/;
  for (const el of all) {
    if (SKIP_TAGS.includes(el.tagName.toUpperCase())) continue;
    if (inside(el, "svg, [data-align-ok]") || !visible(el)) continue;
    const style = getComputedStyle(el);
    if (style.display === "inline" || style.display === "contents") continue;
    // Only boxes whose pieces flow in lines: a wrapping flex row, or inline content.
    const flexRow =
      /flex/.test(style.display) &&
      style.flexDirection.startsWith("row") &&
      style.flexWrap !== "nowrap";
    if (/flex|grid/.test(style.display) && !flexRow) continue;
    const pieces = [];
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        const words = /\S+/g;
        let match;
        while ((match = words.exec(node.nodeValue))) {
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0) pieces.push({ rect, text: match[0] });
        }
      } else if (node.nodeType === 1) {
        const childStyle = getComputedStyle(node);
        if (
          childStyle.display === "none" ||
          childStyle.position === "absolute" ||
          childStyle.position === "fixed"
        )
          continue;
        if (!flexRow && !childStyle.display.startsWith("inline")) continue;
        let text = (node.textContent || "").replace(/\s+/g, " ").trim();
        // An empty box is a mark only when it is icon sized. A picture is content.
        const size = node.getBoundingClientRect();
        if (!text && (size.width > 24 || size.height > 24)) text = "[content]";
        const rects =
          childStyle.display === "inline"
            ? Array.from(node.getClientRects())
            : [node.getBoundingClientRect()];
        rects
          .filter((rect) => rect.width > 0 && rect.height > 0)
          .forEach((rect) => pieces.push({ rect, text, box: true }));
      }
    }
    if (pieces.length < 2) continue;
    const lines = [];
    pieces
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
      .forEach((piece) => {
        const { top, bottom } = piece.rect;
        const line = lines.find(
          (l) =>
            Math.min(l.bottom, bottom) - Math.max(l.top, top) >
            0.5 * Math.min(bottom - top, l.bottom - l.top)
        );
        if (line) {
          line.pieces.push(piece);
          line.top = Math.min(line.top, top);
          line.bottom = Math.max(line.bottom, bottom);
        } else lines.push({ top, bottom, pieces: [piece] });
      });
    if (lines.length < 2) continue;
    lines.sort((a, b) => a.top - b.top);
    lines.forEach((line, index) => {
      line.pieces.sort((a, b) => a.rect.left - b.rect.left);
      const marks = line.pieces.every(
        (p) => MARK.test(p.text) || (p.box && p.text === "")
      );
      const said = line.pieces.map((p) => p.text || "[box]").join(" ");
      if (marks) {
        add(
          "lone mark",
          el,
          `line ${index + 1} of ${lines.length} holds only "${said}"`
        );
      } else if (index < lines.length - 1) {
        const last = line.pieces[line.pieces.length - 1];
        if (!last.box && SEPARATOR.test(last.text))
          add(
            "mark at edge",
            el,
            `line ${index + 1} of ${lines.length} ends with "${last.text}"`
          );
      }
    });
  }
  return findings;
}

/** The text report: one line per finding. */
export function formatReport(results) {
  if (!results.length) return "No alignment fault found.";
  return results
    .map(
      (r) =>
        `${r.route}  ${r.width}px ${r.scheme}  ${r.kind}  ${r.element}  ${r.detail}`
    )
    .join("\n");
}

/** Playwright from the project, or from the folder PLAYWRIGHT_MODULE names. */
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

/**
 * Waits until the page has stopped drawing: the count of elements, shadow roots included, is
 * the same on two reads 400 ms apart. A component that hydrates late is then scanned drawn.
 */
async function settled(page) {
  const count = () =>
    page
      .evaluate(() => {
        let total = 0;
        const walk = (root) =>
          root.querySelectorAll("*").forEach((el) => {
            total++;
            if (el.shadowRoot) walk(el.shadowRoot);
          });
        walk(document);
        return total;
      })
      .catch(() => 0);
  let last = -1;
  for (let i = 0; i < 20; i++) {
    const now = await count();
    if (now === last) return;
    last = now;
    await page.waitForTimeout(400);
  }
}

/** Scans every route at every width and scheme. */
export async function runCheck(options) {
  const { chromium } = await loadPlaywright();
  let served;
  const base = options.base || (served = await serveDist(options.dist)).base;
  const routes =
    options.routes ||
    routesFromDist(options.dist).filter(
      (route) => !SKIPPED_ROUTES.includes(route)
    );
  const targets = [...routes];
  if (options.docs && !options.routes) {
    docKeysFromFixtures().forEach((key) =>
      targets.push(`${DOCS_ROUTE}?doc=${encodeURIComponent(key)}`)
    );
  }
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined
  });
  const results = [];
  try {
    for (const width of options.widths) {
      for (const scheme of options.schemes) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme: scheme
        });
        const page = await context.newPage();
        for (const route of targets) {
          await page
            .goto(`${base}${route}`, { waitUntil: "networkidle" })
            .catch(() => {});
          if (route.includes("?doc="))
            await page
              .waitForSelector(".doc-body", { timeout: 4000 })
              .catch(() => {});
          await page
            .evaluate(() => window.scrollTo(0, document.body.scrollHeight))
            .catch(() => {});
          await settled(page);
          const findings = await page.evaluate(scanAlignment);
          findings.forEach((finding) =>
            results.push({ route, width, scheme, ...finding })
          );
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    if (served) served.server.close();
  }
  return { results, routes: targets.length };
}

export function parseArgs(argv) {
  const options = {
    dist: path.join(WEB_DIR, "dist"),
    widths: DEFAULT_WIDTHS,
    schemes: DEFAULT_SCHEMES,
    docs: true
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dist") options.dist = path.resolve(argv[++i]);
    else if (arg === "--base") options.base = argv[++i];
    else if (arg === "--widths")
      options.widths = argv[++i].split(",").map(Number);
    else if (arg === "--schemes") options.schemes = argv[++i].split(",");
    else if (arg === "--json") options.json = argv[++i];
    else if (arg === "--routes") options.routes = argv[++i].split(",");
    else if (arg === "--no-docs") options.docs = false;
    else throw new Error(`Unknown argument ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { results, routes } = await runCheck(options);
  if (options.json)
    fs.writeFileSync(options.json, `${JSON.stringify(results, null, 2)}\n`);
  console.log(formatReport(results));
  console.log(
    `${routes} routes, widths ${options.widths.join(", ")}, schemes ${options.schemes.join(", ")}: ${results.length} flagged.`
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

/**
 * Fails when a table, diagram, code block or picture on any route is wider than the box that
 * holds it and the visitor has no cue that there is more. R27-13: the design audit found
 * about 70 problems and nothing automated flagged them. This is the check for the sideways
 * kind, run against the fixture build.
 *
 *   node build/check-overflow.mjs [--dist dist] [--base http://localhost:8796]
 *                                 [--widths 390,1280] [--schemes light,dark] [--json file]
 *                                 [--no-docs] [--routes /,/contact]
 *
 * With no --base it serves --dist itself, with the _redirects rewrites that end in 200. Every
 * .html file under dist is a route, and every document the docs page lists is a route too
 * (/docs?doc=key), because the docs tables only exist once the page script has drawn them.
 *
 * What it flags, for each width and colour scheme:
 *   page      the page itself scrolls sideways
 *   no cue    a scroll box (overflow-x auto or scroll) holds more than it shows and neither
 *             the box nor a near ancestor carries a cue: a scroll cue class, a gradient fade
 *             or a mask on the box, or a fade drawn over it
 *   cut off   a table, diagram, code block or picture reaches past an ancestor that clips
 *             (overflow-x hidden or clip) and does not scroll
 *   wide      a table, diagram, code block or picture reaches past the page edge with no
 *             scroll box around it
 * It exits 1 when anything is flagged and prints each route, width, scheme and element.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
export const DEFAULT_WIDTHS = [390, 1280];
export const DEFAULT_SCHEMES = ["light", "dark"];
const DOCS_ROUTE = "/docs";

/** Every page under dist as a route: index.html is the folder, x.html is /x. */
export function routesFromDist(distDir) {
  const routes = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (
          prefix === "" &&
          ["assets", "data", "sr", "recorded"].includes(entry.name)
        )
          continue;
        walk(path.join(dir, entry.name), `${prefix}/${entry.name}`);
      } else if (entry.name.endsWith(".html")) {
        const name = entry.name.slice(0, -".html".length);
        routes.push(name === "index" ? prefix || "/" : `${prefix}/${name}`);
      }
    }
  };
  walk(distDir, "");
  return routes.sort();
}

/** The doc keys the fixture build lists, read from the saved reads, or an empty list. */
export function docKeysFromFixtures(
  fixturesDir = path.join(WEB_DIR, "fixtures")
) {
  try {
    const reads = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, "reads.json"), "utf8")
    );
    const docs = reads["SourceController.getDocs"];
    return Array.isArray(docs)
      ? docs.filter((doc) => doc && doc.key).map((doc) => doc.key)
      : [];
  } catch (error) {
    return [];
  }
}

/** The rewrites in a _redirects file that answer 200, as [from, to] pairs with * as a splat. */
export function rewritesFrom(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(
      (parts) =>
        parts.length >= 3 && !parts[0].startsWith("#") && parts[2] === "200"
    )
    .map(([from, to]) => [from, to]);
}

/** Applies the first rewrite that matches, or returns the path unchanged. */
export function rewritePath(pathname, rewrites) {
  for (const [from, to] of rewrites) {
    if (from.endsWith("/*")) {
      const base = from.slice(0, -1);
      if (pathname.startsWith(base))
        return to.replace(":splat", pathname.slice(base.length));
    } else if (from === pathname) {
      return to;
    }
  }
  return pathname;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".yaml": "text/yaml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml"
};

/** A static server for dist. It starts on a free port and resolves with the address. */
export function serveDist(distDir) {
  const redirects = path.join(distDir, "_redirects");
  const rewrites = fs.existsSync(redirects)
    ? rewritesFrom(fs.readFileSync(redirects, "utf8"))
    : [];
  const server = http.createServer((request, response) => {
    const pathname = rewritePath(
      decodeURIComponent(new URL(request.url, "http://x").pathname),
      rewrites
    );
    const root = path.resolve(distDir);
    const candidates = [
      pathname,
      `${pathname}.html`,
      path.join(pathname, "index.html")
    ];
    for (const candidate of candidates) {
      const file = path.resolve(root, `.${candidate}`);
      if (
        file.startsWith(root) &&
        fs.existsSync(file) &&
        fs.statSync(file).isFile()
      ) {
        response.writeHead(200, {
          "content-type":
            TYPES[path.extname(file)] || "application/octet-stream"
        });
        fs.createReadStream(file).pipe(response);
        return;
      }
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` })
    );
  });
}

/**
 * Runs in the page. It walks the document and every open shadow root, and returns the
 * findings. It has no imports because Playwright serialises the function.
 */
export function scanPage() {
  const findings = [];
  const CANDIDATE_TAGS = [
    "TABLE",
    "PRE",
    "SVG",
    "CANVAS",
    "IMG",
    "VIDEO",
    "IFRAME"
  ];
  const CANDIDATE_CLASS =
    /(^|[\s_-])(code|table|diagram|matrix|graph|schema|mermaid|pre)([\s_-]|$)/i;
  const CUE_CLASS = /scroll-cue|scroll-hint|scrollable|has-more|fade/i;

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
  const hasCue = (box) => {
    const style = getComputedStyle(box);
    if (style.maskImage && style.maskImage !== "none") return true;
    if (style.webkitMaskImage && style.webkitMaskImage !== "none") return true;
    if (
      style.backgroundImage.includes("gradient") &&
      style.backgroundAttachment.includes("local")
    )
      return true;
    let node = box;
    for (let depth = 0; node && depth < 4; depth++, node = parentOf(node)) {
      if (CUE_CLASS.test(className(node))) return true;
      const after = getComputedStyle(node, "::after");
      if (
        after.content !== "none" &&
        after.backgroundImage.includes("gradient")
      )
        return true;
      const near = node.querySelectorAll
        ? node.querySelectorAll('[class*="scroll-cue"], [class*="scroll-hint"]')
        : [];
      for (const cue of near) if (visible(cue)) return true;
    }
    return false;
  };
  const clipper = (el) => {
    for (let node = parentOf(el); node; node = parentOf(node)) {
      if (node === document.documentElement || node === document.body)
        return null;
      const x = getComputedStyle(node).overflowX;
      if (x !== "visible") return node;
    }
    return null;
  };
  const isCandidate = (el) => {
    const tag = el.tagName ? el.tagName.toUpperCase() : "";
    return CANDIDATE_TAGS.includes(tag) || CANDIDATE_CLASS.test(className(el));
  };
  const add = (kind, el, detail) =>
    findings.push({ kind, element: describe(el), detail });

  const viewport = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > viewport + 1) {
    findings.push({
      kind: "page",
      element: "html",
      detail: `scrolls sideways, ${document.documentElement.scrollWidth}px of content in a ${viewport}px window`
    });
  }

  for (const el of all) {
    const style = getComputedStyle(el);
    if (
      ["auto", "scroll"].includes(style.overflowX) &&
      el.scrollWidth > el.clientWidth + 1 &&
      visible(el)
    ) {
      if (!hasCue(el)) {
        add(
          "no cue",
          el,
          `${el.scrollWidth}px of content in a ${el.clientWidth}px box`
        );
      }
      continue;
    }
    if (!isCandidate(el) || !visible(el)) continue;
    const rect = el.getBoundingClientRect();
    const box = clipper(el);
    if (box) {
      const boxStyle = getComputedStyle(box);
      if (["auto", "scroll"].includes(boxStyle.overflowX)) continue;
      const edge = box.getBoundingClientRect();
      if (rect.right > edge.right + 1 || rect.left < edge.left - 1) {
        add(
          "cut off",
          el,
          `${Math.round(rect.width)}px wide in a ${Math.round(edge.width)}px box that clips`
        );
      }
    } else if (rect.right > viewport + 1 || rect.left < -1) {
      add(
        "wide",
        el,
        `${Math.round(rect.width)}px wide, right edge at ${Math.round(rect.right)}px in a ${viewport}px window`
      );
    }
  }
  return findings;
}

/** The text report: one line per finding, grouped by route. */
export function formatReport(results) {
  if (!results.length) return "No overflow found.";
  return results
    .map(
      (r) =>
        `${r.route}  ${r.width}px ${r.scheme}  ${r.kind}  ${r.element}  ${r.detail}`
    )
    .join("\n");
}

function parseArgs(argv) {
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

/**
 * Playwright from the project, or from the folder PLAYWRIGHT_MODULE names, such as a global
 * install's playwright folder, when the project has none.
 */
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

/** Scans every route at every width and scheme. */
export async function runCheck(options) {
  const { chromium } = await loadPlaywright();
  let served;
  const base = options.base || (served = await serveDist(options.dist)).base;
  const routes = options.routes || routesFromDist(options.dist);
  const targets = [...routes];
  if (options.docs && !options.routes) {
    docKeysFromFixtures().forEach((key) =>
      targets.push(`${DOCS_ROUTE}?doc=${encodeURIComponent(key)}`)
    );
  }
  // CHROME_PATH points at an installed Chrome, as on a CI runner, so no Playwright browser
  // download is needed. Without it Playwright uses its own browser.
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
          await page.waitForTimeout(400);
          const findings = await page.evaluate(scanPage);
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

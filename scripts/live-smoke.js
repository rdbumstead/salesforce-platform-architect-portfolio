#!/usr/bin/env node
/* eslint-disable no-console */

// Read only smoke test of the public site. For every route, in each browser engine and at
// one desktop and one phone size, it checks that the page answers 200, that the theme
// layout and each key component of that route render, and that the page logs no console
// error and throws no script error outside the short KNOWN_ERRORS list below.
//
// It loads pages and nothing more. No form is submitted and nothing is clicked. Requests to
// Google Analytics are blocked, so a smoke run never counts as a visitor.
//
// Environment:
//   SITE_BASE   the site root, for example https://example.my.site.com/portfolio (required)
//   BROWSERS    comma list of Playwright engines, default "chromium,webkit"
//   SMOKE_JSON  optional file path that also receives the JSON body
//
// Output: one summary line, then the JSON body on the next line. Exit 0 when every row
// passes, 1 when any row fails or the run cannot start.
//
// A row that fails is loaded once more in a fresh context before it counts as failed,
// because a WebKit page load now and then logs one transient error that a second load does
// not repeat. A real defect fails both loads.
//
// Run: node scripts/live-smoke.js (Playwright must resolve, through NODE_PATH or a local
// install, with its browsers installed).

const fs = require("fs");

const BASE = (process.env.SITE_BASE || "").replace(/\/+$/, "");
const BROWSERS = (process.env.BROWSERS || "chromium,webkit")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const SMOKE_JSON = process.env.SMOKE_JSON || "";

// What each page must show. A component named as a string counts once its first instance
// is visible. A component that renders nothing until it has records (the testimonial wall
// before any testimonial is approved, an asset gallery with no assets) is named with
// mayBeEmpty, and counts once it is on the page.
const ROUTES = [
  { path: "/", components: ["c-hero-banner", "c-experience-timeline"] },
  { path: "/resume", components: ["c-resume-builder"] },
  { path: "/skills", components: ["c-skill-network"] },
  { path: "/api-lab", components: ["c-api-tester"] },
  { path: "/api-lab/reference", components: ["c-api-reference"] },
  { path: "/ai-lab", components: ["c-cover-letter-generator"] },
  {
    path: "/delivery",
    components: ["c-roadmap-viewer", "c-changelog", "c-smart-checklist"]
  },
  {
    path: "/testimonials",
    components: [
      "c-testimonial-submit",
      { tag: "c-testimonial-wall", mayBeEmpty: true }
    ]
  },
  {
    path: "/business-architecture",
    components: ["c-project-asset-gallery", "c-schema-visualizer"]
  },
  {
    path: "/nonprofit-solutions",
    components: [
      "c-pillar-b-story",
      "c-decision-matrix",
      { tag: "c-project-asset-gallery", mayBeEmpty: true }
    ]
  }
];

const LAYOUT = "c-portfolio-theme-layout";

const VIEWPORTS = [
  { name: "desktop", width: 1400, height: 900 },
  { name: "phone", width: 390, height: 844 }
];

// Console errors the site is known to log and that do not affect a visitor. Each entry
// names the routes it applies to and why it is accepted.
const KNOWN_ERRORS = [
  {
    routes: ["/api-lab/reference"],
    pattern: /cdn\.redoc\.ly\/redoc\/logo-mini\.svg/,
    reason:
      "The vendored Redoc bundle asks for its own logo, which the site's image policy blocks. The reference renders without it."
  },
  {
    routes: ["/api-lab/reference"],
    pattern: /^Failed to load resource: net::ERR_FAILED$/,
    locationPattern: /\/_\/commcsp\b/,
    reason:
      "Chromium's follow up line when the report of that blocked logo to the site's policy endpoint does not go through."
  }
];

const BLOCKED_HOSTS =
  /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com)$/;

const NAVIGATION_TIMEOUT_MS = 60000;
const LAYOUT_TIMEOUT_MS = 30000;
const COMPONENT_TIMEOUT_MS = 20000;
const EMPTY_GRACE_MS = 5000;
const SETTLE_MS = 2500;
const PARALLEL_PAGES = 4;

function isBlocked(url) {
  try {
    return BLOCKED_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isKnown(routePath, text, locationUrl) {
  return KNOWN_ERRORS.some(
    (known) =>
      known.routes.includes(routePath) &&
      known.pattern.test(text) &&
      (!known.locationPattern || known.locationPattern.test(locationUrl || ""))
  );
}

// "visible" and "empty" pass. "empty" is only given to a component allowed to be empty that
// is on the page with nothing to show. "hidden" and "missing" fail.
async function componentState(page, tag, mayBeEmpty) {
  const first = page.locator(tag).first();
  if (!mayBeEmpty) {
    return first
      .waitFor({ state: "visible", timeout: COMPONENT_TIMEOUT_MS })
      .then(() => "visible")
      .catch(async () =>
        (await page.locator(tag).count()) > 0 ? "hidden" : "missing"
      );
  }
  const attached = await first
    .waitFor({ state: "attached", timeout: COMPONENT_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!attached) {
    return "missing";
  }
  return first
    .waitFor({ state: "visible", timeout: EMPTY_GRACE_MS })
    .then(() => "visible")
    .catch(() => "empty");
}

async function checkOnce(browser, route, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }
  });
  const page = await context.newPage();
  const errors = [];
  const knownSeen = [];

  await page.route("**/*", (request) =>
    isBlocked(request.request().url()) ? request.abort() : request.continue()
  );
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    const text = message.text();
    const locationUrl = (message.location() || {}).url || "";
    // A request this script blocked on purpose is not a site error.
    if (isBlocked(locationUrl)) {
      return;
    }
    if (isKnown(route.path, text, locationUrl)) {
      knownSeen.push(text.slice(0, 120));
    } else {
      errors.push(text.slice(0, 200));
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`script error: ${String(error.message).slice(0, 200)}`);
  });

  const result = { status: null, layout: false, components: {}, errors };
  try {
    const response = await page.goto(BASE + route.path, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS
    });
    result.status = response ? response.status() : null;
    result.layout = await page
      .locator(LAYOUT)
      .first()
      .waitFor({ state: "attached", timeout: LAYOUT_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    for (const entry of route.components) {
      const { tag, mayBeEmpty } =
        typeof entry === "string" ? { tag: entry, mayBeEmpty: false } : entry;
      result.components[tag] = await componentState(page, tag, mayBeEmpty);
    }
    await page.waitForTimeout(SETTLE_MS);
  } catch (error) {
    result.error = String(error.message).split("\n")[0];
  } finally {
    await context.close();
  }
  if (knownSeen.length) {
    result.knownErrors = knownSeen.length;
  }
  result.pass =
    !result.error &&
    result.status === 200 &&
    result.layout &&
    Object.values(result.components).every(
      (state) => state === "visible" || state === "empty"
    ) &&
    errors.length === 0;
  return result;
}

async function checkRow(browser, engine, route, viewport) {
  let attempt = await checkOnce(browser, route, viewport);
  let attempts = 1;
  if (!attempt.pass) {
    attempt = await checkOnce(browser, route, viewport);
    attempts = 2;
  }
  return {
    browser: engine,
    route: route.path,
    viewport: viewport.name,
    attempts,
    ...attempt
  };
}

async function runPool(tasks, size) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

function finish(body, exitCode) {
  const json = JSON.stringify(body);
  console.log(body.summary);
  console.log(json);
  if (SMOKE_JSON) {
    fs.writeFileSync(SMOKE_JSON, json + "\n");
  }
  process.exitCode = exitCode;
}

async function main() {
  if (!BASE) {
    finish({ ok: false, summary: "live smoke: FAIL, SITE_BASE is not set" }, 1);
    return;
  }
  let playwright;
  try {
    playwright = require("playwright");
  } catch {
    finish(
      { ok: false, summary: "live smoke: FAIL, Playwright is not installed" },
      1
    );
    return;
  }

  const rows = [];
  for (const engine of BROWSERS) {
    if (!playwright[engine]) {
      rows.push({ browser: engine, pass: false, error: "unknown engine" });
      continue;
    }
    let browser;
    try {
      browser = await playwright[engine].launch({ headless: true });
    } catch (error) {
      rows.push({
        browser: engine,
        pass: false,
        error: `launch failed: ${String(error.message).split("\n")[0]}`
      });
      continue;
    }
    try {
      const tasks = [];
      for (const route of ROUTES) {
        for (const viewport of VIEWPORTS) {
          tasks.push(() => checkRow(browser, engine, route, viewport));
        }
      }
      rows.push(...(await runPool(tasks, PARALLEL_PAGES)));
    } finally {
      await browser.close();
    }
  }

  const failed = rows.filter((row) => !row.pass);
  const ok = rows.length > 0 && failed.length === 0;
  const summary =
    `live smoke: ${ok ? "PASS" : "FAIL"}, ${rows.length - failed.length} of ` +
    `${rows.length} rows pass (${BROWSERS.join(", ")}, ${ROUTES.length} routes, ` +
    `${VIEWPORTS.length} sizes)` +
    (failed.length
      ? `, failing: ${failed
          .map((row) =>
            `${row.browser} ${row.route || ""} ${row.viewport || ""}`.trim()
          )
          .join("; ")}`
      : "");
  finish(
    {
      ok,
      summary,
      base: BASE,
      checkedAt: new Date().toISOString(),
      failed: failed.length,
      rows
    },
    ok ? 0 : 1
  );
}

main().catch((error) => {
  finish(
    {
      ok: false,
      summary: `live smoke: FAIL, ${String(error.message).split("\n")[0]}`
    },
    1
  );
});

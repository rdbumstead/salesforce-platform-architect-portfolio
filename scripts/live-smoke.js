#!/usr/bin/env node
/* eslint-disable no-console */

// Read only smoke test of the public site. For every route, in each browser engine and at
// one desktop and one phone size, it checks that the page answers 200, that the theme
// layout and each key component of that route render, and that the page logs no console
// error and throws no script error outside the short KNOWN_ERRORS list below.
//
// It loads pages and, apart from the tour walk below, nothing more. No form is submitted.
// Requests to Google Analytics and Cloudflare Web Analytics are blocked, so a smoke run never counts as a visitor.
//
// The tour walk, once per engine and size: on a normal visit to the home page the tour bar
// shows nothing (the tour is opt in). Then it presses the hero's tour link, which goes to the
// first stop, and at each stop checks the bar's progress row and task line and presses the
// task line (Show me), then Next. On the last stop it presses Finish, checks "That's the tour"
// with no links in the ending, presses Close and checks the bar has gone. It clicks only the
// tour's own links and buttons. TOUR below must follow LIVE_PILLARS in c/pillarData, which
// scripts/check-smoke-routes.js checks.
//
// The footer check, once per engine and size: on the home page every footer group has a chip
// in one row, no group starts open on the phone size and only CI starts open on the desktop
// size, and pressing each chip opens its group in the panel and pressing it again closes it.
// It runs only when SMOKE_FOOTER_CHECK is "1". It is off by default because the deploy workflow runs this
// script against the live site right after the Salesforce deploy, while that site still serves
// the old footer, and the site build waits on that run. Turn it on once the new footer is live
// on the apex. With the variable unset no footer rows exist and the row count is unchanged.
//
// The accessibility check, per engine, for seven routes (AXE_ROUTES below, the six the
// Lighthouse audit covers and /docs, whose Decisions group it opens first), at both sizes and in both colour schemes. After the route's
// components are visible it injects axe-core and fails the row on any violation of the WCAG 2.0
// to 2.2 A and AA rules, naming the rule id and the first elements. Dark is checked because the
// site themes by colour scheme and a contrast failure shows up in one scheme only. It checks the
// page as loaded. The open tour and an open menu are not checked, because each is a state of one
// component that its own Jest tests cover, and the tour walk above already drives the tour. It
// runs unless SMOKE_AXE_CHECK is "0". Best practice rules are not part of it, because they
// are advice and not failures a visitor meets. The one experimental rule it adds, by id, is
// label-content-name-mismatch (AXE_EXTRA_RULES), which fails like the others.
//
// Environment:
//   SITE_BASE   the site root, for example https://example.my.site.com/portfolio (required)
//   BROWSERS    comma list of Playwright engines, default "chromium,webkit"
//   SMOKE_FOOTER_CHECK  "1" adds the footer check rows, off by default
//   SMOKE_AXE_CHECK  "0" leaves the accessibility rows out, they run by default
//   SMOKE_ALLOW_LOCAL_HTTP  "1" strips the CSP directive upgrade-insecure-requests from document
//               responses, only when SITE_BASE is a local http:// address (localhost, 127.0.0.1
//               or [::1]). WebKit applies that directive to http://localhost, so without this a
//               local run cannot load its own pages in WebKit. Off by default, and never applied
//               to an https:// base or to a remote host.
//   SMOKE_JSON  optional file path that also receives the JSON body
//   CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET  optional Cloudflare Access service token for a
//               preview behind Access, sent only to the base's own pages.dev host
//
// Output: one summary line, then the JSON body on the next line. Exit 0 when every row
// passes, 1 when any row fails or the run cannot start.
//
// A row that fails on a component or a console error is loaded once more in a fresh context
// before it counts as failed, because a WebKit page load now and then logs one transient error
// that a second load does not repeat. A real defect fails both loads.
//
// That second load must not hide a flake, so a row that failed its first load and passed its
// second is reported as a first load warning. Each warning names the route, engine, size (and
// colour scheme for an accessibility row) and the first load's failure text. The JSON body
// carries them in "warnings", each also goes to stderr, and the summary line ends with their
// count ("first load warnings: N", also when it is 0). A warning never fails the run. A row that
// fails both loads is a failure, and carries its first load's text in "firstLoadFailure".
//
// It fails fast on a page that is not there. A row whose page does not answer 200, or whose
// page has no site layout, fails at once, with no component waits and no second load. Before
// any row, the home page is loaded once, and when it does not answer 200 with the site layout
// the whole run fails at once, naming the base it tried. SITE_BASE is the site's path prefix
// (for example https://example.my.site.com/portfolio), not the .../portfoliovforcesite address
// a publish result names, which only redirects there.
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
const FOOTER_CHECK = process.env.SMOKE_FOOTER_CHECK === "1";
const AXE_CHECK = process.env.SMOKE_AXE_CHECK !== "0";
const ALLOW_LOCAL_HTTP = process.env.SMOKE_ALLOW_LOCAL_HTTP === "1";

// What each page must show. A component named as a string counts once its first instance
// is visible. A component that renders nothing until it has records (the testimonial wall
// before any testimonial is approved, an asset gallery with no assets) is named with
// mayBeEmpty, and counts once it is on the page. A route can also name parts: an element inside
// a component (the selector starts with the component's tag and pierces its shadow tree) that
// must be on the page, and when an attribute is named, carry that value.
const ROUTES = [
  {
    path: "/",
    components: [
      "c-hero-banner",
      "c-career-line",
      { tag: "c-case-study-grid", mayBeEmpty: true },
      { tag: "c-home-testimonials", mayBeEmpty: true },
      "c-contact-call"
    ]
  },
  { path: "/contact", components: ["c-contact-form"] },
  {
    path: "/docs",
    components: ["c-site-build-section", "c-docs-viewer"],
    // The Decisions group is closed on load and draws its links only once open, so the axe row
    // presses its summary first. Without that its links would never be checked.
    axeOpen: "c-docs-viewer details.doc-group-details > summary"
  },
  { path: "/resume", components: ["c-resume-builder"] },
  { path: "/skills", components: ["c-skill-network"] },
  {
    path: "/api-lab",
    components: ["c-api-tester"],
    parts: [
      {
        selector: "c-api-tester a.collection-download",
        attribute: "download",
        value: "ryan-bumstead-portfolio-api.postman_collection.json"
      }
    ]
  },
  {
    path: "/api-lab/reference",
    components: ["c-api-reference"],
    parts: [{ selector: "c-api-reference a.collection-download" }]
  },
  { path: "/ai-lab", components: ["c-cover-letter-generator"] },
  {
    path: "/delivery",
    components: [
      "c-roadmap-viewer",
      "c-changelog",
      "c-smart-checklist",
      "c-by-the-numbers"
    ]
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
    components: [
      "c-project-asset-gallery",
      "c-schema-visualizer",
      "c-pillar-a-walkthrough"
    ]
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

// When a switch reads recorded (every preview), the static site renders the real form paused,
// with every control disabled and a note inside it, so the smoke expects that note in the form.
// The Salesforce site has no /api/features, so there the list is used exactly as written.
const FORM_SWAPS = {
  "/contact": { feature: "contact", form: "c-contact-form" },
  "/testimonials": { feature: "testimonial", form: "c-testimonial-submit" }
};

/**
 * The switches from a /api/features answer, or null when the answer is not the static site's
 * (a missing page, an HTML page, JSON without the switches).
 * @param {number} status the HTTP status
 * @param {string} text the response body
 * @returns {object|null} the switches
 */
function parseFeatures(status, text) {
  if (status !== 200) {
    return null;
  }
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && typeof body.contact === "string"
      ? body
      : null;
  } catch {
    return null;
  }
}

/**
 * The route list for the switches read. With none, or a switch that reads live, a route is
 * unchanged. A recorded switch swaps the form the route expects for the paused note inside it.
 * @param {object[]} routes the route list
 * @param {object|null} features the switches, or null
 * @returns {object[]} the list to check
 */
function routesFor(routes, features) {
  if (!features) {
    return routes;
  }
  return routes.map((route) => {
    const swap = FORM_SWAPS[route.path];
    if (!swap || features[swap.feature] === "live") {
      return route;
    }
    return {
      ...route,
      components: route.components.map((entry) =>
        entry === swap.form ? `${swap.form} [data-id="paused-note"]` : entry
      )
    };
  });
}

/** Reads /api/features once. Null when the site has none. */
async function readFeatures() {
  const url = `${BASE}/api/features`;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...(accessHeadersFor(url) || {}) }
    });
    return parseFeatures(response.status, await response.text());
  } catch {
    return null;
  }
}

const LAYOUT = "c-portfolio-theme-layout";

// The routes the accessibility check covers, the same six as config/lighthouserc.cjs.
const AXE_ROUTES = [
  "/",
  "/resume",
  "/skills",
  "/docs",
  "/api-lab",
  "/business-architecture",
  "/nonprofit-solutions"
];
const AXE_SCHEMES = ["light", "dark"];
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
// Rules axe marks experimental, so its tag filter leaves them out. Each is switched on by id.
// label-content-name-mismatch is the voice control rule: a control's accessible name must
// start with its visible text.
const AXE_EXTRA_RULES = ["label-content-name-mismatch"];
const AXE_SHOWN = 5;

// The tour's stops in order, each a page above, starting from the hero on the home page.
const TOUR = {
  start: "/",
  stops: [
    { letter: "A", path: "/business-architecture" },
    { letter: "B", path: "/nonprofit-solutions" },
    { letter: "C", path: "/api-lab" },
    { letter: "D", path: "/ai-lab" },
    { letter: "E", path: "/delivery" }
  ]
};

const TOUR_STEP_TIMEOUT_MS = 30000;
const TOUR_SETTLE_MS = 10000;

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
  /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|cloudflareinsights\.com)$/;

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

/**
 * The Cloudflare Access service token headers for a protected Pages preview, or null. They go
 * only to the preview's own host (the base's host, under pages.dev) and never to a third
 * party, so the token cannot leak to an analytics or widget host.
 * @param {string} url the request address
 * @returns {object|null} the headers to add
 */
function accessHeadersFor(url) {
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (!id || !secret || !BASE) {
    return null;
  }
  try {
    const host = new URL(url).hostname;
    const base = new URL(BASE).hostname;
    return host === base && host.endsWith(".pages.dev")
      ? { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret }
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether a document response should lose the CSP directive upgrade-insecure-requests. Only
 * when the option is on, the base is a local http:// address and the request goes to that same
 * host, so an https:// base or a remote host is never touched.
 * @param {string} url the request address
 * @param {string} base the site root
 * @param {boolean} allow whether the option is on
 * @returns {boolean} true when the directive should be stripped
 */
function shouldStripUpgrade(url, base, allow) {
  if (!allow || !base) {
    return false;
  }
  try {
    const target = new URL(url);
    const root = new URL(base);
    return (
      root.protocol === "http:" &&
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(root.hostname) &&
      target.protocol === "http:" &&
      target.host === root.host
    );
  } catch {
    return false;
  }
}

/**
 * The response headers without upgrade-insecure-requests in any content security policy.
 * @param {object} headers the response headers, names in lower case
 * @returns {object} the headers to send
 */
function stripUpgradeHeaders(headers) {
  const out = { ...headers };
  for (const name of [
    "content-security-policy",
    "content-security-policy-report-only"
  ]) {
    if (typeof out[name] === "string") {
      out[name] = out[name]
        .split(";")
        .map((part) => part.trim())
        .filter(
          (part) => part && part.toLowerCase() !== "upgrade-insecure-requests"
        )
        .join("; ");
    }
  }
  return out;
}

/**
 * Blocks the analytics hosts and adds the Access headers where they belong, for every page
 * the context opens.
 * @param {object} context a Playwright browser context
 */
async function prepare(context) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (isBlocked(request.url())) {
      return route.abort();
    }
    if (
      request.resourceType() === "document" &&
      shouldStripUpgrade(request.url(), BASE, ALLOW_LOCAL_HTTP)
    ) {
      const response = await route.fetch({
        headers: {
          ...request.headers(),
          ...(accessHeadersFor(request.url()) || {})
        }
      });
      return route.fulfill({
        response,
        headers: stripUpgradeHeaders(response.headers())
      });
    }
    const extra = accessHeadersFor(request.url());
    return extra
      ? route.continue({ headers: { ...request.headers(), ...extra } })
      : route.continue();
  });
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

// "visible" when the part is on the page with the attribute value named, "missing" otherwise.
async function partState(page, part) {
  const first = page.locator(part.selector).first();
  const attached = await first
    .waitFor({ state: "attached", timeout: COMPONENT_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  if (!attached) {
    return "missing";
  }
  if (!part.attribute) {
    return "visible";
  }
  return (await first.getAttribute(part.attribute)) === part.value
    ? "visible"
    : "missing";
}

async function checkOnce(browser, route, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }
  });
  const page = await context.newPage();
  const errors = [];
  const knownSeen = [];

  await prepare(context);
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
    if (result.status !== 200) {
      // The page is not there: no component wait can pass, so the row fails now.
      result.missingPage = true;
      return finishCheck(result, knownSeen);
    }
    result.layout = await hasLayout(page);
    if (!result.layout) {
      result.missingPage = true;
      return finishCheck(result, knownSeen);
    }
    for (const entry of route.components) {
      const { tag, mayBeEmpty } =
        typeof entry === "string" ? { tag: entry, mayBeEmpty: false } : entry;
      result.components[tag] = await componentState(page, tag, mayBeEmpty);
    }
    for (const part of route.parts || []) {
      result.components[part.selector] = await partState(page, part);
    }
    await page.waitForTimeout(SETTLE_MS);
  } catch (error) {
    result.error = String(error.message).split("\n")[0];
  } finally {
    await context.close();
  }
  return finishCheck(result, knownSeen);
}

function hasLayout(page) {
  return page
    .locator(LAYOUT)
    .first()
    .waitFor({ state: "attached", timeout: LAYOUT_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
}

function finishCheck(result, knownSeen) {
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
    result.errors.length === 0;
  return result;
}

/**
 * Whether an address is the base or a page under it.
 * @param {string} url the address a page landed on
 * @param {string} base the site's path prefix
 * @returns {boolean} true when the address is under the base
 */
function isUnderBase(url, base) {
  const landed = String(url || "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
  return landed === base || landed.startsWith(base + "/");
}

// Loads the home page once. Returns null when it answers 200 with the site layout at an
// address under the base, or the reason it did not. A base that only redirects to the site
// (the .../portfoliovforcesite address) lands somewhere else, so every other route would 404.
async function homeProblem(browser) {
  const context = await browser.newContext();
  try {
    await prepare(context);
    const page = await context.newPage();
    const response = await page.goto(BASE + "/", {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS
    });
    const status = response ? response.status() : null;
    if (status !== 200) {
      return `it answered ${status === null ? "nothing" : status}`;
    }
    if (!isUnderBase(page.url(), BASE)) {
      return `it redirected to ${page.url()}`;
    }
    return (await hasLayout(page)) ? null : "it has no site layout";
  } catch (error) {
    return `it did not load (${String(error.message).split("\n")[0]})`;
  } finally {
    await context.close();
  }
}

/**
 * Says in one line why a load failed: its error, status, components that did not show, console
 * errors and axe violations. This is the text a first load warning carries.
 * @param {object} attempt one load's result
 * @returns {string} the failure text, never empty
 */
function describeFailure(attempt) {
  const parts = [];
  if (attempt.error) {
    parts.push(attempt.error);
  }
  if (attempt.status === null) {
    parts.push("no response");
  } else if (attempt.status !== undefined && attempt.status !== 200) {
    parts.push(`status ${attempt.status}`);
  }
  if (attempt.layout === false) {
    parts.push("no site layout");
  }
  for (const [tag, state] of Object.entries(attempt.components || {})) {
    if (state !== "visible" && state !== "empty") {
      parts.push(`${tag} ${state}`);
    }
  }
  for (const message of attempt.errors || []) {
    parts.push(`console: ${message}`);
  }
  for (const violation of attempt.violations || []) {
    parts.push(`axe ${violation.rule} on ${violation.count}`);
  }
  return parts.join(", ") || "failed with no reason recorded";
}

/**
 * Runs a load, and when it fails in a way worth a second look, runs it once more. A flake that
 * the second load clears is not lost: the first load's failure text comes back with the result.
 * @param {Function} once runs one load and resolves its result, which carries a boolean pass
 * @param {Function} retryable says whether a failed result deserves a second load
 * @returns {Promise<object>} the last result, the loads run and the first failure text, if any
 */
async function loadWithRetry(once, retryable) {
  let attempt = await once();
  let attempts = 1;
  let firstLoadFailure;
  if (!attempt.pass && retryable(attempt)) {
    firstLoadFailure = describeFailure(attempt);
    attempt = await once();
    attempts = 2;
  }
  return { attempt, attempts, firstLoadFailure };
}

/**
 * The rows that failed their first load and passed their second. They stay passing rows, and
 * each is also named here so a flake shows in the report and the daily run.
 * @param {object[]} rows the run's rows
 * @returns {object[]} one warning per recovered row
 */
function warningsFrom(rows) {
  return (rows || [])
    .filter((row) => row.pass && row.firstLoadFailure)
    .map((row) => ({
      warning: "first load failed",
      browser: row.browser,
      route: row.route,
      viewport: row.viewport,
      ...(row.scheme ? { scheme: row.scheme } : {}),
      firstLoad: row.firstLoadFailure
    }));
}

/**
 * The summary line's ending for the warnings, always present so a clean run shows its zero.
 * @param {object[]} warnings the run's warnings
 * @returns {string} the text to append to the summary line
 */
function warningCountText(warnings) {
  return `, first load warnings: ${warnings.length}`;
}

async function checkRow(browser, engine, route, viewport) {
  // A missing page fails at once. Only a component or console failure is loaded again.
  const { attempt, attempts, firstLoadFailure } = await loadWithRetry(
    () => checkOnce(browser, route, viewport),
    (failed) => !failed.missingPage
  );
  return {
    browser: engine,
    route: route.path,
    viewport: viewport.name,
    attempts,
    ...(firstLoadFailure ? { firstLoadFailure } : {}),
    ...attempt
  };
}

/**
 * The footer's chips on the home page. Each group has a chip (a button with aria-expanded) in
 * one row, and the open group's readings show in one panel under it. The chips must be there,
 * start in the default state for the size (none open on a phone, only CI open on a desktop),
 * open their group in the panel when pressed and close it when pressed again.
 * @param {object} browser the Playwright browser
 * @param {object} viewport one of VIEWPORTS
 * @returns {Promise<object>} the row without its browser name
 */
async function footerOnce(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }
  });
  const result = { route: "footer", pass: false, groups: {} };
  try {
    await prepare(context);
    const page = await context.newPage();
    await page.goto(BASE + "/", {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS
    });
    const chips = page.locator("c-footer .chips button.chip");
    await chips
      .first()
      .waitFor({ state: "attached", timeout: COMPONENT_TIMEOUT_MS });
    // The late groups come with the snapshot, so give it a moment, then check what is there.
    await page.waitForTimeout(SETTLE_MS);
    const count = await chips.count();
    const problems = [];
    // The footer text shares the brand's left edge and its top rule runs the full width, on both
    // hosts and at every width.
    const brandBox = await page.locator(".site-brand").first().boundingBox();
    const copyBox = await page
      .locator("c-footer .copyright")
      .first()
      .boundingBox();
    const ruleBox = await page
      .locator("c-footer .footer")
      .first()
      .boundingBox();
    if (brandBox && copyBox && Math.abs(brandBox.x - copyBox.x) > 1) {
      problems.push(
        `footer text starts at ${Math.round(copyBox.x)}, the brand at ${Math.round(brandBox.x)}`
      );
    }
    if (
      ruleBox &&
      (ruleBox.x > 1 || Math.abs(ruleBox.width - viewport.width) > 1)
    ) {
      problems.push(
        `footer rule is not full width: ${Math.round(ruleBox.x)} and ${Math.round(ruleBox.width)}`
      );
    }
    const keyOf = (chip) => chip.evaluate((el) => el.dataset.key);
    const isOpen = (chip) =>
      chip.evaluate((el) => el.getAttribute("aria-expanded") === "true");
    const regionCount = (key) =>
      page.locator(`c-footer [data-id="panel"] [data-group="${key}"]`).count();
    const starts = [];
    for (let i = 0; i < count; i++) {
      starts.push(await isOpen(chips.nth(i)));
    }
    for (let i = 0; i < count; i++) {
      const chip = chips.nth(i);
      const group = await keyOf(chip);
      const start = starts[i];
      const expectedOpen = viewport.name !== "phone" && group === "ci";
      await chip.scrollIntoViewIfNeeded();
      // Settle the group to closed first, so the press below opens it.
      if (await isOpen(chip)) {
        await chip.click();
      }
      await chip.click();
      const afterOpen =
        (await isOpen(chip)) && (await regionCount(group)) === 1;
      await chip.click();
      const afterClose =
        !(await isOpen(chip)) && (await regionCount(group)) === 0;
      result.groups[group] = { start, toggled: afterOpen && afterClose };
      if (start !== expectedOpen) {
        problems.push(`${group} starts ${start ? "open" : "closed"}`);
      }
      if (!result.groups[group].toggled) {
        problems.push(`${group} does not open its panel and close it`);
      }
    }
    if (count === 0) {
      problems.push("no footer chip");
    } else if (!result.groups.ci) {
      problems.push("no CI chip");
    }
    if (problems.length) {
      result.problems = problems;
    }
    result.pass = problems.length === 0;
  } catch (error) {
    result.error = String(error.message).split("\n")[0];
  } finally {
    await context.close();
  }
  return result;
}

async function footerRow(browser, engine, viewport) {
  let attempt = await footerOnce(browser, viewport);
  if (!attempt.pass) {
    attempt = await footerOnce(browser, viewport);
  }
  return { browser: engine, viewport: viewport.name, ...attempt };
}

/**
 * The tour bar's own element, inside the layout's shadow tree. Playwright's CSS locators
 * pierce open shadow roots.
 * @param {object} page the Playwright page
 * @param {string} id the data-id of the part
 * @returns {object} a locator
 */
function tourPart(page, id) {
  return page.locator(`c-tour-bar [data-id="${id}"]`).first();
}

function waitText(locator, pattern) {
  return locator
    .filter({ hasText: pattern })
    .waitFor({ state: "visible", timeout: TOUR_STEP_TIMEOUT_MS })
    .then(() => "visible")
    .catch(() => "missing");
}

/**
 * Lets the page's requests finish before the tour moves to the next page, as a reader would.
 * The footer reads its snapshot once the page is idle. Leaving mid request, WebKit on a preview
 * behind Cloudflare Access sent that read without the service token, Access answered with its
 * login on another host, and the cancelled read was logged as an access control error. A page
 * that never goes quiet still moves on after the timeout, and any real error is still caught.
 * @param {object} page the Playwright page
 */
async function settleBeforeLeaving(page) {
  await page
    .waitForLoadState("networkidle", { timeout: TOUR_SETTLE_MS })
    .catch(() => {});
}

/**
 * Walks the tour once: opt in, the hero link, every stop with Show me and Next, Finish, the
 * ending and Close. Each check is a "component" of the row, so the CI summary names a failing
 * step the same way it names a missing component.
 */
async function tourOnce(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }
  });
  const page = await context.newPage();
  const errors = [];
  await prepare(context);
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    const locationUrl = (message.location() || {}).url || "";
    if (!isBlocked(locationUrl)) {
      errors.push(message.text().slice(0, 200));
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`script error: ${String(error.message).slice(0, 200)}`);
  });
  const steps = {};
  const result = { status: null, layout: false, components: steps, errors };
  try {
    const response = await page.goto(BASE + TOUR.start, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS
    });
    result.status = response ? response.status() : null;
    result.layout = await hasLayout(page);
    if (result.status !== 200 || !result.layout) {
      result.missingPage = true;
      return finishCheck(result, []);
    }
    const heroLink = page
      .locator('c-hero-banner [data-id="tour-link"]')
      .first();
    steps["hero tour link"] = await heroLink
      .waitFor({ state: "visible", timeout: COMPONENT_TIMEOUT_MS })
      .then(() => "visible")
      .catch(() => "missing");
    // Opt in: before the visitor starts, the bar holds nothing.
    steps["no bar before the start"] =
      (await page.locator('c-tour-bar [data-id="tour-bar"]').count()) === 0
        ? "visible"
        : "hidden";
    if (steps["hero tour link"] !== "visible") {
      return finishCheck(result, []);
    }
    await settleBeforeLeaving(page);
    await heroLink.click();
    const total = TOUR.stops.length;
    for (let index = 0; index < total; index += 1) {
      const stop = TOUR.stops[index];
      const name = `stop ${stop.letter}`;
      const arrived = await page
        .waitForURL((url) => new URL(url).pathname.endsWith(stop.path), {
          timeout: TOUR_STEP_TIMEOUT_MS
        })
        .then(() => true)
        .catch(() => false);
      const progress = arrived
        ? await waitText(
            tourPart(page, "tour-progress"),
            `Stop ${index + 1} of ${total},`
          )
        : "missing";
      const task = tourPart(page, "tour-task");
      const taskState =
        progress === "visible"
          ? await task
              .waitFor({ state: "visible", timeout: COMPONENT_TIMEOUT_MS })
              .then(() => "visible")
              .catch(() => "missing")
          : "missing";
      steps[name] =
        progress === "visible" && taskState === "visible"
          ? "visible"
          : "missing";
      if (steps[name] !== "visible") {
        return finishCheck(result, []);
      }
      // Show me asks the page to show the control the task names. It must never fail.
      await task.click();
      await page.waitForTimeout(300);
      await settleBeforeLeaving(page);
      if (index < total - 1) {
        await tourPart(page, "tour-next").click();
      } else {
        await tourPart(page, "tour-finish").click();
      }
    }
    steps.ending = await waitText(
      tourPart(page, "tour-progress"),
      "That's the tour"
    );
    // The header already links Resume, Contact and Docs, so the ending has none of its own.
    steps["no links in the ending"] =
      (await page.locator("c-tour-bar .tour-actions a").count()) === 0
        ? "visible"
        : "missing";
    await tourPart(page, "tour-close").click();
    steps["bar gone after Close"] = await page
      .locator('c-tour-bar [data-id="tour-bar"]')
      .waitFor({ state: "detached", timeout: COMPONENT_TIMEOUT_MS })
      .then(() => "visible")
      .catch(() => "hidden");
    await page.waitForTimeout(SETTLE_MS);
  } catch (error) {
    result.error = String(error.message).split("\n")[0];
  } finally {
    await context.close();
  }
  return finishCheck(result, []);
}

async function tourRow(browser, engine, viewport) {
  const { attempt, attempts, firstLoadFailure } = await loadWithRetry(
    () => tourOnce(browser, viewport),
    (failed) => !failed.missingPage
  );
  return {
    browser: engine,
    route: "tour",
    viewport: viewport.name,
    attempts,
    ...(firstLoadFailure ? { firstLoadFailure } : {}),
    ...attempt
  };
}

/**
 * Shapes axe-core violations for the report: the rule, its impact and the first elements.
 * @param {object[]} violations the violations axe returned
 * @returns {object[]} one entry per rule
 */
function summarizeViolations(violations) {
  return (violations || []).map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    count: violation.nodes.length,
    elements: violation.nodes
      .slice(0, AXE_SHOWN)
      .map((node) => (node.target || []).flat().join(" "))
  }));
}

async function axeOnce(browser, route, viewport, scheme) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: scheme,
    // The site policy blocks an injected script. axe-core needs to run in the page, so only these
    // rows ignore it. The other rows run under the real policy.
    bypassCSP: true
  });
  const result = { status: null, violations: [], errors: [] };
  try {
    await prepare(context);
    const page = await context.newPage();
    const response = await page.goto(BASE + route.path, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS
    });
    result.status = response ? response.status() : null;
    if (result.status !== 200 || !(await hasLayout(page))) {
      result.missingPage = true;
      result.pass = false;
      return result;
    }
    for (const entry of route.components) {
      const { tag, mayBeEmpty } =
        typeof entry === "string" ? { tag: entry, mayBeEmpty: false } : entry;
      const state = await componentState(page, tag, mayBeEmpty);
      if (state !== "visible" && state !== "empty") {
        result.errors.push(`${tag} is ${state}`);
      }
    }
    if (route.axeOpen) {
      const summaries = page.locator(route.axeOpen);
      const count = await summaries.count();
      for (let index = 0; index < count; index++) {
        const group = summaries.nth(index);
        const open = await group.evaluate((node) => node.parentElement.open);
        if (!open) {
          await group.click();
        }
      }
    }
    await page.waitForTimeout(SETTLE_MS);
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const found = await page.evaluate(
      ({ tags, extra }) => {
        // A tag filter and an experimental rule do not mix in one runOnly, so the tagged rules
        // are listed by id, minus the experimental ones the tag filter always left out, and the
        // extra ones are added to the same list.
        // eslint-disable-next-line no-undef
        const ids = axe
          .getRules(tags)
          .filter((rule) => !rule.tags.includes("experimental"))
          .map((rule) => rule.ruleId);
        return (
          // eslint-disable-next-line no-undef
          axe.run(document, {
            runOnly: { type: "rule", values: [...new Set([...ids, ...extra])] },
            resultTypes: ["violations"]
          })
        );
      },
      { tags: AXE_TAGS, extra: AXE_EXTRA_RULES }
    );
    result.violations = summarizeViolations(found.violations);
  } catch (error) {
    result.error = String(error.message).split("\n")[0];
  } finally {
    await context.close();
  }
  result.pass =
    !result.error &&
    result.errors.length === 0 &&
    result.violations.length === 0;
  return result;
}

async function axeRow(browser, engine, route, viewport, scheme) {
  // A real violation fails every load. Only a load problem is tried once more.
  const { attempt, attempts, firstLoadFailure } = await loadWithRetry(
    () => axeOnce(browser, route, viewport, scheme),
    (failed) => failed.violations.length === 0 && !failed.missingPage
  );
  return {
    browser: engine,
    route: `axe ${route.path}`,
    viewport: viewport.name,
    scheme,
    attempts,
    ...(firstLoadFailure ? { firstLoadFailure } : {}),
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

  const features = await readFeatures();
  const routes = routesFor(ROUTES, features);
  const rows = [];
  let homeChecked = false;
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
      if (!homeChecked) {
        homeChecked = true;
        const problem = await homeProblem(browser);
        if (problem) {
          finish(
            {
              ok: false,
              summary:
                `live smoke: FAIL, the home page at ${BASE}/ did not load: ${problem}. ` +
                "SITE_BASE must be the site's path prefix, such as " +
                "https://example.my.site.com/portfolio",
              base: BASE,
              checkedAt: new Date().toISOString()
            },
            1
          );
          return;
        }
      }
      const tasks = [];
      for (const route of routes) {
        for (const viewport of VIEWPORTS) {
          tasks.push(() => checkRow(browser, engine, route, viewport));
        }
      }
      if (AXE_CHECK) {
        for (const path of AXE_ROUTES) {
          const route = routes.find((entry) => entry.path === path);
          for (const viewport of VIEWPORTS) {
            for (const scheme of AXE_SCHEMES) {
              tasks.push(() =>
                axeRow(browser, engine, route, viewport, scheme)
              );
            }
          }
        }
      }
      for (const viewport of VIEWPORTS) {
        tasks.push(() => tourRow(browser, engine, viewport));
        if (FOOTER_CHECK) {
          tasks.push(() => footerRow(browser, engine, viewport));
        }
      }
      rows.push(...(await runPool(tasks, PARALLEL_PAGES)));
    } finally {
      await browser.close();
    }
  }

  const failed = rows.filter((row) => !row.pass);
  const warnings = warningsFrom(rows);
  for (const warning of warnings) {
    console.error(
      `live smoke warning: ${warning.browser} ${warning.route} ${warning.viewport}` +
        `${warning.scheme ? ` ${warning.scheme}` : ""} failed its first load and passed its second: ${warning.firstLoad}`
    );
  }
  const ok = rows.length > 0 && failed.length === 0;
  const summary =
    `live smoke: ${ok ? "PASS" : "FAIL"}, ${rows.length - failed.length} of ` +
    `${rows.length} rows pass (${BROWSERS.join(", ")}, ${ROUTES.length} routes and the tour walk${AXE_CHECK ? ", the accessibility check" : ""}${FOOTER_CHECK ? ", the footer check" : ""}, ` +
    `${VIEWPORTS.length} sizes)` +
    (failed.length
      ? `, failing: ${failed
          .map((row) =>
            `${row.browser} ${row.route || ""} ${row.viewport || ""} ${row.scheme || ""}`.trim()
          )
          .join("; ")}`
      : "") +
    warningCountText(warnings);
  finish(
    {
      ok,
      summary,
      base: BASE,
      checkedAt: new Date().toISOString(),
      failed: failed.length,
      warnings,
      rows
    },
    ok ? 0 : 1
  );
}

// The route list is shared with scripts/check-smoke-routes.js, which checks it against the
// site's views without a browser. Requiring this file runs nothing.
module.exports = {
  ROUTES,
  TOUR,
  isUnderBase,
  AXE_ROUTES,
  AXE_EXTRA_RULES,
  summarizeViolations,
  accessHeadersFor,
  shouldStripUpgrade,
  stripUpgradeHeaders,
  parseFeatures,
  routesFor,
  describeFailure,
  loadWithRetry,
  warningsFrom,
  warningCountText
};

if (require.main === module) {
  main().catch((error) => {
    finish(
      {
        ok: false,
        summary: `live smoke: FAIL, ${String(error.message).split("\n")[0]}`
      },
      1
    );
  });
}

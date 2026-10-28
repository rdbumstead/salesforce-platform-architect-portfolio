#!/usr/bin/env node
/* eslint-disable no-console */

// Checks the live smoke test's route list (scripts/live-smoke.js) against the site's own
// source, so the smoke never expects a page that has changed. For every page route of the
// Experience site (the home route and every custom route), it reads the route's view and
// collects the components the view places, then every component those components place in
// their own templates. It fails when:
//   - the smoke names a route the site does not have,
//   - the smoke expects a component its route no longer places,
//   - the site has a page route the smoke does not check, or
//   - a page places a component that has no bundle in the repository (a deleted component
//     still named in a view or a template).
// It also checks the smoke's tour walk (TOUR in scripts/live-smoke.js) against the live pillars
// in c/pillarData, read from its source: the same stops in the same order, each a page the site
// has, and the start page too.
// The order of the components in a route's list does not matter.
// No browser and no org: it reads files only, so it runs in the quality check on every PR.
//
// Run: node scripts/check-smoke-routes.js [repository root]
// Exit 0 when the list matches the site, 1 with one line per problem otherwise.

const fs = require("fs");
const path = require("path");

const SITE =
  "packages/portfolio-site/main/default/digitalExperiences/site/Portfolio1";
const LWC = "packages/portfolio-site/main/default/lwc";

/** Turns a view definition such as "c:heroBanner" into its tag, "c-hero-banner". */
function tagOf(definition) {
  const name = definition.slice(2);
  return "c-" + name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
}

/** Turns a tag such as "c-hero-banner" into its bundle folder, "heroBanner". */
function bundleOf(tag) {
  return tag
    .slice(2)
    .replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Every "definition": "c:..." in a view, at any depth. */
function viewTags(value, found = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => viewTags(item, found));
  } else if (value && typeof value === "object") {
    if (
      typeof value.definition === "string" &&
      value.definition.startsWith("c:")
    ) {
      found.add(tagOf(value.definition));
    }
    Object.values(value).forEach((item) => viewTags(item, found));
  }
  return found;
}

/** The tags a component places in its own templates, read from its bundle's html files. */
function templateTags(root, tag) {
  const dir = path.join(root, LWC, bundleOf(tag));
  const found = new Set();
  if (!fs.existsSync(dir)) {
    return found;
  }
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".html")) {
      continue;
    }
    const html = fs.readFileSync(path.join(dir, file), "utf8");
    for (const match of html.matchAll(/<(c-[a-z0-9-]+)/g)) {
      found.add(match[1]);
    }
  }
  return found;
}

/** A view's components plus everything they place, followed through each template. */
function placedTags(root, direct) {
  const placed = new Set(direct);
  const queue = [...direct];
  while (queue.length) {
    for (const child of templateTags(root, queue.shift())) {
      if (!placed.has(child)) {
        placed.add(child);
        queue.push(child);
      }
    }
  }
  return placed;
}

/** Whether a component's bundle folder is in the repository. */
function hasBundle(root, tag) {
  return fs.existsSync(path.join(root, LWC, bundleOf(tag)));
}

/** Page routes of the site, keyed by path ("/" for home), each with its placed components. */
function sitePages(root) {
  const routesDir = path.join(root, SITE, "sfdc_cms__route");
  const pages = new Map();
  for (const name of fs.readdirSync(routesDir)) {
    const file = path.join(routesDir, name, "content.json");
    if (!fs.existsSync(file)) {
      continue;
    }
    const body = readJson(file).contentBody || {};
    const type = String(body.routeType || "");
    if (type !== "home" && !type.startsWith("custom-")) {
      continue;
    }
    const viewFile = path.join(
      root,
      SITE,
      "sfdc_cms__view",
      body.activeViewId,
      "content.json"
    );
    const direct = fs.existsSync(viewFile)
      ? viewTags(readJson(viewFile))
      : new Set();
    pages.set("/" + (body.urlPrefix || ""), placedTags(root, direct));
  }
  return pages;
}

/** Problems between the smoke's route list and the site's pages. */
function check(root, routes) {
  const pages = sitePages(root);
  const problems = [];
  const checked = new Set();
  for (const route of routes) {
    checked.add(route.path);
    const placed = pages.get(route.path);
    if (!placed) {
      problems.push(
        `${route.path}: the smoke checks a route the site does not have`
      );
      continue;
    }
    for (const tag of [...placed].sort()) {
      if (!hasBundle(root, tag)) {
        problems.push(
          `${route.path}: the page places ${tag}, which has no bundle in the repository`
        );
      }
    }
    for (const entry of route.components) {
      const tag = typeof entry === "string" ? entry : entry.tag;
      if (!placed.has(tag)) {
        problems.push(
          `${route.path}: the smoke expects ${tag}, which the page no longer places`
        );
      }
    }
  }
  for (const pagePath of pages.keys()) {
    if (!checked.has(pagePath)) {
      problems.push(
        `${pagePath}: the site has this page and the smoke does not check it`
      );
    }
  }
  return problems;
}

/**
 * The live pillars in tour order, read from the pillarData source: each SOURCE entry's letter,
 * url and inProgress flag, in file order, keeping those that are not in progress.
 * @param {string} root the repository root
 * @returns {{letter: string, path: string}[]} the live stops
 */
function liveStops(root) {
  const file = path.join(root, LWC, "pillarData", "pillarData.js");
  const source = fs.readFileSync(file, "utf8");
  const stops = [];
  const entry =
    /letter:\s*"([A-Z])"[\s\S]*?url:\s*"([^"]*)"[\s\S]*?inProgress:\s*(true|false)/g;
  for (const match of source.matchAll(entry)) {
    if (match[3] === "false") {
      stops.push({ letter: match[1], path: "/" + match[2] });
    }
  }
  return stops;
}

/** Problems between the smoke's tour walk, the live pillars and the site's pages. */
function checkTour(root, tour) {
  const problems = [];
  if (!tour) {
    return ["tour: the smoke has no tour walk"];
  }
  const pages = sitePages(root);
  const expected = liveStops(root);
  const shown = (stops) =>
    stops.map((stop) => `${stop.letter} ${stop.path}`).join(", ");
  if (shown(tour.stops) !== shown(expected)) {
    problems.push(
      `tour: the smoke walks ${shown(tour.stops) || "no stops"}, the live pillars are ${shown(expected) || "none"}`
    );
  }
  [tour.start, ...tour.stops.map((stop) => stop.path)].forEach((page) => {
    if (!pages.has(page)) {
      problems.push(`tour: ${page} is not a page the site has`);
    }
  });
  return problems;
}

module.exports = { check, checkTour, liveStops, sitePages, tagOf, bundleOf };

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
  const { ROUTES, TOUR } = require(path.join(root, "scripts", "live-smoke.js"));
  const problems = [...check(root, ROUTES), ...checkTour(root, TOUR)];
  if (problems.length) {
    console.log(
      `Smoke routes: ${problems.length} problem(s). Update ROUTES in scripts/live-smoke.js:`
    );
    problems.forEach((line) => console.log(`- ${line}`));
    process.exit(1);
  }
  console.log(
    `Smoke routes match the site: ${ROUTES.length} routes and the ${TOUR.stops.length} tour stops checked.`
  );
}

// Tests for scripts/check-smoke-routes.js. Run: node --test scripts/check-smoke-routes.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  check,
  checkTour,
  liveStops,
  tagOf,
  bundleOf,
  checkStatic
} = require("./check-smoke-routes.js");
const {
  ROUTES,
  TOUR,
  isUnderBase,
  parseFeatures,
  routesFor
} = require("./live-smoke.js");

const SITE =
  "packages/portfolio-site/main/default/digitalExperiences/site/Portfolio1";
const LWC = "packages/portfolio-site/main/default/lwc";

function write(root, file, text) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

// A tiny site: home places c:heroBanner, whose template places c-contact-call, and a custom
// page "about" places c:aboutCard. A login route is not a page the smoke checks. Every placed
// component has a bundle folder.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-routes-"));
  const route = (name, type, prefix, view) =>
    write(
      root,
      `${SITE}/sfdc_cms__route/${name}/content.json`,
      JSON.stringify({
        contentBody: { routeType: type, urlPrefix: prefix, activeViewId: view }
      })
    );
  const view = (name, definitions) =>
    write(
      root,
      `${SITE}/sfdc_cms__view/${name}/content.json`,
      JSON.stringify({
        regions: [
          { components: definitions.map((definition) => ({ definition })) }
        ]
      })
    );
  route("Home", "home", "", "home");
  route("About__c", "custom-about", "about", "About");
  route("Login", "login", "login", "login");
  view("home", ["c:heroBanner", "community_builder:seoAssistant"]);
  view("About", ["c:aboutCard"]);
  write(
    root,
    `${LWC}/heroBanner/heroBanner.html`,
    "<template><c-contact-call></c-contact-call></template>"
  );
  write(root, `${LWC}/contactCall/contactCall.html`, "<template></template>");
  write(root, `${LWC}/aboutCard/aboutCard.html`, "<template></template>");
  return root;
}

test("names convert between view definitions, tags and bundles", () => {
  assert.strictEqual(tagOf("c:heroBanner"), "c-hero-banner");
  assert.strictEqual(bundleOf("c-hero-banner"), "heroBanner");
});

test("a list that matches the site passes, nested components included", () => {
  const routes = [
    { path: "/", components: ["c-hero-banner", "c-contact-call"] },
    { path: "/about", components: [{ tag: "c-about-card", mayBeEmpty: true }] }
  ];
  assert.deepStrictEqual(check(fixture(), routes), []);
});

test("a component the page no longer places fails", () => {
  const routes = [
    { path: "/", components: ["c-hero-banner", "c-old-timeline"] },
    { path: "/about", components: ["c-about-card"] }
  ];
  const problems = check(fixture(), routes);
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /^\/: .*c-old-timeline/);
});

test("a component a page still places after its bundle is deleted fails", () => {
  const root = fixture();
  fs.rmSync(path.join(root, LWC, "contactCall"), { recursive: true });
  const routes = [
    { path: "/", components: ["c-hero-banner"] },
    { path: "/about", components: ["c-about-card"] }
  ];
  const problems = check(root, routes);
  assert.strictEqual(problems.length, 1);
  assert.match(
    problems[0],
    /^\/: the page places c-contact-call, which has no bundle/
  );
});

test("a page the smoke skips and a route the site lacks both fail", () => {
  const routes = [
    { path: "/", components: ["c-hero-banner"] },
    { path: "/gone", components: ["c-hero-banner"] }
  ];
  const problems = check(fixture(), routes);
  assert.ok(problems.some((line) => line.startsWith("/gone: ")));
  assert.ok(problems.some((line) => line.startsWith("/about: ")));
});

test("the smoke's own list matches this repository's site", () => {
  assert.deepStrictEqual(check(path.join(__dirname, ".."), ROUTES), []);
});

test("the smoke treats only the base and pages under it as the site", () => {
  const base = "https://example.my.site.com/portfolio";
  assert.strictEqual(isUnderBase(`${base}/`, base), true);
  assert.strictEqual(isUnderBase(`${base}/docs?doc=sas#top`, base), true);
  assert.strictEqual(
    isUnderBase("https://example.my.site.com/portfolio/", `${base}vforcesite`),
    false
  );
  assert.strictEqual(isUnderBase(`${base}2/`, base), false);
});

// A pillarData source with two pillars, the second coming, for the tour checks.
function withPillars(root, secondInProgress) {
  write(
    root,
    `${LWC}/pillarData/pillarData.js`,
    [
      "const SOURCE = [",
      '  { key: "about", letter: "A", url: "about", tour: "Read it.", inProgress: false },',
      `  { key: "x", letter: "B", url: "", tour: "Home.", inProgress: ${secondInProgress} }`,
      "];"
    ].join("\n")
  );
  return root;
}

test("the tour stops are read from pillarData in order, live ones only", () => {
  assert.deepStrictEqual(liveStops(withPillars(fixture(), true)), [
    { letter: "A", path: "/about" }
  ]);
  assert.deepStrictEqual(liveStops(withPillars(fixture(), false)), [
    { letter: "A", path: "/about" },
    { letter: "B", path: "/" }
  ]);
});

test("a tour walk that matches the live pillars and the site's pages passes", () => {
  const root = withPillars(fixture(), true);
  const tour = { start: "/", stops: [{ letter: "A", path: "/about" }] };
  assert.deepStrictEqual(checkTour(root, tour), []);
});

test("a tour walk out of step with the pillars, or on a missing page, fails", () => {
  const root = withPillars(fixture(), false);
  const tour = {
    start: "/gone",
    stops: [{ letter: "A", path: "/about" }]
  };
  const problems = checkTour(root, tour);
  assert.ok(
    problems.some((line) => /the live pillars are A \/about, B \//.test(line))
  );
  assert.ok(
    problems.some((line) => line === "tour: /gone is not a page the site has")
  );
  assert.deepStrictEqual(checkTour(root, undefined), [
    "tour: the smoke has no tour walk"
  ]);
});

test("the smoke's own tour walk matches this repository's pillars and site", () => {
  assert.deepStrictEqual(checkTour(path.join(__dirname, ".."), TOUR), []);
  assert.strictEqual(TOUR.stops.length, 5);
});

test("a part inside a component the page does not place fails", () => {
  const routes = [
    {
      path: "/",
      components: ["c-hero-banner"],
      parts: [
        { selector: "c-contact-call a.ok" },
        { selector: "c-gone-card a.download" }
      ]
    },
    { path: "/about", components: ["c-about-card"] }
  ];
  const problems = check(fixture(), routes);
  assert.deepStrictEqual(problems, [
    "/: the smoke looks inside c-gone-card, which the page does not place"
  ]);
});

test("the smoke checks exactly the pages the static site builds", async () => {
  const root = path.join(__dirname, "..");
  assert.deepStrictEqual(await checkStatic(root, ROUTES), []);
});

test("a smoke route the static site does not build is reported", async () => {
  const root = path.join(__dirname, "..");
  const problems = await checkStatic(root, [...ROUTES, { path: "/gone" }]);
  assert.ok(problems.some((line) => line.startsWith("/gone:")));
});

test("the Access service token goes only to the preview's own host", () => {
  const saved = { ...process.env };
  process.env.SITE_BASE = "https://pr-7.ryanbumstead.pages.dev";
  process.env.CF_ACCESS_CLIENT_ID = "id";
  process.env.CF_ACCESS_CLIENT_SECRET = "secret";
  delete require.cache[require.resolve("./live-smoke.js")];
  const { accessHeadersFor } = require("./live-smoke.js");
  try {
    assert.deepStrictEqual(
      accessHeadersFor("https://pr-7.ryanbumstead.pages.dev/assets/a.js"),
      { "CF-Access-Client-Id": "id", "CF-Access-Client-Secret": "secret" }
    );
    assert.strictEqual(
      accessHeadersFor("https://www.googletagmanager.com/gtag/js"),
      null
    );
    assert.strictEqual(
      accessHeadersFor("https://challenges.cloudflare.com/turnstile/v0/api.js"),
      null
    );
  } finally {
    process.env = saved;
    delete require.cache[require.resolve("./live-smoke.js")];
  }
});

test("no Access headers for a base outside pages.dev", () => {
  const saved = { ...process.env };
  process.env.SITE_BASE = "https://ryanbumstead.com";
  process.env.CF_ACCESS_CLIENT_ID = "id";
  process.env.CF_ACCESS_CLIENT_SECRET = "secret";
  delete require.cache[require.resolve("./live-smoke.js")];
  const { accessHeadersFor } = require("./live-smoke.js");
  try {
    assert.strictEqual(accessHeadersFor("https://ryanbumstead.com/"), null);
  } finally {
    process.env = saved;
    delete require.cache[require.resolve("./live-smoke.js")];
  }
});

const LIVE = {
  contact: "live",
  testimonial: "live",
  coverLetter: "live",
  apiLab: "live",
  liveReads: "live"
};

test("a missing or foreign /api/features leaves the route list as written", () => {
  assert.strictEqual(parseFeatures(404, "<html>"), null);
  assert.strictEqual(parseFeatures(200, "<html>not json</html>"), null);
  assert.strictEqual(parseFeatures(200, '{"other":1}'), null);
  assert.strictEqual(routesFor(ROUTES, null), ROUTES);
});

test("switches that read live keep the forms the smoke expects", () => {
  const features = parseFeatures(200, JSON.stringify(LIVE));
  assert.strictEqual(features.contact, "live");
  assert.deepStrictEqual(routesFor(ROUTES, features), ROUTES);
});

test("recorded switches swap the form for the recorded note and keep the rest", () => {
  const features = parseFeatures(
    200,
    JSON.stringify({ ...LIVE, contact: "recorded", testimonial: "recorded" })
  );
  const routes = routesFor(ROUTES, features);
  const find = (list, route) => list.find((item) => item.path === route);
  assert.deepStrictEqual(find(routes, "/contact").components, [
    'section.recorded-note[data-recorded="contact"]'
  ]);
  const testimonials = find(routes, "/testimonials").components;
  assert.strictEqual(
    testimonials[0],
    'section.recorded-note[data-recorded="testimonial"]'
  );
  assert.deepStrictEqual(
    testimonials[1],
    find(ROUTES, "/testimonials").components[1]
  );
  assert.deepStrictEqual(find(routes, "/docs"), find(ROUTES, "/docs"));
  assert.strictEqual(find(ROUTES, "/contact").components[0], "c-contact-form");
});

test("only the recorded switch swaps its own page", () => {
  const routes = routesFor(ROUTES, { ...LIVE, contact: "recorded" });
  const find = (list, route) => list.find((item) => item.path === route);
  assert.deepStrictEqual(
    find(routes, "/testimonials"),
    find(ROUTES, "/testimonials")
  );
  assert.notDeepStrictEqual(find(routes, "/contact"), find(ROUTES, "/contact"));
});

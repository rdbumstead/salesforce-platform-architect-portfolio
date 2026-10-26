// Tests for scripts/check-smoke-routes.js. Run: node --test scripts/check-smoke-routes.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { check, tagOf, bundleOf } = require("./check-smoke-routes.js");
const { ROUTES } = require("./live-smoke.js");

const SITE =
  "packages/portfolio-site/main/default/digitalExperiences/site/Portfolio1";
const LWC = "packages/portfolio-site/main/default/lwc";

function write(root, file, text) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
}

// A tiny site: home places c:heroBanner, whose template places c-contact-call, and a custom
// page "about" places c:aboutCard. A login route is not a page the smoke checks.
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
    { path: "/", components: ["c-hero-banner", "c-experience-timeline"] },
    { path: "/about", components: ["c-about-card"] }
  ];
  const problems = check(fixture(), routes);
  assert.strictEqual(problems.length, 1);
  assert.match(problems[0], /^\/: .*c-experience-timeline/);
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

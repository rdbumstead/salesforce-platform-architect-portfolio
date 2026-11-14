const test = require("node:test");
const assert = require("node:assert");
const {
  shouldStripUpgrade,
  stripUpgradeHeaders,
  describeFailure,
  loadWithRetry,
  warningsFrom,
  warningCountText,
  AXE_EXTRA_RULES,
  AXE_ROUTES,
  ROUTES
} = require("./live-smoke.js");

test("strips only for a local http base with the option on", () => {
  const base = "http://localhost:8813";
  assert.strictEqual(shouldStripUpgrade(base + "/docs", base, true), true);
  assert.strictEqual(shouldStripUpgrade(base + "/docs", base, false), false);
});

test("never strips for an https base or a remote host", () => {
  assert.strictEqual(
    shouldStripUpgrade(
      "https://localhost:8813/",
      "https://localhost:8813",
      true
    ),
    false
  );
  assert.strictEqual(
    shouldStripUpgrade("http://example.com/", "http://example.com", true),
    false
  );
  assert.strictEqual(
    shouldStripUpgrade("http://example.com/", "http://localhost:8813", true),
    false
  );
  assert.strictEqual(shouldStripUpgrade("http://localhost/", "", true), false);
});

test("removes upgrade-insecure-requests and keeps the other directives", () => {
  const out = stripUpgradeHeaders({
    "content-type": "text/html",
    "content-security-policy":
      "default-src 'self'; upgrade-insecure-requests; img-src 'self' data:"
  });
  assert.strictEqual(
    out["content-security-policy"],
    "default-src 'self'; img-src 'self' data:"
  );
  assert.strictEqual(out["content-type"], "text/html");
});

test("a first load that fails and a second that passes returns the first failure text", async () => {
  const results = [
    {
      pass: false,
      status: 200,
      components: {
        "c-docs-viewer": "hidden",
        "c-site-build-section": "visible"
      },
      errors: ["script error"]
    },
    { pass: true, status: 200, components: {}, errors: [] }
  ];
  const run = await loadWithRetry(
    async () => results.shift(),
    () => true
  );
  assert.strictEqual(run.attempts, 2);
  assert.strictEqual(run.attempt.pass, true);
  assert.strictEqual(
    run.firstLoadFailure,
    "c-docs-viewer hidden, console: script error"
  );
});

test("a first load that passes is not loaded again and has no failure text", async () => {
  let loads = 0;
  const run = await loadWithRetry(
    async () => {
      loads += 1;
      return { pass: true };
    },
    () => true
  );
  assert.strictEqual(loads, 1);
  assert.strictEqual(run.attempts, 1);
  assert.strictEqual(run.firstLoadFailure, undefined);
});

test("a failure the caller does not want retried is loaded once", async () => {
  let loads = 0;
  const run = await loadWithRetry(
    async () => {
      loads += 1;
      return { pass: false, missingPage: true, status: 404 };
    },
    (failed) => !failed.missingPage
  );
  assert.strictEqual(loads, 1);
  assert.strictEqual(run.firstLoadFailure, undefined);
});

test("describes status, layout, error and axe failures in one line", () => {
  assert.strictEqual(
    describeFailure({ pass: false, status: 503, layout: false }),
    "status 503, no site layout"
  );
  assert.strictEqual(
    describeFailure({ pass: false, status: null, error: "net::ERR_TIMED_OUT" }),
    "net::ERR_TIMED_OUT, no response"
  );
  assert.strictEqual(
    describeFailure({
      pass: false,
      status: 200,
      violations: [{ rule: "label-content-name-mismatch", count: 6 }]
    }),
    "axe label-content-name-mismatch on 6"
  );
  assert.strictEqual(
    describeFailure({ pass: false }),
    "failed with no reason recorded"
  );
});

test("only a row that recovered becomes a warning, with its route, engine, size and text", () => {
  const warnings = warningsFrom([
    { browser: "webkit", route: "/docs", viewport: "phone", pass: true },
    {
      browser: "chromium",
      route: "/api-lab/reference",
      viewport: "desktop",
      pass: true,
      attempts: 2,
      firstLoadFailure: "console: script error"
    },
    {
      browser: "webkit",
      route: "axe /skills",
      viewport: "phone",
      scheme: "dark",
      pass: true,
      attempts: 2,
      firstLoadFailure: "net::ERR_ABORTED"
    },
    {
      browser: "webkit",
      route: "/contact",
      viewport: "phone",
      pass: false,
      firstLoadFailure: "status 500"
    }
  ]);
  assert.deepStrictEqual(warnings, [
    {
      warning: "first load failed",
      browser: "chromium",
      route: "/api-lab/reference",
      viewport: "desktop",
      firstLoad: "console: script error"
    },
    {
      warning: "first load failed",
      browser: "webkit",
      route: "axe /skills",
      viewport: "phone",
      scheme: "dark",
      firstLoad: "net::ERR_ABORTED"
    }
  ]);
});

test("the summary ending always shows the count, zero included", () => {
  assert.strictEqual(warningCountText([]), ", first load warnings: 0");
  assert.strictEqual(
    warningCountText([{}, {}, {}]),
    ", first load warnings: 3"
  );
});

test("the axe rows switch on the voice control rule by id and keep the skills page", () => {
  assert.ok(AXE_EXTRA_RULES.includes("label-content-name-mismatch"));
  assert.ok(AXE_ROUTES.includes("/skills"));
});

test("the docs page is an axe route and opens its Decisions group to reach the links", () => {
  assert.ok(AXE_ROUTES.includes("/docs"));
  const docs = ROUTES.find((route) => route.path === "/docs");
  assert.ok(docs.axeOpen.includes("summary"));
  AXE_ROUTES.forEach((path) =>
    assert.ok(ROUTES.some((route) => route.path === path))
  );
});

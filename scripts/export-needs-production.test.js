// Tests for scripts/export-needs-production.js. Run: node --test scripts/export-needs-production.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const {
  EXIT,
  ALLOWLIST_FILE,
  exportedClasses,
  needsProduction,
  main
} = require("./export-needs-production.js");

const ALLOWLIST = `public with sharing class SiteExportCalls {
  private static final Map<String, Set<String>> PARAMS_BY_CALL = new Map<String, Set<String>>{
    'ResumeController.getHeader' => new Set<String>(),
    'ResumeController.getTimeline' => new Set<String>(),
    'SourceController.getDocs' => new Set<String>()
  };
}`;
const CLASSES = exportedClasses(ALLOWLIST);
const CLS = "packages/portfolio-site/main/default/classes";

test("exportedClasses reads each class once from PARAMS_BY_CALL", () => {
  assert.deepStrictEqual(CLASSES, ["ResumeController", "SourceController"]);
  assert.deepStrictEqual(exportedClasses("no block here"), []);
});

test("exportedClasses finds the real allowlist and its main classes", () => {
  const real = exportedClasses(fs.readFileSync(ALLOWLIST_FILE, "utf8"));
  assert.ok(real.includes("ResumeController"));
  assert.ok(real.includes("ResumeSnapshotService"));
  assert.ok(real.includes("SourceController"));
});

test("paths in the export, build and snapshot areas need production", () => {
  const yes = [
    "web/build/export.mjs",
    "web/build/build.mjs",
    "web/fixtures/reads.json",
    "web/functions/_generated/lab-paths.js",
    "web/src/shims/site-data.js",
    "web/src/shims/graphql.js",
    "web/package.json",
    ".github/workflows/site.yml",
    `${CLS}/SiteExportResource.cls`,
    `${CLS}/SiteExportCalls.cls-meta.xml`,
    `${CLS}/ResumeSnapshotService.cls`,
    `${CLS}/ResumeSnapshotServiceTest.cls`,
    `${CLS}/ResumeController.cls`,
    "packages/integration-api/main/default/classes/SourceController.cls",
    "web\\build\\plan.mjs"
  ];
  for (const p of yes)
    assert.ok(needsProduction([p], CLASSES), `${p} should need production`);
});

test("other paths preview on fixtures", () => {
  const no = [
    "README.md",
    "docs/guides/05-Maintenance-Guide.md",
    "web/functions/api/contact.js",
    "web/functions/_lib/salesforce.js",
    "web/src/shims/api-client.js",
    "web/test/build.test.mjs",
    `${CLS}/ResumeControllerTest.cls`,
    `${CLS}/ContactFormController.cls`,
    "packages/portfolio-site/main/default/lwc/contactForm/contactForm.js",
    ".github/workflows/pr.yml",
    ""
  ];
  assert.strictEqual(needsProduction(no, CLASSES), null);
});

test("needsProduction names the first matching path and its area", () => {
  const hit = needsProduction(
    ["README.md", "web/build/export.mjs", `${CLS}/ResumeController.cls`],
    CLASSES
  );
  assert.deepStrictEqual(hit, {
    path: "web/build/export.mjs",
    area: "the build"
  });
});

function harness(files, extra = {}) {
  const lines = [];
  const outputs = [];
  return {
    lines,
    outputs,
    deps: {
      env: { GITHUB_OUTPUT: "out" },
      log: (line) => lines.push(line),
      appendFile: (file, text) => outputs.push(text),
      readFile: (file) => (file === ALLOWLIST_FILE ? ALLOWLIST : files),
      ...extra
    }
  };
}

test("main with a file list writes production=true for an export change", () => {
  const h = harness("README.md\nweb/build/export.mjs\n");
  assert.strictEqual(main(["--files", "changed.txt"], h.deps), EXIT.OK);
  assert.deepStrictEqual(h.outputs, ["production=true\n"]);
  assert.match(
    h.lines[0],
    /^Preview reads production: web\/build\/export\.mjs changes the build\.$/
  );
});

test("main with git diff writes production=false for an unrelated change", () => {
  const calls = [];
  const run = (file, args) => {
    calls.push([file, ...args]);
    return {
      status: 0,
      stdout: "README.md\r\nweb/functions/api/contact.js\r\n"
    };
  };
  const h = harness("", { run });
  assert.strictEqual(main(["--base", "origin/main"], h.deps), EXIT.OK);
  assert.deepStrictEqual(calls, [
    ["git", "diff", "--name-only", "origin/main...HEAD"]
  ]);
  assert.deepStrictEqual(h.outputs, ["production=false\n"]);
  assert.match(h.lines[0], /^Preview uses the fixtures/);
});

test("a failed git diff falls back to fixtures with exit 3, a bad argument exits 4", () => {
  const run = () => ({
    status: 128,
    stdout: "",
    stderr: "fatal: bad revision"
  });
  const h = harness("", { run });
  assert.strictEqual(main([], h.deps), EXIT.READ_FAILED);
  assert.deepStrictEqual(h.outputs, ["production=false\n"]);
  assert.match(h.lines[0], /fatal: bad revision/);
  const h2 = harness("");
  assert.strictEqual(main(["--nope"], h2.deps), EXIT.USAGE);
  assert.deepStrictEqual(h2.outputs, []);
});

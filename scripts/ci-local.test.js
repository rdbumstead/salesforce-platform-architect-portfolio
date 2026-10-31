// Tests for scripts/ci-local.js. Run: node --test scripts/ci-local.test.js
// The drift test reads the quality-check job in .github/workflows/pr.yml and fails when a
// command there has no step in ci-local.js, so CI and the local runner cannot drift apart.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { STEPS, selectSteps } = require("./ci-local.js");

// CI_LOCAL_WORKFLOW points the test at another copy of the workflow, to show it fails on a new command.
const WORKFLOW =
  process.env.CI_LOCAL_WORKFLOW ||
  path.join(__dirname, "..", ".github", "workflows", "pr.yml");

/** A command line without its leading environment settings, or "" when there is nothing to run. */
function normalize(line) {
  let text = line.trim();
  if (!text || text.startsWith("#")) return "";
  // Leading NAME=value pairs, where a value may be quoted and may hold spaces.
  const env = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s*/;
  while (env.test(text)) text = text.replace(env, "");
  // Installing dependencies is setup, not a check.
  if (text === "npm ci" || text.startsWith("npm install --prefix")) return "";
  return text;
}

function qualityCheckCommands() {
  const doc = yaml.load(fs.readFileSync(WORKFLOW, "utf8"));
  const steps = doc.jobs["quality-check"].steps;
  return steps
    .filter((step) => typeof step.run === "string")
    .flatMap((step) => step.run.split("\n"))
    .map(normalize)
    .filter(Boolean);
}

const stepCommands = STEPS.flatMap((step) =>
  step.commands.map((c) => c.ci).filter(Boolean)
);

test("the workflow has commands to compare", () => {
  assert.ok(qualityCheckCommands().length >= 10);
});

test("every quality-check command has a step in ci-local.js", () => {
  const missing = qualityCheckCommands().filter(
    (command) => !stepCommands.includes(command)
  );
  assert.deepStrictEqual(
    missing,
    [],
    `pr.yml runs commands that scripts/ci-local.js does not: ${missing.join(" | ")}`
  );
});

test("every step command with a CI text is still in the workflow", () => {
  const ci = qualityCheckCommands();
  const stale = stepCommands.filter((command) => !ci.includes(command));
  assert.deepStrictEqual(stale, []);
});

test("the steps run in the order of the workflow", () => {
  const ci = qualityCheckCommands();
  const positions = stepCommands.map((command) => ci.indexOf(command));
  assert.deepStrictEqual(
    positions,
    [...positions].sort((a, b) => a - b)
  );
});

test("a docs only change selects neither Jest nor the analyzer", () => {
  const names = selectSteps(["docs/guides/05-Maintenance-Guide.md"]).map(
    (s) => s.name
  );
  assert.ok(!names.includes("Jest"));
  assert.ok(!names.includes("Code analyzer"));
  assert.ok(names.includes("Internal references"));
  assert.ok(names.includes("Mermaid diagrams"));
  assert.ok(names.includes("Secret scan"));
});

test("a class change selects the analyzer", () => {
  const names = selectSteps([
    "packages/portfolio-core/main/default/classes/Foo.cls"
  ]).map((s) => s.name);
  assert.ok(names.includes("Code analyzer"));
  assert.ok(!names.includes("Jest"));
});

test("an LWC change selects Jest and the analyzer", () => {
  const names = selectSteps([
    "packages/portfolio-site/main/default/lwc/heroBanner/heroBanner.js"
  ]).map((s) => s.name);
  assert.ok(names.includes("Jest"));
  assert.ok(names.includes("Code analyzer"));
});

test("a spec change selects the API docs and Postman steps", () => {
  const names = selectSteps(["packages/integration-api/specs/papi.yaml"]).map(
    (s) => s.name
  );
  assert.ok(names.includes("API docs are current"));
  assert.ok(names.includes("Postman collection"));
});

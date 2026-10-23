#!/usr/bin/env node
/* eslint-disable no-console */

// Runs the release checks in one command:
//   npm run pre-launch-check -- --target-org <alias>
// The org is required and is never taken from the CLI default, because the main checkout's
// default is the production org. Prettier checks only the files changed against origin/main,
// since the repo as a whole has never been formatted in one pass.

const { execFileSync, execSync } = require("child_process");

const PRETTIER_EXTENSIONS =
  /\.(cls|cmp|component|css|html|js|json|md|page|trigger|xml|yaml|yml)$/;

function targetOrg() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--target-org");
  return at >= 0 ? argv[at + 1] : undefined;
}

function changedFiles() {
  const output = execSync(
    "git diff --name-only --diff-filter=ACMR origin/main...HEAD",
    { encoding: "utf8" }
  );
  return output
    .split(/\r?\n/)
    .filter((file) => file && PRETTIER_EXTENSIONS.test(file));
}

function prettierOnChanged() {
  const files = changedFiles();
  if (files.length === 0) {
    console.log("No changed files to check.");
    return;
  }
  execFileSync(
    "npx",
    ["prettier", "--config", "config/.prettierrc", "--check", ...files],
    { stdio: "inherit", shell: true }
  );
}

function runNode(script, org) {
  execFileSync("node", [script, "--target-org", org], { stdio: "inherit" });
}

const org = targetOrg();
if (!org) {
  console.error(
    "Name the org to validate and test against: npm run pre-launch-check -- --target-org <alias>"
  );
  process.exit(2);
}

const checks = [
  { name: "Code Formatting (changed files)", run: prettierOnChanged },
  { name: "Static Analysis", cmd: "npm run scan" },
  {
    name: "Delta Package Validation",
    run: () => runNode("scripts/validate.js", org)
  },
  { name: "LWC Unit Tests", cmd: "npm run test:unit" },
  {
    name: "Apex Tests and Coverage (90%)",
    run: () => runNode("scripts/coverage-gate.js", org)
  },
  {
    name: "Lighthouse Performance",
    cmd: "npm run test:lighthouse",
    optional: true
  }
];

console.log(`Starting Pre-Launch Check against ${org}...\n`);

for (const check of checks) {
  try {
    console.log(`Running: ${check.name}`);
    if (check.run) {
      check.run();
    } else {
      execSync(check.cmd, { stdio: "inherit" });
    }
    console.log(`${check.name} PASSED\n`);
  } catch {
    if (check.optional) {
      console.log(`${check.name} SKIPPED (optional)\n`);
    } else {
      console.error(`${check.name} FAILED`);
      process.exit(1);
    }
  }
}

console.log("PRE-LAUNCH CHECK PASSED");

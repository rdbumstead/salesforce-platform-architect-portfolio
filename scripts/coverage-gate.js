#!/usr/bin/env node
/* eslint-disable no-console */

// Apex test and coverage gate. It fails when any test fails, when the run did not finish,
// or when org wide coverage is below the minimum (90% unless --min says otherwise).
//
// Two ways to run it:
//   node scripts/coverage-gate.js --file apex-tests.json
//     reads the JSON written by `sf apex run test --code-coverage --json`
//     (pr.yml uses this after its scratch org run)
//   node scripts/coverage-gate.js --target-org <alias>
//     runs the local tests in that org first (npm run sf:coverage -- --target-org <alias>)
//
// The org is never taken from the CLI default, because the main checkout's default is the
// production org.

const { execFileSync } = require("child_process");
const fs = require("fs");

const DEFAULT_MIN = 90;

function readArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--file" || key === "--target-org" || key === "--min") {
      args[key.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return args;
}

function runTests(targetOrg) {
  console.log(`Running local Apex tests in ${targetOrg} with coverage...`);
  try {
    return execFileSync(
      "sf",
      [
        "apex",
        "run",
        "test",
        "--target-org",
        targetOrg,
        "--test-level",
        "RunLocalTests",
        "--code-coverage",
        "--wait",
        "30",
        "--json"
      ],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: true }
    );
  } catch (error) {
    // The CLI exits non zero when a test fails, and still prints the JSON.
    return error.stdout || "";
  }
}

// Returns { ok, lines } so the caller decides how to print and exit.
function evaluate(rawJson, min) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, lines: ["No readable test result JSON."] };
  }
  const summary = parsed && parsed.result && parsed.result.summary;
  if (!summary) {
    const message = (parsed && parsed.message) || "no summary in the result";
    return { ok: false, lines: [`Test run did not finish: ${message}`] };
  }
  const ran = Number(summary.testsRan);
  const passing = Number(summary.passing);
  const failing = Number(summary.failing);
  const coverage = parseFloat(
    String(summary.orgWideCoverage || "").replace("%", "")
  );
  const lines = [
    `Outcome: ${summary.outcome}`,
    `Tests run: ${ran}, passed: ${passing}, failed: ${failing}`,
    `Org wide coverage: ${Number.isFinite(coverage) ? coverage + "%" : "unknown"} (minimum ${min}%)`
  ];
  let ok = true;
  if (!Number.isFinite(ran) || ran === 0) {
    lines.push("FAIL: no tests ran.");
    ok = false;
  }
  if (!Number.isFinite(failing) || failing > 0) {
    lines.push("FAIL: at least one test failed.");
    // Name each failure, so a red run can be read from its log alone.
    const tests = (parsed.result && parsed.result.tests) || [];
    tests
      .filter((test) => test.Outcome && test.Outcome !== "Pass")
      .forEach((test) => {
        const name = `${(test.ApexClass && test.ApexClass.Name) || "?"}.${test.MethodName}`;
        const message = String(test.Message || "")
          .replace(/\s+/g, " ")
          .slice(0, 300);
        lines.push(`  ${test.Outcome}: ${name}: ${message}`);
      });
    ok = false;
  }
  if (!Number.isFinite(coverage)) {
    lines.push(
      "FAIL: the run reported no org wide coverage. Pass --code-coverage."
    );
    ok = false;
  } else if (coverage < min) {
    lines.push(`FAIL: org wide coverage ${coverage}% is below ${min}%.`);
    ok = false;
  }
  return { ok, lines };
}

function main() {
  const args = readArgs(process.argv.slice(2));
  const min = args.min === undefined ? DEFAULT_MIN : Number(args.min);
  if (!Number.isFinite(min)) {
    console.error("--min must be a number.");
    process.exit(2);
  }
  let raw;
  if (args.file) {
    raw = fs.existsSync(args.file) ? fs.readFileSync(args.file, "utf8") : "";
  } else if (args["target-org"]) {
    raw = runTests(args["target-org"]);
  } else {
    console.error(
      "Name the org or the result file: --target-org <alias> or --file <json>. The CLI default org is never used."
    );
    process.exit(2);
  }
  const { ok, lines } = evaluate(raw, min);
  lines.forEach((line) => console.log(line));
  console.log(ok ? "Coverage gate PASSED" : "Coverage gate FAILED");
  process.exit(ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { evaluate, readArgs };

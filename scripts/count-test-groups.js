#!/usr/bin/env node
/* eslint-disable no-console */

// Test group counter. Counts the Apex test methods and the Jest tests in this repository,
// puts every Apex test class and every Jest suite into one group from scripts/test-groups.json,
// and writes the result to the file the numbers panel reads, lwc/byTheNumbers/testGroups.js.
//
//   node scripts/count-test-groups.js           count and rewrite testGroups.js with today's date
//   node scripts/count-test-groups.js --check   exit 1 when testGroups.js differs from the repo
//
//   --jest-json <file>   read the results of a Jest run made with --json instead of running Jest
//   --date YYYY-MM-DD    the date to write instead of today
//
// Apex: a test method is a method marked @IsTest (or written with the testMethod keyword) in a
// class file under a classes folder. The @IsTest on a class itself is not counted. Jest: the
// count is the number of tests Jest itself reports, so a data driven it.each counts once per row.
// The check ignores the date, so a repository that has not changed does not fail on a new day.
//
// Groups come from scripts/test-groups.json. A pattern is a class name or a Jest suite id
// (component folder and file, like apiTester/apiTesterParams) where * matches any run of
// characters. The script fails and names the file when a test class or suite matches no group or
// more than one, and when a pattern matches nothing.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PACKAGES = path.join(ROOT, "packages");
const MAPPING_FILE = path.join(__dirname, "test-groups.json");
const OUTPUT_FILE = path.join(
  PACKAGES,
  "portfolio-site",
  "main",
  "default",
  "lwc",
  "byTheNumbers",
  "testGroups.js"
);

const SKIP_FOLDERS = new Set(["node_modules", ".git", ".sfdx", ".sf"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_FOLDERS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

/** Apex source with comments blanked and string contents emptied, so neither can fake a match. */
function stripApex(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "")
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

/** The number of test methods in one Apex source file. */
function countApexMethods(source) {
  const text = stripApex(source);
  let count = 0;
  // An @IsTest annotation (with or without arguments) followed by a declaration. If the
  // declaration says class it marks a test class, and if it has a parameter list it is a method.
  const annotated = /@isTest(?:\s*\([^)]*\))?([^{;]*?)(\{|;)/gi;
  let match;
  while ((match = annotated.exec(text))) {
    if (/\bclass\b/i.test(match[1])) continue;
    if (/\(/.test(match[1])) count++;
  }
  // The older form: static testMethod void name().
  const keyword =
    /(^|[^@\w])\s*(?:static\s+)?testMethod\s+(?:static\s+)?void\s+\w+\s*\(/gi;
  while (keyword.exec(text)) count++;
  return count;
}

/** Every Apex class file that holds at least one test method. */
function collectApex(root = PACKAGES) {
  return walk(root)
    .filter((file) => /[\\/]classes[\\/][^\\/]+\.cls$/.test(file))
    .map((file) => ({
      id: path.basename(file, ".cls"),
      file: rel(file),
      tests: countApexMethods(fs.readFileSync(file, "utf8"))
    }))
    .filter((item) => item.tests > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Every Jest suite in a --json result, with the tests Jest reports for it. */
function collectJest(results) {
  return results.testResults
    .map((suite) => {
      const file = suite.name.replace(/\\/g, "/");
      const match = file.match(/\/lwc\/([^/]+)\/__tests__\/(.+)\.test\.js$/);
      if (!match) {
        throw new Error(`Jest ran a suite outside lwc/**/__tests__: ${file}`);
      }
      return {
        id: `${match[1]}/${match[2]}`,
        file: file.includes("/packages/")
          ? "packages/" + file.split("/packages/").pop()
          : file,
        tests: suite.assertionResults.length
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function globToRegExp(glob) {
  return new RegExp(
    "^" +
      glob
        .split("*")
        .map((part) => part.replace(/[.+^${}()|[\]\\?]/g, "\\$&"))
        .join(".*") +
      "$"
  );
}

/**
 * Puts each item in exactly one group. Returns the groups with their counts, largest first, and a list of problems. A problem names the file of the item.
 */
function assignGroups(items, groups, patternKey, mappingName) {
  const problems = [];
  const compiled = groups.map((group) => ({
    group,
    patterns: (group[patternKey] || []).map((glob) => ({
      glob,
      regex: globToRegExp(glob),
      used: false
    }))
  }));
  const totals = groups.map(() => 0);

  for (const item of items) {
    const hits = [];
    compiled.forEach((entry, index) => {
      const hit = entry.patterns.filter((p) => p.regex.test(item.id));
      hit.forEach((p) => (p.used = true));
      if (hit.length) hits.push(index);
    });
    if (hits.length === 0) {
      problems.push(
        `${item.file} (${item.id}) is in no group. Add it to ${mappingName}.`
      );
    } else if (hits.length > 1) {
      const names = hits.map((i) => `"${groups[i].name}"`).join(" and ");
      problems.push(
        `${item.file} (${item.id}) is in more than one group: ${names}. Fix ${mappingName}.`
      );
    } else {
      totals[hits[0]] += item.tests;
    }
  }

  compiled.forEach((entry) =>
    entry.patterns
      .filter((p) => !p.used)
      .forEach((p) =>
        problems.push(
          `${mappingName} group "${entry.group.name}" has the pattern "${p.glob}", which matches nothing.`
        )
      )
  );

  return {
    // Largest group first, as the panel has always listed them. A tie keeps the mapping order.
    groups: groups
      .map((group, index) => ({
        name: group.name,
        tests: totals[index],
        index
      }))
      .sort((a, b) => b.tests - a.tests || a.index - b.index)
      .map(({ name, tests }) => ({ name, tests })),
    problems
  };
}

const HEADER = `/**
 * @description       : The test groups the numbers panel lists under "What the tests
 *                      cover", counted from the repository's test files on the date below.
 *                      Apex counts are the test methods in each group of test classes. Jest
 *                      counts are the tests in each group of component suites. The groups
 *                      add up to the totals. Written by scripts/count-test-groups.js from
 *                      scripts/test-groups.json, so recount with that script and do not edit
 *                      the numbers by hand.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
`;

function renderGroups(name, groups) {
  const rows = groups
    .map(
      (g) =>
        `  {\n    name: ${JSON.stringify(g.name)},\n    tests: ${g.tests}\n  }`
    )
    .join(",\n");
  return `export const ${name} = [\n${rows}\n];\n`;
}

/** The text of testGroups.js. */
function renderFile(date, apexGroups, jestGroups) {
  return (
    HEADER +
    `export const COUNTED_ON = ${JSON.stringify(date)};\n\n` +
    renderGroups("APEX_GROUPS", apexGroups) +
    "\n" +
    renderGroups("JEST_GROUPS", jestGroups)
  );
}

/** Line endings made LF and the date line blanked, so only counts and groups are compared. */
function withoutDate(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^export const COUNTED_ON = .*$/m, "export const COUNTED_ON = X;");
}

function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function sum(groups) {
  return groups.reduce((total, g) => total + g.tests, 0);
}

function runJest() {
  const out = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "test-groups-")),
    "jest.json"
  );
  const result = spawnSync(
    `npx sfdx-lwc-jest -- --json --outputFile="${out}"`,
    {
      cwd: ROOT,
      shell: true,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024
    }
  );
  if (!fs.existsSync(out)) {
    throw new Error(
      `Jest did not write its results.\n${result.stdout || ""}${result.stderr || ""}`
    );
  }
  return JSON.parse(fs.readFileSync(out, "utf8"));
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
}

function main(argv) {
  const check = argv.includes("--check");
  const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8"));
  const mappingName = rel(MAPPING_FILE);

  const jestFile = option(argv, "--jest-json");
  let results;
  try {
    results = jestFile
      ? JSON.parse(fs.readFileSync(jestFile, "utf8"))
      : runJest();
  } catch (error) {
    console.error(`Test group count FAILED: ${error.message}`);
    return 1;
  }
  if (results.numFailedTests > 0 || results.numFailedTestSuites > 0) {
    console.error(
      `Test group count FAILED: Jest reports ${results.numFailedTests} failing tests and ${results.numFailedTestSuites} failing suites. Fix them first, because a failing suite can hide tests.`
    );
    return 1;
  }

  const apex = assignGroups(
    collectApex(),
    mapping.apex,
    "classes",
    mappingName
  );
  const jest = assignGroups(
    collectJest(results),
    mapping.jest,
    "suites",
    mappingName
  );
  const problems = [...apex.problems, ...jest.problems];
  if (problems.length) {
    console.error(`Test group count FAILED (${problems.length} problems):`);
    problems.forEach((problem) => console.error(`- ${problem}`));
    return 1;
  }

  const date = option(argv, "--date") || today();
  const next = renderFile(date, apex.groups, jest.groups);
  const outName = rel(OUTPUT_FILE);

  if (check) {
    const current = fs.existsSync(OUTPUT_FILE)
      ? fs.readFileSync(OUTPUT_FILE, "utf8")
      : "";
    if (withoutDate(current) !== withoutDate(next)) {
      console.error(
        `Test group check FAILED: ${outName} does not match the repository (Apex ${sum(apex.groups)}, Jest ${sum(jest.groups)}). Run: node scripts/count-test-groups.js`
      );
      return 1;
    }
    console.log(
      `Test group check passed: ${outName} matches ${sum(apex.groups)} Apex tests in ${apex.groups.length} groups and ${sum(jest.groups)} Jest tests in ${jest.groups.length} groups.`
    );
    return 0;
  }

  fs.writeFileSync(OUTPUT_FILE, next);
  console.log(
    `Wrote ${outName} counted on ${date}: ${sum(apex.groups)} Apex tests and ${sum(jest.groups)} Jest tests.`
  );
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  countApexMethods,
  collectJest,
  assignGroups,
  renderFile,
  withoutDate,
  globToRegExp
};

#!/usr/bin/env node
/* eslint-disable no-console */

// Says whether a pull request's preview build must read production (owner decision P-D60).
// A preview build uses the fixtures, except when the pull request changes the export, the
// build or the resume snapshot. Then it still reads production, so the change is tried on
// real data before it merges.
//
//   node scripts/export-needs-production.js [--base origin/main] [--files <file>]
//
//   --base <ref>    compare HEAD with this ref, as git diff --name-only <ref>...HEAD.
//                   Default origin/main
//   --files <file>  read the changed paths from this file, one per line, instead of git.
//                   A dash reads them from standard input
//
// It prints one plain line naming the first matching path, and writes production=true or
// production=false to GITHUB_OUTPUT when that is set. Exit 0 either way, 3 when the changed
// files could not be read, 4 on a bad argument. When the list cannot be read the safe answer
// for the budget is fixtures, so the output then says production=false.
//
// The areas that count, and why:
//   web/build/**                      the build and the export themselves
//   web/fixtures/**                   the sample data a preview would otherwise use
//   web/functions/_generated/**       files the build writes for the functions
//   web/src/shims/site-data.js        read by the export to name each read
//   web/src/shims/graphql.js          read by the export to shape each GraphQL read
//   web/package.json, package-lock    the build's own tools
//   .github/workflows/site.yml        the workflow that runs the build
//   packages/**/classes/SiteExport*   the allowlisted export endpoint (/site/export)
//   packages/**/classes/ResumeSnapshotService*  the resume snapshot the build exports
//   packages/**/classes/<Controller>.cls for every class SiteExportCalls serves, read from
//                                     its PARAMS_BY_CALL block, because each one answers an
//                                     export call
// A test class of one of those controllers does not count, as it changes no exported data.
// Components (lwc) do not count either, as a component change previews well on fixtures.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ALLOWLIST_FILE = path.join(
  ROOT,
  "packages/portfolio-site/main/default/classes/SiteExportCalls.cls"
);
const EXIT = Object.freeze({ OK: 0, READ_FAILED: 3, USAGE: 4 });

const FIXED_RULES = Object.freeze([
  { area: "the build", test: (p) => p.startsWith("web/build/") },
  { area: "the fixtures", test: (p) => p.startsWith("web/fixtures/") },
  {
    area: "the generated function files",
    test: (p) => p.startsWith("web/functions/_generated/")
  },
  {
    area: "a file the export reads",
    test: (p) =>
      p === "web/src/shims/site-data.js" || p === "web/src/shims/graphql.js"
  },
  {
    area: "the build tools",
    test: (p) => p === "web/package.json" || p === "web/package-lock.json"
  },
  {
    area: "the site workflow",
    test: (p) => p === ".github/workflows/site.yml"
  },
  {
    area: "the export endpoint",
    test: (p) => /^packages\/.+\/classes\/SiteExport[^/]*$/.test(p)
  },
  {
    area: "the resume snapshot",
    test: (p) => /^packages\/.+\/classes\/ResumeSnapshotService[^/]*$/.test(p)
  }
]);

/** The class names in SiteExportCalls.PARAMS_BY_CALL, like ResumeController. */
function exportedClasses(source) {
  const start = source.indexOf("PARAMS_BY_CALL");
  if (start < 0) return [];
  const block = source.slice(start, source.indexOf("};", start));
  const names = [
    ...block.matchAll(/'([A-Za-z0-9_]+)\.[A-Za-z0-9_]+'\s*=>/g)
  ].map((match) => match[1]);
  return [...new Set(names)].sort();
}

/** Every rule, the fixed ones and one per exported class. */
function rules(classes) {
  return [
    ...FIXED_RULES,
    ...classes.map((name) => ({
      area: `the export call class ${name}`,
      test: (p) => {
        const match =
          /^packages\/.+\/classes\/([A-Za-z0-9_]+)\.cls(-meta\.xml)?$/.exec(p);
        return Boolean(match) && match[1] === name;
      }
    }))
  ];
}

/** The first changed path that needs production, as { path, area }, or null. */
function needsProduction(paths, classes) {
  const all = rules(classes);
  for (const raw of paths) {
    const p = String(raw).trim().replace(/\\/g, "/");
    if (!p) continue;
    const rule = all.find((entry) => entry.test(p));
    if (rule) return { path: p, area: rule.area };
  }
  return null;
}

function parseArgs(argv) {
  const options = { base: "origin/main", files: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--base" || arg === "--files") && next !== undefined) {
      options[arg.slice(2)] = next;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument ${arg}.`);
    }
  }
  return options;
}

function gitChanged(base, run) {
  const outcome = run("git", ["diff", "--name-only", `${base}...HEAD`]);
  if (outcome.status !== 0)
    throw new Error(
      `git diff against ${base} failed (${String(outcome.stderr || "")
        .trim()
        .slice(0, 200)})`
    );
  return String(outcome.stdout || "").split(/\r?\n/);
}

function defaultRun(file, args) {
  return spawnSync(file, args, { cwd: ROOT, encoding: "utf8" });
}

function main(argv, deps = {}) {
  const env = deps.env || process.env;
  const log = deps.log || console.log;
  const run = deps.run || defaultRun;
  const readFile = deps.readFile || ((file) => fs.readFileSync(file, "utf8"));
  const appendFile = deps.appendFile || fs.appendFileSync;
  const write = (value) => {
    if (env.GITHUB_OUTPUT)
      appendFile(env.GITHUB_OUTPUT, `production=${value}\n`);
  };

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    log(`Preview data not decided: ${error.message}`);
    return EXIT.USAGE;
  }
  let paths;
  let classes;
  try {
    paths = options.files
      ? readFile(options.files === "-" ? 0 : options.files).split(/\r?\n/)
      : gitChanged(options.base, run);
    classes = exportedClasses(readFile(ALLOWLIST_FILE));
  } catch (error) {
    log(`Preview data not decided, so it uses the fixtures: ${error.message}`);
    write("false");
    return EXIT.READ_FAILED;
  }
  const hit = needsProduction(paths, classes);
  if (hit) {
    log(`Preview reads production: ${hit.path} changes ${hit.area}.`);
    write("true");
  } else {
    log(
      "Preview uses the fixtures: nothing in this change touches the export, the build or the snapshot."
    );
    write("false");
  }
  return EXIT.OK;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  EXIT,
  ALLOWLIST_FILE,
  FIXED_RULES,
  exportedClasses,
  needsProduction,
  parseArgs,
  main
};

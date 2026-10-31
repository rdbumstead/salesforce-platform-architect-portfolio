#!/usr/bin/env node
/* eslint-disable no-console */

// Runs on this machine the checks that the quality-check job in .github/workflows/pr.yml runs,
// in the same order and with the same arguments, so a push does not fail in CI on a check that
// never ran here.
//
//   node scripts/ci-local.js [--changed]   steps whose paths changed against origin/main (default)
//   node scripts/ci-local.js --all         every step
//   node scripts/ci-local.js --list        the steps and whether each would run
//
// Changed means committed since the merge base with origin/main, plus staged, unstaged and
// untracked files. Every selected step runs even after one fails, so one pass shows every
// failure. A command that cannot run here is reported as SKIPPED and listed again in the
// summary, never counted as a pass. scripts/ci-local.test.js fails when pr.yml gains a command
// that no step here mirrors.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const MERMAID_INSTALL =
  'PUPPETEER_SKIP_DOWNLOAD=1 npm install --prefix "$RUNNER_TEMP/mmd" --no-save --no-audit --no-fund @mermaid-js/mermaid-cli@12.0.0 puppeteer@25.16.0, then set MERMAID_CLI_DIR to that folder';

/**
 * Each step has a name, the paths that make it relevant (globs, ** crosses folders, * does not)
 * and its commands. A command's `ci` text is the command line as pr.yml writes it, without any
 * leading environment setting. `local` marks a command CI does not list. `special` names a
 * command that needs more than a plain run.
 */
const STEPS = [
  {
    name: "Secret scan",
    paths: ["**"],
    commands: [{ ci: "npm run scan:secrets" }]
  },
  {
    name: "Jest",
    paths: [
      "packages/**/lwc/**",
      "config/jest*",
      "config/jest/**",
      "package.json",
      "package-lock.json"
    ],
    commands: [{ ci: "npm run test:unit" }]
  },
  {
    name: "API docs are current",
    paths: [
      "packages/integration-api/specs/**",
      "docs/api/**",
      "scripts/generate-api-docs.js"
    ],
    commands: [{ ci: "npm run docs:verify", special: "api-docs" }]
  },
  {
    name: "Internal references",
    paths: [
      "packages/**",
      "docs/**",
      "README.md",
      "STATUS.md",
      "scripts/check-internal-refs*",
      "scripts/internal-refs-allowlist.json"
    ],
    commands: [
      { ci: "node --test scripts/check-internal-refs.test.js" },
      {
        ci: "node scripts/check-internal-refs.js packages docs README.md STATUS.md"
      }
    ]
  },
  {
    name: "Smoke routes",
    paths: [
      "packages/**/digitalExperiences/**",
      "packages/**/lwc/**",
      "scripts/live-smoke.js",
      "scripts/check-smoke-routes*"
    ],
    commands: [
      { ci: "node --test scripts/check-smoke-routes.test.js" },
      { ci: "node scripts/check-smoke-routes.js" }
    ]
  },
  {
    name: "Postman collection",
    paths: [
      "packages/integration-api/specs/**",
      "scripts/build-postman-collection*",
      "scripts/postman-sync.js",
      "package.json",
      "package-lock.json"
    ],
    commands: [
      { ci: "node --test scripts/build-postman-collection.test.js" },
      {
        ci: "node scripts/build-postman-collection.js --check",
        special: "postman-check"
      },
      { ci: "node scripts/postman-sync.js probe", special: "postman-probe" }
    ]
  },
  {
    name: "Mermaid diagrams",
    paths: [
      "docs/**/*.md",
      "scripts/render-mermaid*",
      "scripts/check-mermaid-alt.js",
      "packages/**/lwc/docsViewer/**"
    ],
    commands: [
      { ci: "node --test scripts/render-mermaid.test.js" },
      // Not a separate CI command. The render test enforces the same rule in CI.
      { local: "node scripts/check-mermaid-alt.js" },
      { ci: "node scripts/render-mermaid.js", special: "mermaid-render" }
    ]
  },
  {
    name: "Code analyzer",
    paths: [
      "packages/**/*.cls",
      "packages/**/*.trigger",
      "packages/**/lwc/**/*.js",
      "packages/**/aura/**/*.js",
      "packages/**/*.flow-meta.xml",
      "config/code-analyzer.yml"
    ],
    commands: [{ ci: "npm run scan" }]
  }
];

/** A glob as a regular expression. ** crosses folders, * stays inside one name. */
function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          out += "(?:.*/)?";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else {
      out += c.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
    }
  }
  return new RegExp("^" + out + "$");
}

/** True when the step has a path glob that matches any of the files. */
function matches(step, files) {
  const patterns = step.paths.map(globToRegExp);
  return files.some((file) => patterns.some((p) => p.test(file)));
}

/** The steps a set of changed files selects. */
function selectSteps(files, steps = STEPS) {
  return steps.filter((step) => matches(step, files));
}

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}

/** Files changed against the merge base with origin/main, plus staged, unstaged and untracked. */
function changedFiles() {
  const base = git(["merge-base", "HEAD", "origin/main"]);
  if (base === null) return null;
  const files = new Set();
  const add = (text) =>
    (text || "")
      .split("\n")
      .map((l) => l.trim().replace(/\\/g, "/"))
      .filter(Boolean)
      .forEach((l) => files.add(l));
  add(git(["diff", "--name-only", base.trim(), "HEAD"]));
  add(git(["diff", "--name-only", "--cached"]));
  add(git(["diff", "--name-only"]));
  add(git(["ls-files", "--others", "--exclude-standard"]));
  return [...files];
}

function findChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  ].filter(Boolean);
  return candidates.find((file) => fs.existsSync(file)) || null;
}

const NETWORK_ERROR =
  /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|fetch failed|getaddrinfo|network|socket hang up/i;

// A git hook runs with GIT_DIR and friends set to this repo. A test that builds its own
// temporary repo then talks to this one instead, so every check runs without them, as
// it does in a clean CI checkout.
const GIT_HOOK_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_PREFIX",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_QUARANTINE_PATH"
];

/** The environment a check runs in: this one, less the variables a git hook sets. */
function checkEnv(base = process.env, extra = {}) {
  const env = { ...base, ...extra };
  GIT_HOOK_VARS.forEach((name) => delete env[name]);
  return env;
}

function exec(command, env) {
  const result = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    env: checkEnv(process.env, env),
    maxBuffer: 64 * 1024 * 1024
  });
  return {
    code: result.status === null ? 1 : result.status,
    output: (result.stdout || "") + (result.stderr || "")
  };
}

/** Runs one command. Returns { status: "PASS"|"FAIL"|"SKIPPED", output, note }. */
function runCommand(command) {
  const text = command.ci || command.local;
  const done = (result) => ({
    status: result.code === 0 ? "PASS" : "FAIL",
    output: result.output
  });

  if (command.special === "postman-check") {
    const dir = process.env.OPENAPI_TO_POSTMAN_DIR;
    const installed = dir
      ? fs.existsSync(path.resolve(dir))
      : fs.existsSync(path.join(ROOT, "node_modules", "openapi-to-postmanv2"));
    if (!installed) {
      return {
        status: "SKIPPED",
        note: "run npm install (openapi-to-postmanv2 is a dev dependency)",
        output: ""
      };
    }
    return done(exec(text));
  }

  if (command.special === "postman-probe") {
    const result = exec(text);
    if (result.code !== 0 && NETWORK_ERROR.test(result.output)) {
      return {
        status: "SKIPPED",
        note: "offline, Postman could not be reached",
        output: result.output
      };
    }
    return done(result);
  }

  if (command.special === "api-docs") {
    // The generator writes LF, and on Windows git status then shows the pages as changed
    // with no real difference (git diff shows nothing). Put back only pages whose whole
    // difference is line endings.
    const result = exec(text);
    (git(["status", "--porcelain", "--", "docs/api/oas"]) || "")
      .split("\n")
      .filter((l) => l.startsWith(" M "))
      .map((l) => l.slice(3).trim())
      .forEach((file) => {
        const only = spawnSync(
          "git",
          ["diff", "--ignore-cr-at-eol", "--quiet", "--", file],
          { cwd: ROOT }
        );
        if (only.status === 0) git(["checkout", "--", file]);
      });
    return done(result);
  }

  if (command.special === "mermaid-render") {
    const cli = process.env.MERMAID_CLI_DIR;
    const chrome = findChrome();
    if (!cli || !chrome) {
      const missing = [
        !cli && "MERMAID_CLI_DIR is not set",
        !chrome && "no Chrome or Edge found"
      ].filter(Boolean);
      return {
        status: "SKIPPED",
        note: `${missing.join(" and ")}. Install with: ${MERMAID_INSTALL}`,
        output: ""
      };
    }
    return done(exec(text, { PUPPETEER_EXECUTABLE_PATH: chrome }));
  }

  return done(exec(text));
}

function runStep(step) {
  const started = Date.now();
  let failed = false;
  const skips = [];
  const outputs = [];
  for (const command of step.commands) {
    const text = command.ci || command.local;
    const result = runCommand(command);
    if (result.status === "FAIL") {
      failed = true;
      outputs.push(`$ ${text}\n${result.output}`);
    } else if (result.status === "SKIPPED") {
      skips.push(`${text}: ${result.note}`);
    }
  }
  let status = "PASS";
  if (failed) status = "FAIL";
  else if (skips.length === step.commands.length) status = "SKIPPED";
  else if (skips.length) status = "PARTIAL";
  return {
    name: step.name,
    status,
    seconds: (Date.now() - started) / 1000,
    skips,
    output: outputs.join("\n")
  };
}

function main(argv) {
  const list = argv.includes("--list");
  let selected;
  let basis;
  if (argv.includes("--all")) {
    selected = STEPS;
    basis = "all steps";
  } else {
    const files = changedFiles();
    if (files === null) {
      selected = STEPS;
      basis = "origin/main not found, so all steps";
    } else {
      selected = selectSteps(files);
      basis = `${files.length} changed file(s) against origin/main`;
    }
  }

  if (list) {
    console.log(`ci-local steps (${basis})`);
    STEPS.forEach((step) => {
      console.log(
        `  ${selected.includes(step) ? "RUN " : "skip"}  ${step.name}`
      );
      step.commands.forEach((c) => console.log(`          ${c.ci || c.local}`));
    });
    return 0;
  }

  console.log(
    `ci-local: ${selected.length} of ${STEPS.length} steps (${basis})`
  );
  const results = [];
  for (const step of selected) {
    console.log(`\n[RUN ] ${step.name}`);
    const result = runStep(step);
    results.push(result);
    if (result.output) console.log(result.output.trimEnd());
    result.skips.forEach((s) => console.log(`  SKIPPED: ${s}`));
    console.log(
      `[${result.status}] ${result.name} (${result.seconds.toFixed(1)}s)`
    );
  }

  const failed = results.filter((r) => r.status === "FAIL");
  const skipped = results.filter((r) => r.skips.length);
  console.log("\nSummary");
  results.forEach((r) =>
    console.log(`  ${r.status.padEnd(8)} ${r.name} (${r.seconds.toFixed(1)}s)`)
  );
  if (skipped.length) {
    console.log("\nSkipped, not passed:");
    skipped.forEach((r) =>
      r.skips.forEach((s) => console.log(`  ${r.name}: ${s}`))
    );
  }
  const passed = results.filter((r) => r.status === "PASS").length;
  console.log(
    `\n${passed} passed, ${failed.length} failed, ${skipped.length} with skips, ${STEPS.length - selected.length} not selected`
  );
  if (failed.length) {
    console.log(`FAILED: ${failed.map((r) => r.name).join(", ")}`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { STEPS, globToRegExp, matches, selectSteps, checkEnv };

#!/usr/bin/env node
/* eslint-disable no-console */

// Makes a scratch org ready to walk the public site, in one command.
//
//   node scripts/scratch-ready.js --alias <alias> [--days 14] [--dev-hub spap-portfolio]
//                                 [--skip-mermaid] [--dry-run]
//
// Steps, in order. The run stops at the first one that fails and says which:
//   1. preflight    reads the Dev Hub's scratch limits and the known org aliases
//   2. create       a scratch org from config/project-scratch-def-ai.json
//   3. deploy       the whole packages folder
//   4. admin        assigns Portfolio_Admin to the org's admin, which the seed import needs
//   5. guest        assigns Portfolio_Guest to the Portfolio1 site's guest user
//   6. seed         imports the plans in data/, then the docs cache rows built from docs/
//   7. mermaid      draws the docs diagrams and deploys them (skipped, with a warning, when
//                   the drawing tools or a Chrome are missing)
//   8. publish      publishes the site, then prints its URL and the org Id
//
// It never touches the production org. The alias spap-portfolio, the alias portfolio and the
// production org Id are refused up front, and every sf call names its org with --target-org
// (the create names the Dev Hub with --target-dev-hub).
//
// Environment: CHROME_PATH or PUPPETEER_EXECUTABLE_PATH is the Chrome the diagrams are drawn
// with. MERMAID_CLI_DIR is an existing folder with @mermaid-js/mermaid-cli installed, else
// the script installs it into a temp folder.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PRODUCTION_ALIASES = Object.freeze(["spap-portfolio", "portfolio"]);
const PRODUCTION_ORG_ID = "00Dfj00000FSoCXEA1";
const DEFINITION = "config/project-scratch-def-ai.json";
const SEED_PLANS = Object.freeze([
  "data/site/plan.json",
  "data/home/plan.json",
  "data/delivery/plan.json",
  "data/pillars/plan-a.json",
  "data/pillars/plan-b.json"
]);
const SITE_NAME = "Portfolio";
const SITE_ENTRY = "Portfolio1";
const MERMAID_CLI = "@mermaid-js/mermaid-cli@12.0.0";
const PUPPETEER = "puppeteer@25.16.0";
const MAX_PARTS = 8;
const MAX_LENGTH = 131072;
const STEPS = Object.freeze([
  "preflight",
  "create",
  "deploy",
  "admin",
  "guest",
  "seed",
  "mermaid",
  "publish"
]);

class StepError extends Error {
  constructor(step, message) {
    super(message);
    this.step = step;
  }
}

/** Reads the command line. Throws a plain Error for anything not allowed. */
function parseArgs(argv) {
  const options = {
    alias: "",
    days: 14,
    devHub: "spap-portfolio",
    skipMermaid: false,
    dryRun: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--alias") {
      options.alias = argv[++i] || "";
    } else if (arg === "--days") {
      options.days = Number(argv[++i]);
    } else if (arg === "--dev-hub") {
      options.devHub = argv[++i] || "";
    } else if (arg === "--skip-mermaid") {
      options.skipMermaid = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(options.alias)) {
    throw new Error("--alias is required, for example --alias r22-org");
  }
  if (PRODUCTION_ALIASES.includes(options.alias.toLowerCase())) {
    throw new Error(
      `Refusing alias ${options.alias}: it is the production org. Pick a scratch alias.`
    );
  }
  if (
    !Number.isInteger(options.days) ||
    options.days < 1 ||
    options.days > 30
  ) {
    throw new Error("--days must be a whole number from 1 to 30");
  }
  if (!options.devHub) {
    throw new Error("--dev-hub needs an alias");
  }
  return options;
}

function quote(arg) {
  return /[\s"'<>&|^%]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/** Runs sf for real. Returns the parsed --json body, or throws if there is none. */
function runSf(args) {
  const full = [...args, "--json"];
  const windows = process.platform === "win32";
  const res = spawnSync(
    windows ? `sf ${full.map(quote).join(" ")}` : "sf",
    windows ? [] : full,
    { cwd: ROOT, encoding: "utf8", shell: windows, maxBuffer: 64 * 1024 * 1024 }
  );
  const out = res.stdout || "";
  const start = out.indexOf("{");
  if (start < 0) {
    throw new Error(
      `sf ${args.slice(0, 3).join(" ")} printed no JSON. ${(res.stderr || "").trim().slice(0, 300)}`
    );
  }
  // Under Git Bash every sf call exits 1, so the body's status is the result, not the exit code.
  return JSON.parse(out.slice(start));
}

/** Calls sf and turns a failed body into a StepError for the step. */
function call(deps, step, args) {
  const body = deps.sf(args);
  if (!body || body.status !== 0) {
    const detail = body && (body.message || body.name || "no message");
    throw new StepError(
      step,
      `sf ${args.slice(0, 3).join(" ")} failed: ${detail}`
    );
  }
  return body.result;
}

/** Splits text into pieces for Content__c, never leaving whitespace at a cut. */
function splitContent(text) {
  const parts = [];
  let rest = text;
  while (rest.length > MAX_LENGTH && parts.length < MAX_PARTS) {
    let cut = MAX_LENGTH;
    while (
      cut > 1 &&
      (/\s/.test(rest[cut - 1]) ||
        /\s/.test(rest[cut]) ||
        /[\uD800-\uDBFF]/.test(rest[cut - 1]))
    ) {
      cut--;
    }
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  parts.push(rest);
  return parts;
}

/** The paths of every docs record in the Source_File custom metadata. */
function docPaths(root = ROOT) {
  const dir = path.join(
    root,
    "packages/portfolio-site/main/default/customMetadata"
  );
  const found = [];
  if (!fs.existsSync(dir)) {
    return found;
  }
  for (const name of fs.readdirSync(dir)) {
    if (!/^Source_File\.docs_.*\.md-meta\.xml$/.test(name)) {
      continue;
    }
    const xml = fs.readFileSync(path.join(dir, name), "utf8");
    const match = /<field>Path__c<\/field>\s*<value[^>]*>([^<]+)<\/value>/.exec(
      xml
    );
    if (match) {
      found.push(match[1].trim());
    }
  }
  return found.sort();
}

/** The tree import plan and data file for the docs cache. Returns null when no doc exists. */
function buildDocsPlan(outDir, root = ROOT, now = new Date()) {
  const records = [];
  for (const docPath of docPaths(root)) {
    const file = path.join(root, docPath);
    if (!fs.existsSync(file)) {
      continue;
    }
    const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    splitContent(text).forEach((content, index) => {
      records.push({
        attributes: {
          type: "Source_Cache__c",
          referenceId: `Doc${records.length + 1}Ref`
        },
        Path__c: index === 0 ? docPath : `${docPath}#part-${index + 1}`,
        Content__c: content,
        Html_Url__c: `https://example.com/${docPath}`,
        Fetched_At__c: now.toISOString(),
        Checked_At__c: now.toISOString(),
        Last_Status__c: "200",
        Truncated__c: false
      });
    });
  }
  if (records.length === 0) {
    return null;
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "Source_Cache__c.json"),
    JSON.stringify({ records })
  );
  const plan = path.join(outDir, "plan.json");
  fs.writeFileSync(
    plan,
    JSON.stringify([
      {
        sobject: "Source_Cache__c",
        saveRefs: false,
        resolveRefs: false,
        files: ["Source_Cache__c.json"]
      }
    ])
  );
  return { plan, count: records.length };
}

/** The path prefix live-smoke wants. A publish names the .../portfoliovforcesite address. */
function siteBase(url) {
  return url.replace(/\/portfoliovforcesite\/?$/, "/portfolio");
}

function preflight(deps, options) {
  const limits = call(deps, "preflight", [
    "limits",
    "api",
    "display",
    "--target-org",
    options.devHub
  ]);
  const remaining = (name) =>
    (limits.find((row) => row.name === name) || {}).remaining;
  const active = remaining("ActiveScratchOrgs");
  const daily = remaining("DailyScratchOrgs");
  // One active slot stays free for CI's PR validation.
  if (!(active >= 2) || !(daily >= 2)) {
    throw new StepError(
      "preflight",
      `Not enough scratch org slots (ActiveScratchOrgs remaining ${active}, DailyScratchOrgs remaining ${daily}). Need at least 2 of each.`
    );
  }
  const list = deps.sf(["org", "list"]);
  const orgs = (list && list.result) || {};
  const known = [...(orgs.scratchOrgs || []), ...(orgs.nonScratchOrgs || [])];
  if (known.some((org) => org.alias === options.alias)) {
    throw new StepError(
      "preflight",
      `The alias ${options.alias} already exists. Pick another or delete that org first.`
    );
  }
  return { active, daily };
}

function guard(step, display) {
  if (display && display.id === PRODUCTION_ORG_ID) {
    throw new StepError(
      step,
      `Org ${display.id} is the production org. Stopping before any change.`
    );
  }
}

function drawMermaid(deps, options, log) {
  if (options.skipMermaid) {
    log("mermaid: skipped by --skip-mermaid. /docs shows diagram source only.");
    return false;
  }
  const chrome = deps.env.CHROME_PATH || deps.env.PUPPETEER_EXECUTABLE_PATH;
  if (!chrome || !deps.exists(chrome)) {
    log(
      "mermaid: skipped, no Chrome found (set CHROME_PATH). /docs shows diagram source only."
    );
    return false;
  }
  let cliDir = deps.env.MERMAID_CLI_DIR;
  if (!cliDir) {
    cliDir = path.join(os.tmpdir(), "scratch-ready-mmd");
    const installed = deps.npmInstall(cliDir);
    if (!installed) {
      log(
        "mermaid: skipped, the drawing tools did not install. /docs shows diagram source only."
      );
      return false;
    }
  }
  const drawn = deps.render(cliDir, chrome);
  if (!drawn) {
    log(
      "mermaid: skipped, the drawing step failed. /docs shows diagram source only."
    );
  }
  return drawn;
}

function realDeps() {
  return {
    sf: runSf,
    env: process.env,
    exists: (file) => fs.existsSync(file),
    tempDir: () => fs.mkdtempSync(path.join(os.tmpdir(), "scratch-docs-")),
    npmInstall: (dir) => {
      const res = spawnSync(
        process.platform === "win32" ? "npm.cmd" : "npm",
        [
          "install",
          "--prefix",
          dir,
          "--no-save",
          "--no-audit",
          "--no-fund",
          MERMAID_CLI,
          PUPPETEER
        ],
        {
          cwd: ROOT,
          encoding: "utf8",
          shell: process.platform === "win32",
          env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "1" }
        }
      );
      return res.status === 0;
    },
    render: (cliDir, chrome) => {
      const res = spawnSync(
        process.execPath,
        [path.join(ROOT, "scripts/render-mermaid.js")],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            MERMAID_CLI_DIR: cliDir,
            PUPPETEER_EXECUTABLE_PATH: chrome
          }
        }
      );
      return res.status === 0;
    }
  };
}

/** Runs every step. Returns { siteUrl, orgId, steps }. Throws a StepError on the first failure. */
function main(argv, deps = realDeps(), log = console.log) {
  const options = parseArgs(argv);
  const alias = options.alias;
  const done = [];
  const mark = (step) => {
    done.push(step);
    log(`${step}: done`);
  };

  if (options.dryRun) {
    log(`dry run: would run ${STEPS.join(", ")} for alias ${alias}`);
    return { dryRun: true, steps: [] };
  }

  const slots = preflight(deps, options);
  log(
    `preflight: ActiveScratchOrgs remaining ${slots.active}, DailyScratchOrgs remaining ${slots.daily}`
  );
  mark("preflight");

  call(deps, "create", [
    "org",
    "create",
    "scratch",
    "--target-dev-hub",
    options.devHub,
    "--definition-file",
    DEFINITION,
    "--alias",
    alias,
    "--duration-days",
    String(options.days),
    "--no-ancestors",
    "--wait",
    "30"
  ]);
  const display = call(deps, "create", [
    "org",
    "display",
    "--target-org",
    alias
  ]);
  guard("create", display);
  log(
    `create: ${alias} ${display.id}, expires ${display.expirationDate || "unknown"}`
  );
  mark("create");

  // The AI definition creates its own sfdc_aiplanner_service_permset, which source tracking
  // reports as a conflict with ours. The source version wins, as pr.yml does.
  call(deps, "deploy", [
    "project",
    "deploy",
    "start",
    "--source-dir",
    "packages",
    "--target-org",
    alias,
    "--ignore-conflicts",
    "--wait",
    "30"
  ]);
  mark("deploy");

  call(deps, "admin", [
    "org",
    "assign",
    "permset",
    "--name",
    "Portfolio_Admin",
    "--target-org",
    alias
  ]);
  mark("admin");

  const site = call(deps, "guest", [
    "data",
    "query",
    "--target-org",
    alias,
    "--query",
    `SELECT GuestUserId FROM Site WHERE Name = '${SITE_ENTRY}'`
  ]);
  const guestId =
    site.records && site.records[0] && site.records[0].GuestUserId;
  if (!guestId) {
    throw new StepError(
      "guest",
      `No guest user found for the ${SITE_ENTRY} site.`
    );
  }
  const user = call(deps, "guest", [
    "data",
    "query",
    "--target-org",
    alias,
    "--query",
    `SELECT Username FROM User WHERE Id = '${guestId}'`
  ]);
  const guestName = user.records && user.records[0] && user.records[0].Username;
  if (!guestName) {
    throw new StepError("guest", `Guest user ${guestId} has no username.`);
  }
  call(deps, "guest", [
    "org",
    "assign",
    "permset",
    "--name",
    "Portfolio_Guest",
    "--on-behalf-of",
    guestName,
    "--target-org",
    alias
  ]);
  mark("guest");

  for (const plan of SEED_PLANS) {
    call(deps, "seed", [
      "data",
      "import",
      "tree",
      "--plan",
      plan,
      "--target-org",
      alias
    ]);
  }
  const docs = buildDocsPlan(deps.tempDir());
  if (docs) {
    call(deps, "seed", [
      "data",
      "import",
      "tree",
      "--plan",
      docs.plan,
      "--target-org",
      alias
    ]);
    log(`seed: ${SEED_PLANS.length} plans and ${docs.count} docs cache rows`);
  } else {
    log(`seed: ${SEED_PLANS.length} plans, no docs found to cache`);
  }
  mark("seed");

  if (drawMermaid(deps, options, log)) {
    call(deps, "mermaid", [
      "project",
      "deploy",
      "start",
      "--source-dir",
      "packages/portfolio-site/main/default/staticresources/Mermaid_Diagrams.resource-meta.xml",
      "--source-dir",
      "packages/portfolio-site/main/default/staticresources/Mermaid_Diagrams",
      "--target-org",
      alias,
      "--ignore-conflicts",
      "--wait",
      "30"
    ]);
  }
  mark("mermaid");

  const published = call(deps, "publish", [
    "community",
    "publish",
    "--name",
    SITE_NAME,
    "--target-org",
    alias
  ]);
  mark("publish");

  const siteUrl = (published && published.url) || "";
  log(`site URL: ${siteUrl}`);
  log(`SITE_BASE for live-smoke: ${siteBase(siteUrl)}`);
  log(`org Id: ${display.id}`);
  return { siteUrl, orgId: display.id, steps: done };
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const where = error.step ? ` at the ${error.step} step` : "";
    console.error(`scratch-ready: FAIL${where}. ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  main,
  preflight,
  buildDocsPlan,
  docPaths,
  splitContent,
  siteBase,
  StepError,
  STEPS,
  PRODUCTION_ORG_ID,
  PRODUCTION_ALIASES
};

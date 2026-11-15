#!/usr/bin/env node
/* eslint-disable no-console */

// API reserve check. Reads how many daily API requests the org has left and stops a CI job,
// softly, when less than the reserve kept for the public site is left (owner decision P-D59).
//
//   node scripts/api-reserve.js --target-org <alias> [--reserve 0.4] [--need-scratch-org]
//   SF_ACCESS_TOKEN=... SF_INSTANCE_URL=... node scripts/api-reserve.js [--reserve 0.4]
//
//   --target-org <alias>   read the limits through `sf org list limits` for that org
//   --reserve <value>      a share of the daily cap (0.4 is 40 percent) or a whole number of
//                          requests. Default 0.4
//   --need-scratch-org     also needs one daily and one active scratch org left
//   --api-version <v>      the REST version for the token read. Default 62.0
//   --label <text>         a short name for the job, put in front of the line
//
// With no --target-org, the read uses SF_ACCESS_TOKEN and SF_INSTANCE_URL from the
// environment and calls the REST limits resource, /services/data/v<version>/limits.
// Either way it is one GET of that resource, which Salesforce counts as one API request.
//
// It prints one plain line and exits:
//   0  the reserve is intact (and a scratch org is free when asked)
//   2  the reserve is reached, or no scratch org is left. Also when the org refuses the read
//      itself because the daily cap is spent
//   3  the limits could not be read
//   4  the arguments are wrong
// When GITHUB_OUTPUT is set it also writes ok=true or ok=false, reason, remaining, max and
// reserve, so a workflow can skip its later steps.

const fs = require("fs");
const { spawnSync } = require("child_process");

const EXIT = Object.freeze({ OK: 0, RESERVE: 2, READ_FAILED: 3, USAGE: 4 });
const DEFAULT_RESERVE = 0.4;
const DEFAULT_API_VERSION = "62.0";
const LIMIT_REFUSED = /REQUEST_LIMIT_EXCEEDED|TotalRequests Limit exceeded/i;

class UsageError extends Error {}

/** Reads the command line. Throws UsageError on anything it does not know. */
function parseArgs(argv) {
  const options = {
    targetOrg: null,
    reserve: DEFAULT_RESERVE,
    needScratchOrg: false,
    apiVersion: DEFAULT_API_VERSION,
    label: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--"))
        throw new UsageError(`${arg} needs a value.`);
      index += 1;
      return next;
    };
    if (arg === "--target-org") options.targetOrg = value();
    else if (arg === "--reserve") options.reserve = parseReserve(value());
    else if (arg === "--need-scratch-org") options.needScratchOrg = true;
    else if (arg === "--api-version") options.apiVersion = value();
    else if (arg === "--label") options.label = value();
    else throw new UsageError(`Unknown argument ${arg}.`);
  }
  if (!/^\d+\.\d$/.test(options.apiVersion))
    throw new UsageError("--api-version must look like 62.0.");
  return options;
}

/** A share between 0 and 1, or a whole number of requests of 1 or more. */
function parseReserve(text) {
  const number = Number(text);
  if (!Number.isFinite(number) || number <= 0)
    throw new UsageError("--reserve must be a share like 0.4 or a count.");
  if (number >= 1 && !Number.isInteger(number))
    throw new UsageError("--reserve above 1 must be a whole number.");
  return number;
}

/** The reserve in requests for a cap. A share is rounded up, so the site never gets less. */
function reserveCount(reserve, max) {
  return reserve < 1 ? Math.ceil(max * reserve) : reserve;
}

/** "api-usage=3/15000" from a Sforce-Limit-Info header, as { used, max }, or null. */
function parseLimitInfo(header) {
  const match = /api-usage=(\d+)\/(\d+)/.exec(String(header || ""));
  return match ? { used: Number(match[1]), max: Number(match[2]) } : null;
}

/** The REST limits body, { DailyApiRequests: { Max, Remaining }, ... }, as plain numbers. */
function fromRestBody(body) {
  const pick = (name) => {
    const entry = body && body[name];
    return entry &&
      Number.isFinite(entry.Max) &&
      Number.isFinite(entry.Remaining)
      ? { max: entry.Max, remaining: entry.Remaining }
      : null;
  };
  return {
    api: pick("DailyApiRequests"),
    dailyScratch: pick("DailyScratchOrgs"),
    activeScratch: pick("ActiveScratchOrgs")
  };
}

/** The `sf org list limits --json` result, [{ name, max, remaining }], as plain numbers. */
function fromCliResult(result) {
  const rows = Array.isArray(result) ? result : [];
  const pick = (name) => {
    const row = rows.find((entry) => entry && entry.name === name);
    return row && Number.isFinite(row.max) && Number.isFinite(row.remaining)
      ? { max: row.max, remaining: row.remaining }
      : null;
  };
  return {
    api: pick("DailyApiRequests"),
    dailyScratch: pick("DailyScratchOrgs"),
    activeScratch: pick("ActiveScratchOrgs")
  };
}

class ReadError extends Error {
  constructor(message, limitRefused) {
    super(message);
    this.limitRefused = Boolean(limitRefused);
  }
}

/** One GET of the REST limits resource with a stored token. */
async function readWithToken({ token, instanceUrl, apiVersion, fetchImpl }) {
  const base = String(instanceUrl).replace(/\/+$/, "");
  let response;
  try {
    response = await fetchImpl(`${base}/services/data/v${apiVersion}/limits`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
  } catch (error) {
    throw new ReadError(
      `the limits request could not be sent (${error.message})`
    );
  }
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new ReadError(
      `the org answered HTTP ${response.status}`,
      LIMIT_REFUSED.test(text)
    );
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new ReadError("the limits answer was not JSON");
  }
  const limits = fromRestBody(body);
  const header =
    response.headers && typeof response.headers.get === "function"
      ? parseLimitInfo(response.headers.get("Sforce-Limit-Info"))
      : null;
  return { ...limits, header };
}

/** One `sf org list limits` call. The exit code is not trusted, only the JSON body. */
function readWithCli({ targetOrg, run }) {
  const outcome = run("sf", [
    "org",
    "list",
    "limits",
    "--target-org",
    targetOrg,
    "--json"
  ]);
  const text = `${outcome.stdout || ""}`;
  let body;
  try {
    body = JSON.parse(text.slice(text.indexOf("{")));
  } catch (error) {
    const all = `${text}\n${outcome.stderr || ""}`;
    throw new ReadError("the sf answer was not JSON", LIMIT_REFUSED.test(all));
  }
  if (body.status !== 0 || !Array.isArray(body.result)) {
    const message = String(body.message || body.name || "unknown error");
    throw new ReadError(
      `sf could not read the limits (${message.slice(0, 200)})`,
      LIMIT_REFUSED.test(`${message} ${body.name || ""}`)
    );
  }
  return { ...fromCliResult(body.result), header: null };
}

function defaultRun(file, args) {
  // On Windows sf is a .cmd file, which Node runs only through a shell.
  const windows = process.platform === "win32";
  return spawnSync(
    windows ? `${file} ${args.map(quote).join(" ")}` : file,
    windows ? [] : args,
    {
      encoding: "utf8",
      shell: windows,
      maxBuffer: 10 * 1024 * 1024
    }
  );
}

function quote(arg) {
  return /^[A-Za-z0-9._\-/:=]+$/.test(arg)
    ? arg
    : `"${String(arg).replace(/"/g, '\\"')}"`;
}

/**
 * The decision, with no I/O. Returns { code, ok, reason, line, remaining, max, reserve }.
 */
function decide(limits, options) {
  const prefix = options.label ? `${options.label}: ` : "";
  const api = limits.api;
  if (!api) {
    return {
      code: EXIT.READ_FAILED,
      ok: false,
      reason: "read-failed",
      line: `${prefix}API reserve not checked: the answer had no DailyApiRequests figure.`
    };
  }
  const reserve = reserveCount(options.reserve, api.max);
  const base = { remaining: api.remaining, max: api.max, reserve };
  if (api.remaining < reserve) {
    return {
      ...base,
      code: EXIT.RESERVE,
      ok: false,
      reason: "reserve",
      line: `${prefix}API reserve reached: ${api.remaining} of ${api.max} left, reserve ${reserve}. This job stops here. The public site keeps the rest.`
    };
  }
  if (options.needScratchOrg) {
    const daily = limits.dailyScratch;
    const active = limits.activeScratch;
    if (!daily || !active) {
      return {
        ...base,
        code: EXIT.READ_FAILED,
        ok: false,
        reason: "read-failed",
        line: `${prefix}Scratch org limits not checked: the answer had no DailyScratchOrgs or ActiveScratchOrgs figure.`
      };
    }
    if (daily.remaining < 1 || active.remaining < 1) {
      return {
        ...base,
        code: EXIT.RESERVE,
        ok: false,
        reason: "scratch",
        line: `${prefix}Scratch org limit reached: ${daily.remaining} of ${daily.max} daily and ${active.remaining} of ${active.max} active scratch orgs left. This job stops here.`
      };
    }
    return {
      ...base,
      code: EXIT.OK,
      ok: true,
      reason: "ok",
      line: `${prefix}API reserve OK: ${api.remaining} of ${api.max} left, reserve ${reserve}. Scratch orgs left: ${daily.remaining} daily, ${active.remaining} active.`
    };
  }
  return {
    ...base,
    code: EXIT.OK,
    ok: true,
    reason: "ok",
    line: `${prefix}API reserve OK: ${api.remaining} of ${api.max} left, reserve ${reserve}.`
  };
}

function writeOutputs(file, decision, appendFile) {
  if (!file) return;
  const lines = [
    `ok=${decision.ok ? "true" : "false"}`,
    `reason=${decision.reason}`
  ];
  ["remaining", "max", "reserve"].forEach((name) => {
    if (decision[name] !== undefined) lines.push(`${name}=${decision[name]}`);
  });
  appendFile(file, `${lines.join("\n")}\n`);
}

/**
 * The whole run. Every seam is injectable so the tests need no network and no sf.
 * @returns {Promise<number>} the exit code
 */
async function main(argv, deps = {}) {
  const env = deps.env || process.env;
  const log = deps.log || console.log;
  const fetchImpl = deps.fetch || globalThis.fetch;
  const run = deps.run || defaultRun;
  const appendFile = deps.appendFile || fs.appendFileSync;

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    log(`API reserve not checked: ${error.message}`);
    return EXIT.USAGE;
  }
  const prefix = options.label ? `${options.label}: ` : "";

  let decision;
  try {
    let limits;
    if (options.targetOrg) {
      limits = readWithCli({ targetOrg: options.targetOrg, run });
    } else if (env.SF_ACCESS_TOKEN && env.SF_INSTANCE_URL) {
      limits = await readWithToken({
        token: env.SF_ACCESS_TOKEN,
        instanceUrl: env.SF_INSTANCE_URL,
        apiVersion: options.apiVersion,
        fetchImpl
      });
    } else {
      log(
        `${prefix}API reserve not checked: give --target-org, or set SF_ACCESS_TOKEN and SF_INSTANCE_URL.`
      );
      return EXIT.USAGE;
    }
    decision = decide(limits, options);
  } catch (error) {
    if (!(error instanceof ReadError)) throw error;
    decision = error.limitRefused
      ? {
          code: EXIT.RESERVE,
          ok: false,
          reason: "reserve",
          line: `${prefix}API reserve reached: the org refused the limits read because its daily API cap is spent. This job stops here. The public site keeps the rest.`
        }
      : {
          code: EXIT.READ_FAILED,
          ok: false,
          reason: "read-failed",
          line: `${prefix}API reserve not checked: ${error.message}.`
        };
  }
  log(decision.line);
  writeOutputs(env.GITHUB_OUTPUT, decision, appendFile);
  return decision.code;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.log(`API reserve not checked: ${error.message}`);
      process.exitCode = EXIT.READ_FAILED;
    }
  );
}

module.exports = {
  EXIT,
  DEFAULT_RESERVE,
  UsageError,
  ReadError,
  parseArgs,
  parseReserve,
  reserveCount,
  parseLimitInfo,
  fromRestBody,
  fromCliResult,
  readWithToken,
  readWithCli,
  decide,
  main
};

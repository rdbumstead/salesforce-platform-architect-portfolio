#!/usr/bin/env node
/* eslint-disable no-console */

// The primed cache test for the returning visitor redirect. It plays the part of a browser that
// visited ryanbumstead.com before the cutover and still holds the Cloudflare Page Rule's 301.
//
// One local server stands in for the old apex. Phase 1 it answers every address with a 301 to the
// scratch org's Salesforce site at the matching path, and a real browser (Chromium and WebKit,
// each in a persistent context) loads /, /resume and /api-lab so the 301 sits in its cache. The
// redirect setting is off in the org during this phase, so the visitors stop on the Salesforce
// site. That is the "before" row.
//
// Phase 2 switches the setting on in the org and the server to the static build (web/dist).
// The same contexts open the three addresses again. The browser follows its cached 301 to the
// Salesforce site, the layout there sends it to the local static site with from=sf, and the
// static site strips from=sf and records one arrival event. A row passes when it ends on the
// static site at the right path with a clean address, the server never saw the plain address
// (proof the browser used its cache), the arrival event fired once, the analytics tag loaded
// with a clean address, and the browser never went back to the Salesforce site afterwards.
//
// Phase 3, the rollback: the setting goes off and the Salesforce site must serve its own pages
// and keep the visitor there. Phase 4, the bypass: with the setting on, ?stay=1 keeps the
// visitor on the Salesforce site, a reload in that tab stays, and a fresh tab without the
// parameter is sent on, which shows the setting really was on. Phase 5 measures the time from
// the start of a Salesforce site load to the redirect request. At the end the committed values
// go back to the org and are read back.
//
// Settings records for the test are deployed from a temporary folder and never touch the
// repository. The org is named on the command line and its Id is checked before any deploy.
//
// Usage:
//   node scripts/redirect-cache-check.js --org <scratch alias> --org-id <its 15 or 18 character Id> \
//     --sf-base https://example.scratch.my.site.com/portfolio --dist web/dist --port 8822
// Options: --browsers chromium,webkit  --measure 5  --out result.json  --shots folder
//
// Output: one summary line, then the JSON body. Exit 0 when every row passes, 1 otherwise.

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawnSync } = require("child_process");

const PATHS = ["/", "/resume", "/api-lab"];
const SETTINGS = [
  "Site_Redirect_Enabled",
  "Site_Redirect_Target",
  "Site_Redirect_Host"
];
const REPO = path.resolve(__dirname, "..");
const SETTINGS_DIR = path.join(
  REPO,
  "packages/portfolio-site/main/default/customMetadata"
);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".xml": "application/xml"
};

/**
 * The file in the static build that answers an address, the way Cloudflare Pages does: the
 * exact file, then the path with .html, then the folder's index.html.
 * @param {string} distDir the static build folder
 * @param {string} urlPath the request path, with no query
 * @returns {string|null} the file path, or null when nothing answers or the path escapes the folder
 */
function staticFileFor(distDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) {
    return null;
  }
  const root = path.resolve(distDir);
  const clean = decoded.replace(/\/+$/, "") || "/";
  const candidates =
    clean === "/"
      ? ["index.html"]
      : [
          clean.slice(1),
          `${clean.slice(1)}.html`,
          `${clean.slice(1)}/index.html`
        ];
  for (const candidate of candidates) {
    const file = path.resolve(root, candidate);
    if (file !== root && !file.startsWith(root + path.sep)) {
      return null;
    }
    try {
      if (fs.statSync(file).isFile()) {
        return file;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/**
 * One local server with two modes. In "old" mode it plays the old apex: a 301 to the Salesforce
 * site at the same path, with a year of freshness. That is the worst case, a browser that keeps
 * the Page Rule's 301 for good. The real response's headers were not read, because the rule is
 * off and the zone is not for test traffic, and a bare 301 is not kept by Chromium here. In "static" mode it serves the static build, with no security headers.
 * Every request is logged with its mode, so a test can see what reached it.
 * @param {{distDir: string, sfBase: string}} options the build folder and the Salesforce site address
 * @returns {{server: http.Server, hits: object[], setMode: Function, mode: Function}} the server and its controls
 */
function createServer({ distDir, sfBase }) {
  let mode = "old";
  const hits = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://local");
    hits.push({
      mode,
      method: req.method,
      path: url.pathname,
      search: url.search
    });
    if (mode === "old") {
      res.writeHead(301, {
        Location: `${sfBase.replace(/\/+$/, "")}${url.pathname}`,
        "Cache-Control": "max-age=31536000"
      });
      res.end();
      return;
    }
    const file = staticFileFor(distDir, url.pathname);
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    fs.createReadStream(file).pipe(res);
  });
  return {
    server,
    hits,
    setMode(next) {
      mode = next;
    },
    mode() {
      return mode;
    }
  };
}

/**
 * Judges one visitor row of the primed cache test.
 * @param {object} row what the browser did: finalUrl, hops (main frame URLs in order), plainHits
 *        (requests to the local server for the plain address), arrivals (events seen),
 *        gtagHref (the address the analytics tag saw when it loaded) and the local origin and path
 * @returns {{pass: boolean, problems: string[]}} the verdict
 */
function judgeArrival(row) {
  const problems = [];
  const sfHost = new URL(row.sfBase).host;
  const url = safeUrl(row.finalUrl);
  if (row.plainHits > 0) {
    problems.push(
      `the server saw the plain address ${row.plainHits} times, so the 301 was not cached`
    );
  }
  const hopHosts = row.hops.map((hop) => (safeUrl(hop) || {}).host);
  const sfIndex = hopHosts.indexOf(sfHost);
  if (sfIndex < 0) {
    problems.push("the browser never went through the Salesforce site");
  }
  if (hopHosts.lastIndexOf(sfHost) > sfIndex) {
    problems.push("the browser came back to the Salesforce site twice");
  }
  const landed = hopHosts.findIndex(
    (host, index) =>
      index > sfIndex && sfIndex >= 0 && host === new URL(row.origin).host
  );
  if (landed >= 0 && hopHosts.slice(landed).includes(sfHost)) {
    problems.push(
      "the browser went back to the Salesforce site after reaching the static site"
    );
  }
  if (!url || url.origin !== row.origin || url.pathname !== row.path) {
    problems.push(`ended on ${row.finalUrl}, not ${row.origin}${row.path}`);
  } else if (url.search !== "") {
    problems.push(`the final address kept a query: ${url.search}`);
  }
  if (row.arrivals !== 1) {
    problems.push(`${row.arrivals} arrival events were recorded, not 1`);
  }
  return { pass: problems.length === 0, problems };
}

/**
 * Judges the analytics row: a visitor arriving with from=sf, where the analytics tag is a stub
 * that records the address it saw when it loaded.
 * @param {object} row finalUrl, origin, path, arrivals and gtagHref
 * @returns {{pass: boolean, problems: string[]}} the verdict
 */
function judgeAnalytics(row) {
  const problems = [];
  const url = safeUrl(row.finalUrl);
  if (
    !url ||
    url.origin !== row.origin ||
    url.pathname !== row.path ||
    url.search !== ""
  ) {
    problems.push(
      `ended on ${row.finalUrl}, not a clean ${row.origin}${row.path}`
    );
  }
  if (row.arrivals !== 1) {
    problems.push(`${row.arrivals} arrival events were recorded, not 1`);
  }
  if (!row.gtagHref) {
    problems.push("the analytics tag did not load");
  } else if (/[?&]from=sf(&|$|#)/.test(row.gtagHref)) {
    problems.push(`the analytics tag saw ${row.gtagHref}`);
  }
  return { pass: problems.length === 0, problems };
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * The metadata folder content for the three redirect settings, for a test deploy.
 * @param {{enabled: number, target: string, host: string}} values the test values
 * @returns {{files: Object<string, string>}} file text by relative path, in metadata API format
 */
function settingsMetadata({ enabled, target, host }) {
  const record = (
    label,
    number,
    text
  ) => `<?xml version="1.0" encoding="UTF-8"?>
<CustomMetadata xmlns="http://soap.sforce.com/2006/04/metadata" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    <label>${label}</label>
    <protected>false</protected>
    <values><field>Number_Value__c</field>${number === null ? '<value xsi:nil="true"/>' : `<value xsi:type="xsd:double">${number}</value>`}</values>
    <values><field>Text_Value__c</field>${text === null ? '<value xsi:nil="true"/>' : `<value xsi:type="xsd:string">${escapeXml(text)}</value>`}</values>
    <values><field>Min_Value__c</field>${number === null ? '<value xsi:nil="true"/>' : '<value xsi:type="xsd:double">0</value>'}</values>
    <values><field>Max_Value__c</field>${number === null ? '<value xsi:nil="true"/>' : '<value xsi:type="xsd:double">1</value>'}</values>
    <values><field>Description__c</field><value xsi:type="xsd:string">Test value, deployed by scripts/redirect-cache-check.js.</value></values>
</CustomMetadata>
`;
  return {
    files: {
      "package.xml": `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
${SETTINGS.map((name) => `        <members>Portfolio_Setting.${name}</members>`).join("\n")}
        <name>CustomMetadata</name>
    </types>
    <version>64.0</version>
</Package>
`,
      "customMetadata/Portfolio_Setting.Site_Redirect_Enabled.md": record(
        "Site redirect enabled",
        enabled,
        null
      ),
      "customMetadata/Portfolio_Setting.Site_Redirect_Target.md": record(
        "Site redirect target",
        null,
        target
      ),
      "customMetadata/Portfolio_Setting.Site_Redirect_Host.md": record(
        "Site redirect host",
        null,
        host
      )
    }
  };
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The JSON body of an sf command's output. Under some shells sf exits 1 on success, so the
 * body is read and the exit code is not.
 * @param {string} stdout the command's standard output
 * @returns {object|null} the parsed body, or null when there is none
 */
function parseSfJson(stdout) {
  const start = String(stdout || "").indexOf("{");
  if (start < 0) {
    return null;
  }
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return null;
  }
}

function sf(args) {
  const quoted = args.map((arg) =>
    /[\s()'"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
  );
  const result = spawnSync("sf", quoted, {
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  return parseSfJson(result.stdout);
}

function argValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function median(values) {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function main() {
  const args = process.argv.slice(2);
  const org = argValue(args, "--org");
  const orgId = argValue(args, "--org-id");
  const sfBase = (argValue(args, "--sf-base") || "").replace(/\/+$/, "");
  const distDir = path.resolve(
    argValue(args, "--dist", path.join(REPO, "web/dist"))
  );
  const port = Number(argValue(args, "--port", "8822"));
  const browsers = argValue(args, "--browsers", "chromium,webkit").split(",");
  const measureCount = Number(argValue(args, "--measure", "5"));
  const outFile = argValue(args, "--out");
  const shots = path.resolve(
    argValue(args, "--shots", path.join(os.tmpdir(), "redirect-cache-check"))
  );
  if (!org || !orgId || !sfBase) {
    console.error(
      "Usage: --org <alias> --org-id <Id> --sf-base <site address> [--dist --port --browsers --measure --out --shots]"
    );
    process.exit(1);
  }
  fs.mkdirSync(shots, { recursive: true });

  const display = sf(["org", "display", "--target-org", org, "--json"]);
  if (!display || !display.result || display.result.id !== orgId) {
    console.error(
      `Org ${org} is not ${orgId}: ${display && display.result ? display.result.id : "no answer"}`
    );
    process.exit(1);
  }

  const origin = `http://127.0.0.1:${port}`;
  const sfHost = new URL(sfBase).host;
  const sfHostname = new URL(sfBase).hostname;
  const local = createServer({ distDir, sfBase });
  await new Promise((resolve) =>
    local.server.listen(port, "127.0.0.1", resolve)
  );

  const deployTemp = (enabled) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "redirect-settings-"));
    const { files } = settingsMetadata({
      enabled,
      target: origin,
      host: sfHostname
    });
    Object.entries(files).forEach(([name, text]) => {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    });
    const body = sf([
      "project",
      "deploy",
      "start",
      "--metadata-dir",
      dir,
      "--target-org",
      org,
      "--wait",
      "10",
      "--json"
    ]);
    fs.rmSync(dir, { recursive: true, force: true });
    const result = body && body.result;
    const ok =
      Boolean(result) &&
      result.status === "Succeeded" &&
      result.checkOnly === false;
    if (!ok) {
      throw new Error(
        `Deploy of the test settings failed: ${JSON.stringify(body && (body.message || body.result)).slice(0, 300)}`
      );
    }
  };

  const report = {
    org,
    orgId,
    sfBase,
    origin,
    rows: [],
    rollback: [],
    bypass: [],
    timing: [],
    restore: null,
    problems: []
  };
  const playwright = require("playwright");
  const proxy = await startBlockingProxy();
  const proxyOption = { server: `http://127.0.0.1:${proxy.port}` };
  const contexts = [];
  let finished = false;

  try {
    // Phase 1, the old apex answers and the switch is off.
    deployTemp(0);
    local.setMode("old");
    for (const name of browsers) {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), `redirect-profile-${name}-`)
      );
      const context = await playwright[name].launchPersistentContext(dir, {
        headless: true,
        proxy: proxyOption
      });
      await instrument(context);
      contexts.push({ name, context, dir });
      for (const urlPath of PATHS) {
        const before = local.hits.length;
        const page = await context.newPage();
        const trace = traceHops(page);
        await page.goto(`${origin}${urlPath}`, {
          waitUntil: "load",
          timeout: 60000
        });
        await page.waitForTimeout(4000);
        const entry = {
          phase: "before",
          browser: name,
          path: urlPath,
          finalUrl: page.url(),
          hops: trace.hops,
          reachedServer: local.hits.length - before,
          endsOnSalesforce: new URL(page.url()).host === sfHost
        };
        report.rows.push(entry);
        await page.close();
      }
      // Proof the 301 is cached: the second visit never reaches the server.
      for (const urlPath of PATHS) {
        const before = local.hits.length;
        const page = await context.newPage();
        await page.goto(`${origin}${urlPath}`, {
          waitUntil: "commit",
          timeout: 60000
        });
        await page.waitForTimeout(1500);
        const reached = local.hits
          .slice(before)
          .filter((hit) => hit.path === urlPath).length;
        report.rows.push({
          phase: "primed",
          browser: name,
          path: urlPath,
          serverRequests: reached,
          cached: reached === 0
        });
        await page.close();
      }
    }

    // Phase 2, the switch is on and the server is the static site.
    deployTemp(1);
    local.setMode("static");
    for (const { name, context } of contexts) {
      // An engine that does not keep the 301 starts where the cached 301 would have sent it,
      // on the Salesforce site, and its rows say so.
      const cacheHolds = report.rows
        .filter((row) => row.phase === "primed" && row.browser === name)
        .every((row) => row.cached);
      for (const urlPath of PATHS) {
        const startHits = local.hits.length;
        const page = await context.newPage();
        const trace = traceHops(page);
        const started = Date.now();
        let note = null;
        try {
          await page.goto(
            cacheHolds ? `${origin}${urlPath}` : `${sfBase}${urlPath}`,
            {
              waitUntil: "commit",
              timeout: 60000
            }
          );
          await page.waitForURL(
            (url) =>
              url.origin === origin &&
              url.pathname === urlPath &&
              !url.searchParams.has("from") &&
              url.search === "",
            { timeout: 45000 }
          );
          await page.waitForTimeout(3000);
        } catch (error) {
          note = String(error).slice(0, 200);
        }
        const state = await page
          .evaluate(() => ({ arrivals: (window.__arrivals || []).length }))
          .catch(() => ({ arrivals: 0 }));
        const plainHits = local.hits
          .slice(startHits)
          .filter((hit) => hit.path === urlPath && hit.search === "").length;
        const row = {
          phase: "after",
          browser: name,
          path: urlPath,
          origin,
          sfBase,
          start: cacheHolds
            ? "cached 301"
            : "salesforce site (this engine did not keep the 301)",
          finalUrl: page.url(),
          hops: trace.hops,
          plainHits,
          arrivals: state.arrivals,
          ms: Date.now() - started,
          note
        };
        const verdict = judgeArrival(row);
        row.pass = verdict.pass;
        row.problems = verdict.problems;
        if (!row.pass) {
          row.screenshot = path.join(
            shots,
            `fail-${name}-${urlPath.replace(/\W+/g, "_")}.png`
          );
          await page.screenshot({ path: row.screenshot }).catch(() => {});
        }
        report.rows.push(row);
        await page.close();
      }
    }

    // Analytics pass. A direct visit with from=sf, with the analytics tag replaced by a stub that
    // records the address it saw when it loaded. Request interception turns the browser cache off,
    // so this pass is separate from the cached 301 pass above.
    for (const name of browsers) {
      const browser = await playwright[name].launch({ headless: true });
      for (const urlPath of PATHS) {
        const context = await browser.newContext();
        await instrument(context, { stubTag: true });
        const page = await context.newPage();
        let note = null;
        try {
          await page.goto(`${origin}${urlPath}?from=sf`, {
            waitUntil: "load",
            timeout: 60000
          });
          await page.waitForFunction(() => Boolean(window.__gtagHref), null, {
            timeout: 15000
          });
          await page.waitForTimeout(1500);
        } catch (error) {
          note = String(error).slice(0, 200);
        }
        const state = await page
          .evaluate(() => ({
            arrivals: (window.__arrivals || []).length,
            gtagHref: window.__gtagHref || null
          }))
          .catch(() => ({ arrivals: 0, gtagHref: null }));
        const row = {
          phase: "analytics",
          browser: name,
          path: urlPath,
          origin,
          finalUrl: page.url(),
          arrivals: state.arrivals,
          gtagHref: state.gtagHref,
          note
        };
        Object.assign(row, judgeAnalytics(row));
        report.rows.push(row);
        await context.close();
      }
      await browser.close();
    }

    // Phase 3, the rollback.
    deployTemp(0);
    for (const { name, context } of contexts) {
      const page = await context.newPage();
      await page.goto(`${sfBase}/resume`, {
        waitUntil: "load",
        timeout: 60000
      });
      await page.waitForTimeout(7000);
      const stayed = new URL(page.url()).host === sfHost;
      const rendered = await page
        .evaluate(() =>
          Boolean(document.querySelector("c-portfolio-theme-layout"))
        )
        .catch(() => false);
      report.rollback.push({
        browser: name,
        finalUrl: page.url(),
        stayedOnSalesforce: stayed,
        layoutRendered: rendered,
        pass: stayed && rendered
      });
      await page.close();
    }

    // Phase 4, the bypass, with the switch on.
    deployTemp(1);
    for (const { name, context } of contexts) {
      const page = await context.newPage();
      await page.goto(`${sfBase}/resume?stay=1`, {
        waitUntil: "load",
        timeout: 60000
      });
      await page.waitForTimeout(7000);
      const stayed = new URL(page.url()).host === sfHost;
      await page.goto(`${sfBase}/resume`, {
        waitUntil: "load",
        timeout: 60000
      });
      await page.waitForTimeout(7000);
      const stayedAfterReload = new URL(page.url()).host === sfHost;
      await page.close();
      const fresh = await context.newPage();
      await fresh.goto(`${sfBase}/resume`, {
        waitUntil: "commit",
        timeout: 60000
      });
      const sent = await fresh
        .waitForURL((url) => url.origin === origin, { timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      await fresh.close();
      report.bypass.push({
        browser: name,
        stayedWithStay: stayed,
        stayedOnReloadInSameTab: stayedAfterReload,
        freshTabWithoutItWasSentOn: sent,
        pass: stayed && stayedAfterReload && sent
      });
    }

    // Phase 5, time to redirect, each load in a fresh context, the switch still on.
    for (const name of browsers) {
      const times = [];
      const browser = await playwright[name].launch({
        headless: true,
        proxy: proxyOption
      });
      for (let i = 0; i < measureCount; i += 1) {
        const context = await browser.newContext();
        await instrument(context);
        const page = await context.newPage();
        let redirectAt = null;
        const started = Date.now();
        page.on("request", (request) => {
          if (
            request.isNavigationRequest() &&
            request.url().startsWith(origin) &&
            redirectAt === null
          ) {
            redirectAt = Date.now();
          }
        });
        await page.goto(`${sfBase}/`, { waitUntil: "commit", timeout: 60000 });
        await page
          .waitForURL((url) => url.origin === origin, { timeout: 30000 })
          .catch(() => {});
        if (redirectAt !== null) {
          times.push(redirectAt - started);
        }
        await context.close();
      }
      await browser.close();
      report.timing.push({
        browser: name,
        runs: measureCount,
        measured: times.length,
        ms: times,
        median: median(times)
      });
    }
    finished = true;
  } catch (error) {
    report.problems.push(
      `The run stopped early: ${String(error).slice(0, 300)}`
    );
  } finally {
    for (const { context, dir } of contexts) {
      await context.close().catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
    }
    await new Promise((resolve) => local.server.close(resolve));
    proxy.server.close();
    report.refusedTrackerHosts = [...new Set(proxy.refused)].sort();
    report.restore = restoreSourceValues(org);
  }

  const failures = [
    ...report.rows.filter((row) => row.phase === "after" && !row.pass),
    ...report.rows.filter((row) => row.phase === "analytics" && !row.pass),
    ...(args.includes("--require-primed")
      ? report.rows.filter((row) => row.phase === "primed" && !row.cached)
      : []),
    ...report.rows.filter(
      (row) => row.phase === "before" && !row.endsOnSalesforce
    ),
    ...report.rollback.filter((row) => !row.pass),
    ...report.bypass.filter((row) => !row.pass)
  ];
  const ok =
    finished &&
    failures.length === 0 &&
    report.restore &&
    report.restore.matches;
  const summary = `redirect-cache-check ${ok ? "PASS" : "FAIL"}: ${report.rows.filter((r) => r.phase === "after" && r.pass).length} of ${report.rows.filter((r) => r.phase === "after").length} arrival rows, ${report.rows.filter((r) => r.phase === "analytics" && r.pass).length} of ${report.rows.filter((r) => r.phase === "analytics").length} analytics rows, ${report.rollback.filter((r) => r.pass).length} of ${report.rollback.length} rollback, ${report.bypass.filter((r) => r.pass).length} of ${report.bypass.length} bypass, settings restored ${report.restore ? report.restore.matches : false}, 301 held by the browser: ${browsers.map((b) => `${b} ${report.rows.filter((r) => r.phase === "primed" && r.browser === b).every((r) => r.cached)}`).join(", ")}`;
  console.log(summary);
  const body = JSON.stringify(report);
  if (outFile) {
    fs.writeFileSync(outFile, body);
  }
  console.log(body);
  process.exit(ok ? 0 : 1);
}

const TRACKERS =
  /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|cloudflareinsights\.com)$/;

/**
 * A small forward proxy for the browsers. It refuses the analytics hosts, so no run counts as a
 * visit, and passes everything else through. The analytics hosts are blocked here and not with
 * request interception because interception turns the browser's HTTP cache off, and the cache
 * is what this test is about.
 * @returns {Promise<{server: http.Server, port: number, refused: string[]}>} the proxy
 */
function startBlockingProxy() {
  const net = require("net");
  const refused = [];
  const server = http.createServer((req, res) => {
    const target = new URL(req.url);
    const upstream = http.request(
      {
        host: target.hostname,
        port: target.port || 80,
        path: target.pathname + target.search,
        method: req.method,
        headers: req.headers
      },
      (answer) => {
        res.writeHead(answer.statusCode, answer.headers);
        answer.pipe(res);
      }
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  server.on("connect", (req, socket, head) => {
    const [host, port] = req.url.split(":");
    if (TRACKERS.test(host)) {
      refused.push(host);
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = net.connect(Number(port) || 443, host, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, port: server.address().port, refused })
    );
  });
}

/**
 * Adds the page hooks every context needs: the analytics tag is replaced by a stub that
 * records the address it saw, other trackers are blocked, and the arrival events are counted.
 * @param {object} context a Playwright browser context
 */
async function instrument(context, { stubTag = false } = {}) {
  if (stubTag) {
    await context.route(/googletagmanager\.com\/gtag\/js/, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: "window.__gtagHref = location.href;"
      })
    );
    await context.route(
      /cloudflareinsights\.com|google-analytics\.com/,
      (route) => route.abort()
    );
  }
  await addArrivalListener(context);
}

async function addArrivalListener(context) {
  await context.addInitScript(() => {
    window.__arrivals = [];
    document.addEventListener(
      "portfolio-analytics",
      (event) => {
        if (event.detail && event.detail.name === "redirect_arrived") {
          window.__arrivals.push(event.detail.params || {});
        }
      },
      true
    );
  });
}

function traceHops(page) {
  const hops = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      hops.push(frame.url());
    }
  });
  return { hops };
}

/**
 * Puts the committed settings back in the org and reads them back.
 * @param {string} org the org alias
 * @returns {{deployed: boolean, matches: boolean, read: object[]}} what the org holds afterwards
 */
function restoreSourceValues(org) {
  const files = SETTINGS.map((name) =>
    path.join(SETTINGS_DIR, `Portfolio_Setting.${name}.md-meta.xml`)
  );
  const body = sf([
    "project",
    "deploy",
    "start",
    "--source-dir",
    ...files,
    "--target-org",
    org,
    "--ignore-conflicts",
    "--wait",
    "10",
    "--json"
  ]);
  const deployed = Boolean(
    body &&
    body.result &&
    body.result.status === "Succeeded" &&
    body.result.checkOnly === false
  );
  const query = sf([
    "data",
    "query",
    "--target-org",
    org,
    "--query",
    `SELECT DeveloperName, Number_Value__c, Text_Value__c FROM Portfolio_Setting__mdt WHERE DeveloperName IN (${SETTINGS.map((n) => `'${n}'`).join(",")})`,
    "--json"
  ]);
  const read = ((query && query.result && query.result.records) || []).map(
    (r) => ({
      name: r.DeveloperName,
      number: r.Number_Value__c,
      text: r.Text_Value__c
    })
  );
  const expected = SETTINGS.map((name) => {
    const text = fs.readFileSync(
      path.join(SETTINGS_DIR, `Portfolio_Setting.${name}.md-meta.xml`),
      "utf8"
    );
    const number =
      /<field>Number_Value__c<\/field>\s*<value xsi:type="xsd:double">([^<]+)</.exec(
        text
      );
    const str =
      /<field>Text_Value__c<\/field>\s*<value\s+xsi:type="xsd:string"\s*>([^<]+)</.exec(
        text
      );
    return {
      name,
      number: number ? Number(number[1]) : null,
      text: str ? str[1] : null
    };
  });
  const matches =
    deployed &&
    expected.every((want) => {
      const got = read.find((item) => item.name === want.name);
      return got && got.number === want.number && got.text === want.text;
    });
  return { deployed, matches, read };
}

module.exports = {
  staticFileFor,
  createServer,
  judgeArrival,
  judgeAnalytics,
  startBlockingProxy,
  settingsMetadata,
  parseSfJson,
  median
};

if (require.main === module) {
  main().catch((error) => {
    console.error(String(error));
    process.exit(1);
  });
}

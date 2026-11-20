import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  routesFromDist,
  rewritesFrom,
  rewritePath,
  formatReport,
  scanPage,
  serveDist
} from "../build/check-overflow.mjs";

function distWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "overflow-dist-"));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

test("every html file under dist is a route and asset folders are skipped", () => {
  const dir = distWith({
    "index.html": "",
    "contact.html": "",
    "resume/index.html": "",
    "api-lab/reference.html": "",
    "assets/page.html": "",
    "sr/thing.html": "",
    "robots.txt": ""
  });
  assert.deepEqual(routesFromDist(dir), [
    "/",
    "/api-lab/reference",
    "/contact",
    "/resume"
  ]);
});

test("only the redirects that answer 200 are rewrites, and a splat carries over", () => {
  const rewrites = rewritesFrom(
    "# note\n/portfolio / 301\n/sfsites/c/resource/Prism_JS/* /sr/Prism_JS/:splat 200\n/sfsites/c/resource/D3_Library /sr/D3_Library.js 200\n"
  );
  assert.equal(rewrites.length, 2);
  assert.equal(
    rewritePath("/sfsites/c/resource/Prism_JS/a.js", rewrites),
    "/sr/Prism_JS/a.js"
  );
  assert.equal(
    rewritePath("/sfsites/c/resource/D3_Library", rewrites),
    "/sr/D3_Library.js"
  );
  assert.equal(rewritePath("/contact", rewrites), "/contact");
});

test("the report lists each finding with its route, width and scheme", () => {
  assert.equal(formatReport([]), "No overflow found.");
  const line = formatReport([
    {
      route: "/docs",
      width: 390,
      scheme: "dark",
      kind: "no cue",
      element: "table.t",
      detail: "900px of content in a 300px box"
    }
  ]);
  assert.equal(
    line,
    "/docs  390px dark  no cue  table.t  900px of content in a 300px box"
  );
});

test("the dist server answers a clean path, a rewrite and a missing file", async () => {
  const dir = distWith({
    "contact.html": "contact page",
    "sr/a.txt": "asset",
    _redirects: "/old/* /sr/:splat 200\n"
  });
  const { server, base } = await serveDist(dir);
  try {
    assert.equal(await (await fetch(`${base}/contact`)).text(), "contact page");
    assert.equal(await (await fetch(`${base}/old/a.txt`)).text(), "asset");
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    assert.equal((await fetch(`${base}/../../etc/passwd`)).status, 404);
  } finally {
    server.close();
  }
});

async function pageFor(html) {
  const specifier = process.env.PLAYWRIGHT_MODULE;
  let chromium;
  try {
    if (specifier) {
      const { createRequire } = await import("node:module");
      ({ chromium } = createRequire(import.meta.url)(specifier));
    } else {
      ({ chromium } = await import("playwright"));
    }
  } catch (error) {
    return null;
  }
  // CI sets CHROME_PATH to the runner's own Chrome. Without it, the package can be installed
  // while its browser is not, and that case skips like a missing package. Any other launch
  // failure still fails.
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || undefined
    });
  } catch (error) {
    if (/Executable doesn't exist/.test(String(error && error.message))) return null;
    throw error;
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page.setContent(html);
  return { browser, page };
}

test("the page scan flags a scroll box with no cue, a clipped table and a wide picture, and passes a cued box", async (t) => {
  const opened = await pageFor(`<body style="margin:0">
    <div id="bare" style="width:300px;overflow-x:auto"><table style="width:900px"><tr><td>x</td></tr></table></div>
    <div id="cued" class="table-wrap is-scrollable"><div style="width:300px;overflow-x:auto"><table style="width:900px"><tr><td>y</td></tr></table></div></div>
    <div id="clip" style="width:300px;overflow-x:hidden"><table style="width:900px"><tr><td>z</td></tr></table></div>
    <div id="fits" style="width:300px"><table style="width:100%"><tr><td>ok</td></tr></table></div>
  </body>`);
  if (!opened) return t.skip("Playwright or its browser is not installed here");
  try {
    const findings = await opened.page.evaluate(scanPage);
    const kinds = findings.map((f) => f.kind).sort();
    assert.deepEqual(kinds, ["cut off", "no cue"]);
    assert.ok(
      findings.find((f) => f.kind === "no cue").element.includes("div#bare")
    );
    assert.ok(
      findings.find((f) => f.kind === "cut off").element.includes("table")
    );
  } finally {
    await opened.browser.close();
  }
});

test("the page scan flags a page that scrolls sideways and an unwrapped wide table", async (t) => {
  const opened = await pageFor(
    '<body style="margin:0"><table style="width:900px"><tr><td>x</td></tr></table></body>'
  );
  if (!opened) return t.skip("Playwright or its browser is not installed here");
  try {
    const kinds = (await opened.page.evaluate(scanPage))
      .map((f) => f.kind)
      .sort();
    assert.deepEqual(kinds, ["page", "wide"]);
  } finally {
    await opened.browser.close();
  }
});

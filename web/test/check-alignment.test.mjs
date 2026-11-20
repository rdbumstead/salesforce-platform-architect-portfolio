import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  DEFAULT_WIDTHS,
  DEFAULT_SCHEMES,
  formatReport,
  parseArgs,
  scanAlignment
} from "../build/check-alignment.mjs";

test("the report says so when nothing is flagged and lists each finding with its route, width and scheme", () => {
  assert.equal(formatReport([]), "No alignment fault found.");
  assert.equal(
    formatReport([
      {
        route: "/ai-lab",
        width: 390,
        scheme: "light",
        kind: "aligned",
        element: "p.generate-hint",
        detail: "2 lines, text-align right"
      }
    ]),
    "/ai-lab  390px light  aligned  p.generate-hint  2 lines, text-align right"
  );
});

test("the defaults cover the four widths and both schemes, and the arguments override them", () => {
  assert.deepEqual(DEFAULT_WIDTHS, [360, 390, 768, 1280]);
  assert.deepEqual(DEFAULT_SCHEMES, ["light", "dark"]);
  const options = parseArgs([
    "--widths",
    "390",
    "--schemes",
    "dark",
    "--routes",
    "/a,/b",
    "--no-docs",
    "--dist",
    "somewhere"
  ]);
  assert.deepEqual(options.widths, [390]);
  assert.deepEqual(options.schemes, ["dark"]);
  assert.deepEqual(options.routes, ["/a", "/b"]);
  assert.equal(options.docs, false);
  assert.equal(options.dist, path.resolve("somewhere"));
  assert.throws(() => parseArgs(["--nope"]), /Unknown argument/);
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
  // while its browser is not, and that case skips like a missing package.
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROME_PATH || undefined
    });
  } catch (error) {
    if (/Executable doesn't exist/.test(String(error && error.message)))
      return null;
    throw error;
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page.setContent(html);
  return { browser, page };
}

const LONG =
  "A hint that is long enough to wrap onto a second line on a phone sized window for sure.";

async function scan(html, t) {
  const opened = await pageFor(html);
  if (!opened) {
    t.skip("Playwright or its browser is not installed here");
    return null;
  }
  try {
    return await opened.page.evaluate(scanAlignment);
  } finally {
    await opened.browser.close();
  }
}

test("a right aligned paragraph of two lines is flagged and a one line right label is not", async (t) => {
  const findings = await scan(
    `<body style="margin:0">
      <div style="text-align:right"><p id="hint" style="width:200px">${LONG}</p></div>
      <div style="text-align:right"><p id="short">Saved</p></div>
    </body>`,
    t
  );
  if (!findings) return;
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "aligned");
  assert.ok(findings[0].element.includes("p#hint"));
  assert.match(findings[0].detail, /text-align right/);
});

test("a centred paragraph of two lines is flagged, and one in a button, or marked data-align-ok, is not", async (t) => {
  const findings = await scan(
    `<body style="margin:0">
      <p id="mid" style="width:200px;text-align:center">${LONG}</p>
      <button style="width:140px;text-align:center"><span>${LONG}</span></button>
      <p id="ok" data-align-ok style="width:200px;text-align:center">${LONG}</p>
      <p id="left" style="width:200px;text-align:left">${LONG}</p>
    </body>`,
    t
  );
  if (!findings) return;
  assert.deepEqual(
    findings.map((f) => [f.kind, f.element.split(" > ").pop()]),
    [["aligned", "p#mid"]]
  );
});

test("text clipped by its box is flagged and a deliberate ellipsis is not", async (t) => {
  const findings = await scan(
    `<body style="margin:0">
      <div id="clip" style="width:120px;overflow:hidden"><span style="white-space:nowrap">${LONG}</span></div>
      <div id="dots" style="width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${LONG}</div>
      <div id="fits" style="width:300px;overflow:hidden">Short</div>
    </body>`,
    t
  );
  if (!findings) return;
  const cut = findings.filter((f) => f.kind === "cut off");
  assert.equal(cut.length, 1);
  assert.ok(cut[0].element.includes("div#clip"));
  assert.equal(
    findings.some((f) => f.element.includes("div#dots")),
    false
  );
});

test("text past the edge of the window is flagged and the same text in a scroll box is not", async (t) => {
  const findings = await scan(
    `<body style="margin:0">
      <div id="wide" style="white-space:nowrap;width:700px">${LONG}</div>
      <div id="scroller" style="width:300px;overflow-x:auto"><div style="white-space:nowrap">${LONG}</div></div>
    </body>`,
    t
  );
  if (!findings) return;
  const past = findings.filter((f) => f.kind === "past edge");
  assert.equal(past.length, 1);
  assert.ok(past[0].element.includes("div#wide"));
});

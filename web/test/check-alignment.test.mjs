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

// R29 mobile findings: the data source marker left its dot alone above the label on a phone, and
// the hero's test counts broke a line right after a separator dot.
const MARKER = (dotInLabel) =>
  `<button id="marker" style="display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px 8px;max-width:100%;padding:4px 16px;font:16px sans-serif;text-align:left">
    ${dotInLabel ? "" : '<span style="width:8px;height:8px;border-radius:50%;background:#36f"></span>'}
    <span>${dotInLabel ? '<span style="display:inline-block;width:8px;height:8px;margin-right:8px;background:#36f"></span>' : ""}From Salesforce · built Nov\u00a021,\u00a02026,\u00a011:59\u00a0AM\u00a0EST</span>
    <span>6 case studies</span>
  </button>`;

test("a status dot left alone on a line above its label is a lone mark, and the dot inside the label is not", async (t) => {
  const findings = await scan(
    `<body style="margin:0;width:330px">${MARKER(false)}</body>`,
    t
  );
  if (!findings) return;
  const lone = findings.filter((f) => f.kind === "lone mark");
  assert.equal(lone.length, 1);
  assert.ok(lone[0].element.includes("button#marker"));
  assert.match(lone[0].detail, /line 1 of 3 holds only "\[box\]"/);

  const fixed = await scan(
    `<body style="margin:0;width:330px">${MARKER(true)}</body>`,
    t
  );
  assert.equal(
    fixed.some((f) => f.kind === "lone mark"),
    false
  );
});

test("a line that ends on a separator dot is a mark at edge, and a plain wrapped paragraph is not", async (t) => {
  const findings = await scan(
    `<body style="margin:0">
      <p id="stats" style="width:330px;font:13px monospace">1,701 Apex tests passing · 99% coverage · 1,739 Jest tests passing</p>
      <p id="prose" style="width:200px">${LONG}</p>
    </body>`,
    t
  );
  if (!findings) return;
  const edge = findings.filter((f) => f.kind === "mark at edge");
  assert.equal(edge.length, 1);
  assert.ok(edge[0].element.includes("p#stats"));
  assert.equal(
    findings.some((f) => f.element.includes("p#prose")),
    false
  );
});

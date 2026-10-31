// Tests for scripts/render-mermaid.js. Run: node --test scripts/render-mermaid.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  loadHash,
  findDiagrams,
  collectDiagrams,
  sourceFor
} = require("./render-mermaid.js");

const MARKED = require(
  path.join(
    __dirname,
    "../packages/portfolio-site/main/default/staticresources/Marked_Library.js"
  )
);

test("the script's hash is the viewer's hash", () => {
  const hashOf = loadHash();
  assert.match(hashOf("graph TD\n  A-->B"), /^[0-9a-f]{14}$/);
  assert.strictEqual(hashOf("a\r\nb\n"), hashOf("a\nb"));
  assert.notStrictEqual(hashOf("a"), hashOf("b"));
});

test("finds a block inside a list and one in the top level, once per source", () => {
  const md = [
    "# T",
    "",
    "```mermaid",
    "graph TD",
    "  A-->B",
    "```",
    "",
    "- item",
    "",
    "  ```mermaid",
    "  graph TD",
    "    A-->B",
    "  ```",
    "",
    "```js",
    "not a diagram",
    "```"
  ].join("\n");
  const found = collectDiagrams(MARKED.lexer(md, { gfm: true }), []);
  assert.strictEqual(found.length, 2);
  assert.strictEqual(loadHash()(found[0]), loadHash()(found[1]));
});

test("walks a docs folder and lists each distinct block with its file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mmd-test-"));
  try {
    fs.writeFileSync(
      path.join(dir, "a.md"),
      "```mermaid\ngraph TD\n  A-->B\n```\n"
    );
    fs.writeFileSync(
      path.join(dir, "b.md"),
      "```mermaid\ngraph TD\n  C-->D\n```\n"
    );
    const found = findDiagrams(dir, loadHash());
    assert.strictEqual(found.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the alt file has one sentence for every block in the docs", () => {
  const alt = JSON.parse(
    fs.readFileSync(path.join(__dirname, "render-mermaid-alt.json"), "utf8")
  );
  const found = findDiagrams(path.join(__dirname, "../docs"), loadHash());
  for (const diagram of found) {
    assert.ok(
      alt[diagram.hash],
      `no alt text for ${diagram.hash} in ${diagram.files}`
    );
  }
});

test("every key in the alt file belongs to a block in the docs", () => {
  const alt = JSON.parse(
    fs.readFileSync(path.join(__dirname, "render-mermaid-alt.json"), "utf8")
  );
  const found = findDiagrams(path.join(__dirname, "../docs"), loadHash());
  const used = new Set(found.map((diagram) => diagram.hash));
  for (const hash of Object.keys(alt)) {
    assert.ok(
      used.has(hash),
      `alt text key ${hash} matches no block in the docs, probably an old hash`
    );
  }
});

test("the dark drawing drops a pinned theme directive and keeps the rest", () => {
  const src = [
    "sequenceDiagram",
    "  %%{init: {'theme': 'base', 'themeVariables': {'mainBkg': '#ffffff'}}}%%",
    "  %%{init: {'flowchart': {'nodeSpacing': 50}}}%%",
    "  A->>B: hi"
  ].join("\n");
  assert.strictEqual(sourceFor(src, "light"), src);
  const dark = sourceFor(src, "dark");
  assert.ok(!dark.includes("themeVariables"));
  assert.ok(dark.includes("nodeSpacing"));
  assert.ok(dark.includes("A->>B: hi"));
});

test("the committed placeholder keeps the static resource deployable before a render", () => {
  const dir = path.join(
    __dirname,
    "../packages/portfolio-site/main/default/staticresources/Mermaid_Diagrams"
  );
  assert.ok(fs.existsSync(path.join(dir, "placeholder.txt")));
});

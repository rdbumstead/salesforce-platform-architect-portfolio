// Tests for the internal reference gate. Run with: node --test scripts/check-internal-refs.test.js

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const { scanText, isScanned, VENDORED } = require("./check-internal-refs.js");

const SCRIPT = path.join(__dirname, "check-internal-refs.js");

function matches(file, text) {
  return scanText(file, text).map((hit) => hit.match);
}

function lines(file, text) {
  return scanText(file, text).map((hit) => hit.line);
}

// Writes files under a fresh temp root and runs the script on them as a child process.
function runScript(files, extraArgs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refs-check-"));
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  const emptyAllowlist = path.join(root, "allowlist.json");
  fs.writeFileSync(emptyAllowlist, "[]");
  const args = [SCRIPT, "--root", root];
  if (!extraArgs.includes("--allowlist")) {
    args.push("--allowlist", emptyAllowlist);
  }
  const result = spawnSync(
    process.execPath,
    [
      ...args,
      ...extraArgs.map((a) => a.replace("<root>", root)),
      ...Object.keys(files)
    ],
    { encoding: "utf8" }
  );
  fs.rmSync(root, { recursive: true, force: true });
  return result;
}

test("a hit in an Apex line comment and block comment fails", () => {
  const text = [
    "public class Foo {",
    "  // kept for the Round 7 plan",
    "  /* see log 312 */",
    "  /**",
    "   * @description contract P2 shape",
    "   */",
    "}"
  ].join("\n");
  assert.deepStrictEqual(matches("a/Foo.cls", text), [
    "Round 7",
    "log 312",
    "P2"
  ]);
  assert.deepStrictEqual(lines("a/Foo.cls", text), [2, 3, 5]);
});

test("a hit in a trigger comment fails", () => {
  assert.deepStrictEqual(
    matches("a/T.trigger", "trigger T on Lead (after insert) { // trap 79\n}"),
    ["trap 79"]
  );
});

test("a hit in a JS line comment and block comment fails", () => {
  const text = "// workstream note\nconst a = 1; /* kickoff item F7 */\n";
  assert.deepStrictEqual(matches("a/x.js", text), [
    "workstream",
    "kickoff",
    "F7"
  ]);
});

test("a hit in an HTML comment fails", () => {
  assert.deepStrictEqual(
    matches(
      "a/x.html",
      "<template>\n  <!-- stream (c) owns this -->\n</template>"
    ),
    ["stream ("]
  );
});

test("a hit in an XML comment, description or help text fails", () => {
  const text = [
    "<CustomField>",
    "  <!-- see .claude notes -->",
    "  <description",
    "  >Shown on the card (Round 6 plan N7).</description>",
    "  <inlineHelpText>Ask @Orchestrator first</inlineHelpText>",
    "  <label>N7 label is a value, not prose</label>",
    "</CustomField>"
  ].join("\n");
  assert.deepStrictEqual(matches("a/f.field-meta.xml", text), [
    ".claude",
    "Round 6",
    "N7",
    "@Orchestrator"
  ]);
});

test("a hit in a CSS block comment fails", () => {
  assert.deepStrictEqual(
    matches("a/x.css", "/* tokens from contract L1 */\n.a { color: red; }"),
    ["L1"]
  );
});

test("a hit in a YAML comment or description value fails", () => {
  const text = [
    "# owner answer 7c",
    "paths:",
    "  /skills:",
    "    get:",
    "      description: Lists skills (R18).",
    "      summary: S1 summary is not checked",
    "    post:",
    "      description: |",
    "        First line.",
    "        Kept since Round 4.",
    "      operationId: G5",
    '      example: "M10 # not a comment"'
  ].join("\n");
  assert.deepStrictEqual(matches("a/spec.yaml", text), [
    "owner answer",
    "R18",
    "Round 4"
  ]);
});

test("a hit in a JSON description value fails and other keys pass", () => {
  const text =
    '{\n  "id": "S51",\n  "description": "Built for Round 5 (M9)",\n  "value": "P02"\n}';
  assert.deepStrictEqual(matches("a/x.json", text), ["Round 5", "M9"]);
});

test("a hit anywhere in a Markdown file fails", () => {
  assert.deepStrictEqual(matches("a/README.md", "Ships in Round 8."), [
    "Round 8"
  ]);
});

test("a hex colour passes", () => {
  const css = ".a { color: #E4E4E7; background: #B12; border-color: #D3D3D3; }";
  assert.deepStrictEqual(matches("a/x.css", css), []);
  assert.deepStrictEqual(matches("a/x.js", 'const accent = "#B12";'), []);
});

test("an h1 tag passes", () => {
  assert.deepStrictEqual(
    matches("a/x.html", "<template><h1>Title</h1><h2>Sub</h2></template>"),
    []
  );
});

test("a plan code inside a JS string, template or regex passes", () => {
  const text = [
    'const id = "F7";',
    "const label = 'P2';",
    "const t = `pillar ${id} and E3 ${`nested M1`}`;",
    "const re = /R18\\/G5/;",
    "const url = 'https://example.com/a'; // a real comment"
  ].join("\n");
  assert.deepStrictEqual(matches("a/x.js", text), []);
});

test("a plan code inside an Apex string passes", () => {
  const text =
    "String path = 'M10 10'; // the svg path\nAssert.areEqual('E4', x, 'msg');";
  assert.deepStrictEqual(matches("a/Foo.cls", text), []);
});

test("an ADR reference passes", () => {
  assert.deepStrictEqual(
    matches("a/Foo.cls", "// Auth is platform native, see ADR-027.\n"),
    []
  );
  assert.deepStrictEqual(
    matches(
      "a/f.xml",
      "<x><description>Read only per ADR-028.</description></x>"
    ),
    []
  );
});

test("a comment after code on the same line is still checked", () => {
  assert.deepStrictEqual(
    matches("a/x.js", 'const a = "x"; // stream (b) wrote this'),
    ["stream ("]
  );
});

test("unscanned extensions and vendored bundles are skipped", () => {
  assert.strictEqual(isScanned("packages/a/x.svg"), false);
  assert.strictEqual(isScanned("packages/a/x.page"), false);
  assert.strictEqual(isScanned("packages/a/x.cls"), true);
  for (const bundle of VENDORED) {
    assert.ok(bundle.library, `${bundle.path} names its library`);
    assert.strictEqual(isScanned(bundle.path), false);
  }
});

test("exit code 1 lists path:line: match for each hit", () => {
  const result = runScript({
    "packages/a/Foo.cls": "public class Foo {\n  // Round 7 plan P5\n}\n"
  });
  assert.strictEqual(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /^packages\/a\/Foo\.cls:2: Round 7, P5$/m);
});

test("exit code 0 when clean", () => {
  const result = runScript({
    "packages/a/Foo.cls":
      "public class Foo {\n  // Explains itself, see ADR-027.\n  String s = 'F7';\n}\n",
    "packages/a/x.css": ".a { color: #E4E4E7; }\n"
  });
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /No internal references in 2 scanned file/);
});

test("a vendored bundle is skipped by the script", () => {
  const result = runScript({
    [VENDORED[0].path]: "/* Round 7 (audit E1) appended these */\n",
    "packages/a/clean.js": "// nothing to see\n"
  });
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /No internal references in 1 scanned file/);
});

test("an allowlisted line passes and other hits still fail", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "refs-allow-"));
  const allowlist = path.join(root, "allow.json");
  fs.writeFileSync(
    allowlist,
    JSON.stringify([
      {
        path: "packages/a/Foo.cls",
        line: "// The vendor's own field is named M10.",
        reason: "a real vendor name the script cannot tell from a plan code"
      }
    ])
  );
  const allowed = runScript(
    {
      "packages/a/Foo.cls":
        "public class Foo {\n  // The vendor's own field is named M10.\n}\n"
    },
    ["--allowlist", allowlist]
  );
  assert.strictEqual(allowed.status, 0, allowed.stdout + allowed.stderr);
  const other = runScript(
    {
      "packages/a/Foo.cls":
        "public class Foo {\n  // The vendor's own field is named M10.\n  // and F7 here\n}\n"
    },
    ["--allowlist", allowlist]
  );
  assert.strictEqual(other.status, 1);
  assert.match(other.stdout, /Foo\.cls:3: F7/);
  assert.doesNotMatch(other.stdout, /Foo\.cls:2:/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("the shipped allowlist is valid and every entry gives a reason", () => {
  const entries = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "internal-refs-allowlist.json"),
      "utf8"
    )
  );
  assert.ok(Array.isArray(entries));
  for (const entry of entries) {
    assert.ok(entry.path && entry.line && entry.reason);
  }
});

// Tests for scripts/check-file-length.js. Run: node --test scripts/check-file-length.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  EXCLUSIONS,
  countLines,
  skipReason,
  findLongFiles,
  formatReport
} = require("./check-file-length.js");

function makeFolder(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "file-length-"));
  for (const [name, lines] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Array(lines).fill("x").join("\n") + "\n");
  }
  return root;
}

test("counts lines with and without a final line break", () => {
  assert.strictEqual(countLines(""), 0);
  assert.strictEqual(countLines("a"), 1);
  assert.strictEqual(countLines("a\n"), 1);
  assert.strictEqual(countLines("a\nb"), 2);
  assert.strictEqual(countLines("a\r\nb\r\n"), 2);
});

test("a file at the limit passes and one over it is listed, longest first", () => {
  const root = makeFolder({ "a.js": 5, "b.js": 6, "c.cls": 9 });
  const long = findLongFiles(["a.js", "b.js", "c.cls"], root, 5);
  assert.deepStrictEqual(long, [
    { file: "c.cls", lines: 9 },
    { file: "b.js", lines: 6 }
  ]);
});

test("generated and vendored paths are skipped even when long", () => {
  const root = makeFolder({
    "packages/portfolio-site/main/default/staticresources/Lib.js": 50,
    "web/functions/_generated/lab-paths.js": 50,
    "web/app.min.js": 50,
    "web/src/real.js": 50
  });
  const files = [
    "packages/portfolio-site/main/default/staticresources/Lib.js",
    "web/functions/_generated/lab-paths.js",
    "web/app.min.js",
    "web/src/real.js"
  ];
  assert.deepStrictEqual(findLongFiles(files, root, 10), [
    { file: "web/src/real.js", lines: 50 }
  ]);
});

test("data and doc file types are skipped, source types are not", () => {
  assert.ok(skipReason("package-lock.json"));
  assert.ok(skipReason("docs/guides/03-SAS.md"));
  assert.ok(skipReason("packages/x/specs/api.yaml"));
  assert.ok(skipReason("perm.permissionset-meta.xml"));
  assert.strictEqual(skipReason("scripts/live-smoke.js"), null);
  assert.strictEqual(skipReason("classes/Foo.cls"), null);
});

test("every exclusion gives a reason", () => {
  EXCLUSIONS.forEach((e) => {
    assert.ok(e.glob && e.reason.length > 10);
  });
});

test("a file listed by git but missing on disk is ignored", () => {
  const root = makeFolder({});
  assert.deepStrictEqual(findLongFiles(["gone.js"], root, 1), []);
});

test("in Actions each file becomes a warning line with the path", () => {
  const lines = formatReport([{ file: "web/a,b.js", lines: 1500 }], 1000, true);
  assert.strictEqual(lines.length, 1);
  assert.match(lines[0], /^::warning file=web\/a%2Cb\.js::/);
  assert.match(lines[0], /1500 lines, over the 1000 line limit/);
});

test("outside Actions it prints a plain list and a clean message", () => {
  const list = formatReport([{ file: "a.js", lines: 1200 }], 1000, false);
  assert.match(list[0], /1 source file is over 1000 lines/);
  assert.match(list[1], /1200 {2}a\.js/);
  assert.ok(!list.join("\n").includes("::warning"));
  assert.deepStrictEqual(formatReport([], 1000, false), [
    "No source file is over 1000 lines."
  ]);
});

test("the script exits 0 and warns when a file is long", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "check-file-length.js"), "--limit", "50"],
    { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "true" } }
  );
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /::warning file=/);
});

// Tests for scripts/check-build-status.js. Run: node --test scripts/check-build-status.test.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  checkPhrases,
  checkStatusColumns,
  checkAdr,
  scan
} = require("./check-build-status.js");

const SCRIPT = path.join(__dirname, "check-build-status.js");

const GOOD_ADR = `# ADR-099: Example

## Status

- **Decision:** Accepted
- **Build:** [Live](../../scripts/example.js)

## Context
`;

/** A scratch docs tree with the given files, as { "docs/adr/001-x.md": "text" }. */
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "build-status-"));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return root;
}

test("each old phrasing fails", () => {
  const phrases = [
    "Phase 1 (Completed)",
    "Design Complete",
    "Designed, not built",
    "designed and not built",
    "Design only",
    "Future Scope",
    "Future Enhancements",
    "Accepted and built",
    "It is not built",
    "Deferred to V2.0",
    "planned for 2027",
    "Accepted, cutover pending",
    "In source, inactive"
  ];
  for (const phrase of phrases) {
    const failures = checkPhrases("docs/guides/x.md", `Text.\n${phrase}\n`);
    assert.ok(failures.length >= 1, phrase);
    assert.match(failures[0], /docs\/guides\/x\.md:2:/);
  }
});

test("the three words and plain prose pass", () => {
  const text =
    "Phase 1 is Live. Phase 8 is Designed. The cutover is In progress.\nThe job finished and the test completed.\n";
  assert.deepStrictEqual(checkPhrases("docs/guides/x.md", text), []);
});

test("dateCompleted passes, as a field name and in a code span", () => {
  const text =
    "| dateCompleted | string | When the run finished |\nThe `Completed` status and `not built` value are literals.\nThe field dateCompleted and numberTestsCompleted come from the API.\n";
  assert.deepStrictEqual(checkPhrases("docs/guides/x.md", text), []);
});

test("fenced code and link targets are skipped", () => {
  const text =
    "```yaml\nstatus: Completed\n```\nSee [the quota note](#51-quota-monitoring-not-built).\n";
  assert.deepStrictEqual(checkPhrases("docs/guides/x.md", text), []);
});

test("the generated API documents are never scanned", () => {
  const root = tree({
    "README.md": "Live.\n",
    "docs/adr/099-example.md": GOOD_ADR,
    "docs/api/oas/papi.md": "dateCompleted Completed Completed\n"
  });
  assert.deepStrictEqual(scan(root), []);
});

test("an ADR with Decision and Build lines passes", () => {
  assert.deepStrictEqual(checkAdr("docs/adr/099-example.md", GOOD_ADR), []);
});

test("an ADR with no Build field fails", () => {
  const text = GOOD_ADR.replace(/- \*\*Build:\*\*.*\n/, "");
  const failures = checkAdr("docs/adr/099-example.md", text);
  assert.strictEqual(failures.length, 1);
  assert.match(failures[0], /no "- \*\*Build:\*\*" line/);
});

test("an ADR with no Decision field fails", () => {
  const text = GOOD_ADR.replace(/- \*\*Decision:\*\*.*\n/, "");
  const failures = checkAdr("docs/adr/099-example.md", text);
  assert.strictEqual(failures.length, 1);
  assert.match(failures[0], /no "- \*\*Decision:\*\*" line/);
});

test("a Decision or Build outside the vocabulary fails", () => {
  const badDecision = GOOD_ADR.replace("Accepted", "Approved");
  assert.match(checkAdr("a.md", badDecision)[0], /Decision/);
  const badBuild = GOOD_ADR.replace(
    "[Live](../../scripts/example.js)",
    "Built"
  );
  assert.match(checkAdr("a.md", badBuild)[0], /Build "Built"/);
});

test("Live must link to its evidence", () => {
  const text = GOOD_ADR.replace("[Live](../../scripts/example.js)", "Live");
  const failures = checkAdr("docs/adr/099-example.md", text);
  assert.strictEqual(failures.length, 1);
  assert.match(failures[0], /does not link to its evidence/);
});

test("Designed needs no link, and Live may carry more words after the link", () => {
  const designed = GOOD_ADR.replace(
    "[Live](../../scripts/example.js)",
    "Designed. Nothing is built."
  );
  assert.deepStrictEqual(checkAdr("a.md", designed), []);
  const more = GOOD_ADR.replace(
    "[Live](../../scripts/example.js)",
    "[Live](../../scripts/example.js) since 2026-11-09, also [t](../../x.js)"
  );
  assert.deepStrictEqual(checkAdr("a.md", more), []);
});

test("In progress needs a Jira key", () => {
  const without = GOOD_ADR.replace(
    "[Live](../../scripts/example.js)",
    "In progress"
  );
  assert.match(checkAdr("a.md", without)[0], /names no Jira key/);
  const withKey = GOOD_ADR.replace(
    "[Live](../../scripts/example.js)",
    "In progress (SPAP-95)"
  );
  assert.deepStrictEqual(checkAdr("a.md", withKey), []);
});

test("a Status column outside the three words fails, and a Phase column is ignored", () => {
  const table =
    "| Area | Status |\n| :-- | :-- |\n| Docs | Complete |\n| Site | [Live](x.md) |\n";
  const failures = checkStatusColumns("STATUS.md", table);
  assert.strictEqual(failures.length, 1);
  assert.match(failures[0], /STATUS\.md:3: Status "Complete"/);
  const dictionary =
    "| Field | API |\n| :-- | :-- |\n| **Status** | `Status__c` |\n";
  assert.deepStrictEqual(
    checkStatusColumns("docs/guides/x.md", dictionary),
    []
  );
  const phase =
    "| Phase | Status |\n| :-- | :-- |\n| **Phase 8** | **Designed, 2027** |\n";
  assert.deepStrictEqual(checkStatusColumns("docs/guides/x.md", phase), []);
});

test("scan reports a tree with an old phrase and an ADR with no Build", () => {
  const root = tree({
    "README.md": "Fine.\n",
    "docs/guides/g.md": "Phase 1 (Completed)\n",
    "docs/adr/098-bad.md": GOOD_ADR.replace(/- \*\*Build:\*\*.*\n/, "")
  });
  const failures = scan(root);
  assert.strictEqual(failures.length, 2);
});

test("the command exits 1 on a bad tree, 0 on a good one and 2 on an empty one", () => {
  const good = tree({
    "README.md": "Live.\n",
    "docs/adr/099-example.md": GOOD_ADR
  });
  const bad = tree({ "README.md": "Design Complete.\n" });
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "build-status-empty-"));
  const run = (root) =>
    spawnSync(process.execPath, [SCRIPT, "--root", root], { encoding: "utf8" })
      .status;
  assert.strictEqual(run(good), 0);
  assert.strictEqual(run(bad), 1);
  assert.strictEqual(run(empty), 2);
});

test("the repository passes", () => {
  const root = path.resolve(__dirname, "..");
  assert.deepStrictEqual(scan(root), []);
});

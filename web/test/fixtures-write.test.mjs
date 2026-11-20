import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeData, readData } from "../build/export.mjs";
import { fixtureReads, FIXTURE_TEXT_LIMIT } from "../build/build.mjs";

test("writing the fixtures keeps the recorded folder and the fixture snapshot", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fixtures-write-"));
  fs.mkdirSync(path.join(dir, "recorded"));
  fs.writeFileSync(
    path.join(dir, "recorded/cover-letter.json"),
    '{"kept":true}'
  );
  fs.writeFileSync(path.join(dir, "resume-snapshot.json"), '{"kept":true}');
  fs.writeFileSync(path.join(dir, "reads.json"), '{"old":1}');

  writeData({ a: 1 }, { fixture: true }, dir);

  assert.equal(
    fs.readFileSync(path.join(dir, "recorded/cover-letter.json"), "utf8"),
    '{"kept":true}'
  );
  assert.equal(
    fs.readFileSync(path.join(dir, "resume-snapshot.json"), "utf8"),
    '{"kept":true}'
  );
  assert.deepEqual(readData(dir).reads, { a: 1 });
  assert.equal(readData(dir).manifest.fixture, true);
});

test("writing to a folder that does not exist yet makes it", () => {
  const dir = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "fixtures-write-")),
    "new"
  );
  writeData({ b: 2 }, { fixture: false }, dir);
  assert.deepEqual(readData(dir).reads, { b: 2 });
});

test("fixtures keep a whole document body and still cut other long text", () => {
  const long = "word ".repeat(FIXTURE_TEXT_LIMIT);
  const reads = {
    'SourceController.getDoc|{"docKey":"sas"}': { key: "sas", content: long },
    'SourceController.getSourceFiles|{"sourceKey":"footer"}': [
      { path: "footer.js", content: long }
    ],
    "SourceController.getDocs": [
      { key: "sas", title: "SAS", path: "docs/guides/03-SAS.md" }
    ]
  };

  const out = fixtureReads(reads);

  assert.equal(out['SourceController.getDoc|{"docKey":"sas"}'].content, long);
  assert.ok(
    out['SourceController.getSourceFiles|{"sourceKey":"footer"}'][0].content
      .length < long.length
  );
  assert.deepEqual(
    out["SourceController.getDocs"],
    reads["SourceController.getDocs"]
  );
});

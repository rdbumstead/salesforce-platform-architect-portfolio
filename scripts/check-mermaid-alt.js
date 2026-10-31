#!/usr/bin/env node
/* eslint-disable no-console */

// Mermaid alt text gate. Every Mermaid block under docs/ needs a sentence in
// scripts/render-mermaid-alt.json, keyed by the block's hash. Editing any text inside a block
// changes its hash, so the old sentence no longer matches and CI's render-mermaid test fails.
// This runs the same check before the commit and says how to fix it.
//
//   node scripts/check-mermaid-alt.js
//
// lint-staged runs it when a staged file under docs/ is Markdown. It ignores any arguments,
// because the check needs every block in docs/, not only the staged files. It reads files only
// and needs no org. Exit code 0 when every block has a sentence, 1 otherwise.

const fs = require("fs");
const path = require("path");
const { findDiagrams, loadHash } = require("./render-mermaid.js");

const ROOT = path.resolve(__dirname, "..");
const DOCS_DIR = path.join(ROOT, "docs");
const ALT_FILE = path.join(__dirname, "render-mermaid-alt.json");

const alt = JSON.parse(fs.readFileSync(ALT_FILE, "utf8"));
const diagrams = findDiagrams(DOCS_DIR, loadHash());
const missing = diagrams.filter((diagram) => !alt[diagram.hash]);

if (missing.length === 0) {
  console.log(
    `Mermaid alt text check passed: ${diagrams.length} diagrams, each with a sentence.`
  );
  process.exit(0);
}

// A key no block uses any more is most likely the old hash of a block that was just edited.
const used = new Set(diagrams.map((diagram) => diagram.hash));
const unused = Object.keys(alt).filter((hash) => !used.has(hash));

console.error("Mermaid alt text check failed.");
for (const diagram of missing) {
  console.error(
    `  No sentence for hash ${diagram.hash} in ${diagram.files.join(", ")}`
  );
}
console.error(
  "Add a sentence for each hash to scripts/render-mermaid-alt.json. If you only edited a block,"
);
console.error(
  "rename its old key to the new hash and check the sentence still describes it."
);
if (unused.length > 0) {
  console.error("Keys no block uses any more, probably the old hashes:");
  for (const hash of unused) {
    console.error(`  ${hash}: ${alt[hash]}`);
  }
}
process.exit(1);

#!/usr/bin/env node
/* eslint-disable no-console */

// Doc count gate. Counts the ADR files in docs/adr (names like 031-some-title.md) and fails
// when a count of ADRs typed into README.md or STATUS.md disagrees, or when an ADR file is
// not linked from the README's ADR index or from docs/index.md.
//
//   node scripts/check-doc-counts.js
//
// It reads files only and needs no org. Exit code 0 when everything agrees, 1 otherwise.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ADR_DIR = path.join(ROOT, "docs", "adr");
const ADR_FILE = /^(\d{3})-[a-z0-9-]+\.md$/;

// Every phrase in README.md or STATUS.md that states how many ADRs there are. Each pattern
// captures the number. A count written in some other phrasing is not checked, so new
// phrasings belong here.
const COUNT_PATTERNS = [
  /(\d+) ADRs\b/g,
  /(\d+) Architectural Decisions\b/g,
  /(\d+) documented decisions\b/g,
  /Complete \((\d+) records\)/g
];

// Files whose ADR links must cover every ADR file.
const INDEX_FILES = ["README.md", "docs/index.md"];

function adrFiles() {
  return fs
    .readdirSync(ADR_DIR)
    .filter((name) => ADR_FILE.test(name))
    .sort();
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function checkCounts(file, expected) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  const problems = [];
  let found = 0;
  for (const pattern of COUNT_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      found++;
      const stated = Number(match[1]);
      if (stated !== expected) {
        problems.push(
          `${file}:${lineOf(text, match.index)} says "${match[0]}", but docs/adr holds ${expected} ADR files.`
        );
      }
    }
  }
  return { problems, found };
}

function checkLinks(file, names) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  return names
    .filter((name) => !text.includes(`adr/${name}`))
    .map((name) => `${file} has no link to docs/adr/${name}.`);
}

function main() {
  const names = adrFiles();
  const expected = names.length;
  const problems = [];

  const numbers = names.map((name) => Number(name.slice(0, 3)));
  numbers.forEach((number, i) => {
    if (number !== i + 1) {
      problems.push(
        `docs/adr numbering has a gap or a duplicate at ${names[i]} (expected ${String(i + 1).padStart(3, "0")}).`
      );
    }
  });

  let statedCounts = 0;
  for (const file of ["README.md", "STATUS.md"]) {
    const result = checkCounts(file, expected);
    problems.push(...result.problems);
    statedCounts += result.found;
  }
  if (statedCounts === 0) {
    problems.push(
      "No ADR count was found in README.md or STATUS.md, so the patterns in this script no longer match the docs."
    );
  }

  for (const file of INDEX_FILES) {
    problems.push(...checkLinks(file, names));
  }

  if (problems.length > 0) {
    console.error(`Doc count check FAILED (${problems.length} problems):`);
    problems.forEach((problem) => console.error(`- ${problem}`));
    process.exit(1);
  }
  console.log(
    `Doc count check passed: ${expected} ADR files, ${statedCounts} stated counts agree, every ADR is linked from ${INDEX_FILES.join(" and ")}.`
  );
}

main();

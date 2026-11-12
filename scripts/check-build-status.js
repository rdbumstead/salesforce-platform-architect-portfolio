#!/usr/bin/env node
/* eslint-disable no-console */

// Build status gate. The docs describe what is built with three words only:
//
//   Live         built and deployed, and the label links to its evidence (a test, a deploy, a
//                file or the live section)
//   In progress  taken from the Jira roadmap, never hand written. A doc cannot read Jira, so
//                this gate only requires the Jira key beside it (see JIRA_KEY)
//   Designed     an ADR or spec exists and nothing is built
//
// Each ADR splits its status into two lines under "## Status":
//
//   - **Decision:** Accepted, Superseded or Deferred
//   - **Build:** Live, In progress or Designed
//
// This gate fails on the older phrasings ("Completed", "Design Complete", "designed, not built",
// "Future Scope", "Accepted and built", "not built", "Deferred to", "planned for"), on an ADR
// whose Decision or Build line is missing or outside the vocabulary, on a Live label with no
// link, and on a Status column in README.md or STATUS.md that uses any other word.
//
//   node scripts/check-build-status.js              scans README.md, STATUS.md, docs/index.md,
//                                                   docs/guides and docs/adr
//   node scripts/check-build-status.js --root <dir> scans another folder laid out the same way
//
// It never reads docs/api, which npm run docs:api regenerates from the specifications and which
// holds field names such as dateCompleted. Fenced code blocks, inline code spans and link
// targets are skipped, so a field name, a literal value or an anchor never counts. Exit code 0
// when clean, 1 when there is at least one hit, 2 when the script cannot run.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const DECISIONS = ["Accepted", "Superseded", "Deferred"];
const BUILDS = ["Live", "In progress", "Designed"];
const JIRA_KEY = /\bSPAP-\d+\b/;

const OLD_PHRASES = [
  { re: /\bCompleted\b/, use: "Live, with a link to its evidence" },
  { re: /\bDesign Complete(?:d)?\b/i, use: "Designed" },
  { re: /\bdesigned,? (?:and )?not built\b/i, use: "Designed" },
  { re: /\bdesign only\b/i, use: "Designed" },
  { re: /\bfuture (?:scope|enhancements)\b/i, use: "Designed" },
  { re: /\baccepted and built\b/i, use: "Decision Accepted and Build Live" },
  { re: /\bnot (?:yet )?built\b/i, use: "Designed" },
  { re: /\bdeferred to\b/i, use: "Decision Deferred and Build Designed" },
  { re: /\bplanned for\b/i, use: "Designed, or In progress from the roadmap" },
  { re: /\bcutover pending\b/i, use: "In progress from the roadmap, or Live" },
  { re: /\bin source, inactive\b/i, use: "Designed" }
];

/** Text with fenced code, inline code spans and link targets blanked, line numbers kept. */
function prose(text) {
  let fenced = false;
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced;
        return "";
      }
      if (fenced) return "";
      return line.replace(/`[^`]*`/g, "``").replace(/\]\([^)]*\)/g, "]()");
    });
}

/** Words of a table cell with emphasis marks and link brackets taken off. */
function cellText(cell) {
  return cell
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/[*_[\]]/g, "")
    .trim();
}

/** True when the value starts with the word and the word ends there, as in "Live," or "Live ". */
function startsWithWord(value, word) {
  return (
    value.startsWith(word) && !/[A-Za-z0-9]/.test(value.charAt(word.length))
  );
}

/** Failures for the old phrasings in one Markdown file. */
function checkPhrases(file, text) {
  const failures = [];
  prose(text).forEach((line, i) => {
    for (const { re, use } of OLD_PHRASES) {
      const m = line.match(re);
      if (m) {
        failures.push(
          `${file}:${i + 1}: "${m[0]}" is an old phrasing. Use ${use}.`
        );
      }
    }
  });
  return failures;
}

/** Failures for a Status column that uses a word outside the vocabulary. */
function checkStatusColumns(file, text) {
  const failures = [];
  const lines = prose(text);
  let column = -1;
  lines.forEach((line, i) => {
    if (!line.trim().startsWith("|")) {
      column = -1;
      return;
    }
    const cells = line
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|");
    const next = lines[i + 1] || "";
    if (
      column === -1 &&
      /^\s*\|?\s*:?-+/.test(next) &&
      cells.some((c) => cellText(c) === "Status")
    ) {
      column = cells.findIndex((c) => cellText(c) === "Status");
      return;
    }
    if (column === -1 || /^\s*:?-+:?\s*$/.test(cells[column] || "")) return;
    const value = cellText(cells[column] || "");
    if (value && !BUILDS.some((word) => startsWithWord(value, word))) {
      failures.push(
        `${file}:${i + 1}: Status "${value}" is not ${BUILDS.join(", ")}.`
      );
    }
  });
  return failures;
}

/** Failures for one ADR's Decision and Build lines. */
function checkAdr(file, text) {
  const failures = [];
  const body = text.replace(/\r\n/g, "\n");
  const status = body.match(/## Status\n([\s\S]*?)\n## /);
  const section = status ? status[1] : "";
  const decision = section.match(/^- \*\*Decision:\*\* (.*)$/m);
  const build = section.match(/^- \*\*Build:\*\* (.*)$/m);
  if (!decision) {
    failures.push(`${file}: the Status section has no "- **Decision:**" line.`);
  } else if (!DECISIONS.some((w) => decision[1].startsWith(w))) {
    failures.push(
      `${file}: Decision "${decision[1].slice(0, 40)}" does not start with ${DECISIONS.join(", ")}.`
    );
  }
  if (!build) {
    failures.push(`${file}: the Status section has no "- **Build:**" line.`);
    return failures;
  }
  const value = cellText(build[1].replace(/\]\([^)]*\)/g, "]"));
  const word = BUILDS.find((w) => startsWithWord(value, w));
  if (!word) {
    failures.push(
      `${file}: Build "${value.slice(0, 40)}" does not start with ${BUILDS.join(", ")}.`
    );
  } else if (word === "Live" && !/\[Live\]\([^)]+\)/.test(build[1])) {
    failures.push(
      `${file}: Build is Live but the word Live does not link to its evidence.`
    );
  } else if (word === "In progress" && !JIRA_KEY.test(build[1])) {
    failures.push(
      `${file}: Build is In progress but names no Jira key such as SPAP-95.`
    );
  }
  return failures;
}

function listMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdown(full);
    return entry.name.endsWith(".md") ? [full] : [];
  });
}

/** Every file the gate reads under a root, as paths relative to it with forward slashes. */
function filesToScan(root) {
  const single = ["README.md", "STATUS.md", "docs/index.md"].filter((f) =>
    fs.existsSync(path.join(root, f))
  );
  const nested = ["docs/guides", "docs/adr"].flatMap((d) =>
    listMarkdown(path.join(root, d)).map((f) =>
      path.relative(root, f).replace(/\\/g, "/")
    )
  );
  return [...single, ...nested];
}

function scan(root) {
  const failures = [];
  for (const file of filesToScan(root)) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    failures.push(...checkPhrases(file, text));
    failures.push(...checkStatusColumns(file, text));
    if (/^docs\/adr\/\d{3}-[^/]+\.md$/.test(file)) {
      failures.push(...checkAdr(file, text));
    }
  }
  return failures;
}

function main(argv) {
  const at = argv.indexOf("--root");
  const root = at >= 0 ? path.resolve(argv[at + 1]) : ROOT;
  const files = filesToScan(root);
  if (files.length === 0) {
    console.error(`No documents found under ${root}.`);
    return 2;
  }
  const failures = scan(root);
  if (failures.length === 0) {
    console.log(`Build status check passed: ${files.length} documents.`);
    return 0;
  }
  console.error(`Build status check failed with ${failures.length} hit(s).`);
  failures.forEach((f) => console.error(`  ${f}`));
  console.error(
    "Use Live (linked to its evidence), In progress (from the roadmap) or Designed. An ADR gives a Decision line and a Build line."
  );
  return 1;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  checkPhrases,
  checkStatusColumns,
  checkAdr,
  scan,
  filesToScan
};

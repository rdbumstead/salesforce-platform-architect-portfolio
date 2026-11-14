#!/usr/bin/env node
/* eslint-disable no-console */
// Refuses private evaluation files. Real job postings, gold selections and run results for the
// tailoring evaluation live under web/tailor-eval/private/, which git ignores. A forced add gets
// past the ignore rule, so this fails when such a path is staged (the default, run by the commit
// hook) or tracked (--tracked, run by the web tests in CI).
const { execFileSync } = require("child_process");

const PRIVATE = [
  /^web\/tailor-eval\/private\//,
  /^web\/tailor-eval\/gold\/(?!README\.md$)/,
  /^web\/functions\/_generated\/resume-snapshot\.json$/
];

/** The paths in a list that must never be committed. */
function privatePaths(files) {
  return files.filter((file) => PRIVATE.some((pattern) => pattern.test(file)));
}

function listed(tracked) {
  const args = tracked
    ? ["ls-files", "-z"]
    : ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"];
  return execFileSync("git", args, { maxBuffer: 64 * 1024 * 1024 })
    .toString()
    .split("\0")
    .filter(Boolean);
}

function main() {
  const tracked = process.argv.includes("--tracked");
  const hits = privatePaths(listed(tracked));
  if (hits.length) {
    console.error(
      `[ERROR] Private evaluation files are ${tracked ? "tracked" : "staged"}:`
    );
    for (const file of hits) console.error(`  ${file}`);
    console.error(
      "Remove them with git rm --cached <file>. They belong only in paths git ignores."
    );
    process.exit(1);
  }
  console.log(
    `[OK] No private evaluation files ${tracked ? "tracked" : "staged"}.`
  );
}

if (require.main === module) main();

module.exports = { privatePaths };

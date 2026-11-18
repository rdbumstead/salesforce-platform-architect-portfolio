#!/usr/bin/env node
/* eslint-disable no-console */

// Warns about tracked source files longer than a limit (1,000 lines by default). It never
// fails: the exit code is 0 whatever it finds, so a long file is a prompt to split it and
// never a blocked PR.
//
//   node scripts/check-file-length.js [--limit N]
//
// In GitHub Actions each long file becomes a ::warning file=<path>:: line, which shows on the
// PR. Anywhere else it prints a plain list. Only hand written source is counted. Generated,
// vendored and data files are skipped, and each skip below says why.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_LIMIT = 1000;

/** File types that hold hand written source. Anything else (docs, JSON, YAML, XML) is not counted. */
const SOURCE_EXTENSIONS = [
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".cls",
  ".trigger",
  ".html",
  ".css",
  ".sh",
  ".apex"
];

/**
 * Source files that are not hand written. A path matches by a glob (** crosses folders, *
 * does not). Every entry says why, and a long hand written file does not belong here.
 */
const EXCLUSIONS = [
  {
    glob: "packages/*/main/default/staticresources/**",
    reason:
      "static resources are vendored libraries and generated copies of the specs"
  },
  {
    glob: "web/functions/_generated/**",
    reason: "written by the build, not by hand"
  },
  {
    glob: "**/*.min.js",
    reason: "minified output"
  }
];

/** A glob as a regular expression. ** crosses folders, * stays inside one name. */
function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          out += "(?:.*/)?";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else {
      out += c.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
    }
  }
  return new RegExp("^" + out + "$");
}

/** The reason a file is skipped, or null when it is counted. */
function skipReason(file, exclusions = EXCLUSIONS) {
  const ext = path.extname(file).toLowerCase();
  if (!SOURCE_EXTENSIONS.includes(ext)) return "not a source file type";
  const hit = exclusions.find((e) => globToRegExp(e.glob).test(file));
  return hit ? hit.reason : null;
}

/** Lines in a text: the number of line breaks, plus one when the last line has none. */
function countLines(text) {
  if (text.length === 0) return 0;
  const breaks = text.split("\n").length - 1;
  return text.endsWith("\n") ? breaks : breaks + 1;
}

/** Tracked files, as paths with forward slashes, relative to the root. */
function trackedFiles(root = ROOT) {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error("git ls-files failed: " + (result.stderr || "").trim());
  }
  return result.stdout.split("\0").filter(Boolean);
}

/** Counted files over the limit, longest first. */
function findLongFiles(
  files,
  root,
  limit = DEFAULT_LIMIT,
  exclusions = EXCLUSIONS
) {
  const long = [];
  for (const file of files) {
    if (skipReason(file, exclusions)) continue;
    let text;
    try {
      text = fs.readFileSync(path.join(root, file), "utf8");
    } catch {
      continue; // listed by git but missing on disk, for example deleted and not staged
    }
    const lines = countLines(text);
    if (lines > limit) long.push({ file, lines });
  }
  return long.sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
}

/** A message for a GitHub workflow command, with the characters it treats as markup escaped. */
function escapeMessage(text) {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** The property value of a workflow command, which also escapes the colon and comma. */
function escapeProperty(text) {
  return escapeMessage(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/** The output lines for the long files, as workflow warnings or as a plain list. */
function formatReport(long, limit, inActions) {
  if (inActions) {
    return long.map(
      ({ file, lines }) =>
        `::warning file=${escapeProperty(file)}::${escapeMessage(
          `${file} is ${lines} lines, over the ${limit} line limit. Consider splitting it.`
        )}`
    );
  }
  if (long.length === 0) {
    return [`No source file is over ${limit} lines.`];
  }
  return [
    `${long.length} source file${long.length === 1 ? " is" : "s are"} over ${limit} lines. This is a warning only.`,
    ...long.map(({ file, lines }) => `${String(lines).padStart(6)}  ${file}`)
  ];
}

function main(argv) {
  const at = argv.indexOf("--limit");
  const limit = at >= 0 ? Number(argv[at + 1]) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    console.log(`Ignoring a bad --limit, using ${DEFAULT_LIMIT}.`);
  }
  const used = Number.isInteger(limit) && limit >= 1 ? limit : DEFAULT_LIMIT;
  const long = findLongFiles(trackedFiles(), ROOT, used);
  formatReport(long, used, process.env.GITHUB_ACTIONS === "true").forEach((l) =>
    console.log(l)
  );
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    // A warning check must never block a PR, so even a failure to list files exits 0.
    console.log(`Long file check could not run: ${error.message}`);
    process.exitCode = 0;
  }
}

module.exports = {
  DEFAULT_LIMIT,
  EXCLUSIONS,
  countLines,
  skipReason,
  findLongFiles,
  formatReport,
  escapeMessage,
  escapeProperty
};

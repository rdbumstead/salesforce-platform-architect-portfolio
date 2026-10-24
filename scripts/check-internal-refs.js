#!/usr/bin/env node
/* eslint-disable no-console */

// Internal reference gate. Fails when a comment, a metadata description or a help text under
// packages/ names a build process code instead of explaining the code on its own terms: a
// round number, a log or trap number, a plan code such as F7 or P2, a .claude path, or the
// words "owner answer", "kickoff", "workstream", "stream (" and "@Orchestrator". The repo is
// public and the site serves some of these files, so those codes leak process and mean
// nothing to a reader.
//
//   node scripts/check-internal-refs.js              scans every tracked file under packages/
//   node scripts/check-internal-refs.js <path> ...   scans only these files or directories
//
// Options: --root <dir> resolves paths against <dir> instead of the repo root, and
// --allowlist <file> reads a different allowlist. Both exist for the tests.
//
// Only text a reader sees as prose is checked. Code, string literals, markup, CSS rules and
// metadata values are not, so a hex colour, an h1 tag or an id in test data never counts.
// What counts as prose depends on the file type:
//   .cls .trigger .js   line and block comments
//   .html               HTML comments
//   .xml                XML comments and the text of <description> and <inlineHelpText>
//   .css                block comments
//   .yaml .yml          # comments and description values
//   .json               string values whose key is "description"
//   .md                 the whole file
//
// Exit code 0 when clean, 1 when there is at least one hit (each printed as path:line: match),
// 2 when the script itself cannot run.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_ALLOWLIST = path.join(__dirname, "internal-refs-allowlist.json");
const DEFAULT_TARGETS = ["packages"];

const EXTENSIONS = new Set([
  ".cls",
  ".trigger",
  ".js",
  ".html",
  ".css",
  ".xml",
  ".json",
  ".yaml",
  ".yml",
  ".md"
]);

// Third party bundles copied in unchanged. Their text belongs to their authors, so they are
// never scanned. Paths are relative to the repo root.
const VENDORED = [
  {
    path: "packages/portfolio-site/main/default/staticresources/D3_Library.js",
    library:
      "D3 (d3-dispatch, d3-quadtree, d3-timer, d3-force, d3-selection, d3-color, d3-interpolate, d3-ease, d3-transition, d3-drag, d3-zoom)"
  },
  {
    path: "packages/portfolio-site/main/default/staticresources/Redoc_Script.js",
    library: "Redoc standalone"
  },
  {
    path: "packages/portfolio-site/main/default/staticresources/jsPDF_Library.js",
    library: "jsPDF 3.0.4"
  },
  {
    path: "packages/portfolio-site/main/default/staticresources/Marked_Library.js",
    library: "marked 18.1.0"
  },
  {
    path: "packages/portfolio-site/main/default/staticresources/Prism_JS/prism.js",
    library: "PrismJS 1.30.0"
  },
  {
    path: "packages/portfolio-site/main/default/staticresources/Prism_JS/prism.css",
    library: "PrismJS 1.30.0 theme"
  },
  {
    path: "packages/portfolio-site/main/default/staticresources/SiteSamples/SiteStyles.css",
    library: "Salesforce Sites sample stylesheet"
  }
];

// The banned references. Each has a name so a hit says which rule it broke. The plan code
// rule is case sensitive on purpose, because lower case letters with digits are ordinary
// identifiers. The word rules ignore case so a sentence that starts with one is still caught.
// "D3.js" is the library's own name, not a plan code, so the plan code rule skips it. A bare
// "D3" is still caught.
const RULES = [
  { name: "round", pattern: /\bRound [0-9]/gi },
  { name: "log number", pattern: /\blogs? [0-9]{2,3}\b/gi },
  { name: "trap number", pattern: /\btraps? [0-9]{1,3}\b/gi },
  { name: ".claude path", pattern: /\.claude/gi },
  { name: "owner answer", pattern: /owner answer/gi },
  { name: "kickoff", pattern: /kickoff/gi },
  { name: "workstream", pattern: /workstream/gi },
  { name: "stream", pattern: /\bstream \(/gi },
  { name: "@Orchestrator", pattern: /@Orchestrator/gi },
  {
    name: "plan code",
    pattern: /\b(?!D3\.js\b)[ABDEFGKLMNPRSX][0-9]{1,2}\b/g
  }
];

// ---------------------------------------------------------------------------------------
// Prose extraction. Each extractor returns the file's text with everything that is not
// prose replaced by spaces. Newlines are kept, so line numbers still match the source.
// ---------------------------------------------------------------------------------------

function blank(text) {
  return text.replace(/[^\n]/g, " ");
}

// Keeps the ranges [start, end) of text and blanks the rest.
function keepRanges(text, ranges) {
  const out = blank(text).split("");
  for (const [start, end] of ranges) {
    for (let i = start; i < end; i++) {
      out[i] = text[i];
    }
  }
  return out.join("");
}

// Characters after which a / starts a regular expression literal rather than a division.
const REGEX_PREFIX = new Set("(,=:[!&|?{};+-*%<>~^".split(""));
const REGEX_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await"
]);

function slashStartsRegex(text, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(text[i])) {
    i--;
  }
  if (i < 0) {
    return true;
  }
  const ch = text[i];
  if (REGEX_PREFIX.has(ch)) {
    return true;
  }
  if (/[A-Za-z_$]/.test(ch)) {
    let j = i;
    while (j >= 0 && /[A-Za-z0-9_$]/.test(text[j])) {
      j--;
    }
    return REGEX_KEYWORDS.has(text.slice(j + 1, i + 1));
  }
  return false;
}

// Line and block comments of a C style language. Apex has only single quoted strings. JS
// also has double quoted strings, template literals with ${} code inside, and regex literals.
function cStyleComments(text, isJs) {
  const ranges = [];
  // A stack of open template literals. Each entry counts the braces opened inside its ${}.
  const templates = [];
  let i = 0;
  const n = text.length;

  function skipString(quote) {
    i++;
    while (i < n && text[i] !== quote && text[i] !== "\n") {
      i += text[i] === "\\" ? 2 : 1;
    }
    i++;
  }

  // Reads template literal text from i until its closing backtick or a ${.
  function skipTemplateText() {
    while (i < n) {
      if (text[i] === "\\") {
        i += 2;
      } else if (text[i] === "`") {
        i++;
        return;
      } else if (text[i] === "$" && text[i + 1] === "{") {
        i += 2;
        templates.push(0);
        return;
      } else {
        i++;
      }
    }
  }

  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "/" && next === "/") {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      ranges.push([i, stop]);
      i = stop;
    } else if (ch === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      ranges.push([i, stop]);
      i = stop;
    } else if (ch === "'") {
      skipString("'");
    } else if (isJs && ch === '"') {
      skipString('"');
    } else if (isJs && ch === "`") {
      i++;
      skipTemplateText();
    } else if (isJs && templates.length && ch === "{") {
      templates[templates.length - 1]++;
      i++;
    } else if (isJs && templates.length && ch === "}") {
      if (templates[templates.length - 1] === 0) {
        templates.pop();
        i++;
        skipTemplateText();
      } else {
        templates[templates.length - 1]--;
        i++;
      }
    } else if (isJs && ch === "/" && slashStartsRegex(text, i)) {
      i++;
      let inClass = false;
      while (i < n && text[i] !== "\n") {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === "[") {
          inClass = true;
        } else if (text[i] === "]") {
          inClass = false;
        } else if (text[i] === "/" && !inClass) {
          break;
        }
        i++;
      }
      i++;
    } else {
      i++;
    }
  }
  return keepRanges(text, ranges);
}

function cssComments(text) {
  const ranges = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      ranges.push([i, stop]);
      i = stop;
    } else if (ch === '"' || ch === "'") {
      i++;
      while (i < n && text[i] !== ch && text[i] !== "\n") {
        i += text[i] === "\\" ? 2 : 1;
      }
      i++;
    } else {
      i++;
    }
  }
  return keepRanges(text, ranges);
}

function markupCommentRanges(text) {
  const ranges = [];
  const re = /<!--[\s\S]*?(?:-->|$)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function htmlComments(text) {
  return keepRanges(text, markupCommentRanges(text));
}

function xmlProse(text) {
  const ranges = markupCommentRanges(text);
  // Prettier can break the opening tag across lines, as in <description\n  >text.
  const re = /(<(description|inlineHelpText)\s*>)([\s\S]*?)<\/\2\s*>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[1].length;
    ranges.push([start, start + m[3].length]);
  }
  return keepRanges(text, ranges);
}

function jsonProse(text) {
  const ranges = [];
  const re = /"description"\s*:\s*"((?:[^"\\\n]|\\.)*)"/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length - m[1].length - 1;
    ranges.push([start, start + m[1].length]);
  }
  return keepRanges(text, ranges);
}

// Finds where a # comment starts on one YAML line, or -1. A # only starts a comment at the
// start of the line or after whitespace, and never inside a quoted scalar.
function yamlCommentStart(line) {
  let quote = null;
  let valueStart = true;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (quote === '"' && ch === "\\") {
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if ((ch === '"' || ch === "'") && valueStart) {
      quote = ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return i;
    }
    if (ch === ":" || ch === "-" || ch === "[" || ch === "," || ch === "{") {
      valueStart = true;
    } else if (!/\s/.test(ch)) {
      valueStart = false;
    }
  }
  return -1;
}

function indentOf(line) {
  return line.match(/^\s*/)[0].length;
}

function yamlProse(text) {
  const lines = text.split("\n");
  const kept = lines.map((line) => blank(line));
  const keyLine = /^(\s*)(?:- )?description:(\s*)(.*)$/;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const commentAt = yamlCommentStart(line);
    if (commentAt !== -1) {
      kept[i] = blank(line.slice(0, commentAt)) + line.slice(commentAt);
    }
    const m = line.match(keyLine);
    if (!m) {
      i++;
      continue;
    }
    const keyIndent = m[1].length;
    const value = m[3];
    const valueAt = line.length - value.length;
    const commentInValue = commentAt !== -1 && commentAt >= valueAt;
    const inline = commentInValue ? line.slice(valueAt, commentAt) : value;
    kept[i] =
      blank(line.slice(0, valueAt)) +
      inline +
      (commentInValue ? line.slice(commentAt) : "");
    const isBlock = /^[|>][-+0-9]*\s*$/.test(inline.trim());
    i++;
    // A block scalar runs while lines are blank or indented past the key. A plain or quoted
    // scalar can also continue on more indented lines that are not keys of their own.
    while (i < lines.length) {
      const nextLine = lines[i];
      if (nextLine.trim() === "") {
        i++;
        continue;
      }
      if (indentOf(nextLine) <= keyIndent) {
        break;
      }
      if (!isBlock && /^\s*(?:- |[\w$.-]+:(?:\s|$))/.test(nextLine)) {
        break;
      }
      kept[i] = nextLine;
      i++;
    }
  }
  return kept.join("\n");
}

function proseOf(filePath, text) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".cls":
    case ".trigger":
      return cStyleComments(text, false);
    case ".js":
      return cStyleComments(text, true);
    case ".html":
      return htmlComments(text);
    case ".xml":
      return xmlProse(text);
    case ".css":
      return cssComments(text);
    case ".yaml":
    case ".yml":
      return yamlProse(text);
    case ".json":
      return jsonProse(text);
    case ".md":
      return text;
    default:
      return blank(text);
  }
}

// ---------------------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------------------

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function isVendored(relPath) {
  return VENDORED.some((v) => v.path === relPath);
}

function isScanned(relPath) {
  return (
    EXTENSIONS.has(path.extname(relPath).toLowerCase()) && !isVendored(relPath)
  );
}

// Returns every hit in one file as { line, match, rule, text }.
function scanText(relPath, text) {
  const normalized = text.replace(/\r\n?/g, "\n");
  const sourceLines = normalized.split("\n");
  const proseLines = proseOf(relPath, normalized).split("\n");
  const hits = [];
  proseLines.forEach((prose, index) => {
    if (!prose.trim()) {
      return;
    }
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      let m;
      while ((m = rule.pattern.exec(prose)) !== null) {
        hits.push({
          line: index + 1,
          match: m[0],
          rule: rule.name,
          text: sourceLines[index]
        });
      }
    }
  });
  hits.sort((a, b) => a.line - b.line);
  return hits;
}

function loadAllowlist(file) {
  if (!fs.existsSync(file)) {
    return [];
  }
  const entries = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(entries)) {
    throw new Error(`${file} must hold a JSON array`);
  }
  for (const entry of entries) {
    if (!entry.path || !entry.line || !entry.reason) {
      throw new Error(`${file}: every entry needs path, line and reason`);
    }
  }
  return entries;
}

function isAllowed(allowlist, relPath, lineText) {
  return allowlist.some(
    (entry) => entry.path === relPath && entry.line.trim() === lineText.trim()
  );
}

function listTracked(root, target) {
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--", target], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024
    });
    return out.split("\0").filter(Boolean);
  } catch {
    return null;
  }
}

function walk(root, dir) {
  const found = [];
  for (const entry of fs.readdirSync(path.join(root, dir), {
    withFileTypes: true
  })) {
    const rel = path.posix.join(toPosix(dir), entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git") {
        found.push(...walk(root, rel));
      }
    } else {
      found.push(rel);
    }
  }
  return found;
}

// Expands targets into repo relative file paths. A directory is read from git so only tracked
// files count, or walked on disk when it is not inside a git work tree.
function expandTargets(root, targets) {
  const files = new Set();
  for (const target of targets) {
    const abs = path.resolve(root, target);
    if (!fs.existsSync(abs)) {
      throw new Error(`no such file or directory: ${target}`);
    }
    const rel = toPosix(path.relative(root, abs)) || ".";
    if (fs.statSync(abs).isFile()) {
      files.add(rel);
      continue;
    }
    const tracked = listTracked(root, rel);
    for (const file of tracked === null ? walk(root, rel) : tracked) {
      files.add(toPosix(file));
    }
  }
  return [...files].sort();
}

function parseArgs(argv) {
  const options = {
    root: REPO_ROOT,
    allowlist: DEFAULT_ALLOWLIST,
    targets: []
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root") {
      options.root = path.resolve(argv[++i]);
    } else if (argv[i] === "--allowlist") {
      options.allowlist = path.resolve(argv[++i]);
    } else {
      options.targets.push(argv[i]);
    }
  }
  if (!options.targets.length) {
    options.targets = DEFAULT_TARGETS;
  }
  return options;
}

function run(argv) {
  const options = parseArgs(argv);
  const allowlist = loadAllowlist(options.allowlist);
  const files = expandTargets(options.root, options.targets).filter(isScanned);
  const reported = [];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(options.root, rel), "utf8");
    // One output line per source line, naming every match on it.
    const byLine = new Map();
    for (const hit of scanText(rel, text)) {
      if (isAllowed(allowlist, rel, hit.text)) {
        continue;
      }
      if (!byLine.has(hit.line)) {
        byLine.set(hit.line, []);
      }
      byLine.get(hit.line).push(hit.match);
    }
    for (const [line, matches] of byLine) {
      reported.push(`${rel}:${line}: ${matches.join(", ")}`);
    }
  }
  for (const line of reported) {
    console.log(line);
  }
  if (reported.length) {
    console.log(
      `\n${reported.length} internal reference(s) in ${files.length} scanned file(s). ` +
        "Rewrite each comment or description to explain the code on its own terms."
    );
    return 1;
  }
  console.log(`No internal references in ${files.length} scanned file(s).`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(`check-internal-refs could not run: ${error.message}`);
    process.exitCode = 2;
  }
}

module.exports = { scanText, proseOf, isScanned, VENDORED, RULES, run };

#!/usr/bin/env node
/* eslint-disable no-console */

// Draws every Mermaid block in the docs to two SVG files, one per theme, for c/docsViewer.
//
//   node scripts/render-mermaid.js [--out <folder>] [--docs <folder>]
//
// The files go into the Mermaid_Diagrams static resource folder, whose drawings are never committed
// (.gitignore). Each is named <hash>-light.svg or <hash>-dark.svg, where the hash comes from
// lwc/docsViewer/diagramHash.js, the same function the viewer uses, over the text of the block
// as the vendored Marked_Library lexes it. A manifest.json beside them lists each hash with its
// text alternative from scripts/render-mermaid-alt.json. The viewer shows a drawing only for a
// hash the manifest lists, so an edited block falls back to its source until this runs again.
//
// The drawing is done by @mermaid-js/mermaid-cli, which is installed outside package.json:
//   npm install --prefix "$RUNNER_TEMP/mmd" --no-save --no-audit --no-fund \
//     @mermaid-js/mermaid-cli@<version> puppeteer@<version>
// and found through MERMAID_CLI_DIR (the --prefix folder). It needs a Chromium: set
// PUPPETEER_EXECUTABLE_PATH to one, or let puppeteer's own download be used. The browser is
// started with --no-sandbox, which a container running as root needs.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const LWC_DIR = path.join(
  ROOT,
  "packages/portfolio-site/main/default/lwc/docsViewer"
);
const MARKED = path.join(
  ROOT,
  "packages/portfolio-site/main/default/staticresources/Marked_Library.js"
);
const DEFAULT_OUT = path.join(
  ROOT,
  "packages/portfolio-site/main/default/staticresources/Mermaid_Diagrams"
);
const ALT_FILE = path.join(__dirname, "render-mermaid-alt.json");
const THEMES = Object.freeze({
  light: { theme: "default", background: "#ffffff" },
  dark: { theme: "dark", background: "#1b1f24" }
});

/** Loads the viewer's own hash function, an ES module file, without a build step. */
function loadHash() {
  const source = fs
    .readFileSync(path.join(LWC_DIR, "diagramHash.js"), "utf8")
    .replace(/export function/g, "function");
  return new Function(`${source}\nreturn diagramHash;`)();
}

function walkMarkdown(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "oas" && entry.name !== "node_modules") {
        walkMarkdown(full, found);
      }
    } else if (entry.name.endsWith(".md")) {
      found.push(full);
    }
  }
  return found;
}

function collectDiagrams(tokens, into) {
  for (const token of tokens || []) {
    if (
      token.type === "code" &&
      (token.lang || "").trim().toLowerCase() === "mermaid"
    ) {
      into.push(token.text || "");
    }
    collectDiagrams(token.tokens, into);
    for (const item of token.items || []) {
      collectDiagrams(item.tokens, into);
    }
  }
  return into;
}

/** Every distinct Mermaid block under docsDir, as { hash, source, files }. */
function findDiagrams(docsDir, hashOf) {
  const marked = require(MARKED);
  const byHash = new Map();
  for (const file of walkMarkdown(docsDir).sort()) {
    const markdown = fs.readFileSync(file, "utf8");
    const sources = collectDiagrams(marked.lexer(markdown, { gfm: true }), []);
    for (const source of sources) {
      const hash = hashOf(source);
      if (!byHash.has(hash)) {
        byHash.set(hash, { hash, source, files: [] });
      }
      byHash
        .get(hash)
        .files.push(path.relative(ROOT, file).split(path.sep).join("/"));
    }
  }
  return [...byHash.values()];
}

function readAlt() {
  try {
    return JSON.parse(fs.readFileSync(ALT_FILE, "utf8"));
  } catch {
    return {};
  }
}

function mmdcPath() {
  const dir = process.env.MERMAID_CLI_DIR;
  if (!dir) {
    throw new Error(
      "MERMAID_CLI_DIR is not set. Install the CLI with --prefix and set it."
    );
  }
  const bin = path.join(
    dir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "mmdc.cmd" : "mmdc"
  );
  if (!fs.existsSync(bin)) {
    throw new Error(`mmdc was not found at ${bin}`);
  }
  return bin;
}

/**
 * The text drawn for a theme. A block may pin its own colours with an init directive that names
 * a theme, for example %%{init: {'theme': 'base', 'themeVariables': {'mainBkg': '#ffffff'}}}%%.
 * That would paint a light diagram into the dark drawing, so the dark drawing leaves such a line
 * out and takes the dark theme. Spacing directives and the block's own classDef lines stay.
 */
function sourceFor(source, themeName) {
  if (themeName !== "dark") {
    return source;
  }
  return source
    .split("\n")
    .filter((line) => !/^\s*%%\{\s*init:.*theme/i.test(line))
    .join("\n");
}

function render(mmdc, tmp, diagram, themeName, outFile) {
  const theme = THEMES[themeName];
  const input = path.join(tmp, `${diagram.hash}.mmd`);
  fs.writeFileSync(input, sourceFor(diagram.source, themeName));
  // Text labels as SVG text, not foreignObject, so the drawing is the same as an image in
  // every engine.
  const mermaidConfig = path.join(tmp, "mermaid-config.json");
  fs.writeFileSync(
    mermaidConfig,
    JSON.stringify({ htmlLabels: false, flowchart: { htmlLabels: false } })
  );
  const puppeteerConfig = path.join(tmp, "puppeteer-config.json");
  fs.writeFileSync(
    puppeteerConfig,
    JSON.stringify({ args: ["--no-sandbox", "--disable-setuid-sandbox"] })
  );
  const result = spawnSync(
    mmdc,
    [
      "-i",
      input,
      "-o",
      outFile,
      "-t",
      theme.theme,
      "-b",
      theme.background,
      "-c",
      mermaidConfig,
      "-p",
      puppeteerConfig,
      "--quiet"
    ],
    { encoding: "utf8", shell: process.platform === "win32" }
  );
  if (result.status !== 0 || !fs.existsSync(outFile)) {
    throw new Error(
      `mmdc failed for ${diagram.hash} (${themeName}): ${result.stderr || result.stdout || result.error}`
    );
  }
}

function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const at = args.indexOf(name);
    return at >= 0 && args[at + 1] ? path.resolve(args[at + 1]) : fallback;
  };
  const out = option("--out", DEFAULT_OUT);
  const docsDir = option("--docs", path.join(ROOT, "docs"));
  const hashOf = loadHash();
  const diagrams = findDiagrams(docsDir, hashOf);
  if (diagrams.length === 0) {
    throw new Error(`No Mermaid blocks were found under ${docsDir}`);
  }
  const mmdc = mmdcPath();
  const alt = readAlt();
  fs.mkdirSync(out, { recursive: true });
  // Clear the earlier drawings but keep the committed placeholder.txt, so a checkout that
  // never rendered still deploys a resource with a file in it.
  for (const name of fs.readdirSync(out)) {
    if (name.endsWith(".svg") || name === "manifest.json") {
      fs.rmSync(path.join(out, name));
    }
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mermaid-"));
  const manifest = { diagrams: {} };
  try {
    for (const diagram of diagrams) {
      for (const themeName of Object.keys(THEMES)) {
        render(
          mmdc,
          tmp,
          diagram,
          themeName,
          path.join(out, `${diagram.hash}-${themeName}.svg`)
        );
      }
      manifest.diagrams[diagram.hash] = {
        alt: alt[diagram.hash] || "",
        from: diagram.files
      };
      console.log(`${diagram.hash} ${diagram.files.join(", ")}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  fs.writeFileSync(
    path.join(out, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  console.log(
    `Drew ${diagrams.length} diagrams into ${path.relative(ROOT, out)}`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  sourceFor,
  loadHash,
  findDiagrams,
  collectDiagrams,
  walkMarkdown
};

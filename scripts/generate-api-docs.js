const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Configuration
const SPEC_DIR = path.resolve("packages/integration-api/specs");
const OUTPUT_DIR = path.resolve("docs/api/oas");

const WIDDERSHINS_FLAGS =
  '--search false --language_tabs "javascript:JavaScript" "apex:Apex"';

const PLATFORM_ANCHOR = "error-platform";

/**
 * Reads the Errors section a spec writes into its description. Each entry is an anchor
 * line, then a heading such as "### BAD_REQUEST (400)". Returns the anchor for each error
 * code and the first error code for each status. A page with no such anchors has no
 * Errors section, and then nothing is moved or linked.
 */
function readErrorEntries(content) {
  const anchorByCode = {};
  const codeByStatus = {};
  const entryRe =
    /<a id="(error-[a-z0-9-]+)"><\/a>\s*\n+### ([A-Z_]+) \((\d{3})\)/g;
  let match;
  while ((match = entryRe.exec(content)) !== null) {
    anchorByCode[match[2]] = match[1];
    if (!codeByStatus[match[3]]) {
      codeByStatus[match[3]] = match[2];
    }
  }
  return {
    anchorByCode,
    codeByStatus,
    hasPlatform: content.includes(`<a id="${PLATFORM_ANCHOR}"></a>`)
  };
}

/** Parses a fenced JSON block. Returns the error it shows, or null for any other body. */
function classifyFence(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return null;
  }
  if (Array.isArray(parsed)) {
    const first = parsed[0];
    if (first && typeof first.errorCode === "string") {
      return { code: first.errorCode, status: null, platform: true };
    }
    return null;
  }
  if (parsed && typeof parsed.errorCode === "string") {
    return {
      code: parsed.errorCode,
      status: parsed.httpStatus ? String(parsed.httpStatus) : null,
      platform: false
    };
  }
  return null;
}

/**
 * Takes the example region of one operation (from "> Example responses" to the Responses
 * heading) and drops every example that shows an error body. Returns the kept lines and
 * the error examples that were dropped.
 */
function stripErrorExamples(lines) {
  const kept = [];
  const dropped = [];
  let pending = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```json")) {
      let end = i + 1;
      while (end < lines.length && !lines[end].startsWith("```")) {
        end += 1;
      }
      const fenceLines = lines.slice(i, end + 1);
      const body = lines.slice(i + 1, end).join("\n");
      const info = classifyFence(body);
      if (info) {
        dropped.push({ ...info, text: fenceLines.join("\n") });
        // The quote line that introduced this example goes with it.
        pending = [];
      } else {
        kept.push(...pending, ...fenceLines);
        pending = [];
      }
      i = end + 1;
      continue;
    }
    if (line.startsWith("> ") && line !== "> Example responses") {
      pending.push(line);
      i += 1;
      continue;
    }
    if (line.trim() === "" && pending.length > 0) {
      pending.push(line);
      i += 1;
      continue;
    }
    kept.push(...pending, line);
    pending = [];
    i += 1;
  }
  kept.push(...pending);
  return { kept, dropped };
}

/** The list that replaces the expanded error responses under one operation. */
function buildErrorList(tableStatuses, dropped, entries) {
  const found = [];
  const seen = new Set();
  function add(status, code, platform) {
    const key = `${status}|${code}|${platform}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ status, code, platform });
    }
  }
  const statusesWithExamples = new Set();
  // A platform refusal sits under the status of the example just before it.
  let previousStatus = null;
  dropped.forEach((example) => {
    if (example.platform) {
      if (previousStatus) {
        add(previousStatus, example.code, true);
      }
    } else {
      previousStatus = example.status;
      statusesWithExamples.add(example.status);
      if (example.status) {
        add(example.status, example.code, false);
      }
    }
  });
  tableStatuses.forEach((status) => {
    if (!statusesWithExamples.has(status) && entries.codeByStatus[status]) {
      add(status, entries.codeByStatus[status], false);
    }
  });
  if (found.length === 0) {
    return [];
  }
  found.sort((a, b) => Number(a.status) - Number(b.status));
  const items = found.map((item) => {
    if (item.platform) {
      const label = entries.hasPlatform
        ? `[${item.code}](#${PLATFORM_ANCHOR})`
        : item.code;
      return `- ${item.status} ${label}, sent by the platform before our code runs`;
    }
    const anchor = entries.anchorByCode[item.code];
    const label = anchor ? `[${item.code}](#${anchor})` : item.code;
    return `- ${item.status} ${label}`;
  });
  return [
    "**Errors this operation can return.** Each links to its entry, with examples, in the Errors section above.",
    "",
    ...items,
    ""
  ];
}

/** Puts each distinct dropped example once under its entry in the Errors section. */
function addExamplesToEntries(content, collected, entries) {
  const byAnchor = {};
  const seen = new Set();
  collected.forEach((example) => {
    if (seen.has(example.text)) {
      return;
    }
    seen.add(example.text);
    const anchor = example.platform
      ? PLATFORM_ANCHOR
      : entries.anchorByCode[example.code];
    if (!anchor) {
      return;
    }
    (byAnchor[anchor] = byAnchor[anchor] || []).push(example.text);
  });
  const lines = content.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    out.push(lines[i]);
    const anchorMatch = /^<a id="(error-[a-z0-9-]+)"><\/a>$/.exec(lines[i]);
    i += 1;
    if (!anchorMatch || !byAnchor[anchorMatch[1]]) {
      continue;
    }
    // Copy the entry up to the next anchor or the end of the Errors section.
    while (
      i < lines.length &&
      !/^<a id="error-/.test(lines[i]) &&
      !/^Base URLs:/.test(lines[i])
    ) {
      out.push(lines[i]);
      i += 1;
    }
    while (out.length > 0 && out[out.length - 1].trim() === "") {
      out.pop();
    }
    const examples = byAnchor[anchorMatch[1]];
    out.push("");
    out.push(examples.length === 1 ? "Example:" : "Examples:");
    examples.forEach((text) => {
      out.push("");
      out.push(text);
    });
    out.push("");
  }
  return out.join("\n");
}

/**
 * Widdershins writes every shared error response out in full under every operation. This
 * keeps each operation's parameters, request body and success examples, drops the error
 * example bodies, and puts one copy of each distinct example under its entry in the Errors
 * section. A short linked list of the errors the operation can return replaces them.
 * Pages without an Errors section are returned unchanged.
 */
function consolidateErrors(rawContent) {
  const content = rawContent.replace(/\r\n/g, "\n");
  const entries = readErrorEntries(content);
  if (Object.keys(entries.anchorByCode).length === 0) {
    return rawContent;
  }
  const lines = content.split("\n");
  const out = [];
  const collected = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i] !== "> Example responses") {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    let end = i + 1;
    while (
      end < lines.length &&
      !/^<h3 id="[^"]+-responses">/.test(lines[end])
    ) {
      end += 1;
    }
    const { kept, dropped } = stripErrorExamples(lines.slice(i, end));
    collected.push(...dropped);
    out.push(...kept);
    // Dropping examples leaves runs of blank lines. Keep one.
    while (
      out.length > 1 &&
      out[out.length - 1].trim() === "" &&
      out[out.length - 2].trim() === ""
    ) {
      out.pop();
    }
    // Copy the heading, the blank line and the status table.
    const tableStatuses = [];
    let inTable = false;
    let cursor = end;
    while (cursor < lines.length) {
      const row = lines[cursor];
      out.push(row);
      cursor += 1;
      const statusMatch = /^\|(\d{3})\|/.exec(row);
      if (statusMatch && Number(statusMatch[1]) >= 400) {
        tableStatuses.push(statusMatch[1]);
      }
      if (row.startsWith("|")) {
        inTable = true;
      } else if (inTable) {
        break;
      }
    }
    // out now ends with the blank line after the table.
    out.push(...buildErrorList(tableStatuses, dropped, entries));
    i = cursor;
  }
  const withExamples = addExamplesToEntries(out.join("\n"), collected, entries);
  return dropErrorCodeEnums(withExamples);
}

/**
 * Widdershins also lists the full errorCode enum under every operation, once for each
 * shared error response. The Schemas section keeps the one real definition, so these
 * copies under the operations are dropped.
 */
function dropErrorCodeEnums(content) {
  const split = content.indexOf("\n# Schemas\n");
  const head = split === -1 ? content : content.slice(0, split);
  const tail = split === -1 ? "" : content.slice(split);
  const cleaned = head.replace(
    /#### Enumerated Values\n\n\|Property\|Value\|\n\|---\|---\|\n(?:\|errorCode\|[A-Z_]+\|\n)+\n?/g,
    ""
  );
  return cleaned + tail;
}

/** Runs Widdershins on one spec and cleans up what it writes. */
function generateOne(inputPath, outputPath) {
  const command = `npx widdershins "${inputPath}" ${WIDDERSHINS_FLAGS} -o "${outputPath}"`;
  execSync(command, { stdio: "inherit" });

  let content = fs.readFileSync(outputPath, "utf8");

  content = content.replace(/^---[\s\S]*?---\s*/, "");

  content = content.replace(/<!--\s*Generator:\s*Widdershins.*?-->\s*/i, "");

  content = content.trimStart();

  content = consolidateErrors(content);

  fs.writeFileSync(outputPath, content);

  // Run Prettier on the generated file to ensure it matches the repo style and passes CI
  execSync(`npx prettier --write "${outputPath}"`, { stdio: "inherit" });
}

function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const specs = fs
    .readdirSync(SPEC_DIR)
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));

  console.log(
    `Found ${specs.length} API specifications. Generating documentation...`
  );

  specs.forEach((specFile) => {
    const inputPath = path.join(SPEC_DIR, specFile);
    const fileName = path.parse(specFile).name;
    const outputPath = path.join(OUTPUT_DIR, `${fileName}.md`);

    try {
      console.log(`Processing: ${specFile} -> ${outputPath}`);
      generateOne(inputPath, outputPath);
    } catch (error) {
      console.error(`Error processing ${specFile}:`, error.message);
      process.exit(1);
    }
  });

  console.log("Successfully synchronized all API documentation.");
}

if (require.main === module) {
  main();
}

module.exports = {
  consolidateErrors,
  dropErrorCodeEnums,
  readErrorEntries,
  stripErrorExamples,
  buildErrorList,
  generateOne
};

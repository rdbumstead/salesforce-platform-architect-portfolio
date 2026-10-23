/**
 * Generates every copy of the API specs from the one source, packages/integration-api/specs
 * (Round 7 audit G2, G1 and B4, contract P6).
 *
 *   node scripts/sync-specs.js           writes the generated files
 *   node scripts/sync-specs.js --check   writes nothing, exits 1 when a file differs
 *
 * Outputs, all under packages/portfolio-site/main/default/staticresources:
 *   SAPI_Spec.yaml, PAPI_Spec.yaml   byte copies of the YAML specs (the API reference reads them)
 *   SAPI_OpenAPI.json, PAPI_OpenAPI.json   the same specs as JSON, served at /openapi.json
 *   API_Lab_Catalog.json   the API Lab's GET paths, their query parameters and the top level
 *                          keys of each JSON response, read by ApiLabController and apiTester
 * The YAML copies are compared byte for byte. The JSON files are compared by content, so
 * Prettier may format them.
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SPEC_DIR = path.join(ROOT, "packages/integration-api/specs");
const RESOURCE_DIR = path.join(
  ROOT,
  "packages/portfolio-site/main/default/staticresources"
);

/** Each spec, the API prefix its paths take in the Lab, and its resource names. */
const SPECS = [
  {
    file: "salesforce-sapi.yaml",
    api: "sapi",
    yamlResource: "SAPI_Spec.yaml",
    jsonResource: "SAPI_OpenAPI.json"
  },
  {
    file: "portfolio-papi.yaml",
    api: "papi",
    yamlResource: "PAPI_Spec.yaml",
    jsonResource: "PAPI_OpenAPI.json"
  }
];

const CATALOG_RESOURCE = "API_Lab_Catalog.json";

/**
 * Paths the Lab leaves out on purpose, even if the spec ever gives them a GET:
 * /papi/v1/auth/token vends a credential, and the Lab already has its own token form
 * that goes through the same checks. /papi/v1/ai/generate spends AI provider quota on
 * every call, so the site offers it only through the cover letter tool and its limit.
 */
const EXCLUDED_PATHS = ["/papi/v1/auth/token", "/papi/v1/ai/generate"];

const MAX_HINT_LENGTH = 160;

function readSpec(spec) {
  const raw = fs.readFileSync(path.join(SPEC_DIR, spec.file));
  return { raw, doc: yaml.load(raw.toString("utf8")) };
}

/** Follows a local "#/components/..." reference. */
function resolveRef(doc, node, seen = new Set()) {
  let current = node;
  while (current && typeof current.$ref === "string") {
    if (seen.has(current.$ref)) {
      return {};
    }
    seen.add(current.$ref);
    const parts = current.$ref.replace(/^#\//, "").split("/");
    current = parts.reduce(
      (value, key) => (value ? value[key] : undefined),
      doc
    );
  }
  return current || {};
}

/** Merges allOf members so their properties and required lists read as one object. */
function flatten(doc, schema) {
  const resolved = resolveRef(doc, schema);
  if (!Array.isArray(resolved.allOf)) {
    return resolved;
  }
  const merged = { type: "object", properties: {}, required: [] };
  resolved.allOf.forEach((part) => {
    const member = flatten(doc, part);
    Object.assign(merged.properties, member.properties || {});
    merged.required.push(...(member.required || []));
  });
  Object.assign(merged.properties, resolved.properties || {});
  merged.required.push(...(resolved.required || []));
  return merged;
}

/** The top level keys a response body should have: of the object, or of each array item. */
function shapeOf(doc, schema) {
  const resolved = flatten(doc, schema);
  if (resolved.type === "array" || resolved.items) {
    const item = flatten(doc, resolved.items || {});
    return {
      type: "array",
      properties: Object.keys(item.properties || {}),
      required: [...new Set(item.required || [])]
    };
  }
  return {
    type: "object",
    properties: Object.keys(resolved.properties || {}),
    required: [...new Set(resolved.required || [])]
  };
}

function hint(text) {
  const firstLine = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return "";
  }
  return firstLine.length > MAX_HINT_LENGTH
    ? `${firstLine.slice(0, MAX_HINT_LENGTH - 1).trimEnd()}.`
    : firstLine;
}

function paramOf(doc, ref) {
  const param = resolveRef(doc, ref);
  if (param.in !== "query") {
    return undefined;
  }
  const schema = resolveRef(doc, param.schema || {});
  const entry = {
    name: param.name,
    type: schema.type || "string",
    description: hint(param.description)
  };
  if (Array.isArray(schema.enum)) {
    entry.enum = schema.enum.map(String);
  }
  ["minimum", "maximum", "default"].forEach((key) => {
    if (schema[key] !== undefined) {
      entry[key] = schema[key];
    }
  });
  if (param.required === true) {
    entry.required = true;
  }
  return entry;
}

/** "/services/apexrest/sapi/v1" from "https://{domain}/services/apexrest/sapi/v1". */
function apiPrefix(doc, spec) {
  const url = (doc.servers && doc.servers[0] && doc.servers[0].url) || "";
  const match = /\/services\/apexrest(\/.*)$/.exec(url);
  if (!match) {
    throw new Error(
      `${spec.file}: servers[0].url has no /services/apexrest path`
    );
  }
  return match[1].replace(/\/$/, "");
}

function catalogEntries(doc, spec) {
  const prefix = apiPrefix(doc, spec);
  const entries = [];
  Object.keys(doc.paths || {}).forEach((specPath) => {
    const operation = doc.paths[specPath].get;
    const fullPath = (prefix + specPath).toLowerCase();
    // A path parameter cannot be filled in the Lab, and excluded paths stay out.
    if (
      !operation ||
      specPath.includes("{") ||
      EXCLUDED_PATHS.includes(fullPath)
    ) {
      return;
    }
    const params = (operation.parameters || [])
      .map((ref) => paramOf(doc, ref))
      .filter(Boolean);
    const responses = {};
    Object.keys(operation.responses || {}).forEach((status) => {
      const response = resolveRef(doc, operation.responses[status]);
      const media = response.content && response.content["application/json"];
      if (media && media.schema) {
        responses[status] = shapeOf(doc, media.schema);
      }
    });
    entries.push({
      path: fullPath,
      api: spec.api,
      summary: hint(operation.summary),
      params,
      responses
    });
  });
  return entries;
}

/**
 * Builds every output in memory.
 * @returns {{ yaml: Object<string, Buffer>, json: Object<string, object> }} file name to content
 */
function build() {
  const outputs = { yaml: {}, json: {} };
  const paths = [];
  SPECS.forEach((spec) => {
    const { raw, doc } = readSpec(spec);
    outputs.yaml[spec.yamlResource] = raw;
    outputs.json[spec.jsonResource] = doc;
    paths.push(...catalogEntries(doc, spec));
  });
  outputs.json[CATALOG_RESOURCE] = {
    source: SPECS.map((spec) => `packages/integration-api/specs/${spec.file}`),
    excluded: EXCLUDED_PATHS,
    paths
  };
  return outputs;
}

function sameJson(file, expected) {
  if (!fs.existsSync(file)) {
    return false;
  }
  try {
    const actual = JSON.parse(fs.readFileSync(file, "utf8"));
    return JSON.stringify(actual) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

/** Names of the generated files that differ from what build() makes. */
function differences(outputs = build()) {
  const differ = [];
  Object.entries(outputs.yaml).forEach(([name, content]) => {
    const file = path.join(RESOURCE_DIR, name);
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(content)) {
      differ.push(name);
    }
  });
  Object.entries(outputs.json).forEach(([name, content]) => {
    if (!sameJson(path.join(RESOURCE_DIR, name), content)) {
      differ.push(name);
    }
  });
  return differ;
}

function write(outputs = build()) {
  Object.entries(outputs.yaml).forEach(([name, content]) => {
    fs.writeFileSync(path.join(RESOURCE_DIR, name), content);
  });
  const jsonFiles = Object.entries(outputs.json).map(([name, content]) => {
    const file = path.join(RESOURCE_DIR, name);
    fs.writeFileSync(file, `${JSON.stringify(content, null, 2)}\n`);
    return file;
  });
  // Formatted the way the repo's Prettier gate expects, so a repo wide run changes nothing.
  execFileSync(
    process.execPath,
    [
      require.resolve("prettier/bin/prettier.cjs"),
      "--config",
      path.join(ROOT, "config/.prettierrc"),
      "--write",
      ...jsonFiles
    ],
    { stdio: "ignore" }
  );
}

if (require.main === module) {
  if (process.argv.includes("--check")) {
    const differ = differences();
    if (differ.length) {
      console.error(
        `These generated spec files differ from packages/integration-api/specs: ${differ.join(", ")}. Run node scripts/sync-specs.js.`
      );
      process.exit(1);
    }
    console.log("The spec copies match packages/integration-api/specs.");
  } else {
    write();
    console.log("Wrote the spec copies from packages/integration-api/specs.");
  }
}

module.exports = {
  build,
  differences,
  EXCLUDED_PATHS,
  RESOURCE_DIR,
  CATALOG_RESOURCE
};

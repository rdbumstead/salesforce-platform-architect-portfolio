/**
 * Generates every copy of the API specs from the one source, packages/integration-api/specs.
 *
 *   node scripts/sync-specs.js           writes the generated files
 *   node scripts/sync-specs.js --check   writes nothing, exits 1 when a file differs
 *
 * Outputs under packages/portfolio-site/main/default/staticresources:
 *   SAPI_Spec.yaml, PAPI_Spec.yaml   byte copies of the version 1 YAML specs (deprecated, kept
 *                          until the sunset date, the API reference reads them)
 *   SAPI_Spec_V2.yaml, PAPI_Spec_V2.yaml   byte copies of the version 2 YAML specs, the ones
 *                          the API reference opens by default
 *   SAPI_OpenAPI.json, PAPI_OpenAPI.json   the version 1 specs as JSON, served at /openapi.json
 *   SAPI_OpenAPI_V2.json, PAPI_OpenAPI_V2.json   the version 2 specs as JSON, served at
 *                          /openapi.json by default (?version=v1 serves the version 1 pair)
 *   API_Lab_Catalog.json   the API Lab's GET paths, their query parameters and the top level
 *                          keys of each JSON response, read by ApiLabController and apiTester.
 *                          Paths, parameters and "responses" come from the version 2 specs.
 *                          "v1Responses" holds the same shapes from the version 1 specs, for a
 *                          call the Lab sends as version 1.
 * and docs/api/postman/portfolio-api.postman_collection.json, a Postman collection of every
 * operation in both version 2 specs, sent with X-API-Version v2.
 * The YAML copies are compared byte for byte. The JSON files are compared by content, so
 * Prettier may format them.
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SPEC_DIR = path.join(ROOT, "packages/integration-api/specs");
const RESOURCE_REL = "packages/portfolio-site/main/default/staticresources";
const RESOURCE_DIR = path.join(ROOT, RESOURCE_REL);
const POSTMAN_COLLECTION =
  "docs/api/postman/portfolio-api.postman_collection.json";

/**
 * Each version 2 spec, the API prefix its paths take in the Lab, and its resource names. The
 * Lab and the Postman collection are built from these.
 */
const SPECS = [
  {
    file: "salesforce-sapi-v2.yaml",
    api: "sapi",
    version: "v2",
    yamlResource: "SAPI_Spec_V2.yaml",
    jsonResource: "SAPI_OpenAPI_V2.json"
  },
  {
    file: "portfolio-papi-v2.yaml",
    api: "papi",
    version: "v2",
    yamlResource: "PAPI_Spec_V2.yaml",
    jsonResource: "PAPI_OpenAPI_V2.json"
  }
];

/**
 * The version 1 specs, deprecated until the sunset date. Their YAML and JSON copies stay, and
 * their response shapes go in the catalog as "v1Responses". The files are deleted with this
 * list entry after the sunset.
 */
const V1_SPECS = [
  {
    file: "salesforce-sapi.yaml",
    api: "sapi",
    version: "v1",
    yamlResource: "SAPI_Spec.yaml",
    jsonResource: "SAPI_OpenAPI.json"
  },
  {
    file: "portfolio-papi.yaml",
    api: "papi",
    version: "v1",
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

/** Path of a generated static resource, from the repository root. */
function resource(name) {
  return path.posix.join(RESOURCE_REL, name);
}

/** Resolves {variable} in a server URL with each variable's default. */
function serverUrl(server) {
  const variables = (server && server.variables) || {};
  return String((server && server.url) || "").replace(
    /\{(\w+)\}/g,
    (match, name) => (variables[name] ? variables[name].default : match)
  );
}

/** A request body example: the media example, else one built from the schema's examples. */
function exampleFor(doc, schema, depth = 0) {
  const resolved = flatten(doc, schema || {});
  if (resolved.example !== undefined) {
    return resolved.example;
  }
  if (depth > 4) {
    return null;
  }
  if (resolved.type === "array" || resolved.items) {
    return [exampleFor(doc, resolved.items || {}, depth + 1)];
  }
  if (resolved.properties) {
    const value = {};
    Object.keys(resolved.properties).forEach((key) => {
      value[key] = exampleFor(doc, resolved.properties[key], depth + 1);
    });
    return value;
  }
  if (Array.isArray(resolved.enum)) {
    return resolved.enum[0];
  }
  return { integer: 0, number: 0, boolean: false }[resolved.type] ?? "";
}

/**
 * A Postman v2.1 collection of every operation in both specs. Authenticated
 * calls go to {{instanceUrl}} with {{accessToken}}. The token request and /openapi.json go
 * to the site, {{siteUrl}}, with no auth, and the token request stores what it returns.
 */
function postmanCollection(specDocs, apiVersion) {
  const myDomain = serverUrl(specDocs[0].doc.servers[0]).replace(
    /\/services\/apexrest\/.*$/,
    ""
  );
  let siteUrl = "";
  const folders = specDocs.map(({ spec, doc }) => {
    const items = [];
    Object.keys(doc.paths || {}).forEach((specPath) => {
      const pathItem = doc.paths[specPath];
      const pathServer = pathItem.servers && pathItem.servers[0];
      ["get", "post", "put", "patch", "delete"].forEach((method) => {
        const operation = pathItem[method];
        if (!operation) {
          return;
        }
        const base = serverUrl(pathServer || doc.servers[0]);
        const isSite = Boolean(pathServer);
        if (isSite && !siteUrl) {
          siteUrl = base.replace(/\/services\/apexrest\/.*$/, "");
        }
        const host = isSite ? "{{siteUrl}}" : "{{instanceUrl}}";
        const apiPath = base.replace(
          /^https:\/\/[^/]+(\/portfoliovforcesite)?/,
          ""
        );
        const query = (operation.parameters || [])
          .map((ref) => paramOf(doc, ref))
          .filter(Boolean)
          .map((param) => ({
            key: param.name,
            value:
              param.default !== undefined
                ? String(param.default)
                : param.enum
                  ? param.enum[0]
                  : "",
            description: param.description,
            disabled: true
          }));
        const request = {
          method: method.toUpperCase(),
          header: [
            { key: "Accept", value: "application/json" },
            { key: "X-API-Version", value: apiVersion },
            { key: "X-Request-Id", value: "{{$guid}}" }
          ],
          url: {
            raw: `${host}${apiPath}${specPath}`,
            host: [host],
            path: `${apiPath}${specPath}`.split("/").filter(Boolean),
            query
          },
          description: hint(operation.summary)
        };
        const security = operation.security || doc.security || [];
        if (isSite || security.length === 0) {
          request.auth = { type: "noauth" };
        }
        const media =
          operation.requestBody &&
          resolveRef(doc, operation.requestBody).content &&
          resolveRef(doc, operation.requestBody).content["application/json"];
        if (media) {
          request.header.push({
            key: "Content-Type",
            value: "application/json"
          });
          request.body = {
            mode: "raw",
            raw: JSON.stringify(
              media.example !== undefined
                ? media.example
                : exampleFor(doc, media.schema),
              null,
              2
            ),
            options: { raw: { language: "json" } }
          };
        }
        const item = { name: `${method.toUpperCase()} ${specPath}`, request };
        if (isSite && specPath === "/auth/token") {
          item.event = [
            {
              listen: "test",
              script: {
                type: "text/javascript",
                exec: [
                  "// Keeps the token and instance URL for the other requests.",
                  "const body = pm.response.json();",
                  "if (body.access_token) {",
                  '  pm.collectionVariables.set("accessToken", body.access_token);',
                  '  pm.collectionVariables.set("instanceUrl", body.instance_url);',
                  "}"
                ]
              }
            }
          ];
        }
        items.push(item);
      });
    });
    return {
      name: doc.info.title,
      description: hint(doc.info.description),
      item: items
    };
  });
  folders.push({
    name: "OpenAPI documents",
    description: "Both specs as OpenAPI 3 JSON, open to anyone.",
    item: ["papi", "sapi"].map((spec) => ({
      name: `GET /openapi.json?spec=${spec}`,
      request: {
        method: "GET",
        auth: { type: "noauth" },
        header: [{ key: "Accept", value: "application/json" }],
        url: {
          raw: `{{siteUrl}}/services/apexrest/openapi.json?spec=${spec}`,
          host: ["{{siteUrl}}"],
          path: ["services", "apexrest", "openapi.json"],
          query: [{ key: "spec", value: spec }]
        }
      }
    }))
  });
  return {
    info: {
      name: "Salesforce Architect Portfolio API",
      description:
        "Generated by scripts/sync-specs.js from packages/integration-api/specs. Run POST /auth/token first: it stores accessToken and instanceUrl for the other requests.",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    auth: {
      type: "bearer",
      bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }]
    },
    variable: [
      { key: "instanceUrl", value: myDomain },
      { key: "siteUrl", value: siteUrl },
      { key: "accessToken", value: "" }
    ],
    item: folders
  };
}

/**
 * Builds every output in memory.
 * @returns {{ yaml: Object<string, Buffer>, json: Object<string, object> }} path from the
 *          repository root to content
 */
function build() {
  const outputs = { yaml: {}, json: {} };
  const paths = [];
  const specDocs = [];
  const v1Shapes = {};
  V1_SPECS.forEach((spec) => {
    const { raw, doc } = readSpec(spec);
    outputs.yaml[resource(spec.yamlResource)] = raw;
    outputs.json[resource(spec.jsonResource)] = doc;
    catalogEntries(doc, spec).forEach((entry) => {
      v1Shapes[entry.path] = entry.responses;
    });
  });
  SPECS.forEach((spec) => {
    const { raw, doc } = readSpec(spec);
    specDocs.push({ spec, doc });
    outputs.yaml[resource(spec.yamlResource)] = raw;
    outputs.json[resource(spec.jsonResource)] = doc;
    catalogEntries(doc, spec).forEach((entry) => {
      paths.push({ ...entry, v1Responses: v1Shapes[entry.path] || {} });
    });
  });
  outputs.json[resource(CATALOG_RESOURCE)] = {
    source: [...SPECS, ...V1_SPECS].map(
      (spec) => `packages/integration-api/specs/${spec.file}`
    ),
    excluded: EXCLUDED_PATHS,
    paths
  };
  outputs.json[POSTMAN_COLLECTION] = postmanCollection(specDocs, "v2");
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

/** Paths of the generated files that differ from what build() makes. */
function differences(outputs = build()) {
  const differ = [];
  Object.entries(outputs.yaml).forEach(([relative, content]) => {
    const file = path.join(ROOT, relative);
    if (!fs.existsSync(file) || !fs.readFileSync(file).equals(content)) {
      differ.push(relative);
    }
  });
  Object.entries(outputs.json).forEach(([relative, content]) => {
    if (!sameJson(path.join(ROOT, relative), content)) {
      differ.push(relative);
    }
  });
  return differ;
}

function write(outputs = build()) {
  Object.entries(outputs.yaml).forEach(([relative, content]) => {
    fs.writeFileSync(path.join(ROOT, relative), content);
  });
  const jsonFiles = Object.entries(outputs.json).map(([relative, content]) => {
    const file = path.join(ROOT, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
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
  POSTMAN_COLLECTION,
  differences,
  EXCLUDED_PATHS,
  RESOURCE_DIR,
  CATALOG_RESOURCE
};

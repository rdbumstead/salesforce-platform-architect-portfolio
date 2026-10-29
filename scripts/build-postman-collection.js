/**
 * Builds the one Postman collection the API Lab and the API reference offer for download, and
 * that CI pushes to the public Postman workspace, from the version 2 PAPI and SAPI specs
 * (the YAML files in packages/integration-api/specs), so the collection cannot drift from the specs. It holds three folders in this order: "Start here"
 * with the token request, "Process API (PAPI)" and "System API (SAPI)", each API grouped by its
 * spec tags. A collection pre-request script fetches a token on the first send once
 * evaluatorEmail is set, and a collection test clears the token on a 401 so the next send
 * fetches a fresh one.
 *
 *   node scripts/build-postman-collection.js           writes the collection
 *   node scripts/build-postman-collection.js --check   writes nothing, exits 1 when it differs
 *
 * The conversion is openapi-to-postmanv2, which is not a project dependency. Install it outside
 * package.json and point the script at it, the way the smoke workflow installs Playwright:
 *
 *   npm install --prefix "$TMP/o2p" --no-save --no-audit --no-fund openapi-to-postmanv2@6.4.0
 *   OPENAPI_TO_POSTMAN_DIR="$TMP/o2p/node_modules/openapi-to-postmanv2" node scripts/build-postman-collection.js
 *
 * The converter's output changes on every run (random ids and faked UUID examples), so a post
 * step makes it the same bytes for the same spec: every id is a hash of its place in the
 * collection, every UUID in an example is one fixed value, and keys are sorted. The post step
 * also sets what an evaluator needs: the collection variables baseUrl, accessToken and
 * evaluatorEmail, bearer auth on the collection from {{accessToken}}, and the request "Get an
 * evaluator token" whose test script saves access_token and instance_url into those variables.
 * The file never holds a token or an address. X-Request-Id takes Postman's {{$guid}}, so a
 * request that sends it sends a fresh UUID, and every SAPI request sends it with X-API-Version.
 */
const fs = require("fs");
const yaml = require("js-yaml");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const RESOURCE_DIR = path.join(
  ROOT,
  "packages/portfolio-site/main/default/staticresources"
);
const SPEC_DIR = path.join(ROOT, "packages/integration-api/specs");
const SPEC_FILE = path.join(SPEC_DIR, "portfolio-papi-v2.yaml");
const SAPI_SPEC_FILE = path.join(SPEC_DIR, "salesforce-sapi-v2.yaml");
/** The API version every request sends, the version 2 contract. */
const API_VERSION = "v2";
const OUTPUT_FILE = path.join(RESOURCE_DIR, "PAPI_Postman_Collection.json");

/** The converter version the output was proven deterministic on. */
const CONVERTER_VERSION = "6.4.0";

const CONVERTER_OPTIONS = {
  folderStrategy: "Tags",
  parametersResolution: "Schema",
  alwaysInheritAuthentication: true,
  enableOptionalParameters: false
};

const TOKEN_PATH = "/auth/token";
const RANDOM_SEED = 20261027;
const FIXED_NOW = Date.UTC(2026, 0, 1);
const TOKEN_REQUEST_NAME = "Get an evaluator token";
const COLLECTION_NAME = "Ryan Bumstead Portfolio API";
const START_FOLDER = "Start here";
const PAPI_FOLDER = "Process API (PAPI)";
const SAPI_FOLDER = "System API (SAPI)";
const TOKEN_PURPOSE = "Evaluate the Portfolio API from Postman";
const REFERENCE_URL = "https://ryanbumstead.com/api-lab/reference";
const AI_REQUEST_NAME = "Generate AI Content";
const MISSING_EMAIL_MESSAGE =
  "evaluatorEmail is empty. If you opened the collection on postman.com, fork it into your own workspace first, because the copy there cannot be edited. Then click the collection name, open its Variables tab, type an address you can be reached at in the Current value column of evaluatorEmail, save, and send again.";

/** The collection's description, a short readme shown on the collection's overview. */
const COLLECTION_README = [
  "Every request here calls the live API behind ryanbumstead.com, as version 2 (the X-API-Version header is v2), which returns public keys only.",
  "",
  "## Set up once",
  "",
  "1. If you opened this on postman.com, fork it first. Click Fork on the collection and pick your own workspace, then carry on in the copy. The copy on postman.com is read only, so its variables cannot be edited. If you imported the downloaded file, skip this step.",
  "2. Click the collection name, Ryan Bumstead Portfolio API, in the sidebar. Click the name itself, not a folder.",
  "3. Open the Variables tab.",
  "4. In the evaluatorEmail row, type an address you can be reached at in the Current value column. Leave Initial value empty, because Current value stays on your machine and Initial value is shared.",
  "5. Save with Ctrl+S, or Cmd+S on a Mac.",
  "6. Open any request and press Send. The first send fetches an evaluator token for you and keeps it in accessToken, so there is nothing else to set up.",
  "",
  "You can also run Start here, Get an evaluator token, yourself to fetch the token before anything else.",
  "",
  "The token is shared by every evaluator, shown once, and ends after 30 minutes without use. When it ends the next request answers 401, the collection clears the token, and the send after that fetches a new one.",
  "",
  `For a full tour, run the whole collection with the Collection Runner. Untick ${AI_REQUEST_NAME} there, because it spends the site's AI budget.`,
  "",
  `Every endpoint is described at ${REFERENCE_URL}.`
].join("\n");

/**
 * The collection pre-request script. Every request but the token request gets a token first
 * when accessToken is empty, using evaluatorEmail, and stops with a plain message when no
 * address is set.
 * @param {string} tokenUrl the token endpoint on the site domain
 * @returns {string[]} the script's lines
 */
function prerequestScript(tokenUrl) {
  return [
    `const TOKEN_URL = ${JSON.stringify(tokenUrl)};`,
    'const isTokenRequest = pm.request.url.toString().indexOf("/auth/token") !== -1;',
    'if (!isTokenRequest && !pm.collectionVariables.get("accessToken")) {',
    '  const email = pm.collectionVariables.get("evaluatorEmail");',
    "  if (!email) {",
    `    throw new Error(${JSON.stringify(MISSING_EMAIL_MESSAGE)});`,
    "  }",
    "  pm.sendRequest(",
    "    {",
    "      url: TOKEN_URL,",
    '      method: "POST",',
    "      header: [",
    '        { key: "Content-Type", value: "application/json" },',
    '        { key: "Accept", value: "application/json" }',
    "      ],",
    "      body: {",
    '        mode: "raw",',
    `        raw: JSON.stringify({ email: email, purpose: ${JSON.stringify(TOKEN_PURPOSE)} })`,
    "      }",
    "    },",
    "    function (error, response) {",
    "      if (error) {",
    '        throw new Error("The token request did not reach the server. " + error.message);',
    "      }",
    "      let body = {};",
    "      try {",
    "        body = response.json();",
    "      } catch (parseError) {",
    "        body = {};",
    "      }",
    "      if (response.code !== 200) {",
    '        throw new Error("The token request answered " + response.code + ". " + (body.message || ""));',
    "      }",
    '      pm.collectionVariables.set("accessToken", body.access_token);',
    '      pm.collectionVariables.set("baseUrl", body.instance_url);',
    "    }",
    "  );",
    "}"
  ];
}

/** The collection test script: a 401 clears the token, so the next send fetches a new one. */
const COLLECTION_TEST_SCRIPT = [
  "if (pm.response.code === 401) {",
  '  pm.collectionVariables.unset("accessToken");',
  '  pm.test("The token had ended, so it was cleared. Send again to fetch a new one.", function () {',
  '    pm.expect(pm.collectionVariables.get("accessToken")).to.equal(undefined);',
  "  });",
  "}"
];

const FIXED_UUID = "00000000-0000-4000-8000-000000000000";
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The test script of the token request. It reads the response and stores two variables. */
const TOKEN_TEST_SCRIPT = [
  'pm.test("The token was issued", function () {',
  "  pm.response.to.have.status(200);",
  "});",
  "const body = pm.response.json();",
  "if (body.access_token) {",
  '  pm.collectionVariables.set("accessToken", body.access_token);',
  "}",
  "if (body.instance_url) {",
  '  pm.collectionVariables.set("baseUrl", body.instance_url);',
  "}"
];

/** A UUID shaped id from a SHA-1 of the given text, the same text giving the same id. */
function stableId(text) {
  const hex = crypto.createHash("sha1").update(text).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}`,
    hex.slice(20, 32)
  ].join("-");
}

/** A copy of a value with every object's keys in sorted order. Arrays keep their order. */
function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = sortKeys(value[key]);
        return sorted;
      }, {});
  }
  return value;
}

/** Replaces every UUID inside every string of a value with FIXED_UUID. */
function fixUuids(value) {
  if (typeof value === "string") {
    return value.replace(UUID_PATTERN, FIXED_UUID);
  }
  if (Array.isArray(value)) {
    return value.map(fixUuids);
  }
  if (value && typeof value === "object") {
    return Object.keys(value).reduce((copy, key) => {
      copy[key] = fixUuids(value[key]);
      return copy;
    }, {});
  }
  return value;
}

/** "https://{domain}/x" with each server variable's default filled in. */
function serverUrl(server) {
  let url = server.url;
  Object.keys(server.variables || {}).forEach((name) => {
    url = url.replace(`{${name}}`, server.variables[name].default);
  });
  return url;
}

/** The scheme and host of a URL, such as https://example.my.salesforce.com. */
function originOf(url) {
  const match = /^https:\/\/[^/]+/.exec(url);
  return match ? match[0] : "";
}

/** The path of a URL after its host, with no trailing slash. */
function pathOf(url) {
  return url.replace(/^https:\/\/[^/]+/, "").replace(/\/$/, "");
}

/** Every request and response example in the converter's tree, depth first. */
function walkItems(items, visit, trail = []) {
  (items || []).forEach((item) => {
    const place = [...trail, item.name];
    if (Array.isArray(item.item)) {
      walkItems(item.item, visit, place);
    } else {
      visit(item, place);
    }
  });
}

/** Points a converted url at {{baseUrl}} plus the spec's API path. */
function apiUrl(url, apiPath) {
  const pathSegments = [
    ...apiPath.split("/").filter(Boolean),
    ...(url.path || [])
  ];
  const query = url.query || [];
  const queryText = query
    .filter((param) => !param.disabled)
    .map((param) => `${param.key}=${param.value}`)
    .join("&");
  return {
    raw: `{{baseUrl}}/${pathSegments.join("/")}${queryText ? `?${queryText}` : ""}`,
    host: ["{{baseUrl}}"],
    path: pathSegments,
    query
  };
}

/** The X-Request-Id header value becomes {{$guid}}. Other headers are kept as they are. */
function guidHeaders(headers) {
  return (headers || []).map((header) =>
    header.key === "X-Request-Id" ? { ...header, value: "{{$guid}}" } : header
  );
}

/**
 * The SAPI headers, sent on every SAPI request: SAPI refuses a missing X-Request-Id, and
 * X-API-Version says which version the caller expects.
 */
function sapiHeaders(headers) {
  const others = (headers || []).filter(
    (header) => header.key !== "X-Request-Id" && header.key !== "X-API-Version"
  );
  return [
    { key: "X-Request-Id", value: "{{$guid}}" },
    { key: "X-API-Version", value: API_VERSION },
    ...others
  ];
}

/**
 * The PAPI headers: the converter writes the optional X-API-Version as a disabled row, and a
 * missing header means version 1, which is deprecated. So the row is sent, set to v2, and
 * the X-Request-Id takes a fresh UUID.
 */
function papiHeaders(headers) {
  const others = guidHeaders(headers).filter(
    (header) => header.key !== "X-API-Version"
  );
  return [...others, { key: "X-API-Version", value: API_VERSION }];
}

/**
 * A request with its url on {{baseUrl}}, its X-Request-Id a fresh UUID, and no auth of its
 * own. A SAPI request always sends X-Request-Id and X-API-Version.
 */
function normalizeRequest(request, apiPath, isSapi) {
  const copy = { ...request, url: apiUrl(request.url, apiPath) };
  copy.header = isSapi
    ? sapiHeaders(request.header)
    : papiHeaders(request.header);
  delete copy.auth;
  return copy;
}

/**
 * Sends the spec's own request body example. The converter fills a body from the schema, so an
 * enum such as the AI request's type arrives as "<string>" and the API refuses it. Each request
 * whose operation has an application/json example takes that example as its raw body instead.
 */
function useBodyExamples(items, spec, apiPath) {
  const examples = new Map();
  Object.entries(spec.paths || {}).forEach(([specPath, operations]) => {
    Object.entries(operations).forEach(([method, operation]) => {
      const content =
        operation && operation.requestBody && operation.requestBody.content;
      const json = content && content["application/json"];
      if (json && json.example !== undefined) {
        const segments = `${apiPath}${specPath}`
          .split("/")
          .filter(Boolean)
          .map((segment) => segment.replace(/^\{(.+)\}$/, ":$1"));
        examples.set(
          `${method.toUpperCase()} ${segments.join("/")}`,
          json.example
        );
      }
    });
  });
  walkItems(items, (item) => {
    const key = `${item.request.method} ${(item.request.url.path || []).join("/")}`;
    if (examples.has(key) && item.request.body) {
      item.request.body = {
        ...item.request.body,
        mode: "raw",
        raw: JSON.stringify(examples.get(key), null, 2)
      };
    }
  });
  return items;
}

/** Points every request and response example of one API at {{baseUrl}} plus its path. */
function normalizeApiItems(items, apiPath, isSapi) {
  walkItems(items, (item) => {
    item.request = normalizeRequest(item.request, apiPath, isSapi);
    item.response = (item.response || []).map((example) => ({
      ...example,
      originalRequest: example.originalRequest
        ? normalizeRequest(example.originalRequest, apiPath, isSapi)
        : example.originalRequest
    }));
  });
  return items;
}

/** The first request: the token, on the site domain, with no auth and the saving script. */
function tokenItem(converted, tokenUrl) {
  const request = { ...converted.request };
  request.name = TOKEN_REQUEST_NAME;
  request.method = "POST";
  request.auth = { type: "noauth" };
  request.header = guidHeaders(request.header).filter(
    (header) => header.key !== "Authorization"
  );
  if (!request.header.some((header) => header.key === "Content-Type")) {
    request.header.push({ key: "Content-Type", value: "application/json" });
  }
  const urlPath = pathOf(tokenUrl).split("/").filter(Boolean);
  request.url = {
    raw: tokenUrl,
    protocol: "https",
    host: originOf(tokenUrl).replace("https://", "").split("."),
    path: urlPath
  };
  request.body = {
    mode: "raw",
    raw: JSON.stringify(
      { email: "{{evaluatorEmail}}", purpose: TOKEN_PURPOSE },
      null,
      2
    ),
    options: { raw: { language: "json" } }
  };
  return {
    name: TOKEN_REQUEST_NAME,
    request,
    event: [
      {
        listen: "test",
        script: { type: "text/javascript", exec: TOKEN_TEST_SCRIPT }
      }
    ],
    response: (converted.response || []).map((example) => ({
      ...example,
      originalRequest: { ...request, auth: undefined }
    }))
  };
}

/** Removes empty folders, so a folder left with no request after the token moved goes. */
function pruneEmpty(items) {
  return items
    .map((item) =>
      Array.isArray(item.item) ? { ...item, item: pruneEmpty(item.item) } : item
    )
    .filter((item) => !Array.isArray(item.item) || item.item.length > 0);
}

/** Gives every item and example an id from its place in the tree. */
function assignIds(items, trail = []) {
  return items.map((item, index) => {
    const place = [...trail, `${index}:${item.name}`];
    const copy = { ...item, id: stableId(place.join("/")) };
    if (Array.isArray(item.item)) {
      copy.item = assignIds(item.item, place);
    }
    if (Array.isArray(item.response)) {
      copy.response = item.response.map((example, exampleIndex) => ({
        ...example,
        id: stableId(
          [...place, `response:${exampleIndex}:${example.name}`].join("/")
        )
      }));
    }
    return copy;
  });
}

/**
 * Turns the converter's PAPI and SAPI collections into the published one. Pure: the same
 * converter output and specs give the same object.
 * @param {object} converted the PAPI collection openapi-to-postmanv2 returned
 * @param {object} spec the PAPI OpenAPI document it was built from
 * @param {object} sapiConverted the SAPI collection openapi-to-postmanv2 returned
 * @param {object} sapiSpec the SAPI OpenAPI document it was built from
 * @returns {object} the collection to write
 */
function normalizeCollection(converted, spec, sapiConverted, sapiSpec) {
  if (!sapiConverted || !sapiSpec) {
    throw new Error("Both the PAPI and the SAPI conversions are needed.");
  }
  const apiServer = serverUrl(spec.servers[0]);
  const myDomain = originOf(apiServer);
  const apiPath = pathOf(apiServer);
  const tokenPathItem = spec.paths[TOKEN_PATH];
  const tokenServer =
    tokenPathItem && tokenPathItem.servers && tokenPathItem.servers[0]
      ? serverUrl(tokenPathItem.servers[0])
      : apiServer;
  const tokenUrl = `${tokenServer}${TOKEN_PATH}`;

  let converterToken;
  const removeToken = (items) =>
    items.filter((item) => {
      if (Array.isArray(item.item)) {
        item.item = removeToken(item.item);
        return true;
      }
      const urlPath = (item.request.url.path || []).join("/");
      if (`/${urlPath}` === TOKEN_PATH && item.request.method === "POST") {
        converterToken = item;
        return false;
      }
      return true;
    });
  const tree = JSON.parse(JSON.stringify(converted.item || []));
  const rest = pruneEmpty(removeToken(tree));
  if (!converterToken) {
    throw new Error(`The spec has no POST ${TOKEN_PATH} operation.`);
  }
  useBodyExamples(normalizeApiItems(rest, apiPath, false), spec, apiPath);
  const sapiPath = pathOf(serverUrl(sapiSpec.servers[0]));
  const sapiItems = useBodyExamples(
    normalizeApiItems(
      pruneEmpty(JSON.parse(JSON.stringify(sapiConverted.item || []))),
      sapiPath,
      true
    ),
    sapiSpec,
    sapiPath
  );

  const items = [
    { name: START_FOLDER, item: [tokenItem(converterToken, tokenUrl)] },
    { name: PAPI_FOLDER, item: rest },
    { name: SAPI_FOLDER, item: sapiItems }
  ];
  const info = {
    name: COLLECTION_NAME,
    schema: converted.info.schema,
    description: { content: COLLECTION_README, type: "text/markdown" },
    _postman_id: stableId(`collection:${COLLECTION_NAME}`)
  };

  const collection = {
    info,
    auth: {
      type: "bearer",
      bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }]
    },
    event: [
      {
        listen: "prerequest",
        script: { type: "text/javascript", exec: prerequestScript(tokenUrl) }
      },
      {
        listen: "test",
        script: { type: "text/javascript", exec: COLLECTION_TEST_SCRIPT }
      }
    ],
    variable: [
      {
        key: "baseUrl",
        value: myDomain,
        type: "string",
        description: `The org's My Domain. "${TOKEN_REQUEST_NAME}" replaces it with the instance_url it returns.`
      },
      {
        key: "accessToken",
        value: "",
        type: "string",
        description: `Filled on the first send, or by "${TOKEN_REQUEST_NAME}", or paste a token from the API Lab. Never saved in this file.`
      },
      {
        key: "evaluatorEmail",
        value: "",
        type: "string",
        description:
          "Type an address you can be reached at in Current value, then save. The token request sends it. Current value stays on your machine, and the published collection never holds one."
      }
    ],
    item: assignIds(fixUuids(items))
  };
  return sortKeys(JSON.parse(JSON.stringify(collection)));
}

/** The text written to the file: two space JSON and a final newline. */
function serialize(collection) {
  return `${JSON.stringify(collection, null, 2)}\n`;
}

/**
 * A seeded stand in for Math.random (mulberry32). The converter fakes example values such as
 * numbers, dates and enum picks with Math.random, so seeding it before the converter loads
 * makes those values the same on every run.
 */
function seededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Runs the converter. Resolves with its first collection. */
function convert(converter, specText) {
  return new Promise((resolve, reject) => {
    converter.convert(
      { type: "string", data: specText },
      CONVERTER_OPTIONS,
      (error, result) => {
        if (error) {
          reject(error);
        } else if (!result || !result.result) {
          reject(new Error(result ? result.reason : "No conversion result."));
        } else {
          resolve(result.output[0].data);
        }
      }
    );
  });
}

/**
 * Loads the converter with Math.random seeded and "now" fixed. Its bundled faker keeps a
 * reference to Math.random from the moment it loads, so the seed has to be in place first, and
 * it fakes a date-time as now less a random span, so now has to be one fixed moment. Both stay
 * in place for this process, which converts once.
 */
function loadConverter() {
  Math.random = seededRandom(RANDOM_SEED);
  const RealDate = Date;
  global.Date = class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length) {
        super(...args);
      } else {
        super(FIXED_NOW);
      }
    }

    static now() {
      return FIXED_NOW;
    }
  };
  const dir = process.env.OPENAPI_TO_POSTMAN_DIR;
  return require(dir ? path.resolve(dir) : "openapi-to-postmanv2");
}

/** A YAML spec file as the JSON text the converter reads. */
function readSpecJson(file) {
  return JSON.stringify(yaml.load(fs.readFileSync(file, "utf8")));
}

async function build(converter, specText, sapiSpecText) {
  const spec = JSON.parse(specText);
  const sapiSpec = JSON.parse(sapiSpecText);
  // One after the other, PAPI first, so the seeded values come in the same order every run.
  const converted = await convert(converter, specText);
  const sapiConverted = await convert(converter, sapiSpecText);
  return serialize(
    normalizeCollection(converted, spec, sapiConverted, sapiSpec)
  );
}

async function main(argv) {
  const check = argv.includes("--check");
  const specText = readSpecJson(SPEC_FILE);
  const sapiSpecText = readSpecJson(SAPI_SPEC_FILE);
  const text = await build(loadConverter(), specText, sapiSpecText);
  const relative = path.relative(ROOT, OUTPUT_FILE).split(path.sep).join("/");
  if (check) {
    const current = fs.existsSync(OUTPUT_FILE)
      ? fs.readFileSync(OUTPUT_FILE, "utf8").replace(/\r\n/g, "\n")
      : "";
    if (current !== text) {
      console.error(
        `${relative} is not current. Run node scripts/build-postman-collection.js with openapi-to-postmanv2@${CONVERTER_VERSION}.`
      );
      return 1;
    }
    console.log(`${relative} is current.`);
    return 0;
  }
  fs.writeFileSync(OUTPUT_FILE, text);
  console.log(`Wrote ${relative}.`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error.message || error);
      process.exit(1);
    }
  );
}

module.exports = {
  AI_REQUEST_NAME,
  API_VERSION,
  COLLECTION_NAME,
  COLLECTION_README,
  COLLECTION_TEST_SCRIPT,
  CONVERTER_OPTIONS,
  CONVERTER_VERSION,
  FIXED_UUID,
  MISSING_EMAIL_MESSAGE,
  OUTPUT_FILE,
  PAPI_FOLDER,
  REFERENCE_URL,
  SAPI_FOLDER,
  SAPI_SPEC_FILE,
  SPEC_FILE,
  START_FOLDER,
  TOKEN_PURPOSE,
  TOKEN_REQUEST_NAME,
  prerequestScript,
  build,
  normalizeCollection,
  serialize,
  sortKeys,
  stableId
};

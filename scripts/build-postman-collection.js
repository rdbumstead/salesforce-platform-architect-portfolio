/**
 * Builds the Postman collection the API Lab and the API reference offer for download, from the
 * PAPI OpenAPI JSON, so the collection cannot drift from the spec.
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
 * also sets what an evaluator needs: the collection variables baseUrl and accessToken, bearer
 * auth on the collection from {{accessToken}}, and a first request "Get an evaluator token"
 * whose test script saves access_token and instance_url into those variables. The file never
 * holds a token. X-Request-Id takes Postman's {{$guid}}, so a request that sends it sends a
 * fresh UUID.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const RESOURCE_DIR = path.join(
  ROOT,
  "packages/portfolio-site/main/default/staticresources"
);
const SPEC_FILE = path.join(RESOURCE_DIR, "PAPI_OpenAPI.json");
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

/** A request with its url on {{baseUrl}}, its X-Request-Id a fresh UUID, and no auth of its own. */
function normalizeRequest(request, apiPath) {
  const copy = { ...request, url: apiUrl(request.url, apiPath) };
  copy.header = guidHeaders(request.header);
  delete copy.auth;
  return copy;
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
      { email: "you@example.com", purpose: "Evaluate the Portfolio API" },
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
 * Turns the converter's collection into the published one. Pure: the same converter output
 * and spec give the same object.
 * @param {object} converted the collection openapi-to-postmanv2 returned
 * @param {object} spec the OpenAPI document it was built from
 * @returns {object} the collection to write
 */
function normalizeCollection(converted, spec) {
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
  walkItems(rest, (item) => {
    item.request = normalizeRequest(item.request, apiPath);
    item.response = (item.response || []).map((example) => ({
      ...example,
      originalRequest: example.originalRequest
        ? normalizeRequest(example.originalRequest, apiPath)
        : example.originalRequest
    }));
  });

  const items = [tokenItem(converterToken, tokenUrl), ...rest];
  const info = { ...converted.info };
  info._postman_id = stableId(`collection:${info.name}`);

  const collection = {
    info,
    auth: {
      type: "bearer",
      bearer: [{ key: "token", value: "{{accessToken}}", type: "string" }]
    },
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
        description: `Filled by "${TOKEN_REQUEST_NAME}", or paste a token from the API Lab. Never saved in this file.`
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

async function build(converter, specText) {
  const spec = JSON.parse(specText);
  const converted = await convert(converter, specText);
  return serialize(normalizeCollection(converted, spec));
}

async function main(argv) {
  const check = argv.includes("--check");
  const specText = fs.readFileSync(SPEC_FILE, "utf8");
  const text = await build(loadConverter(), specText);
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
  CONVERTER_OPTIONS,
  CONVERTER_VERSION,
  FIXED_UUID,
  OUTPUT_FILE,
  SPEC_FILE,
  TOKEN_REQUEST_NAME,
  build,
  normalizeCollection,
  serialize,
  sortKeys,
  stableId
};

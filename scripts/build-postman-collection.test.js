/**
 * Tests for scripts/build-postman-collection.js. Run: node --test scripts/build-postman-collection.test.js
 * The post step is tested on small PAPI and SAPI converter outputs, so the converter is not needed
 * here. The committed collection is read to check its folders and scripts and that it holds no
 * token and no address.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const {
  AI_REQUEST_NAME,
  COLLECTION_NAME,
  COLLECTION_TEST_SCRIPT,
  FIXED_UUID,
  OUTPUT_FILE,
  PAPI_FOLDER,
  REFERENCE_URL,
  SAPI_FOLDER,
  START_FOLDER,
  TOKEN_PURPOSE,
  TOKEN_REQUEST_NAME,
  normalizeCollection,
  prerequestScript,
  serialize,
  sortKeys,
  stableId
} = require("./build-postman-collection");

// An obviously fake token. No real token is ever written into a test.
const FAKE_TOKEN = "FAKE-TOKEN-FOR-TESTS-ONLY";

const SPEC = {
  servers: [
    {
      url: "https://{domain}/services/apexrest/papi/v1",
      variables: { domain: { default: "example.my.salesforce.com" } }
    }
  ],
  paths: {
    "/health": { get: {} },
    "/auth/token": {
      servers: [
        {
          url: "https://example.my.site.com/portfoliovforcesite/services/apexrest/papi/v1"
        }
      ],
      post: {}
    }
  }
};

/** A converter output with random ids and faked UUIDs, as openapi-to-postmanv2 writes them. */
function converted(seed) {
  const uuid = `${seed}${seed}${seed}${seed}${seed}${seed}${seed}${seed}-1111-4111-8111-111111111111`;
  return {
    info: { _postman_id: uuid, name: "Portfolio Process API (PAPI)" },
    auth: { type: "oauth2", oauth2: [] },
    variable: [
      { key: "domain", value: "example.my.salesforce.com" },
      { key: "domain", value: "example.my.site.com" }
    ],
    item: [
      {
        id: uuid,
        name: "Access",
        item: [
          {
            id: uuid,
            name: "Request an evaluator access token",
            request: {
              method: "POST",
              url: { host: ["{{auth-token-Url}}"], path: ["auth", "token"] },
              header: [
                { key: "X-Request-Id", value: "<uuid>", disabled: true },
                { key: "Authorization", value: "<token>" }
              ],
              auth: { type: "oauth2" }
            },
            response: [
              {
                id: uuid,
                name: "Token issued",
                header: [{ key: "X-Request-Id", value: uuid }],
                body: `{"access_token":"string","id":"${uuid}"}`
              }
            ]
          }
        ]
      },
      {
        id: uuid,
        name: "Monitoring",
        item: [
          {
            id: uuid,
            name: "PAPI Health Check",
            request: {
              method: "GET",
              url: {
                host: ["{{baseUrl}}"],
                path: ["health"],
                query: [],
                variable: [{ key: "domain" }]
              },
              header: [{ key: "X-Request-Id", value: "<uuid>" }]
            },
            response: []
          }
        ]
      }
    ]
  };
}

const SAPI_SPEC = {
  servers: [
    {
      url: "https://{domain}/services/apexrest/sapi/v1",
      variables: { domain: { default: "example.my.salesforce.com" } }
    }
  ],
  paths: { "/skills": { get: {} } }
};

/** A SAPI converter output: one Objects folder, its headers as the converter writes them. */
function sapiConverted(seed) {
  const uuid = `${seed}${seed}${seed}${seed}${seed}${seed}${seed}${seed}-2222-4222-8222-222222222222`;
  return {
    info: { _postman_id: uuid, name: "Salesforce System API (SAPI)" },
    item: [
      {
        id: uuid,
        name: "Objects",
        item: [
          {
            id: uuid,
            name: "Get Skill records",
            request: {
              method: "GET",
              url: { host: ["{{baseUrl}}"], path: ["skills"], query: [] },
              header: [
                { key: "X-API-Version", value: "v1", disabled: true },
                { key: "X-Request-Id", value: "<uuid>" },
                { key: "Accept", value: "application/json" }
              ],
              auth: { type: "oauth2" }
            },
            response: []
          }
        ]
      }
    ]
  };
}

function build(seed) {
  return normalizeCollection(
    converted(seed),
    SPEC,
    sapiConverted(seed),
    SAPI_SPEC
  );
}

function folder(collection, name) {
  return collection.item.find((item) => item.name === name);
}

const TOKEN_URL =
  "https://example.my.site.com/portfoliovforcesite/services/apexrest/papi/v1/auth/token";

test("two converter runs with different random ids give the same bytes", () => {
  const first = serialize(build("a"));
  const second = serialize(build("b"));
  assert.strictEqual(first, second);
  assert.ok(first.endsWith("}\n"));
});

test("the collection is named for the portfolio and holds the three folders in order", () => {
  const collection = build("a");
  assert.strictEqual(collection.info.name, COLLECTION_NAME);
  assert.deepStrictEqual(
    collection.item.map((item) => item.name),
    [START_FOLDER, PAPI_FOLDER, SAPI_FOLDER]
  );
  assert.ok(collection.item.every((item) => Array.isArray(item.item)));
});

test("Start here holds the token request on the site domain, with no auth, saving both variables", () => {
  const start = folder(build("a"), START_FOLDER).item;
  assert.strictEqual(start.length, 1);
  const first = start[0];
  assert.strictEqual(first.name, TOKEN_REQUEST_NAME);
  assert.strictEqual(first.request.method, "POST");
  assert.strictEqual(first.request.url.raw, TOKEN_URL);
  assert.deepStrictEqual(first.request.auth, { type: "noauth" });
  assert.ok(
    !first.request.header.some((header) => header.key === "Authorization")
  );
  const script = first.event[0].script.exec.join("\n");
  assert.match(
    script,
    /collectionVariables\.set\("accessToken", body\.access_token\)/
  );
  assert.match(
    script,
    /collectionVariables\.set\("baseUrl", body\.instance_url\)/
  );
  assert.match(first.request.body.raw, /\{\{evaluatorEmail\}\}/);
  assert.ok(first.request.body.raw.includes(TOKEN_PURPOSE));
});

test("the token request appears once, and the PAPI folder keeps its other tag folders", () => {
  const collection = build("a");
  const tokenRequests = [];
  const walk = (items) =>
    items.forEach((item) => {
      if (item.item) {
        walk(item.item);
      } else if (/\/auth\/token$/.test(item.request.url.raw)) {
        tokenRequests.push(item.name);
      }
    });
  walk(collection.item);
  assert.deepStrictEqual(tokenRequests, [TOKEN_REQUEST_NAME]);
  assert.deepStrictEqual(
    folder(collection, PAPI_FOLDER).item.map((item) => item.name),
    ["Monitoring"]
  );
});

test("bearer auth from accessToken and three variables, accessToken and evaluatorEmail empty", () => {
  const collection = build("a");
  assert.deepStrictEqual(collection.auth, {
    bearer: [{ key: "token", type: "string", value: "{{accessToken}}" }],
    type: "bearer"
  });
  assert.deepStrictEqual(
    collection.variable.map((variable) => [variable.key, variable.value]),
    [
      ["baseUrl", "https://example.my.salesforce.com"],
      ["accessToken", ""],
      ["evaluatorEmail", ""]
    ]
  );
  assert.match(
    collection.variable[2].description,
    /address you can be reached at in Current value/
  );
});

test("the readme says how to start, how the token behaves, and to untick the AI request in the Runner", () => {
  const readme = build("a").info.description.content;
  assert.match(readme, /evaluatorEmail/);
  assert.match(readme, /Variables tab/);
  assert.match(readme, /Current value column/);
  assert.match(readme, /Open any request and press Send/);
  assert.match(readme, /30 minutes without use/);
  assert.match(readme, /Collection Runner/);
  assert.ok(readme.includes(`Untick ${AI_REQUEST_NAME}`));
  assert.ok(readme.includes(REFERENCE_URL));
  // Plain prose: no em dash, no en dash, no semicolon.
  assert.doesNotMatch(readme, /[–—;]/);
});

test("the collection carries the pre-request and 401 test scripts", () => {
  const collection = build("a");
  const byListen = Object.fromEntries(
    collection.event.map((event) => [event.listen, event.script.exec])
  );
  assert.deepStrictEqual(byListen.prerequest, prerequestScript(TOKEN_URL));
  assert.deepStrictEqual(byListen.test, COLLECTION_TEST_SCRIPT);
  assert.ok(byListen.prerequest.join("\n").includes(TOKEN_PURPOSE));
});

test("PAPI requests go to baseUrl plus the PAPI path, inherit auth, and send a fresh X-Request-Id", () => {
  const health = folder(build("a"), PAPI_FOLDER).item[0].item[0].request;
  assert.strictEqual(
    health.url.raw,
    "{{baseUrl}}/services/apexrest/papi/v1/health"
  );
  assert.strictEqual(health.auth, undefined);
  assert.strictEqual(health.url.variable, undefined);
  assert.strictEqual(
    health.header.find((header) => header.key === "X-Request-Id").value,
    "{{$guid}}"
  );
});

test("SAPI requests go to baseUrl plus the SAPI path, inherit auth, and always send both headers", () => {
  const sapi = folder(build("a"), SAPI_FOLDER);
  assert.deepStrictEqual(
    sapi.item.map((item) => item.name),
    ["Objects"]
  );
  const skills = sapi.item[0].item[0].request;
  assert.strictEqual(
    skills.url.raw,
    "{{baseUrl}}/services/apexrest/sapi/v1/skills"
  );
  assert.strictEqual(skills.auth, undefined);
  const header = (key) => skills.header.find((entry) => entry.key === key);
  assert.deepStrictEqual(header("X-Request-Id"), {
    key: "X-Request-Id",
    value: "{{$guid}}"
  });
  assert.deepStrictEqual(header("X-API-Version"), {
    key: "X-API-Version",
    value: "v1"
  });
  assert.strictEqual(header("Accept").value, "application/json");
});

test("ids are stable and every faked UUID in an example is the fixed one", () => {
  const example = folder(build("a"), START_FOLDER).item[0].response[0];
  assert.match(example.body, new RegExp(FIXED_UUID));
  assert.strictEqual(example.header[0].value, FIXED_UUID);
  assert.strictEqual(stableId("x"), stableId("x"));
  assert.notStrictEqual(stableId("x"), stableId("y"));
  assert.match(
    stableId("x"),
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});

test("a spec with no token operation is refused", () => {
  const input = converted("a");
  input.item = input.item.slice(1);
  assert.throws(
    () => normalizeCollection(input, SPEC, sapiConverted("a"), SAPI_SPEC),
    /no POST \/auth\/token/
  );
});

test("a build without the SAPI conversion is refused", () => {
  assert.throws(
    () => normalizeCollection(converted("a"), SPEC),
    /Both the PAPI and the SAPI conversions are needed/
  );
});

test("sortKeys orders object keys and keeps array order", () => {
  assert.deepStrictEqual(
    JSON.stringify(sortKeys({ b: 1, a: [{ d: 1, c: 2 }, 3] })),
    '{"a":[{"c":2,"d":1},3],"b":1}'
  );
});

test("the committed collection has the three folders and the scripts, and holds no token or address", () => {
  const text = serialize(build("a"));
  assert.ok(!text.includes(FAKE_TOKEN));
  const committed = fs.readFileSync(OUTPUT_FILE, "utf8");
  const collection = JSON.parse(committed);
  assert.strictEqual(collection.info.name, COLLECTION_NAME);
  assert.deepStrictEqual(
    collection.item.map((item) => item.name),
    [START_FOLDER, PAPI_FOLDER, SAPI_FOLDER]
  );
  assert.strictEqual(collection.item[0].item[0].name, TOKEN_REQUEST_NAME);
  assert.deepStrictEqual(
    collection.event.map((event) => event.listen),
    ["prerequest", "test"]
  );
  ["accessToken", "evaluatorEmail"].forEach((key) =>
    assert.strictEqual(
      collection.variable.find((variable) => variable.key === key).value,
      ""
    )
  );
  // A Salesforce session id starts with the org id and an exclamation mark.
  assert.doesNotMatch(committed, /00D[A-Za-z0-9]{12,15}![A-Za-z0-9._]{20,}/);
});

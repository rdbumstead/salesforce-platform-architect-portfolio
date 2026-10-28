/**
 * Tests for scripts/build-postman-collection.js. Run: node --test scripts/build-postman-collection.test.js
 * The post step is tested on a small converter output, so the converter is not needed here. The
 * committed collection is read to check it holds no token and starts with the token request.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const {
  FIXED_UUID,
  OUTPUT_FILE,
  TOKEN_REQUEST_NAME,
  normalizeCollection,
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

test("two converter runs with different random ids give the same bytes", () => {
  const first = serialize(normalizeCollection(converted("a"), SPEC));
  const second = serialize(normalizeCollection(converted("b"), SPEC));
  assert.strictEqual(first, second);
  assert.ok(first.endsWith("}\n"));
});

test("the first request gets the token on the site domain with no auth and saves both variables", () => {
  const collection = normalizeCollection(converted("a"), SPEC);
  const first = collection.item[0];
  assert.strictEqual(first.name, TOKEN_REQUEST_NAME);
  assert.strictEqual(first.request.method, "POST");
  assert.strictEqual(
    first.request.url.raw,
    "https://example.my.site.com/portfoliovforcesite/services/apexrest/papi/v1/auth/token"
  );
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
  assert.match(first.request.body.raw, /you@example\.com/);
  // The token's folder held nothing else, so it is gone.
  assert.deepStrictEqual(
    collection.item.map((item) => item.name),
    [TOKEN_REQUEST_NAME, "Monitoring"]
  );
});

test("the collection uses bearer auth from accessToken and the two plan variables, accessToken empty", () => {
  const collection = normalizeCollection(converted("a"), SPEC);
  assert.deepStrictEqual(collection.auth, {
    bearer: [{ key: "token", type: "string", value: "{{accessToken}}" }],
    type: "bearer"
  });
  assert.deepStrictEqual(
    collection.variable.map((variable) => [variable.key, variable.value]),
    [
      ["baseUrl", "https://example.my.salesforce.com"],
      ["accessToken", ""]
    ]
  );
});

test("API requests go to baseUrl plus the API path, inherit auth, and send a fresh X-Request-Id", () => {
  const collection = normalizeCollection(converted("a"), SPEC);
  const health = collection.item[1].item[0].request;
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

test("ids are stable and every faked UUID in an example is the fixed one", () => {
  const collection = normalizeCollection(converted("a"), SPEC);
  const example = collection.item[0].response[0];
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
    () => normalizeCollection(input, SPEC),
    /no POST \/auth\/token/
  );
});

test("sortKeys orders object keys and keeps array order", () => {
  assert.deepStrictEqual(
    JSON.stringify(sortKeys({ b: 1, a: [{ d: 1, c: 2 }, 3] })),
    '{"a":[{"c":2,"d":1},3],"b":1}'
  );
});

test("the committed collection starts with the token request and holds no token", () => {
  const text = serialize(normalizeCollection(converted("a"), SPEC));
  assert.ok(!text.includes(FAKE_TOKEN));
  const committed = fs.readFileSync(OUTPUT_FILE, "utf8");
  const collection = JSON.parse(committed);
  assert.strictEqual(collection.item[0].name, TOKEN_REQUEST_NAME);
  assert.strictEqual(
    collection.variable.find((variable) => variable.key === "accessToken")
      .value,
    ""
  );
  // A Salesforce session id starts with the org id and an exclamation mark.
  assert.doesNotMatch(committed, /00D[A-Za-z0-9]{12,15}![A-Za-z0-9._]{20,}/);
});

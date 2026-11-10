/**
 * Tests for scripts/generate-api-docs.js. Run: node --test scripts/generate-api-docs.test.js
 * The post step is tested on a small page shaped like Widdershins output. One test also
 * runs Widdershins on a small fixture spec and checks the result end to end.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const { consolidateErrors } = require("./generate-api-docs");

const FENCE = "```";

function errorExample(status, code, message) {
  return [
    `${FENCE}json`,
    "{",
    `  "httpStatus": ${status},`,
    `  "errorCode": "${code}",`,
    `  "message": "${message}"`,
    "}",
    FENCE
  ].join("\n");
}

const OK_EXAMPLE = [
  `${FENCE}json`,
  '{ "name": "Ryan" }'.replace("{ ", "{\n  ").replace(" }", "\n}"),
  FENCE
].join("\n");

const PLATFORM_EXAMPLE = [
  `${FENCE}json`,
  "[",
  '  { "errorCode": "INVALID_SESSION_ID", "message": "Session expired" }',
  "]",
  FENCE
].join("\n");

function operation(name, extraErrors) {
  return [
    `## ${name}`,
    "",
    "> Example responses",
    "",
    "> 200 Response",
    "",
    OK_EXAMPLE,
    "",
    "> The request was refused.",
    "",
    errorExample(400, "BAD_REQUEST", "persona must be Admin."),
    "",
    errorExample(400, "BAD_REQUEST", "limit must be 1 to 200."),
    "",
    "> No token.",
    "",
    errorExample(401, "UNAUTHORIZED", "Get a token."),
    "",
    PLATFORM_EXAMPLE,
    "",
    ...(extraErrors || []),
    `<h3 id="${name.toLowerCase()}-responses">Responses</h3>`,
    "",
    "|Status|Meaning|Description|Schema|",
    "|---|---|---|---|",
    "|200|OK|Fine|Inline|",
    "|400|Bad Request|Refused|Error|",
    "|401|Unauthorized|No token|Error|",
    "|404|Not Found|No route|Error|",
    "",
    `<h3 id="${name.toLowerCase()}-responseschema">Response Schema</h3>`,
    "",
    "#### Enumerated Values",
    "",
    "|Property|Value|",
    "|---|---|",
    "|errorCode|BAD_REQUEST|",
    "|errorCode|UNAUTHORIZED|",
    "",
    "#### Enumerated Values",
    "",
    "|Property|Value|",
    "|---|---|",
    "|type|Image|",
    ""
  ].join("\n");
}

const PAGE = [
  "# Title",
  "",
  "## Errors",
  "",
  '<a id="error-bad-request"></a>',
  "",
  "### BAD_REQUEST (400)",
  "The request was refused.",
  "",
  '<a id="error-unauthorized"></a>',
  "",
  "### UNAUTHORIZED (401)",
  "No token.",
  "",
  '<a id="error-not-found"></a>',
  "",
  "### NOT_FOUND (404)",
  "No route.",
  "",
  '<a id="error-platform"></a>',
  "",
  "### Responses from the platform",
  "The platform refuses first.",
  "",
  "Base URLs:",
  "",
  operation("getone"),
  operation("gettwo"),
  "# Schemas",
  "",
  "#### Enumerated Values",
  "",
  "|Property|Value|",
  "|---|---|",
  "|errorCode|BAD_REQUEST|",
  ""
].join("\n");

test("error bodies leave the operations and the success example stays", () => {
  const out = consolidateErrors(PAGE);
  const operationsPart = out.slice(out.indexOf("## getone"));
  assert.ok(
    !operationsPart
      .slice(0, operationsPart.indexOf("# Schemas"))
      .includes('"httpStatus"')
  );
  assert.strictEqual((out.match(/"name": "Ryan"/g) || []).length, 2);
  assert.ok(!operationsPart.includes("> The request was refused."));
});

test("each distinct example appears once, under its own entry", () => {
  const out = consolidateErrors(PAGE);
  assert.strictEqual((out.match(/persona must be Admin/g) || []).length, 1);
  assert.strictEqual((out.match(/limit must be 1 to 200/g) || []).length, 1);
  const bad = out.indexOf("### BAD_REQUEST (400)");
  const unauthorized = out.indexOf("### UNAUTHORIZED (401)");
  const persona = out.indexOf("persona must be Admin");
  assert.ok(persona > bad && persona < unauthorized);
  const platform = out.indexOf("### Responses from the platform");
  assert.ok(out.indexOf("INVALID_SESSION_ID") > platform);
  assert.ok(
    out.indexOf("INVALID_SESSION_ID", platform) < out.indexOf("Base URLs:")
  );
});

test("each operation gets a list of status and error code that links to the Errors section", () => {
  const out = consolidateErrors(PAGE);
  const one = out.slice(out.indexOf("## getone"), out.indexOf("## gettwo"));
  assert.ok(one.includes("- 400 [BAD_REQUEST](#error-bad-request)"));
  assert.ok(one.includes("- 401 [UNAUTHORIZED](#error-unauthorized)"));
  assert.ok(one.includes("- 401 [INVALID_SESSION_ID](#error-platform)"));
  // 404 had no example, so it comes from the table and the Errors headings.
  assert.ok(one.includes("- 404 [NOT_FOUND](#error-not-found)"));
});

test("every link in the page resolves to an anchor on the page", () => {
  const out = consolidateErrors(PAGE);
  const ids = new Set([...out.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const links = [...out.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(links.length > 0);
  links.forEach((link) => assert.ok(ids.has(link), `no anchor for #${link}`));
});

test("the status table stays and the errorCode enum copies under operations go", () => {
  const out = consolidateErrors(PAGE);
  assert.strictEqual((out.match(/\|400\|Bad Request\|/g) || []).length, 2);
  const operationsPart = out.slice(
    out.indexOf("## getone"),
    out.indexOf("# Schemas")
  );
  assert.ok(!operationsPart.includes("|errorCode|"));
  assert.ok(operationsPart.includes("|type|Image|"));
  // The Schemas section keeps its definition.
  assert.ok(
    out.slice(out.indexOf("# Schemas")).includes("|errorCode|BAD_REQUEST|")
  );
});

test("a page with no Errors section is returned unchanged", () => {
  const page = operation("getone");
  assert.strictEqual(consolidateErrors(page), page);
});

test("Widdershins and the post step on a small fixture spec", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gen-api-docs-"));
  const spec = path.join(dir, "fixture.yaml");
  const target = path.join(dir, "fixture.md");
  fs.writeFileSync(
    spec,
    [
      "openapi: 3.0.3",
      "info:",
      "  title: Fixture API",
      "  version: 1.0.0",
      "  description: |",
      "    Intro.",
      "",
      "    ## Errors",
      "",
      '    <a id="error-bad-request"></a>',
      "",
      "    ### BAD_REQUEST (400)",
      "    Refused.",
      "paths:",
      "  /a:",
      "    get:",
      "      operationId: getA",
      "      responses:",
      '        "200":',
      "          description: Fine",
      "          content:",
      "            application/json:",
      "              example: { name: Ryan }",
      '        "400":',
      "          $ref: '#/components/responses/BadRequest'",
      "  /b:",
      "    get:",
      "      operationId: getB",
      "      responses:",
      '        "200":',
      "          description: Fine",
      "          content:",
      "            application/json:",
      "              example: { name: Ryan }",
      '        "400":',
      "          $ref: '#/components/responses/BadRequest'",
      "components:",
      "  responses:",
      "    BadRequest:",
      "      description: Refused",
      "      content:",
      "        application/json:",
      "          examples:",
      "            one:",
      "              value: { httpStatus: 400, errorCode: BAD_REQUEST, message: one }",
      "            two:",
      "              value: { httpStatus: 400, errorCode: BAD_REQUEST, message: two }",
      ""
    ].join("\n")
  );
  try {
    execSync(
      `npx widdershins "${spec}" --search false --language_tabs "javascript:JavaScript" -o "${target}"`,
      { stdio: "pipe" }
    );
    const raw = fs.readFileSync(target, "utf8");
    assert.strictEqual((raw.match(/"message": "one"/g) || []).length, 2);
    const out = consolidateErrors(raw);
    assert.strictEqual((out.match(/"message": "one"/g) || []).length, 1);
    assert.strictEqual((out.match(/"message": "two"/g) || []).length, 1);
    assert.strictEqual(
      (out.match(/- 400 \[BAD_REQUEST\]\(#error-bad-request\)/g) || []).length,
      2
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

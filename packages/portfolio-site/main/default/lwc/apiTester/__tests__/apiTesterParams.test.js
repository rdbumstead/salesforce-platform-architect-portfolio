/**
 * @description       : Unit tests for the API Lab v2 controls: spec
 *                      parameters as pills, picklists, bounded numbers and hinted text inputs,
 *                      removable pills and the query string, the Advanced field, Next page on
 *                      X-Has-More, the highlighted body and the schema check. The catalog is the
 *                      real generated API_Lab_Catalog resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import ApiTester, {
  buildQueryString,
  checkAgainstSchema,
  controlKind,
  numberHint,
  parseCatalog,
  ID_HINT,
  KIND_ID,
  KIND_NUMBER,
  KIND_PILLS,
  KIND_SELECT,
  KIND_TEXT
} from "c/apiTester";
import getCatalog from "@salesforce/apex/ApiLabController.getCatalog";
import invoke from "@salesforce/apex/ApiLabController.invokeVersioned";
import { trackEvent } from "c/analyticsService";

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: { API_TEST_EXECUTED: "api_test_executed" }
  }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ApiLabController.getCatalog",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ApiLabController.invokeVersioned",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ApiLabController.requestEvaluatorToken",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock("lightning/platformResourceLoader", () => {
  const universal = jest.requireActual("lightning/platformResourceLoader");
  return {
    __esModule: true,
    default: universal.default,
    loadScript: jest.fn(() => Promise.resolve()),
    loadStyle: jest.fn(() => Promise.resolve())
  };
});

const CATALOG_TEXT = readFileSync(
  join(
    process.cwd(),
    "packages/portfolio-site/main/default/staticresources/API_Lab_Catalog.json"
  ),
  "utf8"
);

/** Picks a path in the native endpoint select, as a visitor does. */
function chooseEndpoint(select, path) {
  select.value = path;
  select.dispatchEvent(new CustomEvent("change"));
}

const flush = () => new Promise((resolve) => process.nextTick(resolve));

function create() {
  const element = createElement("c-api-tester", { is: ApiTester });
  document.body.appendChild(element);
  getCatalog.emit(CATALOG_TEXT);
  return element;
}

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));

async function choosePath(element, path) {
  chooseEndpoint($(element, "select.endpoint-picker"), path);
  await flush();
}

function setField(element, selector, value) {
  const input = $(element, selector);
  input.value = value;
  input.dispatchEvent(new CustomEvent("change"));
}

function pill(element, name, value) {
  return $(
    element,
    `fieldset[data-param="${name}"] button[data-value="${value}"]`
  );
}

const SKILLS = [
  { key: "skl_a", name: "Apex", category: "Backend" },
  { key: "skl_b", name: "LWC", category: "Frontend", surprise: true }
];

function result(body, headers = {}, statusCode = 200) {
  return {
    statusCode,
    latencyMs: 90,
    headers: { "X-Request-Id": "r-1", ...headers },
    body: JSON.stringify(body),
    namedCredential: "Portfolio_API",
    requestId: "r-1",
    path: "/sapi/v1/skills"
  };
}

describe("c-api-tester v2 controls", () => {
  beforeEach(() => {
    window.Prism = {
      languages: { clike: {}, json: { property: /x/ } },
      highlight: jest.fn(
        (code) => `<span class="token property">${code.length}</span>`
      )
    };
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.Prism;
    jest.clearAllMocks();
  });

  it("shows the persona enum as pressed pills and builds the query string", async () => {
    invoke.mockResolvedValue(result({ generatedText: "x" }));
    const element = create();
    await flush();
    await choosePath(element, "/papi/v1/resume/generate");

    const pills = $$(element, 'fieldset[data-param="persona"] button');
    expect(pills.map((button) => button.textContent.trim())).toEqual([
      "Admin",
      "Developer",
      "Architect"
    ]);
    expect(
      pills.every((button) => button.getAttribute("aria-pressed") === "false")
    ).toBe(true);
    expect(
      $(element, 'fieldset[data-param="persona"] legend').textContent
    ).toBe("persona");

    pill(element, "persona", "Architect").click();
    await flush();

    expect(
      pill(element, "persona", "Architect").getAttribute("aria-pressed")
    ).toBe("true");
    expect($(element, ".query-string").textContent).toBe("?persona=Architect");
    expect($(element, ".chosen-text").textContent).toBe("persona=Architect");

    $(element, "button.execute-button").click();
    await flush();
    expect(invoke).toHaveBeenCalledWith({
      path: "/papi/v1/resume/generate",
      params: { persona: "Architect" },
      apiVersion: "v2"
    });
    expect(trackEvent).toHaveBeenLastCalledWith("api_test_executed", {
      path: "/papi/v1/resume/generate",
      status: 200,
      param_count: 1
    });
  });

  it("clears a pill when it is pressed again or removed", async () => {
    const element = create();
    await flush();
    await choosePath(element, "/papi/v1/testimonials/feed");

    pill(element, "mode", "casual").click();
    await flush();
    pill(element, "mode", "casual").click();
    await flush();
    expect($(element, ".query-string").textContent).toBe(
      "(no query parameters)"
    );

    pill(element, "mode", "professional").click();
    await flush();
    const remove = $(element, "button.remove-pill");
    expect(remove.getAttribute("aria-label")).toBe("Remove mode=professional");
    expect(remove.textContent.trim()).toBe("Remove");
    remove.click();
    await flush();
    expect($(element, ".chosen-pills")).toBeNull();
  });

  it("shows a boolean as true and false pills, and a five value enum as a picklist", async () => {
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/projects");

    const featured = $$(element, 'fieldset[data-param="isFeatured"] button');
    expect(featured.map((button) => button.textContent.trim())).toEqual([
      "true",
      "false"
    ]);
    const options = $$(element, 'select[data-name="status"] option');
    expect(options[0].textContent.trim()).toBe("Any");
    expect(options).toHaveLength(6);

    pill(element, "isFeatured", "true").click();
    setField(element, 'select[data-name="status"]', "On Hold");
    await flush();
    expect($(element, ".query-string").textContent).toBe(
      "?isFeatured=true&status=On%20Hold"
    );
  });

  it("bounds limit and offset from the spec and hints at id filters", async () => {
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/project-skills");

    const limit = $(element, 'input[data-name="limit"]');
    expect(limit.type).toBe("number");
    expect(limit.getAttribute("min")).toBe("1");
    expect(limit.getAttribute("max")).toBe("200");
    expect(limit.closest("label").textContent).toContain(
      "1 to 200, default 50"
    );
    expect($(element, 'input[data-name="offset"]').getAttribute("min")).toBe(
      "0"
    );
    const projectId = $(element, 'input[data-name="projectId"]');
    expect(projectId.type).toBe("text");
    expect(projectId.closest("label").textContent).toContain(ID_HINT);
  });

  it("lets the Advanced text win on a shared name and keeps it across paths", async () => {
    invoke.mockResolvedValue(result([]));
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/skills");

    setField(element, 'input[data-name="limit"]', "5");
    setField(element, "input.query-input", "limit=abc");
    await flush();
    expect($(element, ".query-string").textContent).toBe("?limit=abc");

    $(element, "button.execute-button").click();
    await flush();
    expect(invoke).toHaveBeenLastCalledWith({
      path: "/sapi/v1/skills",
      params: { limit: "abc" },
      apiVersion: "v2"
    });

    await choosePath(element, "/sapi/v1/accounts");
    expect($(element, ".chosen-pills")).toBeNull();
    expect($(element, "input.query-input").value).toBe("limit=abc");
  });

  it("says when a path takes no query parameters", async () => {
    const element = create();
    await flush();

    expect($(element, ".param-none").textContent).toContain(
      "takes no query parameters"
    );
  });

  it("offers Next page on X-Has-More and moves the offset by the limit", async () => {
    invoke.mockResolvedValue(result(SKILLS, { "X-Has-More": "true" }));
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/skills");
    setField(element, 'input[data-name="limit"]', "2");
    setField(element, "input.query-input", "offset=4");
    await flush();

    $(element, "button.execute-button").click();
    await flush();
    $(element, "button.next-page-button").click();
    await flush();

    expect(invoke).toHaveBeenLastCalledWith({
      path: "/sapi/v1/skills",
      params: { limit: "2", offset: "6" },
      apiVersion: "v2"
    });
    expect($(element, "input.query-input").value).toBe("");
  });

  it("uses the spec default limit for Next page when none is set", async () => {
    invoke.mockResolvedValue(result(SKILLS, { "X-Has-More": "true" }));
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/skills");

    $(element, "button.execute-button").click();
    await flush();
    $(element, "button.next-page-button").click();
    await flush();

    expect(invoke).toHaveBeenLastCalledWith({
      path: "/sapi/v1/skills",
      params: { offset: "50" },
      apiVersion: "v2"
    });
  });

  it("hides Next page when there is no more", async () => {
    invoke.mockResolvedValue(result(SKILLS, { "X-Has-More": "false" }));
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/skills");
    $(element, "button.execute-button").click();
    await flush();

    expect($(element, "button.next-page-button")).toBeNull();
  });

  it("highlights the JSON body through the Prism module", async () => {
    invoke.mockResolvedValue(result(SKILLS));
    const element = create();
    await flush();
    $(element, "button.execute-button").click();
    await flush();
    await flush();

    expect(window.Prism.highlight).toHaveBeenCalled();
    const calls = window.Prism.highlight.mock.calls;
    expect(calls[calls.length - 1][2]).toBe("json");
    expect($(element, ".response-code span.token.property")).not.toBeNull();
    const region = $(element, ".result-box");
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.getAttribute("aria-label")).toBe("Response body");
  });

  it("checks the body against the path's response schema", async () => {
    invoke.mockResolvedValue(result(SKILLS));
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/skills");
    $(element, "button.execute-button").click();
    await flush();

    const summary = $(element, ".schema-summary").textContent;
    expect(summary).toContain("status 200 schema");
    expect(summary).toContain("1 not in the spec");
    expect($(element, '.schema-list[data-list="extra"]').textContent).toContain(
      "surprise"
    );
    expect(
      $(element, '.schema-list[data-list="present"]').textContent
    ).toContain("name");
  });

  it("says when the body is not JSON or the status has no schema", async () => {
    invoke.mockResolvedValueOnce({ ...result({}), body: "plain text" });
    invoke.mockResolvedValueOnce(result({ a: 1 }, {}, 302));
    const element = create();
    await flush();

    $(element, "button.execute-button").click();
    await flush();
    expect($(element, ".schema-summary").textContent).toContain("not JSON");

    $(element, "button.execute-button").click();
    await flush();
    expect($(element, ".schema-summary").textContent).toContain(
      "no JSON body for status 302"
    );
  });
});

describe("c-api-tester v2 helpers", () => {
  it("picks the control for each parameter kind", () => {
    expect(controlKind({ name: "mode", enum: ["a", "b"] })).toBe(KIND_PILLS);
    expect(controlKind({ name: "s", enum: ["1", "2", "3", "4", "5"] })).toBe(
      KIND_SELECT
    );
    expect(controlKind({ name: "flag", type: "boolean" })).toBe(KIND_PILLS);
    expect(controlKind({ name: "limit", type: "integer" })).toBe(KIND_NUMBER);
    expect(controlKind({ name: "projectId", type: "string" })).toBe(KIND_ID);
    expect(controlKind({ name: "category", type: "string" })).toBe(KIND_TEXT);
  });

  it("writes bounds hints", () => {
    expect(numberHint({ minimum: 1, maximum: 200, default: 50 })).toBe(
      "1 to 200, default 50"
    );
    expect(numberHint({ minimum: 0, default: 0 })).toBe("0 or more, default 0");
    expect(numberHint({})).toBe("");
  });

  it("builds and encodes query strings", () => {
    expect(buildQueryString({})).toBe("");
    expect(buildQueryString({ q: "a b", x: "1&2" })).toBe("?q=a%20b&x=1%262");
  });

  it("reads only a catalog with a path list", () => {
    expect(parseCatalog("nope")).toBeUndefined();
    expect(parseCatalog('{"x":1}')).toBeUndefined();
    expect(parseCatalog('{"paths":[]}')).toEqual({ paths: [] });
  });

  it("checks arrays, objects, empty lists and wrong types", () => {
    const shape = { type: "array", properties: ["a", "b"], required: ["b"] };
    expect(checkAgainstSchema([{ a: 1, c: 2 }], shape)).toEqual({
      status: "checked",
      present: ["a"],
      missing: [{ key: "b", required: true }],
      extra: ["c"]
    });
    expect(checkAgainstSchema([], shape)).toEqual({ status: "empty" });
    expect(checkAgainstSchema({ a: 1 }, shape)).toEqual({
      status: "wrongType",
      expected: "array"
    });
    expect(
      checkAgainstSchema([1, { a: 1 }], { type: "array", properties: ["a"] })
    ).toEqual({ status: "checked", present: ["a"], missing: [], extra: [] });
    const objectShape = { type: "object", properties: ["status"] };
    expect(checkAgainstSchema({ status: "UP" }, objectShape).present).toEqual([
      "status"
    ]);
    expect(checkAgainstSchema([1], objectShape)).toEqual({
      status: "wrongType",
      expected: "object"
    });
    expect(checkAgainstSchema({}, undefined)).toEqual({ status: "noSchema" });
  });
});

describe("c-api-tester version picker", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  function chooseVersion(element, value) {
    const select = $(element, "select.version-picker");
    select.value = value;
    select.dispatchEvent(new CustomEvent("change"));
  }

  it("offers v2 first and v1 labelled deprecated, with v2 selected", async () => {
    const element = create();
    await flush();

    const options = $$(element, "select.version-picker option");
    expect(options.map((option) => option.value)).toEqual(["v2", "v1"]);
    expect(options.map((option) => option.textContent.trim())).toEqual([
      "v2",
      "v1 (deprecated)"
    ]);
    expect($(element, "select.version-picker").value).toBe("v2");
    expect($(element, "p.version-notice")).toBeNull();
  });

  it("sends v2 by default and v1 once the visitor picks it", async () => {
    invoke.mockResolvedValue(result({}));
    const element = create();
    await flush();

    $(element, "button.execute-button").click();
    await flush();
    expect(invoke).toHaveBeenLastCalledWith({
      path: "/sapi/v1/health",
      params: {},
      apiVersion: "v2"
    });

    chooseVersion(element, "v1");
    await flush();
    $(element, "button.execute-button").click();
    await flush();
    expect(invoke).toHaveBeenLastCalledWith({
      path: "/sapi/v1/health",
      params: {},
      apiVersion: "v1"
    });
  });

  it("says v1 is deprecated in one line while it is picked, and drops the line for v2", async () => {
    const element = create();
    await flush();

    chooseVersion(element, "v1");
    await flush();
    const notice = $(element, "p.version-notice");
    expect(notice.textContent).toContain("v1 is deprecated");
    expect(notice.textContent).toContain("Sunset");

    chooseVersion(element, "v2");
    await flush();
    expect($(element, "p.version-notice")).toBeNull();
  });

  it("shows the Deprecation, Sunset and Link headers of a v1 call, and marks them when absent on v2", async () => {
    invoke.mockResolvedValueOnce(
      result(
        {},
        {
          "X-API-Version": "v1",
          Deprecation: "true",
          Sunset: "Sat, 28 Nov 2026 00:00:00 GMT",
          Link: '<https://ryanbumstead.com/api-lab/reference?version=v2>; rel="alternate"'
        }
      )
    );
    invoke.mockResolvedValueOnce(result({}, { "X-API-Version": "v2" }));
    const element = create();
    await flush();
    const header = (name) =>
      $$(element, ".header-panel dt")
        .find((dt) => dt.textContent.trim() === name)
        .nextElementSibling.textContent.trim();

    chooseVersion(element, "v1");
    await flush();
    $(element, "button.execute-button").click();
    await flush();
    expect(header("X-API-Version")).toBe("v1");
    expect(header("Deprecation")).toBe("true");
    expect(header("Sunset")).toContain("28 Nov 2026");
    expect(header("Link")).toContain("version=v2");

    chooseVersion(element, "v2");
    await flush();
    $(element, "button.execute-button").click();
    await flush();
    expect(header("X-API-Version")).toBe("v2");
    expect(header("Deprecation")).toBe("(not returned)");
    expect(header("Sunset")).toBe("(not returned)");
  });

  it("checks a v2 body against the key only shape and a v1 body against the shape that still has id", async () => {
    invoke.mockResolvedValue(
      result([{ id: "a01", key: "skl_a", name: "Apex" }])
    );
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/skills");

    $(element, "button.execute-button").click();
    await flush();
    expect($(element, '.schema-list[data-list="extra"]').textContent).toContain(
      "id"
    );

    chooseVersion(element, "v1");
    await flush();
    $(element, "button.execute-button").click();
    await flush();
    expect($(element, ".schema-summary").textContent).toContain("0 not in");
    expect(
      $(element, '.schema-list[data-list="present"]').textContent
    ).toContain("id");
  });

  it("does not depend on an Id format: a text filter takes a key as typed", async () => {
    invoke.mockResolvedValue(result([]));
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/project-skills");

    setField(element, 'input[data-name="projectId"]', "prj_8f3k2m9qtz");
    await flush();
    $(element, "button.execute-button").click();
    await flush();
    expect(invoke).toHaveBeenLastCalledWith({
      path: "/sapi/v1/project-skills",
      params: { projectId: "prj_8f3k2m9qtz" },
      apiVersion: "v2"
    });
    expect(ID_HINT).toContain("key");
  });
});

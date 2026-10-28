/**
 * @description       : Unit tests for the API Lab filter options and the phone layout: the
 *                      option lists from ApiLabOptionsController as picklists with "Any" first,
 *                      a picked name sending its Id, the text box kept when the org returns no
 *                      options, the hint on its own line, and below the phone breakpoint the
 *                      filters, Advanced, the response details and the token form as closed
 *                      button disclosures that send api_lab_section_toggled. The catalog is the
 *                      real generated API_Lab_Catalog resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import ApiTester, {
  controlKind,
  ID_OPTION_HINT,
  KIND_ID,
  KIND_OPTIONS,
  KIND_PILLS,
  KIND_TEXT,
  PHONE_QUERY
} from "c/apiTester";
import getCatalog from "@salesforce/apex/ApiLabController.getCatalog";
import getOptions from "@salesforce/apex/ApiLabOptionsController.getOptions";
import invoke from "@salesforce/apex/ApiLabController.invoke";
import { trackEvent } from "c/analyticsService";

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: {
      API_TEST_EXECUTED: "api_test_executed",
      API_LAB_SECTION_TOGGLED: "api_lab_section_toggled"
    }
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
  "@salesforce/apex/ApiLabOptionsController.getOptions",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ApiLabController.invoke",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock(
  "@salesforce/apex/ApiLabController.requestEvaluatorToken",
  () => ({ default: jest.fn() }),
  { virtual: true }
);

const CATALOG_TEXT = readFileSync(
  join(
    process.cwd(),
    "packages/portfolio-site/main/default/staticresources/API_Lab_Catalog.json"
  ),
  "utf8"
);

const PROJECT_ID = "a0Xdh000001AbCdEAF";

const OPTIONS = {
  projectId: [
    { label: "Platform Architect Portfolio", value: PROJECT_ID },
    { label: "Literacy Pilot", value: "a0Xdh000002AbCdEAF" }
  ],
  issuerName: [
    { label: "Salesforce", value: "Salesforce" },
    { label: "State College", value: "State College" }
  ],
  persona: [
    { label: "Admin", value: "Admin" },
    { label: "Architect", value: "Architect" },
    { label: "Developer", value: "Developer" }
  ],
  contactName: []
};

/** Picks a path in the native endpoint select, as a visitor does. */
function chooseEndpoint(select, path) {
  select.value = path;
  select.dispatchEvent(new CustomEvent("change"));
}

const flush = () => new Promise((resolve) => process.nextTick(resolve));

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));

/** A matchMedia stand in whose answer a test can change later. */
function mockMatchMedia(matches) {
  const listeners = [];
  const query = {
    matches,
    media: PHONE_QUERY,
    addEventListener: jest.fn((type, listener) => listeners.push(listener)),
    removeEventListener: jest.fn()
  };
  window.matchMedia = jest.fn(() => query);
  return {
    query,
    change(next) {
      query.matches = next;
      listeners.forEach((listener) => listener({ matches: next }));
    }
  };
}

function create(options = OPTIONS) {
  const element = createElement("c-api-tester", { is: ApiTester });
  document.body.appendChild(element);
  getCatalog.emit(CATALOG_TEXT);
  if (options) {
    getOptions.emit(options);
  }
  return element;
}

async function choosePath(element, path) {
  chooseEndpoint($(element, "select.endpoint-picker"), path);
  await flush();
}

function pick(element, name, value) {
  const select = $(element, `select[data-name="${name}"]`);
  select.value = value;
  select.dispatchEvent(new CustomEvent("change"));
}

function disclosure(element, section) {
  return $(element, `button.disclosure[data-section="${section}"]`);
}

describe("c-api-tester filter options", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    window.matchMedia = originalMatchMedia;
    jest.clearAllMocks();
  });

  it("shows an Id filter as a picklist of names with Any first and sends the Id", async () => {
    invoke.mockResolvedValue({
      statusCode: 200,
      latencyMs: 10,
      headers: {},
      body: "[]"
    });
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/project-assets");

    const select = $(element, 'select[data-name="projectId"]');
    expect(select).not.toBeNull();
    expect($(element, 'input[data-name="projectId"]')).toBeNull();
    const options = Array.from(select.querySelectorAll("option"));
    expect(options.map((option) => option.textContent.trim())).toEqual([
      "Any",
      "Platform Architect Portfolio",
      "Literacy Pilot"
    ]);
    expect(options[0].value).toBe("");

    pick(element, "projectId", PROJECT_ID);
    await flush();
    expect($(element, "code.query-string").textContent).toBe(
      `?projectId=${PROJECT_ID}`
    );
    expect($(element, "button.disclosure")).toBeNull();

    $(element, "button.execute-button").click();
    await flush();
    expect(invoke).toHaveBeenCalledWith({
      path: "/sapi/v1/project-assets",
      params: { projectId: PROJECT_ID }
    });
  });

  it("puts the hint on its own line under the name", async () => {
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/project-assets");

    const label = $(element, 'select[data-name="projectId"]').closest("label");
    expect(label.querySelector(".param-label").textContent).toBe("projectId");
    const hint = label.querySelector(".param-hint");
    expect(hint.textContent).toBe(ID_OPTION_HINT);
    expect(hint.parentElement).toBe(label);
    expect(label.querySelector(".param-label .param-hint")).toBeNull();
  });

  it("shows a name filter as a picklist sending the name, with the spec's hint", async () => {
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/education");

    pick(element, "issuerName", "State College");
    await flush();
    expect($(element, "code.query-string").textContent).toBe(
      "?issuerName=State%20College"
    );
    const label = $(element, 'select[data-name="issuerName"]').closest("label");
    expect(label.querySelector(".param-hint").textContent).toBe(
      "Filter by Issuer Name."
    );
    expect(
      $(element, `select[data-name="issuerName"] option[value="State College"]`)
        .selected
    ).toBe(true);
  });

  it("keeps the text box when the org has no options for a parameter", async () => {
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/contacts");

    expect($(element, 'input[data-name="contactName"]').type).toBe("text");
    expect($(element, 'select[data-name="contactName"]')).toBeNull();
  });

  it("keeps every text box when the options cannot load", async () => {
    const element = create(null);
    getOptions.error({ body: { message: "nope" } });
    await flush();
    await choosePath(element, "/sapi/v1/project-assets");

    expect($(element, 'input[data-name="projectId"]').type).toBe("text");
    expect($(element, "p.catalog-error")).toBeNull();
  });

  it("leaves a spec enum as it is even when the org has options for its name", async () => {
    const element = create();
    await flush();
    await choosePath(element, "/papi/v1/resume/generate");

    expect($(element, 'fieldset[data-param="persona"]')).not.toBeNull();
    expect($(element, 'select[data-name="persona"]')).toBeNull();
  });

  it("picks the control kind from the options", () => {
    expect(controlKind({ name: "projectId", type: "string" }, OPTIONS)).toBe(
      KIND_OPTIONS
    );
    expect(controlKind({ name: "contactName", type: "string" }, OPTIONS)).toBe(
      KIND_TEXT
    );
    expect(controlKind({ name: "experienceId", type: "string" }, {})).toBe(
      KIND_ID
    );
    expect(controlKind({ name: "projectId", type: "string" })).toBe(KIND_ID);
    expect(
      controlKind(
        { name: "persona", type: "string", enum: ["Admin", "Developer"] },
        OPTIONS
      )
    ).toBe(KIND_PILLS);
  });
});

describe("c-api-tester phone sections", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    window.matchMedia = originalMatchMedia;
    jest.clearAllMocks();
  });

  it("asks the site's phone breakpoint", () => {
    mockMatchMedia(false);
    create();
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767.98px)");
  });

  it("starts with the endpoint and Execute showing and every section closed", async () => {
    mockMatchMedia(true);
    const element = create();
    await flush();

    expect($(element, "select.endpoint-picker")).not.toBeNull();
    expect($(element, "button.execute-button")).not.toBeNull();
    ["filters", "advanced", "token"].forEach((section) => {
      const button = disclosure(element, section);
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      const panel = $(
        element,
        `[id="${button.getAttribute("aria-controls")}"]`
      );
      expect(panel).not.toBeNull();
      expect(panel.hidden).toBe(true);
    });
    expect(disclosure(element, "filters").textContent.trim()).toBe(
      "Filters (0)"
    );
    expect(disclosure(element, "advanced").textContent.trim()).toBe("Advanced");
    expect(disclosure(element, "token").textContent.trim()).toBe(
      "Request an evaluator token"
    );
  });

  it("opens and closes a section, sending api_lab_section_toggled each time", async () => {
    mockMatchMedia(true);
    const element = create();
    await flush();

    const button = disclosure(element, "filters");
    button.click();
    await flush();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(
      $(element, `[id="${button.getAttribute("aria-controls")}"]`).hidden
    ).toBe(false);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenLastCalledWith("api_lab_section_toggled", {
      section: "filters",
      expanded: true
    });

    button.click();
    await flush();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(trackEvent).toHaveBeenLastCalledWith("api_lab_section_toggled", {
      section: "filters",
      expanded: false
    });
  });

  it("counts the chosen values in the Filters heading", async () => {
    mockMatchMedia(true);
    const element = create();
    await flush();
    await choosePath(element, "/sapi/v1/education");
    disclosure(element, "filters").click();
    await flush();

    pick(element, "issuerName", "Salesforce");
    await flush();
    expect(disclosure(element, "filters").textContent.trim()).toBe(
      "Filters (1)"
    );
    $(element, 'input[data-name="limit"]').value = "5";
    $(element, 'input[data-name="limit"]').dispatchEvent(
      new CustomEvent("change")
    );
    await flush();
    expect(disclosure(element, "filters").textContent.trim()).toBe(
      "Filters (2)"
    );
    expect($(element, "code.query-string").textContent).toBe(
      "?issuerName=Salesforce&limit=5"
    );
  });

  it("folds the response details under a closed section after a call", async () => {
    mockMatchMedia(true);
    invoke.mockResolvedValue({
      statusCode: 200,
      latencyMs: 12,
      headers: { "X-Request-Id": "r-1" },
      body: "[]"
    });
    const element = create();
    await flush();
    $(element, "button.execute-button").click();
    await flush();
    await flush();

    expect($(element, ".status-value").textContent).toBe("200");
    const button = disclosure(element, "response");
    expect(button.textContent.trim()).toBe("Response details");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const panel = $(element, `[id="${button.getAttribute("aria-controls")}"]`);
    expect(panel.hidden).toBe(true);
    expect(panel.querySelector(".header-panel")).not.toBeNull();

    button.click();
    await flush();
    expect(panel.hidden).toBe(false);
    expect(trackEvent).toHaveBeenLastCalledWith("api_lab_section_toggled", {
      section: "response",
      expanded: true
    });
  });

  it("shows every section open with no disclosure on desktop", async () => {
    mockMatchMedia(false);
    const element = create();
    await flush();

    expect($$(element, "button.disclosure")).toHaveLength(0);
    $$(element, ".section-panel").forEach((panel) =>
      expect(panel.hidden).toBe(false)
    );
    expect($(element, ".param-section h3").textContent.trim()).toBe(
      "Query parameters"
    );
  });

  it("follows the breakpoint when the width changes", async () => {
    const media = mockMatchMedia(false);
    const element = create();
    await flush();
    expect(disclosure(element, "filters")).toBeNull();

    media.change(true);
    await flush();
    expect(disclosure(element, "filters").getAttribute("aria-expanded")).toBe(
      "false"
    );

    media.change(false);
    await flush();
    expect(disclosure(element, "filters")).toBeNull();
  });

  it("stops listening when it leaves the page", () => {
    const media = mockMatchMedia(true);
    const element = create();
    document.body.removeChild(element);
    expect(media.query.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );
  });
});

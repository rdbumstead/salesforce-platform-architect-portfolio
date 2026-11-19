/**
 * @description       : Unit tests for the API Lab endpoint combobox (an ARIA 1.2 combobox with
 *                      a filter box and options grouped under System API and Process API), the
 *                      tools section that folds on a phone, and each reduceError case. The
 *                      catalog is the real generated API_Lab_Catalog resource.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/18/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import ApiTester, {
  PERSON_CHECK_MESSAGE,
  STATUS_MESSAGES,
  UNREACHABLE_MESSAGE,
  groupEndpoints,
  listPlacement,
  reduceError
} from "c/apiTester";
import getCatalog from "@salesforce/apex/ApiLabController.getCatalog";

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
const CATALOG = JSON.parse(CATALOG_TEXT).paths;

const tick = () => new Promise((resolve) => process.nextTick(resolve));
const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));

function create(phone = false) {
  window.matchMedia = jest.fn(() => ({
    matches: phone,
    media: "",
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }));
  const element = createElement("c-api-tester", { is: ApiTester });
  document.body.appendChild(element);
  getCatalog.emit(CATALOG_TEXT);
  return element;
}

async function key(element, name, init = {}) {
  const input = $(element, "input.endpoint-picker");
  input.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: name,
      bubbles: true,
      cancelable: true,
      ...init
    })
  );
  await tick();
}

const activePath = (element) => {
  const active = $(element, '[role="option"][aria-selected="true"]');
  return active ? active.dataset.path : undefined;
};

describe("endpoint list helpers", () => {
  it("groups the catalog under System API then Process API, in catalog order", () => {
    const groups = groupEndpoints(CATALOG, "");
    expect(groups.map((group) => group.label)).toEqual([
      "System API",
      "Process API"
    ]);
    expect(groups[0].entries).toHaveLength(15);
    expect(groups[1].entries).toHaveLength(6);
  });

  it("filters on every word and drops a group with no match", () => {
    const groups = groupEndpoints(CATALOG, "papi profile");
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Process API");
    expect(groups[0].entries.map((entry) => entry.path)).toEqual([
      "/papi/profile/full",
      "/papi/profile/summary"
    ]);
    expect(groupEndpoints(CATALOG, "zzz nothing")).toEqual([]);
  });

  it("keeps the list inside the window, above the box when there is no room below", () => {
    const below = listPlacement({ top: 100, bottom: 140 }, 800);
    expect(below).toEqual({ up: false, maxHeight: 320 });
    const tight = listPlacement({ top: 600, bottom: 640 }, 700);
    expect(tight.up).toBe(true);
    expect(tight.maxHeight).toBeLessThanOrEqual(320);
    const phone = listPlacement({ top: 300, bottom: 340 }, 400);
    expect(phone.up).toBe(true);
    expect(phone.maxHeight).toBeLessThanOrEqual(300 - 12);
  });
});

describe("c-api-tester endpoint combobox", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("is a closed combobox tied to its label and a listbox", async () => {
    const element = create();
    await tick();
    const input = $(element, "input.endpoint-picker");
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect($(element, `label[for="${input.id}"]`)).not.toBeNull();
    expect($(element, '[role="listbox"]').hidden).toBe(true);
  });

  it("opens on a click with the chosen route active and two named groups", async () => {
    const element = create();
    await tick();
    $(element, "input.endpoint-picker").dispatchEvent(new CustomEvent("click"));
    await tick();
    const input = $(element, "input.endpoint-picker");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect($(element, '[role="listbox"]').hidden).toBe(false);
    expect(
      $$(element, '[role="group"]').map((group) =>
        group.getAttribute("aria-label")
      )
    ).toEqual(["System API", "Process API"]);
    expect($$(element, '[role="option"]')).toHaveLength(21);
    expect(activePath(element)).toBe("/sapi/health");
    const active = $(element, '[role="option"][aria-selected="true"]');
    expect(input.getAttribute("aria-activedescendant")).toBe(active.id);
  });

  it("moves with Down, Up, Home and End and wraps at each end", async () => {
    const element = create();
    await tick();
    await key(element, "ArrowDown");
    expect(activePath(element)).toBe("/sapi/health");
    await key(element, "ArrowDown");
    expect(activePath(element)).toBe("/sapi/contacts");
    await key(element, "End");
    expect(activePath(element)).toBe("/papi/testimonials/feed");
    await key(element, "ArrowDown");
    expect(activePath(element)).toBe("/sapi/health");
    await key(element, "ArrowUp");
    expect(activePath(element)).toBe("/papi/testimonials/feed");
    await key(element, "Home");
    expect(activePath(element)).toBe("/sapi/health");
  });

  it("opens on the last option with Up while closed", async () => {
    const element = create();
    await tick();
    await key(element, "ArrowUp");
    expect(activePath(element)).toBe("/papi/testimonials/feed");
  });

  it("chooses the active option with Enter and closes", async () => {
    const element = create();
    await tick();
    await key(element, "ArrowDown");
    await key(element, "End");
    await key(element, "Enter");
    const input = $(element, "input.endpoint-picker");
    expect(input.value).toBe("GET /papi/testimonials/feed");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect($(element, '[role="listbox"]').hidden).toBe(true);
  });

  it("closes on Escape and keeps the chosen route", async () => {
    const element = create();
    await tick();
    await key(element, "ArrowDown");
    await key(element, "End");
    await key(element, "Escape");
    const input = $(element, "input.endpoint-picker");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.value).toBe("GET /sapi/health");
  });

  it("filters as the visitor types and says when nothing matches", async () => {
    const element = create();
    await tick();
    const input = $(element, "input.endpoint-picker");
    input.value = "papi resume";
    input.dispatchEvent(new CustomEvent("input"));
    await tick();
    expect($$(element, '[role="option"]').map((o) => o.dataset.path)).toEqual([
      "/papi/resume/generate"
    ]);
    expect(activePath(element)).toBe("/papi/resume/generate");
    expect($(element, ".combo-status").textContent).toBe("1 endpoint.");
    input.value = "zzzz";
    input.dispatchEvent(new CustomEvent("input"));
    await tick();
    expect($$(element, '[role="option"]')).toHaveLength(0);
    expect($(element, ".combo-empty").textContent).toContain("No endpoint");
    expect($(element, ".combo-status").textContent).toBe(
      "No endpoint matches."
    );
  });

  it("chooses an option with a click", async () => {
    const element = create();
    await tick();
    $(element, "input.endpoint-picker").dispatchEvent(new CustomEvent("click"));
    await tick();
    $(element, '[role="option"][data-path="/sapi/skills"]').dispatchEvent(
      new CustomEvent("click")
    );
    await tick();
    expect($(element, "input.endpoint-picker").value).toBe("GET /sapi/skills");
  });

  it("closes when the box loses focus", async () => {
    const element = create();
    await tick();
    const input = $(element, "input.endpoint-picker");
    input.dispatchEvent(new CustomEvent("click"));
    await tick();
    input.dispatchEvent(new CustomEvent("blur"));
    await tick();
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("c-api-tester tools section", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("folds under its own named button on a phone and holds the Postman and curl help", async () => {
    const element = create(true);
    await tick();
    const button = $(element, 'button[data-section="tools"]');
    expect(button.textContent.trim()).toBe("Use the API from your own tools");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect($(element, ".tools-section .section-panel").hidden).toBe(true);
    button.click();
    await tick();
    expect($(element, ".tools-section .section-panel").hidden).toBe(false);
    expect($$(element, "pre.curl-block")).toHaveLength(3);
  });

  it("shows the tools open under a heading on a wider screen", async () => {
    const element = create(false);
    await tick();
    expect($(element, 'button[data-section="tools"]')).toBeNull();
    expect($(element, ".tools-section .section-panel").hidden).toBe(false);
  });
});

describe("reduceError", () => {
  it("shows the server message even on a 503", () => {
    expect(
      reduceError({
        status: 503,
        body: { message: "Evaluator tokens are only issued by the live site." }
      })
    ).toBe("Evaluator tokens are only issued by the live site.");
  });

  it("shows the browser's own reason", () => {
    expect(reduceError(new Error("The request could not be sent."))).toBe(
      "The request could not be sent."
    );
  });

  it("uses the generic line for a status only when there is no message", () => {
    expect(reduceError({ status: 503, body: {} })).toBe(STATUS_MESSAGES[503]);
    expect(
      reduceError({
        status: 503,
        body: { message: "Failed to get error from response" }
      })
    ).toBe(STATUS_MESSAGES[503]);
    expect(reduceError({ status: 429 })).toBe(STATUS_MESSAGES[429]);
    expect(reduceError({ status: 401 })).toBe(STATUS_MESSAGES[401]);
  });

  it("says the request did not get through when there is no message and no known status", () => {
    expect(reduceError({ status: 500, body: {} })).toBe(UNREACHABLE_MESSAGE);
    expect(reduceError(undefined)).toBe(UNREACHABLE_MESSAGE);
  });

  it("tells the visitor to reload when the person check could not run", () => {
    expect(
      reduceError({
        status: 503,
        body: {
          message:
            "The check that you are a person could not be run. Try again later."
        }
      })
    ).toBe(PERSON_CHECK_MESSAGE);
    expect(reduceError(new Error("Turnstile did not load"))).toBe(
      PERSON_CHECK_MESSAGE
    );
    expect(PERSON_CHECK_MESSAGE).toContain("Reload the page");
  });

  it("joins the messages of a list body", () => {
    expect(reduceError({ body: [{ message: "a" }, { message: "b" }] })).toBe(
      "a, b"
    );
  });
});

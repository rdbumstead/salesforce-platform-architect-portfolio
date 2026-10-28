/**
 * @description       : Unit tests for what the API Lab shows around a call: the card title, the
 *                      placeholder, the empty response area before the first call, "Sending…"
 *                      with a thin bar while the call is out, the status block that fades in,
 *                      and on a phone the answer scrolled into view, smoothly unless the
 *                      visitor asks for reduced motion.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import ApiTester, { PHONE_QUERY } from "c/apiTester";
import getCatalog from "@salesforce/apex/ApiLabController.getCatalog";
import invoke from "@salesforce/apex/ApiLabController.invoke";

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

const RESULT = {
  statusCode: 200,
  latencyMs: 120,
  headers: { "X-Total-Count": "3" },
  body: '{"data":[]}',
  namedCredential: "Portfolio_API",
  requestId: "11111111-2222-4333-8444-555555555555",
  path: "/sapi/v1/health"
};

const flush = () => new Promise((resolve) => process.nextTick(resolve));
const $ = (element, selector) => element.shadowRoot.querySelector(selector);

/** matchMedia answers the phone query and the reduced motion query separately. */
function mockMedia({ phone, reduced }) {
  window.matchMedia = jest.fn((media) => ({
    matches: media === PHONE_QUERY ? phone : reduced,
    media,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }));
}

function create() {
  const element = createElement("c-api-tester", { is: ApiTester });
  document.body.appendChild(element);
  getCatalog.emit(CATALOG_TEXT);
  return element;
}

describe("c-api-tester feedback", () => {
  const originalMatchMedia = window.matchMedia;
  const originalScroll = window.HTMLElement.prototype.scrollIntoView;

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    window.matchMedia = originalMatchMedia;
    window.HTMLElement.prototype.scrollIntoView = originalScroll;
    jest.clearAllMocks();
  });

  it("names the card Try a request and suggests a working query", async () => {
    mockMedia({ phone: false, reduced: false });
    const element = create();
    await flush();

    expect($(element, "lightning-card").title).toBe("Try a request");
    expect($(element, "input.query-input").placeholder).toBe(
      "limit=10&offset=0"
    );
  });

  it("says how to fill the response area before the first call", async () => {
    mockMedia({ phone: false, reduced: false });
    const element = create();
    await flush();

    expect($(element, '[data-id="response-empty"]').textContent).toContain(
      "Press Execute GET to see the status, headers and body here."
    );
    expect($(element, ".result-summary")).toBeNull();
  });

  it("shows Sending… and a thin bar while the call is out, then the status", async () => {
    mockMedia({ phone: false, reduced: false });
    let finish;
    invoke.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const element = create();
    await flush();

    $(element, "button.execute-button").click();
    await flush();
    expect($(element, '[data-id="sending"] .sending-text').textContent).toBe(
      "Sending…"
    );
    expect($(element, ".progress .progress-bar")).not.toBeNull();
    expect($(element, '[data-id="response-empty"]')).toBeNull();
    expect($(element, "button.execute-button").disabled).toBe(true);

    finish(RESULT);
    await flush();
    await flush();
    expect($(element, '[data-id="sending"]')).toBeNull();
    expect($(element, '[data-id="response-empty"]')).toBeNull();
    const summary = $(element, ".result-summary");
    expect(summary.classList.contains("result-fade")).toBe(true);
    expect(summary.textContent).toContain("200");
  });

  it("shows the error and not the empty area after a failed call", async () => {
    mockMedia({ phone: false, reduced: false });
    invoke.mockRejectedValue({ body: { message: "Path is not available" } });
    const element = create();
    await flush();

    $(element, "button.execute-button").click();
    await flush();
    await flush();
    expect($(element, ".invoke-error").textContent).toContain(
      "Path is not available"
    );
    expect($(element, '[data-id="response-empty"]')).toBeNull();
  });

  it("scrolls the answer into view smoothly on a phone", async () => {
    mockMedia({ phone: true, reduced: false });
    const scroll = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scroll;
    invoke.mockResolvedValue(RESULT);
    const element = create();
    await flush();

    $(element, "button.execute-button").click();
    await flush();
    await flush();

    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("scrolls without animation when the visitor asks for reduced motion", async () => {
    mockMedia({ phone: true, reduced: true });
    const scroll = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scroll;
    invoke.mockResolvedValue(RESULT);
    const element = create();
    await flush();

    $(element, "button.execute-button").click();
    await flush();
    await flush();

    expect(scroll).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });

  it("does not scroll on a wide screen", async () => {
    mockMedia({ phone: false, reduced: false });
    const scroll = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scroll;
    invoke.mockResolvedValue(RESULT);
    const element = create();
    await flush();

    $(element, "button.execute-button").click();
    await flush();
    await flush();

    expect(scroll).not.toHaveBeenCalled();
  });
});

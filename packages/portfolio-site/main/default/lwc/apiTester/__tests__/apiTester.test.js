/**
 * @description       : Unit tests for apiTester LWC. ApiLabController.invoke and
 *                      requestEvaluatorToken are mocked with the shapes the controller returns.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import ApiTester, {
  CATALOG_ERROR,
  DISPLAYED_HEADERS,
  VERSION_HEADERS,
  parseQuery,
  longTextFields,
  RENDERED_MIN_LENGTH
} from "c/apiTester";
import getCatalog from "@salesforce/apex/ApiLabController.getCatalog";
import invoke from "@salesforce/apex/ApiLabController.invokeVersioned";
import requestEvaluatorToken from "@salesforce/apex/ApiLabController.requestEvaluatorToken";
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

const INVOKE_RESULT = {
  statusCode: 200,
  latencyMs: 142,
  headers: {
    "X-Request-Id": "11111111-2222-4333-8444-555555555555",
    "X-RateLimit-Limit": "120",
    "X-RateLimit-Remaining": "119",
    "Cache-Control": "max-age=300, public",
    "X-Total-Count": "54",
    "X-Has-More": "true"
  },
  body: '{"data":[{"name":"Apex"}]}',
  namedCredential: "Portfolio_API",
  requestId: "11111111-2222-4333-8444-555555555555",
  path: "/sapi/skills"
};

/** Picks a path in the native endpoint select, as a visitor does. */
function chooseEndpoint(select, path) {
  select.value = path;
  select.dispatchEvent(new CustomEvent("change"));
}

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

// The real generated catalog, so the tests follow the specs.
const CATALOG_TEXT = readFileSync(
  join(
    process.cwd(),
    "packages/portfolio-site/main/default/staticresources/API_Lab_Catalog.json"
  ),
  "utf8"
);
const CATALOG_PATHS = JSON.parse(CATALOG_TEXT).paths.map((entry) => entry.path);

function createComponent({ emitCatalog = true } = {}) {
  const element = createElement("c-api-tester", { is: ApiTester });
  document.body.appendChild(element);
  if (emitCatalog) {
    getCatalog.emit(CATALOG_TEXT);
  }
  return element;
}

function query(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function headerValue(element, name) {
  return query(element, `dd.header-value[data-header="${name}"]`).textContent;
}

function setInput(element, selector, value) {
  const input = query(element, selector);
  input.value = value;
  input.dispatchEvent(new CustomEvent("change"));
}

describe("c-api-tester", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("offers every catalog GET path and no SAPI resume path", async () => {
    const element = createComponent();
    await flushPromises();

    const select = query(element, "select.endpoint-picker");
    const options = Array.from(select.querySelectorAll("option"));
    expect(options.map((option) => option.value)).toEqual(CATALOG_PATHS);
    expect(options[0].textContent.trim()).toBe("GET /sapi/health");
    // The native select is labelled and shows the first path as chosen.
    expect(select.id).toBeTruthy();
    expect(options[0].selected).toBe(true);
    expect(CATALOG_PATHS).toHaveLength(21);
    // SAPIResume was removed, so no SAPI path may end in /resume.
    expect(
      CATALOG_PATHS.filter(
        (path) => path.startsWith("/sapi/") && path.endsWith("/resume")
      )
    ).toEqual([]);
    expect(CATALOG_PATHS).toContain("/papi/resume/generate");
    expect(CATALOG_PATHS).not.toContain("/papi/auth/token");
    expect(CATALOG_PATHS).not.toContain("/papi/ai/generate");
  });

  it("shows an alert and disables Execute when the catalog cannot load", async () => {
    const element = createComponent({ emitCatalog: false });
    getCatalog.error({ message: "No access" });
    await flushPromises();

    expect(query(element, ".catalog-error").textContent.trim()).toBe(
      CATALOG_ERROR
    );
    expect(query(element, ".catalog-error").textContent).not.toContain(
      "No access"
    );
    expect(query(element, "button.execute-button").disabled).toBe(true);
  });

  it("places View source with the apiTester key in the card actions slot", async () => {
    const element = createComponent();
    await flushPromises();

    expect(query(element, "lightning-card").title).toBe("Try a request");
    const template = readFileSync(
      join(__dirname, "..", "apiTester.html"),
      "utf8"
    );
    expect(template).toMatch(
      /<c-view-source\s+slot="actions"\s+source-key="apiTester"/
    );
  });

  it("reads the catalog the controller allows and matches RETURNED_HEADERS in source", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "packages/integration-api/main/default/classes/ApiLabController.cls"
      ),
      "utf8"
    );
    const block = (name) => {
      const match = new RegExp(
        String.raw`${name}\s*=\s*new [^{]+\{([^}]*)\}`
      ).exec(source);
      return Array.from(match[1].matchAll(/'([^']+)'/g), (m) => m[1]);
    };
    expect(source).toContain("CATALOG_RESOURCE = 'API_Lab_Catalog'");
    // The Apex list starts with DISPLAYED_HEADERS. It may go on with VERSION_HEADERS in order.
    const returned = block("RETURNED_HEADERS");
    expect(returned.slice(0, DISPLAYED_HEADERS.length)).toEqual(
      DISPLAYED_HEADERS
    );
    const rest = returned.slice(DISPLAYED_HEADERS.length);
    expect(rest.length === 0 || rest.join() === VERSION_HEADERS.join()).toBe(
      true
    );
  });

  it("calls invoke and renders status, latency, headers and body", async () => {
    invoke.mockResolvedValue(INVOKE_RESULT);
    const element = createComponent();
    await flushPromises();

    chooseEndpoint(query(element, "select.endpoint-picker"), "/sapi/skills");
    setInput(element, "input.query-input", "limit=5&offset=0");
    await flushPromises();

    query(element, "button.execute-button").click();
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith({
      path: "/sapi/skills",
      params: { limit: "5", offset: "0" },
      apiVersion: "v2"
    });
    expect(query(element, ".status-value").textContent).toBe("200");
    expect(query(element, ".latency-value").textContent).toBe("142 ms");
    expect(headerValue(element, "X-Request-Id")).toBe(
      "11111111-2222-4333-8444-555555555555"
    );
    expect(headerValue(element, "X-RateLimit-Limit")).toBe("120");
    expect(headerValue(element, "X-RateLimit-Remaining")).toBe("119");
    expect(headerValue(element, "Cache-Control")).toBe("max-age=300, public");
    expect(headerValue(element, "X-Total-Count")).toBe("54");
    expect(headerValue(element, "X-Has-More")).toBe("true");
    expect(headerValue(element, "Named Credential")).toBe("Portfolio_API");
    expect(query(element, ".response-body").textContent).toBe(
      JSON.stringify({ data: [{ name: "Apex" }] }, null, 2)
    );
  });

  it("marks headers the API did not return and shows a non-2xx status", async () => {
    invoke.mockResolvedValue({
      ...INVOKE_RESULT,
      statusCode: 429,
      headers: { "X-Request-Id": "abc" },
      body: "not json"
    });
    const element = createComponent();
    await flushPromises();

    query(element, "button.execute-button").click();
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith({
      path: "/sapi/health",
      params: {},
      apiVersion: "v2"
    });
    expect(query(element, ".status-value").textContent).toBe("429");
    expect(query(element, ".status-value").className).toContain("text-error");
    expect(headerValue(element, "X-Total-Count")).toBe("(not returned)");
    expect(query(element, ".response-body").textContent).toBe("not json");
  });

  it("uses native 44 px buttons and no SLDS text colour classes", async () => {
    invoke.mockResolvedValue(INVOKE_RESULT);
    const element = createComponent();
    await flushPromises();
    query(element, "button.execute-button").click();
    await flushPromises();

    expect(query(element, "button.execute-button").textContent.trim()).toBe(
      "Execute GET"
    );
    expect(query(element, "button.token-button").textContent.trim()).toBe(
      "Request token"
    );
    expect(query(element, '[class*="slds-text-color_"]')).toBeNull();
    const css = readFileSync(join(__dirname, "..", "apiTester.css"), "utf8");
    // Both buttons and every replaced field take the shared 44 px look.
    expect(css.startsWith('@import "c/nativeControls";')).toBe(true);
    ["button.execute-button", "button.token-button"].forEach((selector) =>
      expect(query(element, selector).classList.contains("nc-button")).toBe(
        true
      )
    );
    [
      "select.endpoint-picker",
      "input.query-input",
      "input.token-email",
      "input.token-purpose"
    ].forEach((selector) =>
      expect(query(element, selector).classList.contains("nc-control")).toBe(
        true
      )
    );
    expect(element.shadowRoot.querySelector("lightning-input")).toBeNull();
    expect(element.shadowRoot.querySelector("lightning-combobox")).toBeNull();
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("sends api_test_executed with the path, status and param_count after each call", async () => {
    invoke.mockResolvedValueOnce({ ...INVOKE_RESULT, statusCode: 429 });
    invoke.mockRejectedValueOnce({ body: { message: "unreachable" } });
    const element = createComponent();
    await flushPromises();
    chooseEndpoint(query(element, "select.endpoint-picker"), "/sapi/skills");
    await flushPromises();

    query(element, "button.execute-button").click();
    await flushPromises();
    expect(trackEvent).toHaveBeenLastCalledWith("api_test_executed", {
      path: "/sapi/skills",
      status: 429,
      param_count: 0
    });

    query(element, "button.execute-button").click();
    await flushPromises();
    expect(trackEvent).toHaveBeenLastCalledWith("api_test_executed", {
      path: "/sapi/skills",
      status: "error",
      param_count: 0
    });
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });

  it("shows the controller error when invoke throws", async () => {
    invoke.mockRejectedValue({
      body: { message: "Path is not available in the API Lab: /x" }
    });
    const element = createComponent();
    await flushPromises();

    query(element, "button.execute-button").click();
    await flushPromises();

    expect(query(element, ".invoke-error").textContent).toContain(
      "Path is not available in the API Lab: /x"
    );
    expect(query(element, ".header-panel")).toBeNull();
  });

  it("requests a token and shows the issued token fields", async () => {
    requestEvaluatorToken.mockResolvedValue({
      statusCode: 200,
      errorCode: null,
      message: null,
      retryAfterSeconds: null,
      correlationId: "c-1",
      token: {
        access_token: "00Dxx!token",
        token_type: "Bearer",
        instance_url: "https://example.my.salesforce.com",
        docs: "https://example.com/docs"
      }
    });
    const consoleSpies = ["log", "info", "warn", "error", "debug"].map((name) =>
      jest.spyOn(console, name).mockImplementation(() => {})
    );
    const element = createComponent();
    await flushPromises();

    setInput(element, "input.token-email", "eval@example.com");
    setInput(element, "input.token-purpose", "Review the API");
    query(element, "button.token-button").click();
    await flushPromises();

    expect(requestEvaluatorToken).toHaveBeenCalledWith({
      email: "eval@example.com",
      purpose: "Review the API"
    });
    expect(query(element, ".token-issued")).not.toBeNull();
    expect(
      query(element, 'dd.token-value[data-field="access_token"]').textContent
    ).toBe("00Dxx!token");
    expect(
      query(element, 'dd.token-value[data-field="expires_in"]')
    ).toBeNull();
    expect(query(element, ".token-issued").textContent).toContain(
      "30 minutes without use"
    );
    consoleSpies.forEach((spy) => {
      const logged = JSON.stringify(spy.mock.calls);
      expect(logged).not.toContain("00Dxx!token");
      spy.mockRestore();
    });
  });

  it("shows a refusal exactly as the controller returns it", async () => {
    requestEvaluatorToken.mockResolvedValue({
      statusCode: 429,
      errorCode: "RATE_LIMIT_EXCEEDED",
      message: "Too many token requests.",
      retryAfterSeconds: 60,
      correlationId: "c-2",
      token: null
    });
    const element = createComponent();
    await flushPromises();

    setInput(element, "input.token-email", "eval@example.com");
    setInput(element, "input.token-purpose", "Review the API");
    query(element, "button.token-button").click();
    await flushPromises();

    const value = (name) =>
      query(element, `dd.refusal-value[data-field="${name}"]`).textContent;
    expect(query(element, ".token-issued")).toBeNull();
    expect(value("statusCode")).toBe("429");
    expect(value("errorCode")).toBe("RATE_LIMIT_EXCEEDED");
    expect(value("message")).toBe("Too many token requests.");
    expect(value("retryAfterSeconds")).toBe("60");
    expect(value("correlationId")).toBe("c-2");
  });

  it("shows the error when the token call throws", async () => {
    requestEvaluatorToken.mockRejectedValue({
      body: { message: "You do not have access to the Apex class" }
    });
    const element = createComponent();
    await flushPromises();

    setInput(element, "input.token-email", "eval@example.com");
    setInput(element, "input.token-purpose", "Review the API");
    query(element, "button.token-button").click();
    await flushPromises();

    expect(query(element, ".token-error").textContent).toContain(
      "You do not have access to the Apex class"
    );
    expect(query(element, ".token-fields")).toBeNull();
  });

  it("parses query strings into a parameter map", () => {
    expect(parseQuery("")).toEqual({});
    expect(parseQuery("?limit=5&persona=Architect")).toEqual({
      limit: "5",
      persona: "Architect"
    });
    expect(parseQuery("q=a%20b&flag")).toEqual({ q: "a b", flag: "" });
  });

  describe("rendered view", () => {
    const RESUME_TEXT =
      "Test User\nArchitect\n\nEXPERIENCE\n\nEmployer Inc | Developer\n- Did great things";
    const RESUME_RESULT = {
      ...INVOKE_RESULT,
      path: "/papi/resume/generate",
      body: JSON.stringify({
        generatedText: RESUME_TEXT,
        persona: "Architect",
        integrityNote: "complete"
      })
    };

    async function executeWith(result) {
      invoke.mockResolvedValue(result);
      const element = createComponent();
      await flushPromises();
      query(element, "button.execute-button").click();
      await flushPromises();
      return element;
    }

    it("starts on Raw JSON with both views as pressed toggle buttons", async () => {
      const element = await executeWith(RESUME_RESULT);
      const raw = query(element, 'button[data-view="raw"]');
      const rendered = query(element, 'button[data-view="rendered"]');
      expect(raw.getAttribute("aria-pressed")).toBe("true");
      expect(rendered.getAttribute("aria-pressed")).toBe("false");
      expect(raw.tagName).toBe("BUTTON");
      expect(rendered.textContent.trim()).toBe("Rendered");
      expect(query(element, ".response-body")).not.toBeNull();
      expect(query(element, '[data-id="rendered-view"]')).toBeNull();
    });

    it("shows a long text field with its line breaks when Rendered is chosen", async () => {
      const element = await executeWith(RESUME_RESULT);
      query(element, 'button[data-view="rendered"]').click();
      await flushPromises();

      expect(
        query(element, 'button[data-view="rendered"]').getAttribute(
          "aria-pressed"
        )
      ).toBe("true");
      expect(query(element, ".response-body")).toBeNull();
      const fields = element.shadowRoot.querySelectorAll(".rendered-field");
      expect(fields).toHaveLength(1);
      expect(query(element, ".rendered-path").textContent).toBe(
        "generatedText"
      );
      const text = query(element, ".rendered-text");
      expect(text.tagName).toBe("PRE");
      expect(text.textContent).toBe(RESUME_TEXT);
      expect(text.textContent).toContain("\n\nEXPERIENCE\n");
      expect(text.getAttribute("tabindex")).toBe("0");

      query(element, 'button[data-view="raw"]').click();
      await flushPromises();
      expect(query(element, ".response-body")).not.toBeNull();
    });

    it("says so when the body has no long text field", async () => {
      const element = await executeWith(INVOKE_RESULT);
      query(element, 'button[data-view="rendered"]').click();
      await flushPromises();

      expect(query(element, '[data-id="rendered-empty"]')).not.toBeNull();
      expect(query(element, ".rendered-field")).toBeNull();
    });

    it("finds long or multi-line strings at any depth, by path", () => {
      const long = "x".repeat(RENDERED_MIN_LENGTH);
      expect(
        longTextFields({
          short: "Apex",
          multi: "a\nb",
          data: [{ description: long }, { name: "LWC" }],
          nested: { deeper: { text: long } }
        })
      ).toEqual([
        { path: "multi", text: "a\nb" },
        { path: "data.0.description", text: long },
        { path: "nested.deeper.text", text: long }
      ]);
      expect(longTextFields(undefined)).toEqual([]);
      expect(longTextFields("top level string\n")).toEqual([]);
    });
  });
});

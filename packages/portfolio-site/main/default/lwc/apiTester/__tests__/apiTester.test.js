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
  ALLOWED_PATHS,
  DISPLAYED_HEADERS,
  parseQuery,
  longTextFields,
  RENDERED_MIN_LENGTH
} from "c/apiTester";
import invoke from "@salesforce/apex/ApiLabController.invoke";
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
  "@salesforce/apex/ApiLabController.invoke",
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
  path: "/sapi/v1/skills"
};

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

function createComponent() {
  const element = createElement("c-api-tester", { is: ApiTester });
  document.body.appendChild(element);
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

  it("offers only the controller allowlist and no SAPI resume path", async () => {
    const element = createComponent();
    await flushPromises();

    const options = query(
      element,
      "lightning-combobox.endpoint-picker"
    ).options;
    expect(options.map((option) => option.value)).toEqual(ALLOWED_PATHS);
    expect(ALLOWED_PATHS).toHaveLength(21);
    // SAPIResume was removed in Round 2. No SAPI path may end in /resume.
    expect(
      ALLOWED_PATHS.filter(
        (path) => path.startsWith("/sapi/") && path.endsWith("/resume")
      )
    ).toEqual([]);
    expect(ALLOWED_PATHS).toContain("/papi/v1/resume/generate");
  });

  it("matches ApiLabController.ALLOWED_PATHS and RETURNED_HEADERS in source", () => {
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
    expect([...ALLOWED_PATHS].sort()).toEqual(block("ALLOWED_PATHS").sort());
    expect(DISPLAYED_HEADERS).toEqual(block("RETURNED_HEADERS"));
  });

  it("calls invoke and renders status, latency, headers and body", async () => {
    invoke.mockResolvedValue(INVOKE_RESULT);
    const element = createComponent();
    await flushPromises();

    query(element, "lightning-combobox.endpoint-picker").dispatchEvent(
      new CustomEvent("change", { detail: { value: "/sapi/v1/skills" } })
    );
    setInput(element, "lightning-input.query-input", "limit=5&offset=0");
    await flushPromises();

    query(element, "button.execute-button").click();
    await flushPromises();

    expect(invoke).toHaveBeenCalledWith({
      path: "/sapi/v1/skills",
      params: { limit: "5", offset: "0" }
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
      path: ALLOWED_PATHS[0],
      params: {}
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
    expect(css).toMatch(/\.token-button \{[^}]*min-height: 44px/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it("sends api_test_executed with the path and status after each call", async () => {
    invoke.mockResolvedValueOnce({ ...INVOKE_RESULT, statusCode: 429 });
    invoke.mockRejectedValueOnce({ body: { message: "unreachable" } });
    const element = createComponent();
    await flushPromises();
    query(element, "lightning-combobox.endpoint-picker").dispatchEvent(
      new CustomEvent("change", { detail: { value: "/sapi/v1/skills" } })
    );
    await flushPromises();

    query(element, "button.execute-button").click();
    await flushPromises();
    expect(trackEvent).toHaveBeenLastCalledWith("api_test_executed", {
      path: "/sapi/v1/skills",
      status: 429
    });

    query(element, "button.execute-button").click();
    await flushPromises();
    expect(trackEvent).toHaveBeenLastCalledWith("api_test_executed", {
      path: "/sapi/v1/skills",
      status: "error"
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

    setInput(element, "lightning-input.token-email", "eval@example.com");
    setInput(element, "lightning-input.token-purpose", "Review the API");
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
      path: "/papi/v1/resume/generate",
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

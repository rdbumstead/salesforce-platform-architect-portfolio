/**
 * @description       : Unit tests for what the API Lab offers for use outside the page: the
 *                      setup steps, the Postman collection download, the Run in Postman link
 *                      from its setting, the curl examples before and after a token, the copy
 *                      buttons and their events, the email check on the token form, the plain
 *                      error sentences, and the tour's stop C anchor on Execute. Every token here
 *                      is an obviously fake one.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/27/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import ApiTester, {
  buildCurlExamples,
  isPostmanRunUrl,
  reduceError,
  COLLECTION_FILE_NAME,
  COPY_DONE,
  COPY_FAILED,
  EMAIL_ERROR,
  PLACEHOLDER_TOKEN,
  PLACEHOLDER_INSTANCE_URL,
  STATUS_MESSAGES,
  TOKEN_ENDPOINT_PATH,
  UNREACHABLE_MESSAGE
} from "c/apiTester";
import getCatalog from "@salesforce/apex/ApiLabController.getCatalog";
import getPostmanRunUrl from "@salesforce/apex/ApiLabController.getPostmanRunUrl";
import requestEvaluatorToken from "@salesforce/apex/ApiLabController.requestEvaluatorToken";
import { trackEvent } from "c/analyticsService";
import { showMe } from "c/tourShowMe";

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: {
      API_TEST_EXECUTED: "api_test_executed",
      POSTMAN_RUN_CLICKED: "postman_run_clicked",
      POSTMAN_COLLECTION_DOWNLOADED: "postman_collection_downloaded",
      CURL_COPIED: "curl_copied"
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
  "@salesforce/apex/ApiLabController.getPostmanRunUrl",
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

const FAKE_TOKEN = "FAKE-TOKEN-FOR-TESTS-ONLY";
const FAKE_INSTANCE = "https://example.my.salesforce.com";
const RUN_URL = "https://god.gw.postman.com/run-collection/example";

const CATALOG_TEXT = readFileSync(
  join(
    process.cwd(),
    "packages/portfolio-site/main/default/staticresources/API_Lab_Catalog.json"
  ),
  "utf8"
);

const flush = () => new Promise((resolve) => process.nextTick(resolve));

function create() {
  const element = createElement("c-api-tester", { is: ApiTester });
  document.body.appendChild(element);
  getCatalog.emit(CATALOG_TEXT);
  return element;
}

function $(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function $$(element, selector) {
  return Array.from(element.shadowRoot.querySelectorAll(selector));
}

function type(element, selector, value, eventName = "input") {
  const input = $(element, selector);
  input.value = value;
  input.dispatchEvent(new CustomEvent(eventName));
}

function issued() {
  return {
    statusCode: 200,
    correlationId: "c-1",
    token: {
      access_token: FAKE_TOKEN,
      token_type: "Bearer",
      instance_url: FAKE_INSTANCE,
      docs: "https://example.com/docs"
    }
  };
}

describe("c-api-tester outside the page", () => {
  let clipboard;

  beforeEach(() => {
    clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, "clipboard", {
      value: clipboard,
      configurable: true
    });
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("offers three setup steps and the collection as a named download", async () => {
    const element = create();
    await flush();

    expect($$(element, ".setup-steps li")).toHaveLength(3);
    const link = $(element, "a.collection-download");
    expect(link.getAttribute("download")).toBe(COLLECTION_FILE_NAME);
    expect(link.getAttribute("href")).toBeTruthy();
    expect(link.classList.contains("nc-button")).toBe(true);
    link.click();
    expect(trackEvent).toHaveBeenCalledWith("postman_collection_downloaded", {
      source: "api_lab"
    });
  });

  it("hides Run in Postman while the setting is empty", async () => {
    const element = create();
    getPostmanRunUrl.emit("");
    await flush();
    expect($(element, "a.postman-run")).toBeNull();
  });

  it("shows Run in Postman from the setting in a new tab and records the click", async () => {
    const element = create();
    getPostmanRunUrl.emit(RUN_URL);
    await flush();

    const link = $(element, "a.postman-run");
    expect(link.getAttribute("href")).toBe(RUN_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    link.click();
    expect(trackEvent).toHaveBeenCalledWith("postman_run_clicked", {
      source: "api_lab"
    });
  });

  it("keeps Run in Postman hidden for a link that is not a postman.com https link", async () => {
    const element = create();
    getPostmanRunUrl.emit("ftp://www.postman.com/run");
    await flush();
    expect($(element, "a.postman-run")).toBeNull();
    expect(isPostmanRunUrl("http://www.postman.com/x")).toBe(false);
    expect(isPostmanRunUrl("https://postman.com.example.com/x")).toBe(false);
    expect(isPostmanRunUrl("https://app.getpostman.com/run-collection/x")).toBe(
      true
    );
    expect(isPostmanRunUrl(undefined)).toBe(false);
  });

  it("shows placeholders in every curl example before a token", async () => {
    const element = create();
    await flush();

    const blocks = $$(element, "pre.curl-block");
    expect(blocks.map((block) => block.dataset.example)).toEqual([
      "token",
      "health",
      "data"
    ]);
    expect(blocks[0].textContent).toContain(TOKEN_ENDPOINT_PATH);
    expect(blocks[0].textContent).toContain("you@example.com");
    expect(blocks[1].textContent).toContain(PLACEHOLDER_TOKEN);
    expect(blocks[1].textContent).toContain(
      `${PLACEHOLDER_INSTANCE_URL}/services/apexrest/papi/v1/health`
    );
    expect(blocks[2].textContent).toContain("/papi/v1/profile/summary");
    blocks.forEach((block) => {
      expect(block.getAttribute("tabindex")).toBe("0");
      expect(block.getAttribute("aria-label")).toBeTruthy();
    });
    expect($(element, ".curl-note").textContent).toContain(
      "30 minutes without use"
    );
    expect($$(element, ".status-notes li").map((li) => li.textContent)).toEqual(
      [
        expect.stringContaining("401"),
        expect.stringContaining("429"),
        expect.stringContaining("503")
      ]
    );
  });

  it("fills the curl examples with the issued token and instance_url, never the visitor's email", async () => {
    requestEvaluatorToken.mockResolvedValue(issued());
    const element = create();
    await flush();
    type(element, "input.token-email", "eval@example.com");
    type(element, "input.token-purpose", "Review the API");
    $(element, "button.token-button").click();
    await flush();

    const [token, health, data] = $$(element, "pre.curl-block").map(
      (block) => block.textContent
    );
    expect(health).toContain(`Bearer ${FAKE_TOKEN}`);
    expect(health).toContain(`${FAKE_INSTANCE}/services/apexrest/papi/v1`);
    expect(data).toContain(`Bearer ${FAKE_TOKEN}`);
    expect(token).not.toContain("eval@example.com");
    expect(token).not.toContain(FAKE_TOKEN);
  });

  it("copies one example, says so, and sends curl_copied with only its key", async () => {
    requestEvaluatorToken.mockResolvedValue(issued());
    const element = create();
    await flush();
    type(element, "input.token-email", "eval@example.com");
    type(element, "input.token-purpose", "Review the API");
    $(element, "button.token-button").click();
    await flush();

    $(element, 'button.copy-button[data-example="health"]').click();
    await flush();

    expect(clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(FAKE_TOKEN)
    );
    expect($(element, ".copy-status").textContent.trim()).toBe(COPY_DONE);
    expect(trackEvent).toHaveBeenCalledWith("curl_copied", {
      example: "health"
    });
    // No event param ever carries the token.
    expect(JSON.stringify(trackEvent.mock.calls)).not.toContain(FAKE_TOKEN);
  });

  it("says copy did not work and sends nothing when the clipboard refuses", async () => {
    clipboard.writeText.mockRejectedValue(new Error("denied"));
    const element = create();
    await flush();

    $(element, 'button.copy-button[data-example="token"]').click();
    await flush();

    expect($(element, ".copy-status").textContent.trim()).toBe(COPY_FAILED);
    expect(trackEvent).not.toHaveBeenCalledWith(
      "curl_copied",
      expect.anything()
    );
  });

  it("gives every copy button a name that says which example it copies", async () => {
    const element = create();
    await flush();
    const labels = $$(element, "button.copy-button").map((button) =>
      button.getAttribute("aria-label")
    );
    expect(labels).toEqual([
      "Copy the token request",
      "Copy the health call",
      "Copy the profile summary call"
    ]);
  });
});

describe("c-api-tester token form", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("ties each field to its label", async () => {
    const element = create();
    await flush();
    ["token-email", "token-purpose", "query-input", "endpoint-picker"].forEach(
      (name) => {
        const control = $(element, `.${name}`);
        const label = $(element, `label[for="${control.id}"]`);
        expect(label).not.toBeNull();
      }
    );
  });

  it("marks a mistyped email on leaving the field and clears it once it reads right", async () => {
    const element = create();
    await flush();

    type(element, "input.token-email", "not-an-address", "change");
    await flush();
    const field = $(element, "input.token-email");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const error = $(element, ".token-email-error");
    expect(error.textContent.trim()).toBe(EMAIL_ERROR);
    expect(field.getAttribute("aria-describedby")).toContain(error.id);

    type(element, "input.token-email", "eval@example.com");
    await flush();
    expect($(element, ".token-email-error")).toBeNull();
    expect(field.getAttribute("aria-invalid")).toBeNull();
  });

  it("does not send a mistyped email and moves focus to the field", async () => {
    const element = create();
    await flush();

    type(element, "input.token-email", "eval@");
    $(element, "button.token-button").click();
    await flush();
    await flush();

    expect(requestEvaluatorToken).not.toHaveBeenCalled();
    expect($(element, ".token-email-error")).not.toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      $(element, "input.token-email")
    );
  });

  it("still sends an empty form, so the server's own message answers it as before", async () => {
    requestEvaluatorToken.mockResolvedValue({
      statusCode: 400,
      errorCode: "BAD_REQUEST",
      message: "email is required.",
      token: null
    });
    const element = create();
    await flush();
    $(element, "button.token-button").click();
    await flush();
    expect(requestEvaluatorToken).toHaveBeenCalledWith({
      email: "",
      purpose: ""
    });
  });
});

describe("reduceError", () => {
  it("never shows the platform's raw wording", () => {
    expect(
      reduceError({ body: { message: "Failed to get error from response" } })
    ).toBe(UNREACHABLE_MESSAGE);
    expect(reduceError({ message: "Failed to get error from response" })).toBe(
      UNREACHABLE_MESSAGE
    );
    expect(reduceError(undefined)).toBe(UNREACHABLE_MESSAGE);
    expect(reduceError({})).toBe(UNREACHABLE_MESSAGE);
  });

  it("keeps the meaning of 401, 429 and 503", () => {
    expect(reduceError({ status: 401, body: {} })).toBe(STATUS_MESSAGES[401]);
    expect(reduceError({ status: 429, body: {} })).toBe(STATUS_MESSAGES[429]);
    expect(reduceError({ status: 503, body: {} })).toBe(STATUS_MESSAGES[503]);
    expect(STATUS_MESSAGES[429]).toMatch(/minute/);
  });

  it("keeps the server's own message and joins a list of them", () => {
    expect(reduceError({ body: { message: "Rate limit reached." } })).toBe(
      "Rate limit reached."
    );
    expect(reduceError({ body: [{ message: "a" }, { message: "b" }] })).toBe(
      "a, b"
    );
  });
});

describe("buildCurlExamples", () => {
  it("uses the page's origin for the token request", () => {
    const [token] = buildCurlExamples("https://example.my.site.com");
    expect(token.text).toContain(
      `https://example.my.site.com${TOKEN_ENDPOINT_PATH}`
    );
  });
});

describe("c-api-tester tour stop C", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("marks Execute as the anchor and shows it when the tour asks for stop C", async () => {
    const element = create();
    await flush();
    const execute = $(element, "button.execute-button");
    expect(execute.getAttribute("data-tour-anchor")).toBe("C");
    execute.scrollIntoView = jest.fn();

    showMe("B");
    expect(execute.scrollIntoView).not.toHaveBeenCalled();
    showMe("C");
    expect(execute.scrollIntoView).toHaveBeenCalled();
    expect(element.shadowRoot.activeElement).toBe(execute);
  });

  it("stops listening once it leaves the page", async () => {
    const element = create();
    await flush();
    const execute = $(element, "button.execute-button");
    execute.scrollIntoView = jest.fn();
    document.body.removeChild(element);
    showMe("C");
    expect(execute.scrollIntoView).not.toHaveBeenCalled();
  });
});

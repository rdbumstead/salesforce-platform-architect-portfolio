/**
 * @description       : Unit tests for the API reference's Postman row and its plain error
 *                      sentence: the collection downloads with a file name and records the
 *                      download, Run in Postman shows only for a postman.com https link from
 *                      its setting, and a failed load never shows the platform's raw wording.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/27/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ApiReference, {
  COLLECTION_FILE_NAME,
  reduceError
} from "c/apiReference";
import getPostmanRunUrl from "@salesforce/apex/ApiLabController.getPostmanRunUrl";
import { trackEvent } from "c/analyticsService";
import { loadScript } from "lightning/platformResourceLoader";

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: {
      API_REFERENCE_OPENED: "api_reference_opened",
      POSTMAN_RUN_CLICKED: "postman_run_clicked",
      POSTMAN_COLLECTION_DOWNLOADED: "postman_collection_downloaded"
    }
  }),
  { virtual: true }
);
jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
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
// Keep the real mock component as the default export and add the loader beside it.
jest.mock("lightning/platformResourceLoader", () => {
  const universal = jest.requireActual("lightning/platformResourceLoader");
  return {
    __esModule: true,
    default: universal.default,
    loadScript: jest.fn(),
    loadStyle: jest.fn()
  };
});

const RUN_URL = "https://god.gw.postman.com/run-collection/example";
const flush = () => new Promise((resolve) => process.nextTick(resolve));

function create() {
  const element = createElement("c-api-reference", { is: ApiReference });
  document.body.appendChild(element);
  return element;
}

function $(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

describe("c-api-reference Postman row", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.Redoc;
    jest.clearAllMocks();
  });

  it("downloads the collection with its file name and records it with source reference", async () => {
    const element = create();
    await flush();
    const link = $(element, "a.collection-download");
    expect(link.getAttribute("download")).toBe(COLLECTION_FILE_NAME);
    expect(link.textContent.trim()).toBe("Download the Postman collection");
    expect(link.getAttribute("href")).toBeTruthy();
    link.click();
    expect(trackEvent).toHaveBeenCalledWith("postman_collection_downloaded", {
      source: "reference"
    });
  });

  it("hides Run in Postman while the setting is empty", async () => {
    const element = create();
    getPostmanRunUrl.emit("");
    await flush();
    expect($(element, "a.postman-run")).toBeNull();
  });

  it("shows Run in Postman for a set link and records the click", async () => {
    const element = create();
    getPostmanRunUrl.emit(RUN_URL);
    await flush();
    const link = $(element, "a.postman-run");
    expect(link.getAttribute("href")).toBe(RUN_URL);
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    link.click();
    expect(trackEvent).toHaveBeenCalledWith("postman_run_clicked", {
      source: "reference"
    });
  });

  it("keeps Run in Postman hidden for any other link", async () => {
    const element = create();
    getPostmanRunUrl.emit("https://example.com/run");
    await flush();
    expect($(element, "a.postman-run")).toBeNull();
  });

  it("says only that the reference could not be shown when the script load gives no message", async () => {
    loadScript.mockRejectedValueOnce(new CustomEvent("error"));
    const element = create();
    await flush();
    $(element, "button.open-reference").click();
    await flush();
    const text = $(element, ".error-text").textContent;
    expect(text).toBe("The interactive reference could not be shown.");
    expect(text).not.toMatch(/unknown error|failed to get error/i);
  });
});

describe("reduceError", () => {
  it("drops the platform's raw wording and keeps a real cause", () => {
    expect(reduceError({ message: "Failed to get error from response" })).toBe(
      ""
    );
    expect(reduceError(undefined)).toBe("");
    expect(reduceError("Unknown error")).toBe("");
    expect(reduceError(new Error("blocked"))).toBe("blocked");
    expect(reduceError("Invalid spec")).toBe("Invalid spec");
  });
});

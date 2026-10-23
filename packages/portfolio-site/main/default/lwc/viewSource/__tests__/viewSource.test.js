/**
 * @description       : Unit tests for c-view-source. SourceController
 *                      .getSourceFiles is a mocked wire adapter. The tests cover the hidden
 *                      button for an unknown key or empty cache, the dialog's name and role,
 *                      the tabs, the GitHub link, focus moving in and back, Escape, and Tab
 *                      wrapping inside the dialog.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ViewSource from "c/viewSource";
import getSourceFiles from "@salesforce/apex/SourceController.getSourceFiles";

jest.mock(
  "@salesforce/apex/SourceController.getSourceFiles",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

// The code viewer inside the dialog loads Prism. Keep the universal mock component and add
// loader functions that resolve with no Prism, so the viewer shows escaped text.
jest.mock("lightning/platformResourceLoader", () => {
  const universal = jest.requireActual("lightning/platformResourceLoader");
  return {
    __esModule: true,
    default: universal.default,
    loadScript: jest.fn(() => Promise.resolve()),
    loadStyle: jest.fn(() => Promise.resolve())
  };
});

const FILES = [
  {
    path: "packages/x/lwc/apiTester/apiTester.js",
    label: "apiTester.js",
    language: "javascript",
    content: "export default class ApiTester {}",
    htmlUrl: "https://github.com/o/r/blob/main/apiTester.js",
    fetchedAt: "2026-10-23T06:00:00.000Z",
    truncated: false
  },
  {
    path: "packages/x/classes/ApiLabController.cls",
    label: "ApiLabController.cls",
    language: "apex",
    content: "public class ApiLabController {}",
    htmlUrl: "https://github.com/o/r/blob/main/ApiLabController.cls",
    fetchedAt: "2026-10-23T06:00:00.000Z",
    truncated: true
  }
];

const flush = () => Promise.resolve();

function create(key = "apiTester") {
  const element = createElement("c-view-source", { is: ViewSource });
  element.sourceKey = key;
  document.body.appendChild(element);
  return element;
}

const $ = (element, selector) => element.shadowRoot.querySelector(selector);
const $$ = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));

async function openDialog(element) {
  $(element, ".view-source-button").click();
  await flush();
  await flush();
}

function keydown(target, key, options = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options
  });
  target.dispatchEvent(event);
  return event;
}

describe("c-view-source", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("passes its key to the wire and renders nothing before data", async () => {
    const element = create("apiTester");
    await flush();

    expect(getSourceFiles.getLastConfig()).toEqual({ sourceKey: "apiTester" });
    expect($(element, ".view-source-button")).toBeNull();
  });

  it("renders no button when the cache is empty", async () => {
    const element = create("notAKey");
    getSourceFiles.emit([]);
    await flush();

    expect($(element, ".view-source-button")).toBeNull();
  });

  it("renders no button when the wire fails", async () => {
    const element = create();
    getSourceFiles.error();
    await flush();

    expect($(element, ".view-source-button")).toBeNull();
  });

  it("renders a real View source button when files exist", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();

    const button = $(element, ".view-source-button");
    expect(button.tagName).toBe("BUTTON");
    expect(button.textContent.trim()).toBe("View source");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect($(element, ".dialog-body")).toBeNull();
  });

  it("opens a labelled modal dialog and moves focus into it", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();
    await openDialog(element);

    const dialog = $(element, "[role='dialog']");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const heading = $(element, ".dialog-heading");
    expect(heading.textContent.trim()).toBe("Source: API Lab");
    expect(dialog.getAttribute("aria-labelledby")).toBe(
      heading.getAttribute("id")
    );
    expect(element.shadowRoot.activeElement).toBe(heading);
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("uses showModal and close when the browser has them, and closes on cancel", async () => {
    const proto = window.HTMLDialogElement.prototype;
    const original = { showModal: proto.showModal, close: proto.close };
    proto.showModal = jest.fn(function showModal() {
      this.setAttribute("open", "");
    });
    proto.close = jest.fn(function close() {
      this.removeAttribute("open");
    });
    try {
      const element = create();
      getSourceFiles.emit(FILES);
      await flush();
      await openDialog(element);

      expect(proto.showModal).toHaveBeenCalledTimes(1);

      const cancel = new CustomEvent("cancel", { cancelable: true });
      $(element, "dialog").dispatchEvent(cancel);
      await flush();
      await flush();

      expect(cancel.defaultPrevented).toBe(true);
      expect(proto.close).toHaveBeenCalledTimes(1);
      expect($(element, ".dialog-body")).toBeNull();
      expect(element.shadowRoot.activeElement).toBe(
        $(element, ".view-source-button")
      );
    } finally {
      proto.showModal = original.showModal;
      proto.close = original.close;
    }
  });

  it("does not close when a click lands inside the dialog body", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();
    await openDialog(element);

    $(element, ".dialog-heading").click();
    await flush();

    expect($(element, ".dialog-body")).not.toBeNull();
  });

  it("lists one tab per file and shows the first in the code viewer", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();
    await openDialog(element);

    const tabs = $$(element, "[role='tab']");
    expect(tabs.map((tab) => tab.textContent.trim())).toEqual([
      "apiTester.js",
      "ApiLabController.cls"
    ]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(tabs[1].getAttribute("tabindex")).toBe("-1");

    const viewer = $(element, "c-code-viewer");
    expect(viewer.code).toBe(FILES[0].content);
    expect(viewer.language).toBe("javascript");
    expect(viewer.title).toBe("apiTester.js");

    const link = $(element, ".github-link");
    expect(link.getAttribute("href")).toBe(FILES[0].htmlUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect($(element, ".truncated-note")).toBeNull();
  });

  it("switches files on click and says when a file is cut", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();
    await openDialog(element);

    $$(element, "[role='tab']")[1].click();
    await flush();

    expect($(element, "c-code-viewer").code).toBe(FILES[1].content);
    expect($(element, "c-code-viewer").language).toBe("apex");
    expect($(element, ".truncated-note")).not.toBeNull();
  });

  it("moves between tabs with the arrow keys, Home and End", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();
    await openDialog(element);

    keydown($$(element, "[role='tab']")[0], "ArrowRight");
    await flush();
    let tabs = $$(element, "[role='tab']");
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(element.shadowRoot.activeElement).toBe(tabs[1]);

    keydown(tabs[1], "ArrowRight");
    await flush();
    tabs = $$(element, "[role='tab']");
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");

    keydown(tabs[0], "End");
    await flush();
    expect($$(element, "[role='tab']")[1].getAttribute("aria-selected")).toBe(
      "true"
    );

    keydown($$(element, "[role='tab']")[1], "Home");
    await flush();
    expect($$(element, "[role='tab']")[0].getAttribute("aria-selected")).toBe(
      "true"
    );
  });

  it("closes on Escape and returns focus to the button", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();
    await openDialog(element);

    const event = keydown($(element, ".close-button"), "Escape");
    await flush();
    await flush();

    expect(event.defaultPrevented).toBe(true);
    expect($(element, ".dialog-body")).toBeNull();
    expect(element.shadowRoot.activeElement).toBe(
      $(element, ".view-source-button")
    );
  });

  it("closes from the Close button and the backdrop", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();
    await openDialog(element);

    $(element, ".close-button").click();
    await flush();
    expect($(element, ".dialog-body")).toBeNull();

    await openDialog(element);
    $(element, "dialog").click();
    await flush();
    expect($(element, ".dialog-body")).toBeNull();
  });

  it("keeps Tab inside the dialog in both directions", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();
    await openDialog(element);

    const close = $(element, ".close-button");
    const link = $(element, ".github-link");

    link.focus();
    const forward = keydown(link, "Tab");
    expect(forward.defaultPrevented).toBe(true);
    expect(element.shadowRoot.activeElement).toBe(close);

    const back = keydown(close, "Tab", { shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(element.shadowRoot.activeElement).toBe(link);

    $(element, ".dialog-heading").focus();
    keydown($(element, ".dialog-heading"), "Tab", { shiftKey: true });
    expect(element.shadowRoot.activeElement).toBe(link);

    const firstTab = $$(element, "[role='tab']")[0];
    firstTab.focus();
    const middle = keydown(firstTab, "Tab");
    expect(middle.defaultPrevented).toBe(false);
  });

  it("brings focus back when it leaves the open dialog another way", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();
    await openDialog(element);

    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const dialog = $(element, "[role='dialog']");
    dialog.dispatchEvent(
      new FocusEvent("focusout", { bubbles: true, relatedTarget: outside })
    );
    expect(element.shadowRoot.activeElement).toBe($(element, ".close-button"));

    // Focus moving inside the dialog is left alone.
    $(element, ".github-link").focus();
    dialog.dispatchEvent(
      new FocusEvent("focusout", {
        bubbles: true,
        relatedTarget: $(element, ".close-button")
      })
    );
    expect(element.shadowRoot.activeElement).toBe($(element, ".github-link"));

    // Focus going to the page itself, as WebKit's Tab does past the last stop, comes back.
    dialog.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(element.shadowRoot.activeElement).toBe($(element, ".close-button"));
  });

  it("leaves other keys alone and shows the key when it has no label", async () => {
    const element = create("customKey");
    getSourceFiles.emit([{ ...FILES[0], htmlUrl: null }]);
    await flush();
    await openDialog(element);

    const event = keydown($(element, ".close-button"), "a");
    expect(event.defaultPrevented).toBe(false);
    expect($(element, ".dialog-heading").textContent.trim()).toBe(
      "Source: customKey"
    );
    expect($(element, ".github-link")).toBeNull();
  });

  it("closes the dialog when the files go away", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();
    await openDialog(element);

    getSourceFiles.emit([]);
    await flush();

    expect($(element, ".dialog-body")).toBeNull();
    expect($(element, ".view-source-button")).toBeNull();
  });
});

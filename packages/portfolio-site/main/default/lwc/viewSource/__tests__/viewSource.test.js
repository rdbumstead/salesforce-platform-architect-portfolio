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
import ViewSource, {
  COMPONENT_LABELS,
  GUIDE_SECTIONS,
  describeFile
} from "c/viewSource";
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

  it("shows the fetch time in a time element from Intl, not lightning-formatted-date-time", async () => {
    const element = create();
    getSourceFiles.emit(FILES);
    await flush();
    await openDialog(element);

    const time = $(element, ".fetched-at time");
    expect(time.getAttribute("datetime")).toBe("2026-10-23T06:00:00.000Z");
    const expected = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date("2026-10-23T06:00:00.000Z"));
    expect(time.textContent).toBe(expected);
    expect($(element, ".fetched-at").textContent).toContain(
      "Read from GitHub on"
    );
    expect($(element, "lightning-formatted-date-time")).toBeNull();
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

  it("labels the button View source by default and by a custom label", async () => {
    const element = create();
    element.label = "   ";
    getSourceFiles.emit(FILES);
    await flush();
    expect($(element, ".view-source-button").textContent.trim()).toBe(
      "View source"
    );

    element.label = "View analytics source";
    await flush();
    expect($(element, ".view-source-button").textContent.trim()).toBe(
      "View analytics source"
    );
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
    expect(
      tabs.map((tab) => tab.querySelector(".tab-label").textContent.trim())
    ).toEqual(["apiTester.js", "ApiLabController.cls"]);
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

  describe("describeFile", () => {
    const all = [
      "p/lwc/resumeBuilder/resumeBuilder.html",
      "p/lwc/resumeBuilder/resumeBuilder.js",
      "p/lwc/graphEngine/graphEngine.js"
    ];

    it("tags an HTML template with the kebab case component", () => {
      expect(describeFile(all[0], all)).toEqual({
        tag: "LWC · HTML",
        name: "c-resume-builder",
        line: "Component c-resume-builder"
      });
    });

    it("tags JavaScript beside a template as LWC JavaScript", () => {
      const result = describeFile(all[1], all);
      expect(result.tag).toBe("LWC · JavaScript");
      expect(result.name).toBe("c-resume-builder");
    });

    it("tags JavaScript with no template as an API module with its import", () => {
      expect(describeFile(all[2], all)).toEqual({
        tag: "LWC · API module",
        name: "c/graphEngine",
        line: "API module c/graphEngine"
      });
      expect(describeFile(all[2]).tag).toBe("LWC · API module");
      expect(describeFile(all[2], null).tag).toBe("LWC · API module");
    });

    it("ignores a template in another folder and a null entry", () => {
      const result = describeFile(all[2], [null, all[0], all[2]]);
      expect(result.tag).toBe("LWC · API module");
    });

    it("tags CSS and leaves other LWC files untagged", () => {
      expect(describeFile("p/lwc/footer/footer.css", []).tag).toBe("LWC · CSS");
      expect(describeFile("p/lwc/footer/footer.css", []).name).toBe("c-footer");
      expect(describeFile("p/lwc/footer/footer.js-meta.xml", [])).toEqual({
        tag: "",
        name: "",
        line: ""
      });
    });

    it("tags Apex classes and triggers", () => {
      expect(describeFile("p/classes/FooterController.cls")).toEqual({
        tag: "Apex class",
        name: "FooterController",
        line: "Apex class FooterController"
      });
      expect(describeFile("p/triggers/AccountTrigger.trigger")).toEqual({
        tag: "Apex trigger",
        name: "AccountTrigger",
        line: "Apex trigger AccountTrigger"
      });
    });

    it("gives nothing for other paths, no /lwc/ folder and an empty path", () => {
      const none = { tag: "", name: "", line: "" };
      expect(describeFile("docs/guides/x.md")).toEqual(none);
      expect(describeFile("a/b/thing.js", [])).toEqual(none);
      expect(describeFile("")).toEqual(none);
      expect(describeFile(undefined)).toEqual(none);
    });
  });

  describe("tags, name line and guide link", () => {
    const TREE = [
      { ...FILES[0], path: "p/lwc/footer/footer.html", label: "footer.html" },
      { ...FILES[0], path: "p/lwc/footer/footer.js", label: "footer.js" },
      {
        ...FILES[1],
        path: "p/classes/FooterController.cls",
        label: "FooterController.cls"
      },
      {
        ...FILES[0],
        path: "p/lwc/graphEngine/graphEngine.js",
        label: "graphEngine.js"
      },
      { ...FILES[0], path: "docs/readme.md", label: "readme.md" }
    ];

    async function openTree(key) {
      const element = create(key);
      getSourceFiles.emit(TREE);
      await flush();
      await openDialog(element);
      return element;
    }

    it("shows the tag under each label inside the tab, in cache order", async () => {
      const element = await openTree("footer");
      const tabs = $$(element, "[role='tab']");
      expect(
        tabs.map((tab) =>
          Array.from(tab.querySelectorAll("span"))
            .map((span) => span.textContent)
            .join(" ")
        )
      ).toEqual([
        "footer.html LWC · HTML",
        "footer.js LWC · JavaScript",
        "FooterController.cls Apex class",
        "graphEngine.js LWC · API module",
        "readme.md"
      ]);
      expect(tabs[4].querySelector(".tab-tag")).toBeNull();
    });

    it("shows the Component, Apex class and API module lines", async () => {
      const element = await openTree("footer");
      const line = () => $(element, ".file-line");
      expect(line().textContent.trim()).toBe("Component c-footer");
      $$(element, "[role='tab']")[2].click();
      await flush();
      expect(line().textContent.trim()).toBe("Apex class FooterController");
      $$(element, "[role='tab']")[3].click();
      await flush();
      expect(line().textContent.trim()).toBe("API module c/graphEngine");
      $$(element, "[role='tab']")[4].click();
      await flush();
      expect(line()).toBeNull();
    });

    it("links to the guide section for every mapped key, in the same tab", async () => {
      for (const key of Object.keys(GUIDE_SECTIONS)) {
        const element = await openTree(key);
        const link = $(element, ".guide-link");
        expect(link.textContent.trim()).toBe("How it's built");
        expect(link.getAttribute("href")).toBe(
          `/portfolio/docs?doc=technical-guide#${GUIDE_SECTIONS[key]}`
        );
        expect(link.hasAttribute("target")).toBe(false);
        document.body.removeChild(element);
      }
      expect(Object.keys(GUIDE_SECTIONS)).toHaveLength(9);
    });

    it("shows no guide link for a key not in the map", async () => {
      const element = await openTree("customKey");
      expect($(element, ".guide-link")).toBeNull();
    });

    it("has a heading label for every mapped key and siteAnalytics", async () => {
      Object.keys(GUIDE_SECTIONS).forEach((key) => {
        expect(COMPONENT_LABELS[key]).toBeTruthy();
      });
      const element = await openTree("siteAnalytics");
      expect($(element, ".dialog-heading").textContent.trim()).toBe(
        "Source: Site analytics"
      );
    });
  });

  describe("analytics", () => {
    beforeEach(() => {
      window.gtag = jest.fn();
    });

    afterEach(() => {
      delete window.gtag;
    });

    it("sends view_source_opened with the source key when opened", async () => {
      const element = create("skillNetwork");
      getSourceFiles.emit(FILES);
      await flush();
      await openDialog(element);

      expect(window.gtag).toHaveBeenCalledTimes(1);
      expect(window.gtag).toHaveBeenCalledWith("event", "view_source_opened", {
        source_key: "skillNetwork"
      });
    });

    it("sends view_source_file_selected with the key and label on a click", async () => {
      const element = create();
      getSourceFiles.emit(FILES);
      await flush();
      await openDialog(element);
      window.gtag.mockClear();

      $$(element, "[role='tab']")[1].click();
      await flush();

      expect(window.gtag).toHaveBeenCalledWith(
        "event",
        "view_source_file_selected",
        { source_key: "apiTester", file_label: "ApiLabController.cls" }
      );
    });

    it("sends a file selection from the keyboard, and none for the tab already shown", async () => {
      const element = create();
      getSourceFiles.emit(FILES);
      await flush();
      await openDialog(element);
      window.gtag.mockClear();

      $$(element, "[role='tab']")[0].click();
      await flush();
      expect(window.gtag).not.toHaveBeenCalled();

      keydown($$(element, "[role='tab']")[0], "ArrowRight");
      await flush();
      expect(window.gtag).toHaveBeenCalledTimes(1);
      expect(window.gtag.mock.calls[0][2]).toEqual({
        source_key: "apiTester",
        file_label: "ApiLabController.cls"
      });
    });
  });
});

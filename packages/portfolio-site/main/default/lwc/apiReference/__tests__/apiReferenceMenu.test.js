/**
 * @description       : Unit tests for the API reference's menu rows. Redoc is a stub that
 *                      renders tag rows with their operations nested under them, each with
 *                      Redoc's aria-expanded, so the tests prove an open tag scrolls its intro
 *                      into view with focus left on the row, a closed tag scrolls nothing,
 *                      Enter and Space settle a row like a click, the menu is pinned below
 *                      the header and the spec switch on the full width page, the header is
 *                      measured through a layout whose shadow root cannot be read, and a spec
 *                      switch disposes the store Redoc left behind from the render before.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ApiReference, {
  REDOC_STYLE_OVERRIDES,
  disposePreviousRedoc,
  headerOffset
} from "c/apiReference";
import { loadScript } from "lightning/platformResourceLoader";

const fs = require("fs");
const path = require("path");

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: { API_REFERENCE_OPENED: "api_reference_opened" }
  }),
  { virtual: true }
);
jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);
jest.mock("lightning/platformResourceLoader", () => {
  const universal = jest.requireActual("lightning/platformResourceLoader");
  return {
    __esModule: true,
    default: universal.default,
    loadScript: jest.fn(),
    loadStyle: jest.fn()
  };
});

async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

const TAG = "tag/Objects";
const OPERATION = "tag/Objects/operation/getSkills";

/**
 * Renders a Redoc like menu: a tag row with Redoc's tabindex, role and aria-expanded, its
 * label, and its operation row nested in a list under it. A click or Enter on the tag row
 * toggles aria-expanded, as Redoc's own expand does.
 */
function redocStub(startExpanded) {
  return {
    init: jest.fn((spec, options, element, callback) => {
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }
      const menu = document.createElement("ul");
      menu.className = "menu-content";
      const tag = document.createElement("li");
      tag.setAttribute("data-item-id", TAG);
      tag.setAttribute("tabindex", "0");
      tag.setAttribute("role", "menuitem");
      tag.setAttribute("aria-expanded", String(startExpanded));
      const label = document.createElement("label");
      label.textContent = "Objects";
      tag.appendChild(label);
      const list = document.createElement("ul");
      const operation = document.createElement("li");
      operation.setAttribute("data-item-id", OPERATION);
      operation.setAttribute("tabindex", "0");
      operation.setAttribute("aria-expanded", "false");
      operation.appendChild(document.createElement("label"));
      list.appendChild(operation);
      tag.appendChild(list);
      const toggle = () =>
        tag.setAttribute(
          "aria-expanded",
          tag.getAttribute("aria-expanded") === "true" ? "false" : "true"
        );
      tag.addEventListener("click", (event) => {
        if (!operation.contains(event.target)) {
          toggle();
        }
      });
      tag.addEventListener("keydown", (event) => {
        if (
          event.target === tag &&
          (event.key === "Enter" || event.key === " ")
        ) {
          toggle();
        }
      });
      menu.appendChild(tag);
      element.appendChild(menu);
      [TAG, OPERATION].forEach((id, index) => {
        const section = document.createElement("div");
        section.id = id;
        section.setAttribute("data-section-id", id);
        section.getBoundingClientRect = () => ({ top: 1000 + index * 500 });
        element.appendChild(section);
      });
      callback();
    })
  };
}

function create(props = {}) {
  const element = createElement("c-api-reference", { is: ApiReference });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

const $ = (element, selector) => element.shadowRoot.querySelector(selector);

async function open(element) {
  $(element, "button.open-reference").click();
  await flush();
  await flush();
}

function key(target, value) {
  const event = new KeyboardEvent("keydown", {
    key: value,
    bubbles: true,
    cancelable: true,
    composed: true
  });
  target.dispatchEvent(event);
  return event;
}

describe("c-api-reference menu rows", () => {
  beforeEach(() => {
    loadScript.mockReset();
    loadScript.mockResolvedValue();
    window.scrollTo = jest.fn();
    window.history.replaceState(null, "", "/portfolio/api-lab/reference");
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.Redoc;
    jest.useRealTimers();
  });

  it("scrolls an opened tag's intro below the header and leaves focus on the row", async () => {
    jest.useFakeTimers();
    window.Redoc = redocStub(false);
    const element = create({ fullWidth: true });
    await open(element);
    jest.runOnlyPendingTimers();
    window.scrollTo.mockClear();

    const row = $(element, `li[data-item-id="${TAG}"]`);
    row.focus();
    row.querySelector("label").click();
    expect(row.getAttribute("aria-expanded")).toBe("true");
    jest.runOnlyPendingTimers();

    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    // 1000 is the stub intro's top. It lands 1 px past the 8 px gap, as Redoc's own scroll does.
    expect(window.scrollTo.mock.calls[0][0].top).toBe(1000 - 8 + 1);
    expect(element.shadowRoot.activeElement).toBe(row);
    expect($(element, `[id="${TAG}"]`).hasAttribute("tabindex")).toBe(false);
  });

  it("scrolls nothing when a click closes an open tag", async () => {
    jest.useFakeTimers();
    window.Redoc = redocStub(true);
    const element = create({ fullWidth: true });
    await open(element);
    jest.runOnlyPendingTimers();
    window.scrollTo.mockClear();

    const row = $(element, `li[data-item-id="${TAG}"]`);
    row.querySelector("label").click();
    expect(row.getAttribute("aria-expanded")).toBe("false");
    jest.runOnlyPendingTimers();

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("opens and closes a tag with Enter and Space, cancelling Space's page scroll", async () => {
    jest.useFakeTimers();
    window.Redoc = redocStub(false);
    const element = create({ fullWidth: true });
    await open(element);
    jest.runOnlyPendingTimers();
    window.scrollTo.mockClear();
    const row = $(element, `li[data-item-id="${TAG}"]`);

    const enter = key(row, "Enter");
    expect(enter.defaultPrevented).toBe(false);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    jest.runOnlyPendingTimers();
    expect(window.scrollTo).toHaveBeenCalledTimes(1);

    const space = key(row, " ");
    expect(space.defaultPrevented).toBe(true);
    expect(row.getAttribute("aria-expanded")).toBe("false");
    jest.runOnlyPendingTimers();
    expect(window.scrollTo).toHaveBeenCalledTimes(1);

    // Other keys are left alone.
    expect(key(row, "a").defaultPrevented).toBe(false);
    jest.runOnlyPendingTimers();
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("moves focus to an operation's section on Enter, as a click does", async () => {
    jest.useFakeTimers();
    window.Redoc = redocStub(true);
    const element = create({ fullWidth: true });
    await open(element);
    jest.runOnlyPendingTimers();
    window.scrollTo.mockClear();

    key($(element, `li[data-item-id="${OPERATION}"]`), "Enter");
    jest.runOnlyPendingTimers();

    expect(window.scrollTo.mock.calls[0][0].top).toBe(1500 - 8);
    expect(element.shadowRoot.activeElement).toBe(
      $(element, `[id="${OPERATION}"]`)
    );
  });

  it("ignores Enter that does not come from a menu row", async () => {
    jest.useFakeTimers();
    window.Redoc = redocStub(false);
    const element = create({ fullWidth: true });
    await open(element);
    jest.runOnlyPendingTimers();
    window.scrollTo.mockClear();

    key($(element, ".menu-content"), "Enter");
    jest.runOnlyPendingTimers();

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("pins Redoc's menu below the header and the spec switch at desktop widths only", async () => {
    window.Redoc = redocStub(false);
    const element = create({ fullWidth: true });
    await open(element);

    // The test DOM has no header and gives the switch no height.
    expect(
      $(element, "article").style.getPropertyValue("--reference-menu-top")
    ).toBe("0px");
    expect(REDOC_STYLE_OVERRIDES).toContain(
      "@media (min-width: 50rem) { .redoc-panel_full .menu-content {"
    );
    expect(REDOC_STYLE_OVERRIDES).toContain(
      "top: var(--reference-menu-top, 0px) !important;"
    );
    expect(REDOC_STYLE_OVERRIDES).toContain(
      "height: calc(100vh - var(--reference-menu-top, 0px)) !important;"
    );
    expect($(element, ".redoc-styles style").textContent).toContain(
      ".redoc-panel_full .menu-content"
    );

    // A clipping ancestor would stop the menu sticking, so the full width card never clips.
    const css = fs.readFileSync(
      path.join(__dirname, "..", "apiReference.css"),
      "utf8"
    );
    const rule = css.match(/\.reference-card_full \{([^}]*)\}/);
    expect(rule[1]).toContain("overflow: visible;");
  });

  describe("header measured through a layout it cannot open", () => {
    let layout;
    let host;

    beforeEach(() => {
      // A layout component whose shadow root this code cannot read (shadowRoot is null),
      // holding this component, with a 61 px header at the top of the viewport.
      layout = document.createElement("c-layout");
      host = document.createElement("c-api-reference");
      layout.appendChild(host);
      document.body.appendChild(layout);
      document.elementFromPoint = jest.fn((x, y) => (y < 61 ? layout : host));
    });

    afterEach(() => {
      delete document.elementFromPoint;
    });

    it("finds the header's bottom where the layout stops", () => {
      expect(headerOffset(host)).toBe(61);
    });

    it("takes no header when the element at the top is this component", () => {
      document.elementFromPoint = jest.fn((x, y) => (y < 61 ? host : layout));
      expect(headerOffset(host)).toBe(0);
    });

    it("takes no header from a plain element or a layout that does not hold it", () => {
      const plain = document.createElement("div");
      document.body.appendChild(plain);
      document.elementFromPoint = jest.fn((x, y) => (y < 61 ? plain : host));
      expect(headerOffset(host)).toBe(0);

      const other = document.createElement("c-other");
      document.body.appendChild(other);
      document.elementFromPoint = jest.fn((x, y) => (y < 61 ? other : host));
      expect(headerOffset(host)).toBe(0);
    });

    it("takes no header when one element fills the whole scanned band", () => {
      document.elementFromPoint = jest.fn(() => layout);
      expect(headerOffset(host)).toBe(0);
    });
  });

  it("disposes the store an earlier Redoc render left on the element", () => {
    const store = { menu: {}, dispose: jest.fn() };
    const element = document.createElement("div");
    // React keeps its root on the element under a key like this one, then fibers below it.
    element.__reactContainer$test = {
      child: {
        memoizedProps: {},
        sibling: { memoizedProps: { other: true } },
        child: { memoizedProps: { store } }
      }
    };

    expect(disposePreviousRedoc(element)).toBe(true);
    expect(store.dispose).toHaveBeenCalledTimes(1);
    expect(disposePreviousRedoc(document.createElement("div"))).toBe(false);
    expect(
      disposePreviousRedoc({
        get __reactContainer$broken() {
          throw new Error("no access");
        }
      })
    ).toBe(false);
  });

  it("disposes the first spec's store when the visitor switches spec", async () => {
    const stores = [];
    window.Redoc = {
      init: jest.fn((spec, options, element, callback) => {
        const store = { menu: {}, dispose: jest.fn() };
        stores.push(store);
        element.__reactContainer$test = {
          child: { memoizedProps: { store } }
        };
        callback();
      })
    };
    const element = create({ fullWidth: true });
    await open(element);
    expect(stores).toHaveLength(1);

    $(element, 'button[data-spec="papi"]').click();
    await flush();
    await flush();

    expect(stores).toHaveLength(2);
    expect(stores[0].dispose).toHaveBeenCalledTimes(1);
    expect(stores[1].dispose).not.toHaveBeenCalled();
  });
});

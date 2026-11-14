/**
 * @description       : Unit tests for the API reference menu's scroll and style handling.
 *                      A wheel turn or a swipe over the menu is cancelled once the menu is at
 *                      that end of its list, so the page behind it stays put. Style rules Redoc
 *                      inserts after its first render, such as the open state of a row or of the
 *                      phone menu, are copied into the component again.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/13/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ApiReference, {
  REDOC_STYLE_OVERRIDES,
  menuScrollsPage
} from "c/apiReference";
import { loadScript } from "lightning/platformResourceLoader";

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

const $ = (element, selector) => element.shadowRoot.querySelector(selector);

function scroller(top, height, scrollHeight) {
  return { scrollTop: top, clientHeight: height, scrollHeight };
}

/** A Redoc like menu: .menu-content holding one scrolling list. */
function redocStub() {
  return {
    init: jest.fn((spec, options, element, callback) => {
      const menu = document.createElement("div");
      menu.className = "menu-content";
      const list = document.createElement("div");
      menu.appendChild(list);
      element.appendChild(menu);
      callback();
    })
  };
}

async function openReference() {
  window.Redoc = redocStub();
  const element = createElement("c-api-reference", { is: ApiReference });
  document.body.appendChild(element);
  await flush();
  $(element, "button.open-reference").click();
  await flush();
  await flush();
  return element;
}

function setScroll(element, top, height, scrollHeight) {
  const list = $(element, ".menu-content").firstElementChild;
  Object.defineProperty(list, "scrollTop", { value: top, configurable: true });
  Object.defineProperty(list, "clientHeight", {
    value: height,
    configurable: true
  });
  Object.defineProperty(list, "scrollHeight", {
    value: scrollHeight,
    configurable: true
  });
  return list;
}

function wheel(target, deltaY, extra = {}) {
  const event = new WheelEvent("wheel", {
    deltaY,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...extra
  });
  target.dispatchEvent(event);
  return event;
}

function touch(target, type, clientY) {
  const event = new CustomEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true
  });
  event.touches = [{ clientY }];
  target.dispatchEvent(event);
  return event;
}

describe("menuScrollsPage", () => {
  it("is true only at the end the scroll is heading for", () => {
    expect(menuScrollsPage(scroller(0, 400, 900), -10)).toBe(true);
    expect(menuScrollsPage(scroller(0, 400, 900), 10)).toBe(false);
    expect(menuScrollsPage(scroller(250, 400, 900), -10)).toBe(false);
    expect(menuScrollsPage(scroller(250, 400, 900), 10)).toBe(false);
    expect(menuScrollsPage(scroller(500, 400, 900), 10)).toBe(true);
    expect(menuScrollsPage(scroller(500, 400, 900), -10)).toBe(false);
  });

  it("holds the page when the whole list fits and when there is no scroll", () => {
    expect(menuScrollsPage(scroller(0, 400, 400), 10)).toBe(true);
    expect(menuScrollsPage(scroller(0, 400, 400), -10)).toBe(true);
    expect(menuScrollsPage(scroller(0, 400, 900), 0)).toBe(false);
    expect(menuScrollsPage(null, 10)).toBe(false);
  });
});

describe("c-api-reference menu scroll", () => {
  beforeEach(() => {
    loadScript.mockReset();
    loadScript.mockResolvedValue();
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.Redoc;
  });

  it("states overscroll-behavior contain for the menu at every width", () => {
    expect(REDOC_STYLE_OVERRIDES).toContain(
      ".menu-content, .menu-content > div { overscroll-behavior: contain; }"
    );
  });

  it("cancels a wheel turn at the end of the menu and lets one with room through", async () => {
    const element = await openReference();
    const list = setScroll(element, 500, 400, 900);
    expect(wheel(list, 40).defaultPrevented).toBe(true);
    setScroll(element, 250, 400, 900);
    expect(wheel(list, 40).defaultPrevented).toBe(false);
    setScroll(element, 0, 400, 900);
    expect(wheel(list, -40).defaultPrevented).toBe(true);
    expect(wheel(list, 40).defaultPrevented).toBe(false);
  });

  it("leaves a zoom gesture and a wheel outside the menu alone", async () => {
    const element = await openReference();
    const list = setScroll(element, 500, 400, 900);
    expect(wheel(list, 40, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(wheel($(element, ".redoc-target"), 40).defaultPrevented).toBe(false);
  });

  it("cancels a swipe at the end of the menu and lets one with room through", async () => {
    const element = await openReference();
    const list = setScroll(element, 500, 400, 900);
    touch(list, "touchstart", 300);
    // The finger moves up, so the list heads down, and it is already at the bottom.
    expect(touch(list, "touchmove", 260).defaultPrevented).toBe(true);
    setScroll(element, 250, 400, 900);
    touch(list, "touchstart", 300);
    expect(touch(list, "touchmove", 260).defaultPrevented).toBe(false);
    setScroll(element, 0, 400, 900);
    touch(list, "touchstart", 300);
    // The finger moves down, so the list heads up, and it is at the top.
    expect(touch(list, "touchmove", 340).defaultPrevented).toBe(true);
  });
});

describe("c-api-reference style copy", () => {
  beforeEach(() => {
    loadScript.mockReset();
    loadScript.mockResolvedValue();
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    document.head
      .querySelectorAll("style[data-styled]")
      .forEach((style) => style.remove());
    delete window.Redoc;
  });

  it("copies rules Redoc inserts after its first render, once the reference changes", async () => {
    const head = document.createElement("style");
    head.setAttribute("data-styled", "active");
    window.Redoc = {
      init: jest.fn((spec, options, element, callback) => {
        head.textContent = ".first { color: red; }";
        document.head.appendChild(head);
        const menu = document.createElement("div");
        menu.className = "menu-content";
        element.appendChild(menu);
        callback();
      })
    };
    const element = createElement("c-api-reference", { is: ApiReference });
    document.body.appendChild(element);
    await flush();
    $(element, "button.open-reference").click();
    await flush();
    await flush();
    const copy = $(element, ".redoc-styles style");
    expect(copy.textContent).toContain(".first");
    expect(copy.textContent).not.toContain(".late");

    // Redoc draws a state it has not drawn before, which adds a rule and swaps a class.
    head.textContent = ".first { color: red; }\n.late { width: 18px; }";
    $(element, ".menu-content").className = "menu-content open";
    await flush();

    expect($(element, ".redoc-styles style")).toBe(copy);
    expect(copy.textContent).toContain(".late");
    expect(copy.textContent.trim().endsWith(REDOC_STYLE_OVERRIDES)).toBe(true);
  });
});

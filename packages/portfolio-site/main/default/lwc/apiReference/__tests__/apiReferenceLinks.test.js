/**
 * @description       : Unit tests for the API reference's section links. Redoc is a
 *                      stub that renders a menu and sections inside the component, as the real
 *                      one does, so the tests prove the component scrolls to a section below the
 *                      header, moves focus there, follows deep links (switching spec once when
 *                      the section is in the other one) and keeps Redoc's contrast fixes.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ApiReference, {
  REDOC_OPTIONS,
  REDOC_CONSTRAINT_COLOR,
  errorEntry,
  headerOffset
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

// A microtask flush that works under fake timers too.
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

const SECTIONS = {
  SAPI_Spec_V2: ["tag/Objects", "tag/Objects/operation/getSkills"],
  PAPI_Spec_V2: ["tag/Orchestration", "tag/Orchestration/operation/getProfile"]
};

/** Renders a Redoc like menu and sections into the target, as Redoc does. */
function redocStub() {
  return {
    init: jest.fn((spec, options, element, callback) => {
      while (element.firstChild) {
        element.removeChild(element.firstChild);
      }
      const menu = document.createElement("ul");
      menu.className = "menu-content";
      SECTIONS[spec].forEach((id) => {
        const item = document.createElement("li");
        item.setAttribute("data-item-id", id);
        const label = document.createElement("label");
        label.textContent = id;
        item.appendChild(label);
        menu.appendChild(item);
      });
      element.appendChild(menu);
      SECTIONS[spec].forEach((id, index) => {
        const section = document.createElement("div");
        section.id = id;
        section.setAttribute("data-section-id", id);
        section.textContent = id;
        section.getBoundingClientRect = () => ({ top: 1000 + index * 500 });
        element.appendChild(section);
      });
      const link = document.createElement("a");
      link.setAttribute("href", `#${SECTIONS[spec][1]}`);
      link.textContent = "in text link";
      element.appendChild(link);
      // An error entry as Redoc draws it from the spec's Errors section: an empty anchor in a
      // paragraph, then the entry's heading.
      const holder = document.createElement("p");
      const anchor = document.createElement("a");
      anchor.id = "error-bad-request";
      holder.appendChild(anchor);
      element.appendChild(holder);
      const heading = document.createElement("h3");
      heading.id = "bad_request-400";
      heading.textContent = "BAD_REQUEST (400)";
      heading.getBoundingClientRect = () => ({ top: 4000 });
      element.appendChild(heading);
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

function setUrl(search, hash) {
  window.history.replaceState(
    null,
    "",
    `/portfolio/api-lab/reference${search}${hash}`
  );
}

describe("c-api-reference section links", () => {
  beforeEach(() => {
    loadScript.mockReset();
    loadScript.mockResolvedValue();
    window.Redoc = redocStub();
    window.scrollTo = jest.fn();
    setUrl("", "");
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.Redoc;
    jest.useRealTimers();
  });

  it("scrolls a menu item's section into view and focuses it", async () => {
    jest.useFakeTimers();
    const element = create({ fullWidth: true });
    await open(element);
    jest.runOnlyPendingTimers();
    await flush();

    $(
      element,
      'li[data-item-id="tag/Objects/operation/getSkills"] label'
    ).click();
    jest.runOnlyPendingTimers();

    expect(window.scrollTo).toHaveBeenCalled();
    const call =
      window.scrollTo.mock.calls[window.scrollTo.mock.calls.length - 1][0];
    // 1500 is the stub section's top, the pinned switch has no height in the test DOM.
    expect(call.top).toBe(1500 - 8);
    const section = $(element, '[id="tag/Objects/operation/getSkills"]');
    expect(section.getAttribute("tabindex")).toBe("-1");
    expect(element.shadowRoot.activeElement).toBe(section);
  });

  it("follows an in text link to its section", async () => {
    jest.useFakeTimers();
    const element = create({ fullWidth: true });
    await open(element);

    $(element, ".redoc-target a").click();
    jest.runOnlyPendingTimers();

    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[id="tag/Objects/operation/getSkills"]')
    );
  });

  it("ignores clicks that are not section links", async () => {
    jest.useFakeTimers();
    const element = create({ fullWidth: true });
    await open(element);
    window.scrollTo.mockClear();

    $(element, ".menu-content").click();
    jest.runOnlyPendingTimers();

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("opens a deep link on load, switching to the spec that has it", async () => {
    setUrl("", "#tag/Orchestration");
    const element = create({ fullWidth: true, openOnLoad: true });
    await flush();
    await flush();
    await flush();
    await flush();

    const specs = window.Redoc.init.mock.calls.map((call) => call[0]);
    expect(specs).toEqual(["SAPI_Spec_V2", "PAPI_Spec_V2"]);
    expect(
      $(element, 'button[data-spec="papi"]').getAttribute("aria-pressed")
    ).toBe("true");
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[id="tag/Orchestration"]')
    );
  });

  it("finds an operation/ deep link under its tag", async () => {
    setUrl("?spec=papi", "#operation/getProfile");
    const element = create({ fullWidth: true, openOnLoad: true });
    await flush();
    await flush();
    await flush();

    expect(window.Redoc.init.mock.calls[0][0]).toBe("PAPI_Spec_V2");
    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[id="tag/Orchestration/operation/getProfile"]')
    );
  });

  it("lands on an error entry from a help link and focuses its heading", async () => {
    setUrl("?spec=papi&version=v2", "#error-bad-request");
    const element = create({ fullWidth: true, openOnLoad: true });
    await flush();
    await flush();
    await flush();

    expect(window.Redoc.init.mock.calls[0][0]).toBe("PAPI_Spec_V2");
    const heading = $(element, '[id="bad_request-400"]');
    expect(element.shadowRoot.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
  });

  it("keeps the anchor itself when no heading follows it", () => {
    const holder = document.createElement("p");
    const anchor = document.createElement("a");
    anchor.id = "error-gone";
    holder.appendChild(anchor);
    expect(errorEntry(anchor)).toBe(anchor);
    const other = document.createElement("div");
    expect(errorEntry(other)).toBe(other);
  });

  it("switches spec only once for a hash neither spec has", async () => {
    setUrl("", "#tag/Nowhere");
    create({ fullWidth: true, openOnLoad: true });
    await flush();
    await flush();
    await flush();
    await flush();

    expect(window.Redoc.init).toHaveBeenCalledTimes(2);
  });

  it("follows a hash change to a section", async () => {
    const element = create({ fullWidth: true });
    await open(element);

    setUrl("", "#tag/Objects");
    window.dispatchEvent(new CustomEvent("hashchange"));

    expect(element.shadowRoot.activeElement).toBe(
      $(element, '[id="tag/Objects"]')
    );
  });

  it("scrolls the panel, not the page, in the boxed layout", async () => {
    jest.useFakeTimers();
    const element = create();
    await open(element);
    const panel = $(element, ".redoc-panel");
    Object.defineProperty(panel, "scrollHeight", { value: 5000 });
    Object.defineProperty(panel, "clientHeight", { value: 600 });
    panel.getBoundingClientRect = () => ({ top: 200 });
    panel.scrollTop = 0;
    window.scrollTo.mockClear();

    $(element, 'li[data-item-id="tag/Objects"] label').click();
    jest.runOnlyPendingTimers();

    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(panel.scrollTop).toBe(1000 - 200 - 8);
  });

  it("lets Redoc's own section lookups find sections inside the component", async () => {
    const element = create({ fullWidth: true });
    await open(element);

    // Redoc queries the document, so this test does too.
    /* eslint-disable @lwc/lwc/no-document-query */
    const found = document.querySelector('[data-section-id="tag/Objects"]');
    expect(found).toBe($(element, '[id="tag/Objects"]'));
    expect(document.querySelector('[data-section-id="tag/None"]')).toBeNull();
    expect(document.querySelector(".nothing-here")).toBeNull();
    expect(document.querySelector("body")).toBe(document.body);
    /* eslint-enable @lwc/lwc/no-document-query */
  });

  it("gives Redoc the header offset and the contrast fixes", () => {
    expect(REDOC_OPTIONS.scrollYOffset).toBe(headerOffset);
    expect(headerOffset()).toBe(0);
    expect(REDOC_OPTIONS.theme.extensionsHook("ConstraintItem")).toContain(
      REDOC_CONSTRAINT_COLOR
    );
    expect(REDOC_OPTIONS.theme.extensionsHook("Other")).toBe("");
    expect(REDOC_OPTIONS.theme.typography.links.textDecoration).toBe(
      "underline"
    );
  });
});

/**
 * @description       : Unit tests for apiReference LWC. The resource loader is mocked (trap 25)
 *                      and Redoc is a stub on window, so the tests prove the loading contract,
 *                      the spec toggle and the fallback, not Redoc's own rendering.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import ApiReference, {
  HOSTED_REFERENCE_URL,
  REDOC_OPTIONS,
  REDOC_LINK_COLOR,
  REDOC_TAB_COLORS,
  RENDER_TIMEOUT_MS,
  TIMEOUT_MESSAGE
} from "c/apiReference";
import { loadScript } from "lightning/platformResourceLoader";
import { trackEvent } from "c/analyticsService";

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

// config/jest.config.js maps every lightning/* import to one universal mock file, so
// mocking platformResourceLoader mocks lightning-card and the rest too. Keep the real
// mock component as the default export and add the loader functions beside it.
jest.mock("lightning/platformResourceLoader", () => {
  const universal = jest.requireActual("lightning/platformResourceLoader");
  return {
    __esModule: true,
    default: universal.default,
    loadScript: jest.fn(),
    loadStyle: jest.fn()
  };
});

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

// Microtask flush that works under fake timers.
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

function createComponent() {
  const element = createElement("c-api-reference", { is: ApiReference });
  document.body.appendChild(element);
  return element;
}

function query(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function openButton(element) {
  return query(element, "button.open-reference");
}

function specButton(element, value) {
  return query(element, `button[data-spec="${value}"]`);
}

describe("c-api-reference", () => {
  beforeEach(() => {
    loadScript.mockReset();
    loadScript.mockResolvedValue();
    window.Redoc = {
      init: jest.fn((spec, options, element, callback) => {
        element.textContent = `rendered ${spec}`;
        callback();
      })
    };
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.Redoc;
    trackEvent.mockClear();
    jest.useRealTimers();
  });

  it("sends api_reference_opened with the selected spec on open", async () => {
    const element = createComponent();
    await flushPromises();
    specButton(element, "papi").click();
    await flushPromises();

    openButton(element).click();
    await flushPromises();

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("api_reference_opened", {
      spec: "papi"
    });
  });

  it("stops waiting after 15 s and offers the hosted reference", async () => {
    jest.useFakeTimers();
    window.Redoc.init = jest.fn(); // never calls back, as under WebKit (trap 32)
    const element = createComponent();
    await Promise.resolve();

    openButton(element).click();
    await settle();
    expect(window.Redoc.init).toHaveBeenCalledTimes(1);
    expect(query(element, ".reference-error")).toBeNull();
    expect(openButton(element).disabled).toBe(true);

    jest.advanceTimersByTime(RENDER_TIMEOUT_MS - 1);
    await settle();
    expect(query(element, ".reference-error")).toBeNull();

    jest.advanceTimersByTime(1);
    await settle();

    const error = query(element, ".reference-error");
    expect(error).not.toBeNull();
    expect(error.textContent).toContain(TIMEOUT_MESSAGE);
    expect(query(element, "a.hosted-link").href).toBe(HOSTED_REFERENCE_URL);
    expect(openButton(element).disabled).toBe(false);
  });

  it("clears the 15 s timer once Redoc renders", async () => {
    jest.useFakeTimers();
    const element = createComponent();
    await Promise.resolve();

    openButton(element).click();
    await settle();
    expect(jest.getTimerCount()).toBe(0);
    expect(query(element, ".reference-error")).toBeNull();
  });

  it("uses only token colours apart from the Redoc panel, with 44 px buttons", () => {
    const css = readFileSync(join(__dirname, "..", "apiReference.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(css).toMatch(/\.open-reference \{[^}]*min-height: 44px/);
    expect(css).toMatch(/\.spec-button \{[^}]*min-height: 44px/);
  });

  it("loads nothing before the visitor opens the reference", async () => {
    const element = createComponent();
    await flushPromises();

    expect(loadScript).not.toHaveBeenCalled();
    expect(window.Redoc.init).not.toHaveBeenCalled();
    expect(openButton(element).textContent.trim()).toBe(
      "Open interactive reference"
    );
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("loads Redoc_Script once on the click and renders the SAPI spec", async () => {
    const element = createComponent();
    await flushPromises();

    openButton(element).click();
    await flushPromises();

    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript.mock.calls[0][1]).toBe("Redoc_Script");
    expect(window.Redoc.init).toHaveBeenCalledTimes(1);
    const [spec, options, target] = window.Redoc.init.mock.calls[0];
    expect(spec).toBe("SAPI_Spec");
    expect(options).toBe(REDOC_OPTIONS);
    expect(options.disableSearch).toBe(true);
    expect(options.disableTelemetry).toBeUndefined();
    expect(options.hideDownloadButton).toBe(true);
    expect(target.classList.contains("redoc-target")).toBe(true);
    expect(query(element, ".redoc-target").textContent).toBe(
      "rendered SAPI_Spec"
    );
    expect(query(element, ".reference-error")).toBeNull();

    openButton(element).click();
    await flushPromises();
    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(window.Redoc.init).toHaveBeenCalledTimes(2);
  });

  it("switches between the SAPI and PAPI specs", async () => {
    const element = createComponent();
    await flushPromises();

    expect(specButton(element, "sapi").getAttribute("aria-pressed")).toBe(
      "true"
    );
    specButton(element, "papi").click();
    await flushPromises();

    expect(loadScript).not.toHaveBeenCalled();
    expect(specButton(element, "papi").getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(specButton(element, "sapi").getAttribute("aria-pressed")).toBe(
      "false"
    );

    openButton(element).click();
    await flushPromises();
    expect(window.Redoc.init.mock.calls[0][0]).toBe("PAPI_Spec");

    specButton(element, "sapi").click();
    await flushPromises();
    expect(window.Redoc.init).toHaveBeenCalledTimes(2);
    expect(window.Redoc.init.mock.calls[1][0]).toBe("SAPI_Spec");
    expect(loadScript).toHaveBeenCalledTimes(1);
  });

  it("shows the hosted link when Redoc_Script fails to load, and retries", async () => {
    loadScript.mockRejectedValueOnce(new Error("blocked"));
    const element = createComponent();
    await flushPromises();

    openButton(element).click();
    await flushPromises();

    expect(query(element, ".error-text").textContent).toContain(
      "The interactive reference could not be shown. blocked"
    );
    expect(query(element, "a.hosted-link").href).toBe(HOSTED_REFERENCE_URL);
    expect(window.Redoc.init).not.toHaveBeenCalled();

    openButton(element).click();
    await flushPromises();
    expect(loadScript).toHaveBeenCalledTimes(2);
    expect(query(element, ".reference-error")).toBeNull();
  });

  it("shows the hosted link when the script defines no Redoc global", async () => {
    delete window.Redoc;
    const element = createComponent();
    await flushPromises();

    openButton(element).click();
    await flushPromises();

    expect(query(element, ".error-text").textContent).toContain(
      "no Redoc.init was found"
    );
    expect(query(element, "a.hosted-link").href).toBe(HOSTED_REFERENCE_URL);
  });

  it("shows the hosted link when Redoc reports a render error", async () => {
    window.Redoc.init.mockImplementation((spec, options, element, callback) =>
      callback(new Error("Invalid spec"))
    );
    const element = createComponent();
    await flushPromises();

    openButton(element).click();
    await flushPromises();

    expect(query(element, ".error-text").textContent).toContain("Invalid spec");
    expect(query(element, "a.hosted-link")).not.toBeNull();
  });

  it("copies the style tags Redoc adds to the head into the component", async () => {
    window.Redoc.init.mockImplementation((spec, options, element, callback) => {
      const style = document.createElement("style");
      style.setAttribute("data-styled", "active");
      style.textContent = ".redoc-rule { color: #0f172a; }";
      document.head.appendChild(style);
      callback();
    });
    const element = createComponent();
    await flushPromises();

    openButton(element).click();
    await flushPromises();

    const copied = query(element, ".redoc-styles style");
    expect(copied).not.toBeNull();
    expect(copied.textContent).toContain(".redoc-rule");
    document.head
      .querySelectorAll("style[data-styled]")
      .forEach((style) => style.remove());
  });

  it("keeps Redoc_Script pinned to the redoc 2.5.4 standalone UMD bundle", () => {
    const bundle = readFileSync(
      join(
        process.cwd(),
        "packages/portfolio-site/main/default/staticresources/Redoc_Script.js"
      ),
      "utf8"
    );
    expect(
      bundle.startsWith(
        "/*! For license information please see redoc.standalone.js.LICENSE.txt */"
      )
    ).toBe(true);
    expect(bundle).toContain('const Hw="2.5.4"');
    expect(bundle).toContain("e.Redoc=t(");
    expect(bundle).not.toContain("export{");
  });

  it("keeps the spec static resources byte-identical to the spec files", () => {
    const root = process.cwd();
    const pairs = [
      ["SAPI_Spec.yaml", "salesforce-sapi.yaml"],
      ["PAPI_Spec.yaml", "portfolio-papi.yaml"]
    ];
    pairs.forEach(([resource, spec]) => {
      const copy = readFileSync(
        join(
          root,
          "packages/portfolio-site/main/default/staticresources",
          resource
        )
      );
      const source = readFileSync(
        join(root, "packages/integration-api/specs", spec)
      );
      expect(copy.length).toBeGreaterThan(0);
      expect(copy.equals(source)).toBe(true);
    });
  });

  it("fills the page and opens without a click on its own page", async () => {
    const element = createElement("c-api-reference", { is: ApiReference });
    element.fullWidth = true;
    element.openOnLoad = true;
    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();

    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(window.Redoc.init).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("api_reference_opened", {
      spec: "sapi"
    });
    expect(
      query(element, ".reference-body").classList.contains(
        "reference-body_full"
      )
    ).toBe(true);
    const panel = query(element, ".redoc-target").parentElement;
    expect(panel.classList.contains("redoc-panel_full")).toBe(true);
    expect(panel.classList.contains("slds-hide")).toBe(false);
    expect(specButton(element, "papi")).not.toBeNull();

    specButton(element, "papi").click();
    await flushPromises();
    expect(window.Redoc.init).toHaveBeenCalledTimes(2);
    expect(window.Redoc.init.mock.calls[1][0]).toBe("PAPI_Spec");
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("keeps the boxed layout and waits for a click by default", async () => {
    const element = createComponent();
    await flushPromises();

    expect(
      query(element, ".reference-body").classList.contains(
        "reference-body_full"
      )
    ).toBe(false);
    expect(loadScript).not.toHaveBeenCalled();
  });

  it("carries the page's only heading and the Pillar C intro on its own page", async () => {
    const element = createElement("c-api-reference", { is: ApiReference });
    element.fullWidth = true;
    element.openOnLoad = true;
    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();

    const headings = element.shadowRoot.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent.trim()).toBe("API reference");
    expect(element.shadowRoot.querySelector("h2")).toBeNull();
    const intro = query(element, ".reference-intro").textContent;
    expect(intro).toMatch(/^\s*Pillar C: the full contract/);
    expect(intro).not.toMatch(/loads only when you open it/);
    expect(query(element, "a.inline-link").getAttribute("href")).toBe(
      "/portfolio/api-lab"
    );
    expect(
      query(element, ".reference-card").classList.contains(
        "reference-card_full"
      )
    ).toBe(true);
    // Open on its own, so no button pushes the reference down.
    expect(openButton(element)).toBeNull();
  });

  it("offers the open button again on its own page when the reference fails", async () => {
    loadScript.mockRejectedValueOnce(new Error("blocked"));
    const element = createElement("c-api-reference", { is: ApiReference });
    element.fullWidth = true;
    element.openOnLoad = true;
    document.body.appendChild(element);
    await flushPromises();
    await flushPromises();

    expect(query(element, ".reference-error")).not.toBeNull();
    expect(openButton(element)).not.toBeNull();
  });

  it("keeps a section title, the boxed intro and the open button when embedded", async () => {
    const element = createComponent();
    await flushPromises();

    expect(element.shadowRoot.querySelector("h1")).toBeNull();
    expect(query(element, "h2.reference-title").textContent).toMatch(
      /API reference/
    );
    expect(query(element, ".reference-intro").textContent).toMatch(
      /loads only when you open it/
    );
    expect(openButton(element)).not.toBeNull();
  });

  it("exposes fullWidth and openOnLoad to the site builder", () => {
    const meta = readFileSync(
      join(__dirname, "..", "apiReference.js-meta.xml"),
      "utf8"
    );
    expect(meta).toMatch(/name="fullWidth"/);
    expect(meta).toMatch(/name="openOnLoad"/);
  });

  it("gives Redoc's links the light accent, readable on its white panel in both themes", async () => {
    const element = createComponent();
    await flushPromises();
    openButton(element).click();
    await flushPromises();

    const options = window.Redoc.init.mock.calls[0][1];
    expect(REDOC_LINK_COLOR).toBe("#2563EB");
    expect(options.theme.colors.primary.main).toBe(REDOC_LINK_COLOR);
    expect(options.theme.colors.tonalOffset).toBe(0);
    expect(options.theme.colors.primary.light).toBe(REDOC_LINK_COLOR);
    expect(options.theme.colors.primary.dark).toBe(REDOC_LINK_COLOR);
    expect(options.theme.typography.links.color).toBe(REDOC_LINK_COLOR);
    expect(options.theme.typography.links.visited).toBe(REDOC_LINK_COLOR);
    expect(options.theme.typography.links.hover).toBe(REDOC_LINK_COLOR);

    const css = readFileSync(join(__dirname, "..", "apiReference.css"), "utf8");
    expect(css).toMatch(/\.redoc-panel \{[^}]*--pf-accent: var\(--pf-btn\)/);
    expect(css).toMatch(/\.redoc-panel a \{[^}]*color: var\(--pf-btn\)/);
  });

  it("gives every response tab a colour readable on Redoc's dark code panel", async () => {
    const element = createComponent();
    await flushPromises();
    openButton(element).click();
    await flushPromises();

    const responses = window.Redoc.init.mock.calls[0][1].theme.colors.responses;
    // WCAG ratio against the panel as rendered, rgb(17,23,26).
    const luminance = (hex) => {
      const channels = hex
        .match(/\w\w/g)
        .map((part) => parseInt(part, 16) / 255)
        .map((v) =>
          v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
        );
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const panel = luminance("#11171A");
    for (const kind of ["success", "error", "redirect", "info"]) {
      const color = responses[kind].tabTextColor;
      expect(color).toBe(REDOC_TAB_COLORS[kind]);
      const ratio = (luminance(color) + 0.05) / (panel + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});

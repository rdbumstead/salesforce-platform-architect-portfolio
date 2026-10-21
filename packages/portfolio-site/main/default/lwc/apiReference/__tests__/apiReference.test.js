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
  REDOC_OPTIONS
} from "c/apiReference";
import { loadScript } from "lightning/platformResourceLoader";

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

function createComponent() {
  const element = createElement("c-api-reference", { is: ApiReference });
  document.body.appendChild(element);
  return element;
}

function query(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function openButton(element) {
  return query(element, "lightning-button.open-reference");
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
  });

  it("loads nothing before the visitor opens the reference", async () => {
    const element = createComponent();
    await flushPromises();

    expect(loadScript).not.toHaveBeenCalled();
    expect(window.Redoc.init).not.toHaveBeenCalled();
    expect(openButton(element).label).toBe("Open interactive reference");
    expect(openButton(element).variant).toBe("brand");
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
    expect(options.disableTelemetry).toBe(true);
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
});

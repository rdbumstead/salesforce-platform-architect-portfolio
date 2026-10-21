/**
 * @description       : Unit tests for codeViewer LWC. The resource loader is mocked and Prism
 *                      is a stub on window, so the tests prove the loading contract and the
 *                      fallback, not Prism's own tokenizer.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import CodeViewer from "c/codeViewer";
import { loadScript, loadStyle } from "lightning/platformResourceLoader";

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

const SOURCE = "public class Hello { String s = '<b>'; }";

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

function createComponent(props = {}) {
  const element = createElement("c-code-viewer", { is: CodeViewer });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

function codeBlock(element) {
  return element.shadowRoot.querySelector("code.code-block");
}

describe("c-code-viewer", () => {
  beforeEach(() => {
    loadScript.mockReset();
    loadStyle.mockReset();
    loadScript.mockResolvedValue();
    loadStyle.mockResolvedValue();
    window.Prism = {
      languages: { clike: { keyword: /class/ }, javascript: { k: /x/ } },
      highlight: jest.fn(
        (code, grammar, language) =>
          `<span class="token keyword" data-lang="${language}">HL</span>`
      )
    };
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    delete window.Prism;
  });

  it("loads prism.css and prism.js from Prism_JS once", async () => {
    const element = createComponent({ code: SOURCE, title: "Hello" });
    await flushPromises();

    expect(loadStyle).toHaveBeenCalledTimes(1);
    expect(loadStyle.mock.calls[0][1]).toBe("Prism_JS/prism.css");
    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript.mock.calls[0][1]).toBe("Prism_JS/prism.js");

    element.code = "public class Other {}";
    element.language = "javascript";
    await flushPromises();

    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadStyle).toHaveBeenCalledTimes(1);
  });

  it("highlights with Prism and defaults the language to apex", async () => {
    const element = createComponent({ code: SOURCE });
    await flushPromises();

    expect(window.Prism.highlight).toHaveBeenCalledWith(
      SOURCE,
      window.Prism.languages.clike,
      "apex"
    );
    const token = codeBlock(element).querySelector("span.token.keyword");
    expect(token.textContent).toBe("HL");
    expect(token.dataset.lang).toBe("apex");
    expect(element.shadowRoot.querySelector("pre").className).toBe(
      "language-apex"
    );
  });

  it("uses the named grammar when the bundle has it", async () => {
    createComponent({ code: "let x = 1;", language: "javascript" });
    await flushPromises();

    expect(window.Prism.highlight).toHaveBeenCalledWith(
      "let x = 1;",
      window.Prism.languages.javascript,
      "javascript"
    );
  });

  it("re-highlights when the code changes", async () => {
    const element = createComponent({ code: SOURCE });
    await flushPromises();

    window.Prism.highlight.mockReturnValueOnce('<span class="new">NEW</span>');
    element.code = "public class Other {}";
    await flushPromises();

    expect(window.Prism.highlight).toHaveBeenLastCalledWith(
      "public class Other {}",
      window.Prism.languages.clike,
      "apex"
    );
    expect(codeBlock(element).querySelector("span.new").textContent).toBe(
      "NEW"
    );
  });

  it("falls back to escaped plain text when Prism fails to load", async () => {
    loadScript.mockRejectedValue(new Error("blocked"));
    const element = createComponent({ code: SOURCE });
    await flushPromises();

    expect(window.Prism.highlight).not.toHaveBeenCalled();
    expect(codeBlock(element).textContent).toBe(SOURCE);
    expect(codeBlock(element).querySelector("b")).toBeNull();
    expect(element.shadowRoot.querySelector("lightning-spinner")).toBeNull();
  });

  it("copies the raw code to the clipboard", async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true
    });
    const element = createComponent({ code: SOURCE });
    await flushPromises();

    element.shadowRoot.querySelector("lightning-button.copy-code").click();
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith(SOURCE);
    expect(
      element.shadowRoot.querySelector(".copy-message").textContent
    ).toContain("Copied");
    delete navigator.clipboard;
  });
});

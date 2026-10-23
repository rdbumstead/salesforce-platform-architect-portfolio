/**
 * @description       : Unit tests for c/prismHighlighter (Round 7 contract P1). The loader
 *                      tests use a stub Prism. The grammar tests run the real Prism_JS/prism.js
 *                      resource, so they prove the apex, json and yaml grammars are in it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RESOURCE = path.resolve(
  __dirname,
  "../../../staticresources/Prism_JS/prism.js"
);

// Each loader test gets a fresh module so the page level promise starts empty.
function freshModules() {
  let module;
  let loader;
  jest.isolateModules(() => {
    loader = require("lightning/platformResourceLoader");
    module = require("c/prismHighlighter");
  });
  return { module, loader };
}

// Runs prism.js the way a browser runs a classic script, with its own window.
function realPrism() {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(RESOURCE, "utf8"), context);
  return vm.runInContext("Prism", context);
}

const STUB = {
  languages: { clike: { k: /x/ }, json: { p: /y/ } },
  highlight: jest.fn(() => "<span>HL</span>")
};

jest.mock("lightning/platformResourceLoader", () => {
  const universal = jest.requireActual("lightning/platformResourceLoader");
  return {
    __esModule: true,
    default: universal.default,
    loadScript: jest.fn(),
    loadStyle: jest.fn()
  };
});

describe("c/prismHighlighter loadPrism", () => {
  afterEach(() => {
    delete window.Prism;
    jest.clearAllMocks();
  });

  it("loads prism.css and prism.js once for three callers", async () => {
    const { module, loader } = freshModules();
    loader.loadStyle.mockResolvedValue();
    loader.loadScript.mockImplementation(() => {
      window.Prism = STUB;
      return Promise.resolve();
    });

    const [first, second] = await Promise.all([
      module.loadPrism({}),
      module.loadPrism({})
    ]);
    const third = await module.loadPrism({});

    expect(first).toBe(STUB);
    expect(second).toBe(STUB);
    expect(third).toBe(STUB);
    expect(loader.loadScript).toHaveBeenCalledTimes(1);
    expect(loader.loadScript.mock.calls[0][1]).toBe("Prism_JS/prism.js");
    expect(loader.loadStyle).toHaveBeenCalledTimes(1);
    expect(loader.loadStyle.mock.calls[0][1]).toBe("Prism_JS/prism.css");
  });

  it("resolves undefined when the resource fails, and tries again later", async () => {
    const { module, loader } = freshModules();
    loader.loadStyle.mockResolvedValue();
    loader.loadScript.mockRejectedValueOnce(new Error("blocked"));

    await expect(module.loadPrism({})).resolves.toBeUndefined();

    loader.loadScript.mockImplementation(() => {
      window.Prism = STUB;
      return Promise.resolve();
    });
    await expect(module.loadPrism({})).resolves.toBe(STUB);
    expect(loader.loadScript).toHaveBeenCalledTimes(2);
  });

  it("resolves undefined when the script loads but no Prism appears", async () => {
    const { module, loader } = freshModules();
    loader.loadStyle.mockResolvedValue();
    loader.loadScript.mockResolvedValue();

    await expect(module.loadPrism({})).resolves.toBeUndefined();
  });
});

describe("c/prismHighlighter highlight", () => {
  const { highlight } = require("c/prismHighlighter");

  it("escapes plain text when Prism is undefined", () => {
    expect(highlight(undefined, "<b>&'\"</b>", "apex")).toBe(
      "&lt;b&gt;&amp;&#39;&quot;&lt;/b&gt;"
    );
  });

  it("uses the named grammar and passes the language name", () => {
    STUB.highlight.mockClear();
    highlight(STUB, "{}", "json");
    expect(STUB.highlight).toHaveBeenCalledWith(
      "{}",
      STUB.languages.json,
      "json"
    );
  });

  it("falls back to clike for a language with no grammar", () => {
    STUB.highlight.mockClear();
    highlight(STUB, "x", "cobol");
    expect(STUB.highlight).toHaveBeenCalledWith(
      "x",
      STUB.languages.clike,
      "cobol"
    );
  });

  it("escapes plain text when Prism throws", () => {
    const throwing = {
      languages: { clike: {} },
      highlight: () => {
        throw new Error("bad grammar");
      }
    };
    expect(highlight(throwing, "<i>", "apex")).toBe("&lt;i&gt;");
  });

  it("treats null code as empty", () => {
    expect(highlight(undefined, null, "apex")).toBe("");
  });

  it("highlights Apex, JSON and YAML with the real resource grammars", () => {
    const prism = realPrism();
    const apex = highlight(
      prism,
      "public class A { List<Account> a = [SELECT Id FROM Account]; }",
      "apex"
    );
    expect(apex).toContain('<span class="token keyword">public</span>');
    expect(apex).toContain("&lt;");
    expect(apex).not.toContain("<Account>");

    const json = highlight(prism, '{"a": true}', "json");
    expect(json).toContain('<span class="token property">"a"</span>');

    const yaml = highlight(prism, "openapi: 3.0.3", "yaml");
    expect(yaml).toContain("token key atrule");
  });

  it("never returns markup from the code, even inside a string token", () => {
    const prism = realPrism();
    const out = highlight(prism, "String s = '<img src=x onerror=1>';", "apex");
    expect(out).not.toMatch(/<img/);
    expect(out).toContain("&lt;img");
  });
});

describe("c/prismHighlighter languageForPath", () => {
  const { languageForPath } = require("c/prismHighlighter");

  it.each([
    ["classes/SourceController.cls", "apex"],
    ["triggers/LeadTrigger.trigger", "apex"],
    ["lwc/apiTester/apiTester.js", "javascript"],
    ["lwc/apiTester/apiTester.html", "markup"],
    ["objects/Foo__c.object-meta.xml", "markup"],
    ["lwc/apiTester/apiTester.css", "css"],
    ["specs/portfolio-papi.yaml", "yaml"],
    ["config/x.YML", "yaml"],
    ["package.json", "json"],
    ["README.md", "none"],
    ["Makefile", "none"],
    [undefined, "none"]
  ])("maps %s to %s", (file, language) => {
    expect(languageForPath(file)).toBe(language);
  });
});

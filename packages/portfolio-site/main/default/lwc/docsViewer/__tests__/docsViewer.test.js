/**
 * @description       : Unit tests for c-docs-viewer and its docsRenderer. The Apex reads and
 *                      the page reference are mocked wire adapters, and the real vendored
 *                      Marked_Library supplies the lexer. The tests cover the list, a document
 *                      with its title, contents, tables and Mermaid block, the back link, a
 *                      missing document, contents links and a hash on load moving focus to
 *                      their heading (including a Technical Guide deep link), the event with the doc key, and a fixture full of
 *                      script, event handlers and unsafe links that never reaches the DOM.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
import { createElement } from "@lwc/engine-dom";
import DocsViewer, {
  docKeyFrom,
  badgeFor,
  groupFor,
  activeTheme
} from "c/docsViewer";
import getDocs from "@salesforce/apex/SourceController.getDocs";
import getDoc from "@salesforce/apex/SourceController.getDoc";
import { CurrentPageReference } from "lightning/navigation";
import { trackEvent } from "c/analyticsService";
import {
  slugify,
  githubSlug,
  resolveHref,
  renderMarkdown,
  indexHeadings,
  dropOwnContents
} from "../docsRenderer";
import { diagramHash } from "../diagramHash";

/**
 * Runs the vendored file as it is, outside the component compiler, the way the browser does.
 * Named mock so the hoisted module factories may call it.
 */
function mockLoadMarked() {
  const fs = require("fs");
  const path = require("path");
  const vm = require("vm");
  const code = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "..",
      "..",
      "staticresources",
      "Marked_Library.js"
    ),
    "utf8"
  );
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports });
  return mod.exports;
}

const MARKED = mockLoadMarked();

jest.mock(
  "@salesforce/apex/SourceController.getDocs",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/SourceController.getDoc",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "lightning/navigation",
  () => {
    const {
      createTestWireAdapter
    } = require("@salesforce/wire-service-jest-util");
    return {
      __esModule: true,
      CurrentPageReference: createTestWireAdapter(jest.fn())
    };
  },
  { virtual: true }
);

// The loader puts the bundled marked build on globalThis, as the static resource does.
jest.mock(
  "lightning/platformResourceLoader",
  () => ({
    __esModule: true,
    loadScript: jest.fn(() => {
      globalThis.marked = mockLoadMarked();
      return Promise.resolve();
    }),
    loadStyle: jest.fn(() => Promise.resolve())
  }),
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    __esModule: true,
    EVENTS: { DOCS_OPENED: "docs_opened" },
    trackEvent: jest.fn()
  }),
  { virtual: true }
);

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  {
    virtual: true
  }
);

const DOCS = [
  {
    key: "sas",
    title: "Systems Architecture Specification",
    path: "docs/guides/03-SAS.md"
  },
  {
    key: "adr-027",
    title: "Platform auth",
    path: "docs/adr/027-platform-auth.md"
  }
];

const SAS = [
  "# Systems Architecture Specification (SAS)",
  "",
  "See [the auth ADR](../adr/027-platform-auth.md#context) and [section 1.1](#11-architectural-north-star).",
  "",
  "## 1. System Context & Architecture",
  "",
  '### 1.1 Architectural "North Star"',
  "",
  "| Object | Purpose |",
  "| --- | --- |",
  "| `Project__c` | A pillar card |",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[Site<br/>LWR] --> B[Apex]",
  "```",
  "",
  "## 6. Front-End Architecture",
  "",
  "### 6.2 Site Components",
  "",
  "Text."
].join("\n");

// Built from parts so the lint rule against script URLs does not read the fixture as code.
const SCRIPT_SCHEME = ["java", "script:"].join("");

const HOSTILE = [
  "# Hostile fixture",
  "",
  "<script>window.__pwned = 1</script>",
  "",
  '<img src="x" onerror="window.__pwned = 2">',
  "",
  'Inline <b onclick="window.__pwned = 3">bold</b> and <iframe src="https://evil.example"></iframe>.',
  "",
  "[js](" +
    SCRIPT_SCHEME +
    "window.__pwned=4) [data](data:text/html,hi) [http](http://example.com)",
  "[mail](mailto:someone@example.com) [ok](https://example.com/page) [hash](#nowhere)",
  "",
  '<a href="https://example.com" onmouseover="window.__pwned = 5">raw link</a>',
  "",
  "![pic](" + SCRIPT_SCHEME + "alert(1))",
  "",
  "## Section <svg onload=alert(1)>",
  "",
  "<details><summary>Click to view</summary>",
  "",
  "Inside.",
  "",
  "</details>"
].join("\n");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function shadow(el) {
  return el.shadowRoot;
}

async function create(state, docs = DOCS) {
  const el = createElement("c-docs-viewer", { is: DocsViewer });
  document.body.appendChild(el);
  // eslint-disable-next-line @lwc/lwc/no-unexpected-wire-adapter-usages
  CurrentPageReference.emit({ state });
  getDocs.emit(docs);
  await flush();
  return el;
}

async function openDoc(key, content, extra = {}) {
  const el = await create({ doc: key });
  getDoc.emit({
    key,
    title: "Fallback title",
    path: "docs/guides/03-SAS.md",
    content,
    htmlUrl: "https://github.com/o/r/blob/main/docs/guides/03-SAS.md",
    fetchedAt: "2026-10-24T06:00:00.000Z",
    truncated: false,
    ...extra
  });
  await flush();
  await flush();
  return el;
}

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

afterEach(() => {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/");
  delete window.__pwned;
});

describe("c-docs-viewer list", () => {
  it("lists every document with its badge and link when no doc is chosen", async () => {
    const el = await create({});
    const closed = shadow(el).querySelector("details.doc-group-details");
    closed.open = true;
    closed.dispatchEvent(new CustomEvent("toggle"));
    await flush();
    const links = shadow(el).querySelectorAll(".doc-list-link");
    expect(shadow(el).querySelector("h1").textContent).toBe(
      "Architecture docs"
    );
    expect(links.length).toBe(2);
    expect(shadow(el).querySelector(".docs-lead").textContent.trim()).toBe(
      "How this site is designed and why. Start with the Executive Overview."
    );
    expect(links[0].getAttribute("href")).toBe("/portfolio/docs?doc=sas");
    expect(links[1].getAttribute("aria-label")).toBe("ADR-027: Platform auth");
    expect(links[0].querySelector(".doc-badge").textContent).toBe("SAS");
    expect(links[1].querySelector(".doc-badge").textContent).toBe("ADR-027");
    expect(links[1].querySelector(".doc-name").textContent).toBe(
      "Platform auth"
    );
  });

  it("reads the title and lead, then the build section, then the document groups, with one h1", async () => {
    const el = await create({});
    const root = shadow(el);
    const order = [
      ...root.querySelectorAll(
        "h1, .docs-lead, c-site-build-section, .doc-group"
      )
    ].map((node) => node.tagName.toLowerCase() + "." + (node.className || ""));
    expect(order[0]).toBe("h1.docs-title");
    expect(order[1]).toBe("p.docs-lead");
    expect(order[2]).toBe("c-site-build-section.");
    expect(order[3]).toBe("section.doc-group");
    expect(root.querySelectorAll("h1").length).toBe(1);
    expect(root.querySelectorAll("c-site-build-section").length).toBe(1);
  });

  it("groups the list into Start here, Specifications and Decisions, with decisions closed", async () => {
    const docs = [
      { key: "executive-overview", title: "Executive Overview", path: "a" },
      { key: "program-charter", title: "Program Charter", path: "b" },
      { key: "sas", title: "Systems Architecture Specification", path: "c" },
      { key: "guardrails", title: "Guardrails", path: "d" },
      { key: "adr-004", title: "Four", path: "e" },
      { key: "adr-005", title: "Five", path: "f" }
    ];
    const el = await create({}, docs);
    const groups = [...shadow(el).querySelectorAll(".doc-group")];
    expect(groups.map((g) => g.dataset.group)).toEqual([
      "start",
      "specifications",
      "decisions"
    ]);
    const names = (g) =>
      [...g.querySelectorAll(".doc-name")].map((n) => n.textContent);
    expect(names(groups[0])).toEqual(["Executive Overview", "Program Charter"]);
    expect(names(groups[1])).toEqual([
      "Systems Architecture Specification",
      "Guardrails"
    ]);
    expect(names(groups[2])).toEqual([]);
    const decisions = groups[2].querySelector("details.doc-group-details");
    expect(decisions).not.toBeNull();
    expect(decisions.open).toBe(false);
    // A closed group draws no rows, so no link in it can be reached or announced.
    expect(groups[2].querySelectorAll(".doc-list-link")).toHaveLength(0);
    decisions.open = true;
    decisions.dispatchEvent(new CustomEvent("toggle"));
    await flush();
    expect(
      shadow(el).querySelectorAll('[data-group="decisions"] .doc-list-link')
    ).toHaveLength(2);
    expect(groups[2].querySelector(".doc-group-count").textContent).toBe(
      "2 records"
    );
    expect(groups[0].querySelector("details")).toBeNull();
    // Every document still opens from its row.
    expect(shadow(el).querySelectorAll(".doc-list-link")).toHaveLength(6);
  });

  it("leaves a group out when it has no document", async () => {
    const el = await create({}, [
      { key: "sas", title: "Systems Architecture Specification", path: "c" }
    ]);
    const groups = [...shadow(el).querySelectorAll(".doc-group")];
    expect(groups.map((g) => g.dataset.group)).toEqual(["specifications"]);
  });

  it("says nothing is available when the cache is empty", async () => {
    const el = await create({}, []);
    expect(shadow(el).querySelector(".docs-note").textContent).toContain(
      "No documents"
    );
  });
});

describe("c-docs-viewer document", () => {
  it("renders the title, contents, tables, Mermaid source and a back link", async () => {
    const el = await openDoc("sas", SAS);
    const root = shadow(el);
    expect(root.querySelector("h1").textContent).toBe(
      "Systems Architecture Specification (SAS)"
    );
    expect(root.querySelectorAll("h1").length).toBe(1);
    expect(root.querySelector("c-site-build-section")).toBeNull();
    expect(root.querySelector(".back-link").getAttribute("href")).toBe(
      "/portfolio/docs"
    );

    const toc = [...root.querySelectorAll(".toc-link")].map(
      (a) => a.dataset.id
    );
    expect(toc).toEqual([
      "1-system-context-architecture",
      "1-1-architectural-north-star",
      "6-front-end-architecture",
      "6-2-site-components"
    ]);
    expect(root.querySelector(".toc-link").getAttribute("href")).toBe(
      "/portfolio/docs?doc=sas#1-system-context-architecture"
    );

    const table = root.querySelector(".doc-body .table-scroll");
    expect(table.getAttribute("tabindex")).toBe("0");
    expect(table.getAttribute("role")).toBe("region");
    expect(table.getAttribute("aria-label")).toContain("Object");
    expect(table.querySelector("th").getAttribute("scope")).toBe("col");

    const diagram = root.querySelector(".doc-body .doc-diagram");
    const source = diagram.querySelector("details.doc-diagram-source");
    expect(source.open).toBe(false);
    expect(source.querySelector("summary").textContent).toBe(
      "Diagram source (Mermaid)"
    );
    expect(diagram.querySelector("code").textContent).toContain(
      "A[Site<br/>LWR]"
    );
    expect(diagram.querySelector("br")).toBeNull();
    const drawn = diagram.querySelector(".doc-diagram-note a");
    expect(drawn.getAttribute("href")).toBe(
      "https://github.com/o/r/blob/main/docs/guides/03-SAS.md"
    );
    expect(drawn.getAttribute("rel")).toBe("noopener noreferrer");

    const anchor = root.querySelector(".doc-body h3 .heading-anchor");
    expect(anchor.getAttribute("href")).toBe("#1-1-architectural-north-star");
    expect(anchor.getAttribute("aria-label")).toContain("North Star");
  });

  it("points a link to another listed document at that document on the site", async () => {
    const el = await openDoc("sas", SAS);
    const links = [...shadow(el).querySelectorAll(".doc-body p a.doc-link")];
    expect(links[0].getAttribute("href")).toBe(
      "/portfolio/docs?doc=adr-027#context"
    );
    expect(links[1].getAttribute("href")).toBe("#1-1-architectural-north-star");
  });

  it("sends docs_opened once with the doc key", async () => {
    await openDoc("sas", SAS);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("docs_opened", { doc_key: "sas" });
  });

  it("moves focus to the heading and updates the address when a contents link is used", async () => {
    const el = await openDoc("sas", SAS);
    const link = shadow(el).querySelector(
      '.toc-link[data-id="6-2-site-components"]'
    );
    link.click();
    await flush();
    const heading = shadow(el).querySelector('[id="6-2-site-components"]');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(shadow(el).activeElement).toBe(heading);
    expect(window.location.search).toBe("?doc=sas");
    expect(window.location.hash).toBe("#6-2-site-components");
  });

  it("lands on the heading a hash names, by slug or by GitHub's slug", async () => {
    window.history.replaceState(
      null,
      "",
      "/portfolio/docs?doc=sas#11-architectural-north-star"
    );
    const el = await openDoc("sas", SAS);
    await flush();
    const heading = shadow(el).querySelector(
      '[id="1-1-architectural-north-star"]'
    );
    expect(shadow(el).activeElement).toBe(heading);
  });

  it("lands on a Technical Guide section named by a live data marker link on a fresh load", async () => {
    window.history.replaceState(
      null,
      "",
      "/portfolio/docs?doc=technical-guide#2-6-c-footer-glass-box-telemetry"
    );
    const guide = [
      "# Technical Guide",
      "",
      "## 2. Components",
      "",
      "### 2.5 `c-other` (Something Else)",
      "",
      "Text.",
      "",
      "### 2.6 `c-footer` (Glass Box Telemetry)",
      "",
      "Text."
    ].join("\n");
    const el = await openDoc("technical-guide", guide);
    await flush();
    const heading = shadow(el).querySelector(
      '[id="2-6-c-footer-glass-box-telemetry"]'
    );
    expect(heading).not.toBeNull();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(shadow(el).activeElement).toBe(heading);
  });

  it("says the document is not on the site when the read returns nothing", async () => {
    const el = await create({ doc: "adr-999" });
    getDoc.emit(null);
    await flush();
    expect(shadow(el).querySelector("h1").textContent).toBe(
      "Document not found"
    );
    expect(shadow(el).querySelectorAll("h1").length).toBe(1);
    expect(shadow(el).querySelector("c-site-build-section")).toBeNull();
    expect(shadow(el).querySelector(".back-link")).not.toBeNull();
  });

  it("notes a truncated document", async () => {
    const el = await openDoc("sas", SAS, { truncated: true });
    expect(shadow(el).textContent).toContain("longer than the page holds");
  });

  it("never lets script, event handlers or unsafe links reach the DOM", async () => {
    const el = await openDoc("sas", HOSTILE);
    const body = shadow(el).querySelector(".doc-body");
    expect(
      body.querySelectorAll("script, iframe, img, svg, b, details").length
    ).toBe(0);
    for (const node of shadow(el).querySelectorAll("*")) {
      for (const attr of node.attributes) {
        expect(attr.name.startsWith("on")).toBe(false);
      }
    }
    const hrefs = [...body.querySelectorAll("a")].map((a) =>
      a.getAttribute("href")
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(/^(https:\/\/|\/|#)/.test(href)).toBe(true);
    }
    expect(hrefs).toContain("https://example.com/page");
    expect(hrefs.some((h) => /javascript|data:|mailto|http:/.test(h))).toBe(
      false
    );
    expect(body.textContent).toContain("Click to view");
    expect(body.textContent).toContain("raw link");
    expect(window.__pwned).toBeUndefined();
  });
});

describe("one table of contents", () => {
  const WITH_OWN = [
    "# Guide",
    "",
    "**Table of Contents**",
    "",
    "- [Alpha](#alpha)",
    "  - [Beta](#beta)",
    "",
    "## Alpha",
    "",
    "Text.",
    "",
    "### Beta",
    "",
    "More."
  ].join("\n");

  it("drops the document's own list and keeps the reader's one Contents box", async () => {
    const el = await openDoc("sas", WITH_OWN);
    const root = shadow(el);
    expect(root.querySelectorAll("details.toc")).toHaveLength(1);
    expect(root.querySelector(".doc-body").textContent).not.toContain(
      "Table of Contents"
    );
    expect(root.querySelector(".doc-body ul")).toBeNull();
    expect(
      [...root.querySelectorAll(".toc-link")].map((a) => a.dataset.id)
    ).toEqual(["alpha", "beta"]);
  });

  it("keeps every heading and its anchor", () => {
    const tokens = MARKED.lexer(WITH_OWN, { gfm: true });
    const { headings } = indexHeadings(dropOwnContents(tokens));
    expect(headings.map((h) => h.id)).toEqual(["guide", "alpha", "beta"]);
  });

  it("keeps a paragraph of that text when no list follows it", () => {
    const tokens = MARKED.lexer("**Table of Contents**\n\nJust text.", {
      gfm: true
    });
    expect(dropOwnContents(tokens)).toHaveLength(tokens.length);
  });
});

describe("docsViewer helpers", () => {
  it("puts the decision records in Decisions and the rest by name", () => {
    expect(groupFor("adr-033")).toBe("decisions");
    expect(groupFor("executive-overview")).toBe("start");
    expect(groupFor("program-charter")).toBe("start");
    expect(groupFor("sas")).toBe("specifications");
    expect(groupFor("guardrails")).toBe("specifications");
    expect(groupFor("technical-guide")).toBe("specifications");
    expect(groupFor("something-new")).toBe("specifications");
  });

  it("reads only a well formed doc key", () => {
    expect(docKeyFrom({ state: { doc: " SAS " } })).toBe("sas");
    expect(docKeyFrom({ state: {} }, "?doc=adr-027")).toBe("adr-027");
    expect(docKeyFrom({ state: { doc: "<script>" } })).toBe("");
    expect(docKeyFrom(null, "")).toBe("");
    expect(badgeFor("adr-027")).toBe("ADR-027");
  });

  it("gives the guides short badges and keeps the rest upper cased", () => {
    expect(badgeFor("executive-overview")).toBe("OVERVIEW");
    expect(badgeFor("program-charter")).toBe("CHARTER");
    expect(badgeFor("guardrails")).toBe("GUARDRAILS");
    expect(badgeFor("technical-guide")).toBe("TECH GUIDE");
    expect(badgeFor("sas")).toBe("SAS");
    expect(badgeFor("adr-033")).toBe("ADR-033");
    expect(badgeFor("some-new-doc")).toBe("SOME-NEW-DOC");
    expect(badgeFor("constructor")).toBe("CONSTRUCTOR");
    expect(badgeFor(undefined)).toBe("");
  });
});

describe("docsRenderer", () => {
  it("slugs by the docs rule and by GitHub's rule", () => {
    expect(slugify("6.2 Site Components")).toBe("6-2-site-components");
    expect(slugify("  !!! ")).toBe("section");
    expect(githubSlug("1. System Context & Architecture")).toBe(
      "1-system-context--architecture"
    );
    expect(githubSlug('1.1 Architectural "North Star"')).toBe(
      "11-architectural-north-star"
    );
  });

  it("gives repeated headings distinct ids and GitHub aliases", () => {
    const tokens = MARKED.lexer("## Notes\n\n## Notes\n");
    const { headings, aliases } = indexHeadings(tokens);
    expect(headings.map((h) => h.id)).toEqual(["notes", "notes-2"]);
    expect(aliases.get("notes-1")).toBe("notes-2");
  });

  it("resolves links to https, this site's docs or a known heading only", () => {
    const ctx = {
      baseUrl: "https://github.com/o/r/blob/main/docs/guides/03-SAS.md",
      docHrefForPath: (path, hash) => {
        return path === "docs/adr/027-x.md"
          ? `/docs?doc=adr-027${hash ? `#${hash}` : ""}`
          : null;
      },
      hashTarget: (hash) => (hash === "known" ? "known" : null)
    };
    expect(resolveHref("../adr/027-x.md#a", ctx)).toEqual({
      href: "/docs?doc=adr-027#a",
      kind: "doc"
    });
    expect(resolveHref("../adr/003-stub.md", ctx).href).toBe(
      "https://github.com/o/r/blob/main/docs/adr/003-stub.md"
    );
    expect(resolveHref("#known", ctx)).toEqual({
      href: "#known",
      kind: "hash",
      target: "known"
    });
    expect(resolveHref("#unknown", ctx)).toBeNull();
    expect(resolveHref(SCRIPT_SCHEME + "alert(1)", ctx)).toBeNull();
    expect(resolveHref(["JaVa", "ScRiPt:alert(1)"].join(""), ctx)).toBeNull();
    expect(resolveHref("http://example.com", ctx)).toBeNull();
    expect(resolveHref("java\tscript:alert(1)", ctx)).toBeNull();
    expect(resolveHref("", ctx)).toBeNull();
  });

  it("keeps the document's title out of the body and the contents", () => {
    const result = renderMarkdown(MARKED, "# Title\n\n## One\n", {
      doc: document,
      baseUrl: null,
      docHrefForPath: () => null
    });
    expect(result.title).toBe("Title");
    expect(result.headings.map((h) => h.id)).toEqual(["one"]);
    const holder = document.createElement("div");
    holder.appendChild(result.fragment);
    expect(holder.querySelector("h1")).toBeNull();
    expect(holder.querySelector("h2").id).toBe("one");
  });
});

describe("GitHub alert blocks", () => {
  const render = (markdown) => {
    const result = renderMarkdown(MARKED, markdown, {
      doc: document,
      baseUrl: "https://github.com/o/r/blob/main/docs/guides/03-SAS.md",
      docHrefForPath: () => null
    });
    const holder = document.createElement("div");
    holder.appendChild(result.fragment);
    return holder;
  };

  it.each([
    ["NOTE", "Note"],
    ["TIP", "Tip"],
    ["IMPORTANT", "Important"],
    ["WARNING", "Warning"],
    ["CAUTION", "Caution"]
  ])("renders [!%s] as a titled callout without the marker", (type, title) => {
    const holder = render(`> [!${type}]\n> Body text.\n`);
    const box = holder.querySelector(".doc-alert");
    expect(box.getAttribute("role")).toBe("note");
    expect(box.getAttribute("aria-label")).toBe(title);
    expect(box.classList.contains(`doc-alert-${type.toLowerCase()}`)).toBe(
      true
    );
    expect(box.querySelector(".doc-alert-title").textContent).toBe(title);
    expect(box.textContent).not.toContain("[!");
    expect(box.textContent).toContain("Body text.");
    expect(holder.querySelector("blockquote")).toBeNull();
  });

  it("accepts a lower case marker", () => {
    const box = render("> [!tip]\n> Small.\n").querySelector(".doc-alert-tip");
    expect(box.querySelector(".doc-alert-title").textContent).toBe("Tip");
  });

  it("keeps bold text, links and later paragraphs after the marker", () => {
    const box = render(
      "> [!TIP]\n> **Technical Implementation:** See [the guide](https://example.com/g).\n>\n> Second paragraph.\n"
    ).querySelector(".doc-alert");
    expect(box.querySelector("strong").textContent).toBe(
      "Technical Implementation:"
    );
    expect(box.querySelector("a").getAttribute("href")).toBe(
      "https://example.com/g"
    );
    expect(box.querySelectorAll("p").length).toBe(3);
    expect(box.textContent).toContain("Second paragraph.");
  });

  it("leaves a plain blockquote as it was", () => {
    const holder = render("> Just a quote.\n");
    expect(holder.querySelector(".doc-alert")).toBeNull();
    expect(holder.querySelector("blockquote").textContent).toContain(
      "Just a quote."
    );
  });

  it("leaves an unknown marker as an ordinary blockquote", () => {
    const holder = render("> [!FOO]\n> Text.\n");
    expect(holder.querySelector(".doc-alert")).toBeNull();
    expect(holder.querySelector("blockquote").textContent).toContain("[!FOO]");
  });
});

describe("Mermaid drawings", () => {
  const SOURCE = "graph TD\n  A-->B";
  const DOC = "## Flow\n\n```mermaid\n" + SOURCE + "\n```\n";
  const build = (diagrams) => {
    const result = renderMarkdown(MARKED, DOC, {
      doc: document,
      baseUrl: "https://github.com/o/r/blob/main/docs/guides/03-SAS.md",
      docHrefForPath: () => null,
      diagrams
    });
    const holder = document.createElement("div");
    holder.appendChild(result.fragment);
    return holder;
  };

  it("hashes the same text to the same name whatever the line endings", () => {
    expect(diagramHash("a\r\nb\n")).toBe(diagramHash("a\nb"));
    expect(diagramHash("a")).not.toBe(diagramHash("b"));
    expect(diagramHash("a")).toMatch(/^[0-9a-f]{14}$/);
  });

  it("shows a light and a dark drawing with the alt, and keeps the source under them", () => {
    const hash = diagramHash(SOURCE);
    const holder = build({
      base: "/res/Mermaid_Diagrams",
      entries: { [hash]: { alt: "A flows to B." } }
    });
    const imgs = [...holder.querySelectorAll("img.doc-drawing-img")];
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual([
      `/res/Mermaid_Diagrams/${hash}-light.svg`,
      `/res/Mermaid_Diagrams/${hash}-dark.svg`
    ]);
    expect(imgs.map((i) => i.getAttribute("alt"))).toEqual([
      "A flows to B.",
      "A flows to B."
    ]);
    expect(holder.querySelector(".doc-drawing").getAttribute("tabindex")).toBe(
      "0"
    );
    expect(
      holder.querySelector("details.doc-diagram-source code").textContent
    ).toContain("A-->B");
    expect(holder.querySelector(".doc-diagram-note")).toBeNull();
  });

  it("falls back to the source block when no drawing matches the source", () => {
    const holder = build({
      base: "/res/Mermaid_Diagrams",
      entries: { [diagramHash("graph TD\n  X-->Y")]: { alt: "Other." } }
    });
    expect(holder.querySelector("img")).toBeNull();
    expect(holder.querySelector("details.doc-diagram-source")).not.toBeNull();
    expect(holder.querySelector(".doc-diagram-note a")).not.toBeNull();
  });

  it("falls back when the list of drawings is missing", () => {
    expect(build(undefined).querySelector("img")).toBeNull();
    expect(build({ base: "/r", entries: {} }).querySelector("img")).toBeNull();
  });

  it("reads the theme from data-theme, else from the system setting", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    expect(activeTheme()).toBe("dark");
    document.documentElement.setAttribute("data-theme", "light");
    expect(activeTheme()).toBe("light");
    document.documentElement.removeAttribute("data-theme");
  });
});

describe("c-docs-viewer focus and announcement", () => {
  const announced = (el) =>
    shadow(el).querySelector(".docs-announcer").textContent;

  function docPayload(key, content) {
    return {
      key,
      title: "Fallback title",
      path: "docs/guides/03-SAS.md",
      content,
      htmlUrl: "https://github.com/o/r/blob/main/docs/guides/03-SAS.md",
      fetchedAt: "2026-10-24T06:00:00.000Z",
      truncated: false
    };
  }

  async function pick(el, key, content) {
    // eslint-disable-next-line @lwc/lwc/no-unexpected-wire-adapter-usages
    CurrentPageReference.emit({ state: { doc: key } });
    getDoc.emit(docPayload(key, content));
    await flush();
    await flush();
    await flush();
  }

  it("says nothing and moves no focus on the first load", async () => {
    const list = await create({});
    expect(announced(list)).toBe("");
    expect(shadow(list).activeElement).toBeNull();
    document.body.removeChild(list);
    const doc = await openDoc("sas", SAS);
    expect(announced(doc)).toBe("");
    expect(shadow(doc).activeElement).toBeNull();
  });

  it("focuses the document heading and announces it after a document is picked", async () => {
    const el = await create({});
    await pick(el, "sas", SAS);
    const h1 = shadow(el).querySelector("h1");
    expect(h1.getAttribute("tabindex")).toBe("-1");
    expect(shadow(el).activeElement).toBe(h1);
    expect(announced(el)).toBe(
      "Systems Architecture Specification (SAS) opened"
    );
  });

  it("keeps the deep link heading focus when the address carries a hash, and still announces", async () => {
    const el = await create({});
    window.history.replaceState(
      null,
      "",
      "/portfolio/docs?doc=sas#11-architectural-north-star"
    );
    await pick(el, "sas", SAS);
    const heading = shadow(el).querySelector(
      '[id="1-1-architectural-north-star"]'
    );
    expect(shadow(el).activeElement).toBe(heading);
    expect(announced(el)).toBe(
      "Systems Architecture Specification (SAS) opened"
    );
  });

  it("focuses the list heading and announces the list when going back", async () => {
    const el = await create({});
    await pick(el, "sas", SAS);
    // eslint-disable-next-line @lwc/lwc/no-unexpected-wire-adapter-usages
    CurrentPageReference.emit({ state: {} });
    await flush();
    await flush();
    const h1 = shadow(el).querySelector("h1");
    expect(h1.textContent).toBe("Architecture docs");
    expect(shadow(el).activeElement).toBe(h1);
    expect(announced(el)).toBe("Document list");
  });

  it("behaves the same on browser back to the list", async () => {
    const el = await create({});
    await pick(el, "sas", SAS);
    window.history.replaceState(null, "", "/portfolio/docs");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await flush();
    await flush();
    const h1 = shadow(el).querySelector("h1");
    expect(shadow(el).activeElement).toBe(h1);
    expect(announced(el)).toBe("Document list");
  });
});

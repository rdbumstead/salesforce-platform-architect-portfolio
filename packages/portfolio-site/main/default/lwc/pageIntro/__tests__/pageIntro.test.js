import { createElement } from "@lwc/engine-dom";
import PageIntro, { toDesignHref } from "c/pageIntro";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

function mount(props = {}) {
  const element = createElement("c-page-intro", { is: PageIntro });
  Object.assign(element, props);
  document.body.appendChild(element);
  return element;
}

const FULL = {
  eyebrow: "Pillar A",
  heading: "Business Architecture",
  lead: "The opening paragraph.",
  designUrl: "/docs?doc=sas"
};

describe("c-page-intro", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("draws the eyebrow, the one h1, the lead and the design link", () => {
    const element = mount(FULL);
    const root = element.shadowRoot;
    expect(root.querySelector(".intro-eyebrow").textContent).toBe("Pillar A");
    const headings = root.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe("Business Architecture");
    expect(root.querySelector(".intro-lead").textContent).toBe(
      "The opening paragraph."
    );
    const link = root.querySelector("a.intro-design");
    expect(link.textContent).toBe("Read the design");
    expect(link.getAttribute("href")).toBe("/portfolio/docs?doc=sas");
    expect(link.getAttribute("target")).toBeNull();
  });

  it("keeps the eyebrow before the heading and the lead after it", () => {
    const element = mount(FULL);
    const order = [...element.shadowRoot.querySelector(".intro").children].map(
      (child) => child.className
    );
    expect(order).toEqual([
      "intro-eyebrow",
      "intro-heading",
      "intro-lead",
      "intro-actions"
    ]);
  });

  it("uses the design label when one is set", () => {
    const element = mount({ ...FULL, designLabel: "Read the SAS" });
    expect(
      element.shadowRoot.querySelector("a.intro-design").textContent
    ).toBe("Read the SAS");
  });

  it("opens an https design link in a new tab with a safe rel", () => {
    const element = mount({
      ...FULL,
      designUrl: "https://github.com/rdbumstead/x"
    });
    const link = element.shadowRoot.querySelector("a.intro-design");
    expect(link.getAttribute("href")).toBe("https://github.com/rdbumstead/x");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("leaves out the eyebrow, the lead and the link when they are blank", () => {
    const element = mount({ heading: "AI Lab", eyebrow: " ", lead: "" });
    const root = element.shadowRoot;
    expect(root.querySelector("h1").textContent).toBe("AI Lab");
    expect(root.querySelector(".intro-eyebrow")).toBeNull();
    expect(root.querySelector(".intro-lead")).toBeNull();
    expect(root.querySelector("a")).toBeNull();
  });

  it("shows no link for an address it may not link to", () => {
    [
      "javascript:alert(1)",
      "http://example.com",
      "//example.com/docs",
      "data:text/html,x",
      "docs?doc=sas",
      "https://example.com/a b"
    ].forEach((designUrl) => {
      expect(toDesignHref(designUrl)).toBe("");
    });
    const element = mount({ ...FULL, designUrl: "javascript:alert(1)" });
    expect(element.shadowRoot.querySelector("a")).toBeNull();
  });

  it("accepts a site path, an anchor and an https address", () => {
    expect(toDesignHref(" /docs?doc=adr-027#2-decision ")).toBe(
      "/portfolio/docs?doc=adr-027#2-decision"
    );
    expect(toDesignHref("#design")).toBe("#design");
    expect(toDesignHref("https://example.com/docs")).toBe(
      "https://example.com/docs"
    );
    expect(toDesignHref(undefined)).toBe("");
  });
});

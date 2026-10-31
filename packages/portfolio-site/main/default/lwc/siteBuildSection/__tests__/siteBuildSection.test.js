/**
 * @description       : Unit tests for siteBuildSection: one card per live pillar in order, the
 *                      stat as the big number only when it has a number and a label, one
 *                      secondary Open button per card and no primary button, the intro link to
 *                      the guest access design, the coming line, and the removed case study
 *                      disclosure, counts row and docs and architecture links. c/pillarData is
 *                      a fixed stand in.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { createElement } from "@lwc/engine-dom";
import { readFileSync } from "fs";
import { join } from "path";
import SiteBuildSection, { groupLeadingNumber } from "c/siteBuildSection";
import getPillarCards from "@salesforce/apex/ProjectCardController.getPillarCards";
import { setComingLetters, reset } from "c/pillarData";

jest.mock(
  "c/pillarData",
  () => {
    const source = [
      ["business-architecture", "A", "Business Architecture"],
      ["nonprofit-solutions", "B", "Solution Architecture"],
      ["api-lab", "C", "API Lab"],
      ["ai-lab", "D", "AI Lab"],
      ["delivery", "E", "Delivery"]
    ];
    let coming = [];
    const build = () =>
      source.map(([key, letter, pageLabel]) => ({
        key,
        letter,
        pageLabel,
        sasName: `${pageLabel} long name`,
        href: `/portfolio/${key}`,
        summary: `${pageLabel} summary.`,
        inProgress: coming.includes(letter)
      }));
    const api = {
      get LIVE_PILLARS() {
        return build().filter((pillar) => !pillar.inProgress);
      },
      get COMING_PILLARS() {
        return build().filter((pillar) => pillar.inProgress);
      },
      setComingLetters: (letters) => {
        coming = [...letters];
      },
      reset: () => {
        coming = [];
      }
    };
    // Getters, so a test that marks pillars as coming sees the change.
    Object.defineProperty(api, "__esModule", { value: true });
    return api;
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/ProjectCardController.getPillarCards",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

const CASE_E = {
  pillar: "E",
  headlineMetric: "1000 Apex tests",
  headlineLabel: "passing at the last successful deploy",
  challenge: "The challenge.",
  solution: "The solution.",
  businessValue: "The value."
};

function render() {
  const element = createElement("c-site-build-section", {
    is: SiteBuildSection
  });
  document.body.appendChild(element);
  return element;
}

function flush() {
  return Promise.resolve();
}

function text(node) {
  return node.textContent.replace(/\s+/g, " ").trim();
}

function byId(element, id) {
  return element.shadowRoot.querySelector(`[data-id="${id}"]`);
}

function card(element, key) {
  return element.shadowRoot.querySelector(`.card[data-key="${key}"]`);
}

describe("c-site-build-section", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
    reset();
    window.history.replaceState(null, "", "/");
  });

  it("shows the heading, the intro and one card per live pillar in order", () => {
    const element = render();
    const root = element.shadowRoot;
    expect(text(root.querySelector("h2"))).toBe("How this site is built");
    expect(text(root.querySelector(".section-intro"))).toContain(
      "This site runs on a Salesforce org I designed, built and deploy myself."
    );
    expect(root.querySelectorAll(".card")).toHaveLength(5);
    const names = Array.from(root.querySelectorAll(".card-name")).map((node) =>
      text(node)
    );
    expect(names).toEqual([
      "Business Architecture",
      "Solution Architecture",
      "API Lab",
      "AI Lab",
      "Delivery"
    ]);
    const links = Array.from(root.querySelectorAll('[data-id="pillar-link"]'));
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/portfolio/business-architecture",
      "/portfolio/nonprofit-solutions",
      "/portfolio/api-lab",
      "/portfolio/ai-lab",
      "/portfolio/delivery"
    ]);
    expect(links[2].getAttribute("aria-label")).toBe("Open API Lab");
    expect(text(links[2])).toBe("Open →");
  });

  it("gives each card its summary and one secondary button, and no primary button", () => {
    const element = render();
    const root = element.shadowRoot;
    const row = card(element, "api-lab");
    expect(text(row.querySelector(".card-text"))).toBe("API Lab summary.");
    expect(row.textContent).not.toContain("long name");
    root.querySelectorAll(".card").forEach((c) => {
      expect(c.querySelectorAll(".btn")).toHaveLength(1);
      expect(c.querySelector(".btn").classList.contains("btn-secondary")).toBe(
        true
      );
    });
    expect(root.querySelectorAll(".btn-primary")).toHaveLength(0);
  });

  it("keeps the guest access link in the intro as a plain text link", () => {
    const element = render();
    const link = byId(element, "guest-access-link");
    expect(link.getAttribute("href")).toBe(
      "/portfolio/docs?doc=sas#3-2-how-a-guest-reaches-apex"
    );
    expect(link.classList.contains("btn")).toBe(false);
    expect(
      element.shadowRoot.querySelector(".section-intro").contains(link)
    ).toBe(true);
    expect(
      element.shadowRoot
        .querySelector(".section-intro")
        .textContent.replace(/\s+/g, " ")
    ).toContain("Read how a visitor's request");
  });

  it("has no coming line when every pillar is live", () => {
    const element = render();
    expect(byId(element, "coming-note")).toBeNull();
  });

  it("leaves coming pillars out of the cards and names them once", () => {
    setComingLetters(["D", "E"]);
    const element = render();
    expect(card(element, "ai-lab")).toBeNull();
    expect(element.shadowRoot.querySelectorAll(".card")).toHaveLength(3);
    expect(text(byId(element, "coming-note"))).toBe(
      "Pillars D and E, AI Lab and Delivery, are coming."
    );
  });

  it("names a single coming pillar in the singular", () => {
    setComingLetters(["E"]);
    const element = render();
    expect(text(byId(element, "coming-note"))).toBe(
      "Pillar E, Delivery, is coming."
    );
  });

  it("reads the cards from getPillarCards, which takes no parameters", () => {
    render();
    expect(getPillarCards.getLastConfig()).toEqual({});
  });

  it("shows the big number only when the number and its label are both set", async () => {
    const element = render();
    expect(element.shadowRoot.querySelectorAll(".metric-number")).toHaveLength(
      0
    );
    getPillarCards.emit([
      CASE_E,
      { pillar: "C", headlineMetric: "23 API paths", headlineLabel: null }
    ]);
    await flush();
    expect(element.shadowRoot.querySelectorAll(".metric-number")).toHaveLength(
      1
    );
    const delivery = card(element, "delivery");
    expect(text(delivery.querySelector('[data-id="pillar-stat"]'))).toBe(
      "1,000 Apex tests passing at the last successful deploy"
    );
    expect(text(delivery.querySelector(".metric-number"))).toBe(
      "1,000 Apex tests"
    );
    const bare = card(element, "api-lab");
    expect(bare.querySelector('[data-id="pillar-stat"]')).toBeNull();
    expect(
      bare
        .querySelector('[data-id="metric-spacer"]')
        .getAttribute("aria-hidden")
    ).toBe("true");
  });

  it("keeps the cards as drawn when the read fails or is empty", async () => {
    const element = render();
    getPillarCards.error();
    await flush();
    expect(element.shadowRoot.querySelectorAll(".card")).toHaveLength(5);
    getPillarCards.emit([]);
    await flush();
    expect(element.shadowRoot.querySelectorAll(".card")).toHaveLength(5);
    expect(element.shadowRoot.querySelectorAll(".metric-number")).toHaveLength(
      0
    );
  });

  it("uses the first row per letter and ignores a letter that is not live", async () => {
    const element = render();
    getPillarCards.emit([
      { pillar: "Z", headlineMetric: "9", headlineLabel: "ignored" },
      CASE_E,
      { pillar: "E", headlineMetric: "1", headlineLabel: "second" }
    ]);
    await flush();
    expect(element.shadowRoot.querySelectorAll(".metric-number")).toHaveLength(
      1
    );
    expect(
      text(card(element, "delivery").querySelector(".metric-number"))
    ).toBe("1,000 Apex tests");
  });

  describe("the pillar letter in the card title", () => {
    it("is a direct child of the title, the place the stylesheet rule targets", () => {
      const element = render();
      const letters = element.shadowRoot.querySelectorAll(
        ".card-title > .letter"
      );
      expect(letters).toHaveLength(5);
      expect(Array.from(letters).map(text)).toEqual(["A", "B", "C", "D", "E"]);
      expect(
        element.shadowRoot.querySelectorAll(".card-body > .letter")
      ).toHaveLength(0);
    });

    it("has a rule in the stylesheet that matches that markup", () => {
      const css = readFileSync(
        join(__dirname, "..", "siteBuildSection.css"),
        "utf8"
      );
      expect(css).toMatch(/\.card-title > \.letter\s*\{[^}]*margin-inline-end/);
      expect(css).not.toContain(".card-body > .letter");
    });

    it("is hidden from assistive technology, so the heading reads as the page name alone", () => {
      const element = render();
      element.shadowRoot.querySelectorAll(".card-title").forEach((title) => {
        const letter = title.querySelector(".letter");
        expect(letter.getAttribute("aria-hidden")).toBe("true");
        // The accessible name is the title's text without anything aria-hidden.
        const name = Array.from(
          title.querySelectorAll(":scope > :not([aria-hidden])")
        )
          .map(text)
          .join(" ");
        expect(name).toBe(text(title.querySelector(".card-name")));
      });
      expect(
        text(element.shadowRoot.querySelectorAll(".card-title .card-name")[0])
      ).toBe("Business Architecture");
    });
  });

  describe("the heading level", () => {
    it("adds an h2 and no h1, because the docs viewer holds the page's one h1", () => {
      const element = render();
      expect(element.shadowRoot.querySelectorAll("h1")).toHaveLength(0);
      expect(element.shadowRoot.querySelectorAll("h2")).toHaveLength(1);
      expect(
        element.shadowRoot
          .querySelector("h2")
          .classList.contains("section-heading")
      ).toBe(true);
    });
  });

  describe("the Apex test count", () => {
    it("groups a leading number of 1000 or more with a comma", async () => {
      const element = render();
      getPillarCards.emit([{ ...CASE_E, headlineMetric: "1350 Apex tests" }]);
      await flush();
      expect(
        text(card(element, "delivery").querySelector(".metric-number"))
      ).toBe("1,350 Apex tests");
    });

    it("leaves small numbers, grouped numbers and other text alone", () => {
      expect(groupLeadingNumber("646 Apex tests")).toBe("646 Apex tests");
      expect(groupLeadingNumber("1,350 Apex tests")).toBe("1,350 Apex tests");
      expect(groupLeadingNumber("$0")).toBe("$0");
      expect(groupLeadingNumber("12000")).toBe("12,000");
      expect(groupLeadingNumber("Over 1350 tests")).toBe("Over 1350 tests");
    });
  });

  describe("the link to how a request reaches the data", () => {
    function click(link, init = {}) {
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...init
      });
      link.dispatchEvent(event);
      return event;
    }

    it("opens the section in place on the docs page, with no page load", () => {
      window.history.replaceState(null, "", "/portfolio/docs");
      const popped = jest.fn();
      window.addEventListener("popstate", popped);
      const element = render();
      const event = click(byId(element, "guest-access-link"));
      window.removeEventListener("popstate", popped);
      expect(event.defaultPrevented).toBe(true);
      expect(window.location.pathname).toBe("/portfolio/docs");
      expect(window.location.search).toBe("?doc=sas");
      expect(window.location.hash).toBe("#3-2-how-a-guest-reaches-apex");
      expect(popped).toHaveBeenCalledTimes(1);
    });

    it("is a normal link on any other page", () => {
      window.history.replaceState(null, "", "/portfolio/");
      const popped = jest.fn();
      window.addEventListener("popstate", popped);
      const element = render();
      const event = click(byId(element, "guest-access-link"));
      window.removeEventListener("popstate", popped);
      expect(event.defaultPrevented).toBe(false);
      expect(popped).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe("/portfolio/");
    });

    it("leaves a modified click to the browser even on the docs page", () => {
      window.history.replaceState(null, "", "/portfolio/docs");
      const element = render();
      const event = click(byId(element, "guest-access-link"), {
        ctrlKey: true
      });
      expect(event.defaultPrevented).toBe(false);
      expect(window.location.search).toBe("");
    });
  });

  it("has no case study disclosure, counts row, docs or architecture links, or tour", async () => {
    const element = render();
    getPillarCards.emit([CASE_E]);
    await flush();
    const root = element.shadowRoot;
    expect(root.querySelector("button")).toBeNull();
    expect(root.querySelector('[data-id="case-study"]')).toBeNull();
    expect(root.querySelector(".build-foot")).toBeNull();
    expect(byId(element, "counts-link")).toBeNull();
    expect(byId(element, "docs-link")).toBeNull();
    expect(root.textContent).not.toContain("Architecture and decisions");
    expect(root.textContent).not.toContain("Read the design");
    expect(root.textContent).not.toContain("tests passing ·");
    expect(root.textContent).not.toContain("Read the case study");
    expect(root.querySelector('[data-id="tour-button"]')).toBeNull();
  });
});

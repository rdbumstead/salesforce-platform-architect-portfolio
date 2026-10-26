/**
 * @description       : Unit tests for siteBuildSection: the live pillars in order with one
 *                      name each, Skills, the coming line, the stat line and case study
 *                      disclosure merged in by letter with case_study_opened, the counts line
 *                      only with numbers, the docs link, and the tour that opens and takes focus.
 *                      c/pillarData is a fixed stand in.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { createElement } from "@lwc/engine-dom";
import SiteBuildSection from "c/siteBuildSection";
import getPillarCards from "@salesforce/apex/ProjectCardController.getPillarCards";
import getBuildCounts from "@salesforce/apex/ProjectCardController.getBuildCounts";
import { setComingLetters, reset } from "c/pillarData";
import { trackEvent } from "c/analyticsService";

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
        tour: `${pageLabel} tour stop.`,
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
  "c/analyticsService",
  () => ({
    __esModule: true,
    trackEvent: jest.fn(),
    EVENTS: { CASE_STUDY_OPENED: "case_study_opened" }
  }),
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

jest.mock(
  "@salesforce/apex/ProjectCardController.getBuildCounts",
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
  challenge: "  The challenge.  ",
  solution: "The solution.",
  businessValue: "The value.",
  liveUrl: "https://ryanbumstead.com/",
  repositoryUrl:
    "https://github.com/rdbumstead/salesforce-platform-architect-portfolio"
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

function item(element, key) {
  return element.shadowRoot.querySelector(`.build-item[data-key="${key}"]`);
}

describe("c-site-build-section", () => {
  const originalMatchMedia = window.matchMedia;

  function systemReduces(matches) {
    window.matchMedia = jest.fn(() => ({
      matches,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }));
  }

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    window.matchMedia = originalMatchMedia;
    jest.clearAllMocks();
    reset();
  });

  describe("list", () => {
    it("shows the heading, the intro and every live pillar in order, then Skills", () => {
      const element = render();
      const root = element.shadowRoot;
      expect(text(root.querySelector("h2"))).toBe("How this site is built");
      expect(text(root.querySelector(".section-intro"))).toContain(
        "This site runs on a Salesforce org I designed, built and deploy myself."
      );
      const names = Array.from(root.querySelectorAll(".build-name")).map(
        (node) => text(node)
      );
      expect(names).toEqual([
        "Business Architecture",
        "Solution Architecture",
        "API Lab",
        "AI Lab",
        "Delivery",
        "Skills"
      ]);
      const links = Array.from(root.querySelectorAll(".build-go"));
      expect(links.map((a) => a.getAttribute("href"))).toEqual([
        "/portfolio/business-architecture",
        "/portfolio/nonprofit-solutions",
        "/portfolio/api-lab",
        "/portfolio/ai-lab",
        "/portfolio/delivery",
        "/portfolio/skills"
      ]);
      expect(links[2].getAttribute("aria-label")).toBe("Open API Lab");
      expect(text(links[2])).toBe("Open →");
    });

    it("gives each pillar one name: its page name, its letter and its summary", () => {
      const element = render();
      const row = item(element, "api-lab");
      expect(text(row.querySelector(".letter"))).toBe("C");
      expect(text(row.querySelector(".build-text"))).toBe("API Lab summary.");
      expect(row.textContent).not.toContain("long name");
      expect(row.textContent).not.toContain("Pillar C");
    });

    it("has no coming line when every pillar is live", () => {
      const element = render();
      expect(byId(element, "coming-note")).toBeNull();
    });

    it("leaves coming pillars out of the list and the tour, and names them once", () => {
      setComingLetters(["D", "E"]);
      const element = render();
      expect(item(element, "ai-lab")).toBeNull();
      expect(element.shadowRoot.querySelectorAll(".tour-step")).toHaveLength(3);
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
  });

  describe("pillar extras", () => {
    it("reads the cards from getPillarCards, which takes no parameters", () => {
      render();
      expect(getPillarCards.getLastConfig()).toEqual({});
    });

    it("shows the stat line only when the number and its label are both set", async () => {
      const element = render();
      getPillarCards.emit([
        CASE_E,
        { pillar: "C", headlineMetric: "23 API paths", headlineLabel: null }
      ]);
      await flush();
      expect(
        text(item(element, "delivery").querySelector('[data-id="pillar-stat"]'))
      ).toBe("1000 Apex tests passing at the last successful deploy");
      expect(
        item(element, "api-lab").querySelector('[data-id="pillar-stat"]')
      ).toBeNull();
    });

    it("keeps the list as drawn when the read fails or is empty", async () => {
      const element = render();
      getPillarCards.error();
      await flush();
      expect(element.shadowRoot.querySelectorAll(".build-item")).toHaveLength(
        6
      );
      expect(element.shadowRoot.querySelector(".case-study")).toBeNull();
      getPillarCards.emit([]);
      await flush();
      expect(element.shadowRoot.querySelector(".case-study")).toBeNull();
    });

    it("renders no disclosure without case study text, even with links", async () => {
      const element = render();
      getPillarCards.emit([
        { pillar: "E", liveUrl: "https://ryanbumstead.com/" }
      ]);
      await flush();
      expect(element.shadowRoot.querySelector(".case-study")).toBeNull();
    });

    it("starts closed, opens and closes on press, with the blocks and safe links", async () => {
      const element = render();
      getPillarCards.emit([CASE_E]);
      await flush();
      const row = item(element, "delivery");
      const toggle = row.querySelector(".case-toggle");
      const body = row.querySelector('[data-id="case-body"]');
      expect(toggle.tagName).toBe("BUTTON");
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(toggle.getAttribute("aria-controls")).toBeTruthy();
      expect(body.hidden).toBe(true);
      expect(text(toggle)).toBe("Read the case study+");

      toggle.click();
      await flush();
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(body.hidden).toBe(false);
      expect(text(toggle)).toBe("Hide the case study−");
      expect(
        Array.from(body.querySelectorAll(".case-heading")).map((h) => text(h))
      ).toEqual(["Challenge", "Solution", "Business value"]);
      expect(text(body.querySelector(".case-text"))).toBe("The challenge.");
      const links = Array.from(body.querySelectorAll(".case-link"));
      expect(links.map((a) => a.dataset.key)).toEqual(["live", "source"]);
      expect(links[0].getAttribute("target")).toBe("_blank");
      expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
      expect(text(links[0])).toBe("Live site, opens in a new tab");

      toggle.click();
      await flush();
      expect(body.hidden).toBe(true);
    });

    it("drops an unsafe link and keeps the safe one", async () => {
      const element = render();
      getPillarCards.emit([
        // The script URL is the input under test, proving it never renders as a link.
        // eslint-disable-next-line no-script-url
        { ...CASE_E, liveUrl: "javascript:alert(1)" }
      ]);
      await flush();
      const keys = Array.from(
        item(element, "delivery").querySelectorAll(".case-link")
      ).map((a) => a.dataset.key);
      expect(keys).toEqual(["source"]);
    });

    it("sends case_study_opened with the pillar letter on open, not on close", async () => {
      const element = render();
      getPillarCards.emit([CASE_E]);
      await flush();
      const toggle = item(element, "delivery").querySelector(".case-toggle");
      toggle.click();
      await flush();
      toggle.click();
      await flush();
      expect(trackEvent).toHaveBeenCalledTimes(1);
      expect(trackEvent).toHaveBeenCalledWith("case_study_opened", {
        pillar: "E"
      });
    });

    it("uses the first row per letter and ignores a letter that is not live", async () => {
      setComingLetters(["D"]);
      const element = render();
      getPillarCards.emit([
        CASE_E,
        { ...CASE_E, challenge: "Second row." },
        { ...CASE_E, pillar: "D" }
      ]);
      await flush();
      expect(element.shadowRoot.querySelectorAll(".case-study")).toHaveLength(
        1
      );
    });
  });

  describe("footer row", () => {
    it("reads the counts from getBuildCounts, which takes no parameters", () => {
      render();
      expect(getBuildCounts.getLastConfig()).toEqual({});
    });

    it("shows the counts line only with an Apex number, linking to Delivery", async () => {
      const element = render();
      expect(byId(element, "counts-link")).toBeNull();
      getBuildCounts.emit({ apexPassed: null, coverage: 98, jestPassed: 747 });
      await flush();
      expect(byId(element, "counts-link")).toBeNull();

      getBuildCounts.emit({ apexPassed: 1000, coverage: 98, jestPassed: 747 });
      await flush();
      const link = byId(element, "counts-link");
      expect(link.getAttribute("href")).toBe("/portfolio/delivery");
      expect(text(link)).toBe(
        "1,000 Apex tests passing · 98% coverage · 747 Jest tests passing →"
      );

      getBuildCounts.emit({
        apexPassed: 1000,
        coverage: null,
        jestPassed: null
      });
      await flush();
      expect(text(byId(element, "counts-link"))).toBe(
        "1,000 Apex tests passing →"
      );

      getBuildCounts.error();
      await flush();
      expect(byId(element, "counts-link")).toBeNull();
    });

    it("links to the design docs without a count of decision records", () => {
      const element = render();
      const docs = byId(element, "docs-link");
      expect(docs.getAttribute("href")).toBe("/portfolio/docs");
      expect(text(docs)).toBe(
        "Read the design: the architecture spec and the decision records→"
      );
    });
  });

  describe("tour", () => {
    it("starts closed and lists one stop per live pillar with its length", () => {
      const element = render();
      const tour = byId(element, "tour");
      const button = byId(element, "tour-button");
      expect(tour.hidden).toBe(true);
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(text(button)).toBe("Take the 5 minute tour ↓");
      const steps = Array.from(
        element.shadowRoot.querySelectorAll(".tour-step")
      );
      expect(
        steps.map((step) => text(step.querySelector(".tour-number")))
      ).toEqual(["01", "02", "03", "04", "05"]);
      expect(text(steps[1].querySelector(".tour-text"))).toBe(
        "Solution Architecture tour stop."
      );
      expect(steps[1].querySelector(".tour-link").getAttribute("href")).toBe(
        "/portfolio/nonprofit-solutions"
      );
      expect(text(byId(element, "tour-heading"))).toBe("A 5 minute tour");
    });

    it("opens the tour and moves focus to its heading, smoothly by default", async () => {
      systemReduces(false);
      const element = render();
      const heading = byId(element, "tour-heading");
      heading.scrollIntoView = jest.fn();
      byId(element, "tour-button").click();
      await flush();
      expect(byId(element, "tour").hidden).toBe(false);
      expect(byId(element, "tour-button").getAttribute("aria-expanded")).toBe(
        "true"
      );
      expect(heading.scrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start"
      });
      expect(element.shadowRoot.activeElement).toBe(heading);

      heading.blur();
      byId(element, "tour-button").click();
      await flush();
      expect(heading.scrollIntoView).toHaveBeenCalledTimes(2);
      expect(element.shadowRoot.activeElement).toBe(heading);
    });

    it("jumps without smooth scroll and drops the opening motion when the system reduces motion", async () => {
      systemReduces(true);
      const element = render();
      expect(
        element.shadowRoot
          .querySelector(".build")
          .classList.contains("motion-reduced")
      ).toBe(true);
      const heading = byId(element, "tour-heading");
      heading.scrollIntoView = jest.fn();
      byId(element, "tour-button").click();
      await flush();
      expect(heading.scrollIntoView).toHaveBeenCalledWith({
        behavior: "auto",
        block: "start"
      });
    });

    it("keeps the opening motion class off when motion is not reduced", () => {
      systemReduces(false);
      const element = render();
      expect(
        element.shadowRoot
          .querySelector(".build")
          .classList.contains("motion-reduced")
      ).toBe(false);
    });
  });
});

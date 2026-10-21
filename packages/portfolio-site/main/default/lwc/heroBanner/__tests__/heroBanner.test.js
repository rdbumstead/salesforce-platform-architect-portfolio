/**
 * @description       : Unit tests for heroBanner LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { createElement } from "@lwc/engine-dom";
import HeroBanner from "c/heroBanner";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

const EXPECTED_PILLARS = [
  {
    key: "business-architecture",
    heading: "Pillar A: Business Architecture",
    href: "/portfolio/business-architecture"
  },
  {
    key: "nonprofit-solutions",
    heading: "Pillar B: Pre-Sales Consultancy",
    href: "/portfolio/nonprofit-solutions"
  },
  {
    key: "api-lab",
    heading: "Pillar C: Work Experience Verification API",
    href: "/portfolio/api-lab"
  },
  {
    key: "ai-lab",
    heading: "Pillar D: AI & Innovation",
    href: "/portfolio/ai-lab"
  },
  {
    key: "delivery",
    heading: "Pillar E: Agile Delivery & DevOps",
    href: "/portfolio/delivery"
  }
];

function render() {
  const element = createElement("c-hero-banner", { is: HeroBanner });
  document.body.appendChild(element);
  return element;
}

describe("c-hero-banner", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("displays the correct greeting", () => {
    const element = render();
    const h1 = element.shadowRoot.querySelector("h1");
    expect(h1.textContent.replace(/\s+/g, " ").trim()).toBe(
      "Hello, I'm Ryan Bumstead."
    );
  });

  it("renders one pillar card per pillar, in order A to E, with SAS names and route links", () => {
    const element = render();
    const cards = element.shadowRoot.querySelectorAll(
      '[data-id="pillar-nav"] .pillar-card'
    );
    expect(cards).toHaveLength(5);

    cards.forEach((card, index) => {
      const expected = EXPECTED_PILLARS[index];
      expect(card.dataset.key).toBe(expected.key);
      expect(card.querySelector("h3").textContent).toContain(expected.heading);
      expect(card.querySelector("a").getAttribute("href")).toBe(expected.href);
    });
  });

  it("marks only pillars A and B as being built", () => {
    const element = render();
    const building = Array.from(
      element.shadowRoot.querySelectorAll(".pillar-card")
    )
      .filter((card) => card.querySelector(".pillar-status"))
      .map((card) => card.dataset.key);
    expect(building).toEqual(["business-architecture", "nonprofit-solutions"]);
  });

  it("renders the five-minute tour with one step per pillar pointing at its route", () => {
    const element = render();
    const headings = Array.from(element.shadowRoot.querySelectorAll("h2")).map(
      (h) => h.textContent.trim()
    );
    expect(headings).toContain("How to Evaluate Me");

    const intro = element.shadowRoot.querySelector(".tour-intro");
    expect(intro.textContent.replace(/\s+/g, " ").trim()).toBe(
      "A 5 minute tour, one stop per pillar."
    );

    const steps = element.shadowRoot.querySelectorAll(
      '[data-id="tour"] .tour-step'
    );
    expect(steps).toHaveLength(5);
    steps.forEach((step, index) => {
      const expected = EXPECTED_PILLARS[index];
      expect(step.dataset.key).toBe(expected.key);
      expect(step.querySelector("a").getAttribute("href")).toBe(expected.href);
      expect(step.querySelector(".tour-duration").textContent).toBe("1 minute");
      expect(
        step.querySelector(".tour-text").textContent.length
      ).toBeGreaterThan(0);
    });
  });
});

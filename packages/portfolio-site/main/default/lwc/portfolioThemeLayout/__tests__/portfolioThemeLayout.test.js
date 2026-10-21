/**
 * @description       : Unit tests for portfolioThemeLayout LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { createElement } from "@lwc/engine-dom";
import PortfolioThemeLayout from "c/portfolioThemeLayout";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

// Every K7 route URL (Round 3 plan section 4).
const EXPECTED_PAGE_HREFS = [
  "/portfolio/",
  "/portfolio/resume",
  "/portfolio/skills",
  "/portfolio/testimonials"
];

const EXPECTED_PILLARS = [
  {
    letter: "A",
    label: "Business Architecture",
    href: "/portfolio/business-architecture",
    sasName: "Pillar A: Business Architecture (Employer Hub)"
  },
  {
    letter: "B",
    label: "Nonprofit Solutions",
    href: "/portfolio/nonprofit-solutions",
    sasName: "Pillar B: Pre-Sales Consultancy (Nonprofit Literacy Solutions)"
  },
  {
    letter: "C",
    label: "API Lab",
    href: "/portfolio/api-lab",
    sasName: "Pillar C: Work Experience Verification API"
  },
  {
    letter: "D",
    label: "AI Lab",
    href: "/portfolio/ai-lab",
    sasName: "Pillar D: AI & Innovation"
  },
  {
    letter: "E",
    label: "Delivery",
    href: "/portfolio/delivery",
    sasName: "Pillar E: Agile Delivery & DevOps"
  }
];

function render() {
  const element = createElement("c-portfolio-theme-layout", {
    is: PortfolioThemeLayout
  });
  document.body.appendChild(element);
  return element;
}

describe("c-portfolio-theme-layout", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("links every K7 page from the primary navigation", () => {
    const element = render();
    const nav = element.shadowRoot.querySelector('nav[aria-label="Primary"]');
    expect(nav).not.toBeNull();

    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) =>
      a.getAttribute("href")
    );
    const expected = [
      ...EXPECTED_PAGE_HREFS,
      ...EXPECTED_PILLARS.map((p) => p.href)
    ];
    expect(hrefs).toEqual(expected);
    expect(new Set(hrefs).size).toBe(9);
  });

  it("names all five pillars A to E with their SAS names", () => {
    const element = render();
    const links = element.shadowRoot.querySelectorAll(".nav-link_pillar");
    expect(links).toHaveLength(5);

    links.forEach((link, index) => {
      const expected = EXPECTED_PILLARS[index];
      expect(link.querySelector(".pillar-letter").textContent).toBe(
        expected.letter
      );
      expect(link.querySelector(".pillar-label").textContent).toBe(
        expected.label
      );
      expect(link.getAttribute("title")).toBe(expected.sasName);
      expect(link.getAttribute("aria-label")).toBe(
        `${expected.label}, ${expected.sasName}`
      );
    });
  });

  it("links the brand to Home", () => {
    const element = render();
    const brand = element.shadowRoot.querySelector(".site-brand");
    expect(brand.getAttribute("href")).toBe("/portfolio/");
  });

  it("toggles the mobile menu and closes it after a link is chosen", async () => {
    const element = render();
    const button = element.shadowRoot.querySelector(".menu-toggle");
    const nav = element.shadowRoot.querySelector("nav");

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(nav.classList.contains("site-nav_open")).toBe(false);

    button.click();
    await Promise.resolve();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.textContent.trim()).toBe("Close menu");
    expect(nav.classList.contains("site-nav_open")).toBe(true);

    const link = nav.querySelector("a");
    // jsdom does not navigate, so stop the default action and keep the test output clean.
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();
    await Promise.resolve();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(nav.classList.contains("site-nav_open")).toBe(false);
  });

  it("exposes an unnamed content slot plus header and footer slots", () => {
    const element = render();
    const slots = Array.from(element.shadowRoot.querySelectorAll("slot")).map(
      (slot) => slot.getAttribute("name")
    );
    expect(slots).toEqual(["header", null, "footer"]);
  });
});

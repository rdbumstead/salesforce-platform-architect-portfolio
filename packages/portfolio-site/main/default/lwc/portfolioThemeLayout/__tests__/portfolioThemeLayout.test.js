/**
 * @description       : Unit tests for portfolioThemeLayout LWC: header navigation, Pillars menu,
 *                      phone menu and the theme toggle (Round 4 plan, contracts L2 and L3).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { createElement } from "@lwc/engine-dom";
import PortfolioThemeLayout from "c/portfolioThemeLayout";
import { PILLARS } from "c/pillarData";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

// Every K7 route URL (Round 3 plan section 4). Home is the brand link.
const EXPECTED_HREFS = [
  "/portfolio/",
  "/portfolio/resume",
  "/portfolio/skills",
  "/portfolio/testimonials",
  "/portfolio/business-architecture",
  "/portfolio/nonprofit-solutions",
  "/portfolio/api-lab",
  "/portfolio/ai-lab",
  "/portfolio/delivery"
];

const STORAGE_KEY = "portfolio-theme";
const realLocalStorage = window.localStorage;

function mockSystemTheme(dark) {
  const listeners = [];
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: dark && query === "(prefers-color-scheme: dark)",
    media: query,
    addEventListener: (type, fn) => listeners.push(fn),
    removeEventListener: jest.fn()
  }));
  return listeners;
}

function render() {
  const element = createElement("c-portfolio-theme-layout", {
    is: PortfolioThemeLayout
  });
  document.body.appendChild(element);
  return element;
}

function flush() {
  return Promise.resolve();
}

function pressEscape(element) {
  element.shadowRoot
    .querySelector(".site-header")
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
}

describe("c-portfolio-theme-layout", () => {
  beforeEach(() => {
    mockSystemTheme(false);
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: realLocalStorage
    });
    jest.clearAllMocks();
  });

  describe("navigation", () => {
    it("links every K7 route from the brand, the pages and the Pillars menu", () => {
      const element = render();
      const brand = element.shadowRoot.querySelector(".site-brand");
      const nav = element.shadowRoot.querySelector('nav[aria-label="Primary"]');
      expect(nav).not.toBeNull();

      const hrefs = [
        brand.getAttribute("href"),
        ...Array.from(nav.querySelectorAll("a")).map((a) =>
          a.getAttribute("href")
        )
      ];
      expect(hrefs).toEqual(EXPECTED_HREFS);
    });

    it("lists pillars A to E from pillarData with their SAS names", () => {
      const element = render();
      const links = element.shadowRoot.querySelectorAll(".pillar-link");
      expect(links).toHaveLength(5);

      links.forEach((link, index) => {
        const pillar = PILLARS[index];
        expect(link.querySelector(".pillar-letter").textContent).toBe(
          pillar.letter
        );
        expect(link.querySelector(".pillar-label").textContent).toBe(
          pillar.pageLabel
        );
        expect(link.querySelector(".pillar-sas").textContent).toBe(
          pillar.sasName
        );
        expect(link.getAttribute("href")).toBe(pillar.href);
      });
      expect(
        Array.from(links).map(
          (l) => l.querySelector(".pillar-letter").textContent
        )
      ).toEqual(["A", "B", "C", "D", "E"]);
    });

    it("exposes an unnamed content slot plus header and footer slots", () => {
      const element = render();
      const slots = Array.from(element.shadowRoot.querySelectorAll("slot")).map(
        (slot) => slot.getAttribute("name")
      );
      expect(slots).toEqual(["header", null, "footer"]);
    });
  });

  describe("Pillars menu", () => {
    it("opens from its button and closes on Escape with focus back on the button", async () => {
      const element = render();
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      const menu = element.shadowRoot.querySelector(".pillar-menu");

      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(menu.hidden).toBe(true);

      button.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(menu.hidden).toBe(false);

      pressEscape(element);
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(menu.hidden).toBe(true);
      expect(element.shadowRoot.activeElement).toBe(button);
    });

    it("closes when the visitor clicks outside it", async () => {
      const element = render();
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      button.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("true");

      document.body.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes after a pillar is chosen", async () => {
      const element = render();
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      button.click();
      await flush();

      const link = element.shadowRoot.querySelector(".pillar-link");
      // jsdom does not navigate, so stop the default action and keep the test output clean.
      link.addEventListener("click", (event) => event.preventDefault());
      link.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("false");
    });
  });

  describe("phone menu", () => {
    it("toggles, closes on Escape and returns focus to the menu button", async () => {
      const element = render();
      const button = element.shadowRoot.querySelector(".menu-toggle");
      const nav = element.shadowRoot.querySelector("nav");

      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(button.getAttribute("aria-label")).toBe("Open menu");
      expect(nav.classList.contains("site-nav_open")).toBe(false);

      button.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(button.getAttribute("aria-label")).toBe("Close menu");
      expect(nav.classList.contains("site-nav_open")).toBe(true);

      pressEscape(element);
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(nav.classList.contains("site-nav_open")).toBe(false);
      expect(element.shadowRoot.activeElement).toBe(button);
    });

    it("closes the Pillars menu first, then the phone menu, on two presses of Escape", async () => {
      const element = render();
      const menuButton = element.shadowRoot.querySelector(".menu-toggle");
      const pillarsButton = element.shadowRoot.querySelector(".pillars-toggle");
      menuButton.click();
      await flush();
      pillarsButton.click();
      await flush();

      pressEscape(element);
      await flush();
      expect(pillarsButton.getAttribute("aria-expanded")).toBe("false");
      expect(menuButton.getAttribute("aria-expanded")).toBe("true");

      pressEscape(element);
      await flush();
      expect(menuButton.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes after a page link is chosen", async () => {
      const element = render();
      const button = element.shadowRoot.querySelector(".menu-toggle");
      button.click();
      await flush();

      const link = element.shadowRoot.querySelector(".nav-link");
      link.addEventListener("click", (event) => event.preventDefault());
      link.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("false");
    });
  });

  describe("theme toggle", () => {
    it("follows a light system setting and sets no attribute until the visitor chooses", () => {
      const element = render();
      const toggle = element.shadowRoot.querySelector(".theme-toggle");
      expect(toggle.getAttribute("aria-label")).toBe("Dark theme");
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
      expect(element.hasAttribute("data-theme")).toBe(false);
    });

    it("follows a dark system setting", () => {
      mockSystemTheme(true);
      const element = render();
      const toggle = element.shadowRoot.querySelector(".theme-toggle");
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      expect(element.shadowRoot.querySelector(".icon-sun")).not.toBeNull();
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });

    it("sets data-theme and storage on each press", async () => {
      const element = render();
      const toggle = element.shadowRoot.querySelector(".theme-toggle");

      toggle.click();
      await flush();
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(element.getAttribute("data-theme")).toBe("dark");
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      expect(toggle.getAttribute("title")).toBe("Switch to light theme");

      toggle.click();
      await flush();
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      expect(element.getAttribute("data-theme")).toBe("light");
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe("light");
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    });

    it("applies a saved choice on load over the system setting", () => {
      mockSystemTheme(true);
      window.localStorage.setItem(STORAGE_KEY, "light");
      const element = render();
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
      expect(element.getAttribute("data-theme")).toBe("light");
      expect(
        element.shadowRoot
          .querySelector(".theme-toggle")
          .getAttribute("aria-pressed")
      ).toBe("false");
    });

    it("ignores a saved value that is not light or dark", () => {
      window.localStorage.setItem(STORAGE_KEY, "sepia");
      render();
      expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    });

    it("keeps working when localStorage throws on every call", async () => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
          getItem: () => {
            throw new Error("SecurityError");
          },
          setItem: () => {
            throw new Error("QuotaExceededError");
          }
        }
      });
      const element = render();
      const toggle = element.shadowRoot.querySelector(".theme-toggle");
      expect(toggle.getAttribute("aria-pressed")).toBe("false");

      toggle.click();
      await flush();
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
    });

    it("keeps working where matchMedia is missing", () => {
      delete window.matchMedia;
      const element = render();
      expect(
        element.shadowRoot
          .querySelector(".theme-toggle")
          .getAttribute("aria-pressed")
      ).toBe("false");
    });

    it("updates the toggle state when the system setting changes", async () => {
      const listeners = mockSystemTheme(false);
      const element = render();
      listeners.forEach((fn) => fn({ matches: true }));
      await flush();
      expect(
        element.shadowRoot
          .querySelector(".theme-toggle")
          .getAttribute("aria-pressed")
      ).toBe("true");
    });
  });
});

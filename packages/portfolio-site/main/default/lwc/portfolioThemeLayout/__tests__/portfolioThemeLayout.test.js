/**
 * @description       : Unit tests for portfolioThemeLayout LWC: header navigation, Pillars menu,
 *                      phone menu and the theme toggle (Round 4 plan, contracts L2 and L3).
 *                      c/pillarData is a fixed stand in (Round 5 plan, log 192).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { createElement } from "@lwc/engine-dom";
import PortfolioThemeLayout from "c/portfolioThemeLayout";
import { PILLARS, reset, setComingLetters } from "c/pillarData";
import { trackEvent } from "c/analyticsService";

// A fixed five pillar list, all live unless a test marks some as coming with
// setComingLetters, so these tests pass before and after the pillarData flags change
// (Round 5 plan, log 192).
jest.mock(
  "c/pillarData",
  () => {
    const source = [
      [
        "business-architecture",
        "A",
        "Business Architecture",
        "Business Architecture",
        ["Employer Hub", "Data model"]
      ],
      [
        "nonprofit-solutions",
        "B",
        "Nonprofit Solutions",
        "Solution Architecture",
        ["Solution design", "Decision matrix"]
      ],
      [
        "api-lab",
        "C",
        "API Lab",
        "Work Experience Verification API",
        ["Apex REST", "OAuth 2.0", "OpenAPI"]
      ],
      [
        "ai-lab",
        "D",
        "AI Lab",
        "AI & Innovation",
        ["Grounded generation", "Fallback chain"]
      ],
      [
        "delivery",
        "E",
        "Delivery",
        "Agile Delivery & DevOps",
        ["Jira", "GitHub Actions"]
      ]
    ];
    let coming = [];
    const build = () =>
      source.map(([key, letter, pageLabel, sasName, tags]) => ({
        key,
        letter,
        pageLabel,
        sasName,
        tags,
        url: key,
        href: `/portfolio/${key}`,
        summary: `${pageLabel} summary.`,
        tour: `${pageLabel} tour stop.`,
        code: letter === "C" ? "GET /sapi/v1/health  200" : undefined,
        inProgress: coming.includes(letter),
        subLinks:
          letter === "C"
            ? [
                {
                  key: "api-reference",
                  label: "API reference",
                  url: "api-lab/reference",
                  href: "/portfolio/api-lab/reference"
                }
              ]
            : []
      }));
    return {
      __esModule: true,
      get PILLARS() {
        return build();
      },
      get LIVE_PILLARS() {
        return build().filter((pillar) => !pillar.inProgress);
      },
      get COMING_PILLARS() {
        return build().filter((pillar) => pillar.inProgress);
      },
      pillarByLetter: (letter) => build().find((p) => p.letter === letter),
      setComingLetters: (letters) => {
        coming = [...letters];
      },
      reset: () => {
        coming = [];
      }
    };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

// c/analyticsService is built by WS1 (contract L4). Mocked so this bundle tests on its own.
jest.mock(
  "c/analyticsService",
  () => ({
    __esModule: true,
    trackEvent: jest.fn(),
    EVENTS: { THEME_CHANGED: "theme_changed" }
  }),
  { virtual: true }
);

// Every K7 route URL (Round 3 plan section 4) plus the API reference page (log 155).
// Home is the brand link and the first nav link (Round 6 plan, N1).
const EXPECTED_HREFS = [
  "/portfolio/",
  "/portfolio/",
  "/portfolio/resume",
  "/portfolio/skills",
  "/portfolio/testimonials",
  "/portfolio/business-architecture",
  "/portfolio/nonprofit-solutions",
  "/portfolio/api-lab",
  "/portfolio/api-lab/reference",
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

/**
 * Renders the layout so that its document click listener sees what it sees on the published
 * site: a composed path that starts at the layout host and holds nothing inside its shadow
 * root (log 240). Only that listener gets the short path, so the shadow tree dispatches as
 * usual.
 * @param {HTMLElement[]} [content] light DOM children for the default slot
 * @returns {HTMLElement} the layout
 */
function renderPublished(content = []) {
  const element = createElement("c-portfolio-theme-layout", {
    is: PortfolioThemeLayout
  });
  content.forEach((node) => element.appendChild(node));
  const shortPath = () => [
    element,
    document.body,
    document.documentElement,
    document,
    window
  ];
  const wrapped = new Map();
  const add = document.addEventListener.bind(document);
  const remove = document.removeEventListener.bind(document);
  jest
    .spyOn(document, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (type !== "click") {
        add(type, listener, options);
        return;
      }
      const proxy = (event) =>
        listener(
          new Proxy(event, {
            get: (target, key) => {
              if (key === "composedPath") {
                return shortPath;
              }
              const value = target[key];
              return typeof value === "function" ? value.bind(target) : value;
            }
          })
        );
      wrapped.set(listener, proxy);
      add(type, proxy, options);
    });
  jest
    .spyOn(document, "removeEventListener")
    .mockImplementation((type, listener, options) => {
      remove(type, wrapped.get(listener) || listener, options);
    });
  document.body.appendChild(element);
  return element;
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
    // After the removals, so a wrapped document listener is removed through its wrapper.
    jest.restoreAllMocks();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: realLocalStorage
    });
    jest.clearAllMocks();
    reset();
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

    it("lists Home first, with the brand href, then Resume, Skills and Testimonials", () => {
      const element = render();
      const brand = element.shadowRoot.querySelector(".site-brand");
      const items = Array.from(
        element.shadowRoot.querySelectorAll(".nav-list > .nav-item")
      );
      const first = items[0].querySelector("a");
      expect(first.textContent).toBe("Home");
      expect(first.dataset.key).toBe("home");
      expect(first.getAttribute("href")).toBe(brand.getAttribute("href"));
      expect(brand.textContent).toBe("Ryan Bumstead");
      expect(
        items.map((item) => item.querySelector(".nav-link").textContent.trim())
      ).toEqual(["Home", "Resume", "Skills", "Testimonials", "Pillars"]);
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

    it("marks no pillar as coming when every pillar is live", () => {
      const element = render();
      expect(element.shadowRoot.querySelector(".pillar-coming")).toBeNull();
    });

    it("marks the coming pillars and no other pillar", () => {
      setComingLetters(["A", "B"]);
      const element = render();
      const coming = Array.from(
        element.shadowRoot.querySelectorAll(".pillar-link")
      )
        .filter((link) => link.querySelector(".pillar-coming"))
        .map((link) => link.querySelector(".pillar-letter").textContent);
      expect(coming).toEqual(["A", "B"]);
      expect(
        element.shadowRoot.querySelector(".pillar-coming").textContent
      ).toBe("Coming");
    });

    it("lists the API reference under API Lab", () => {
      const element = render();
      const subLinks = element.shadowRoot.querySelectorAll(".pillar-sub-link");
      expect(subLinks).toHaveLength(1);
      expect(subLinks[0].textContent).toBe("API reference");
      expect(subLinks[0].getAttribute("href")).toBe(
        "/portfolio/api-lab/reference"
      );
      const owner = subLinks[0].closest("ul").closest("li");
      expect(owner.querySelector(".pillar-label").textContent).toBe("API Lab");
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

  describe("Pillars menu with the path the published site gives the document", () => {
    it("stays open after the click that opened it", async () => {
      const element = renderPublished();
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      const menu = element.shadowRoot.querySelector(".pillar-menu");

      button.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(menu.hidden).toBe(false);
    });

    it("stays open on a click inside the menu that is not a link", async () => {
      const element = renderPublished();
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      button.click();
      await flush();

      element.shadowRoot.querySelector(".pillar-menu").click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("true");
    });

    it("closes on a click on the page content in the slot", async () => {
      const content = document.createElement("p");
      const element = renderPublished([content]);
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      button.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("true");

      content.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(element.shadowRoot.querySelector(".pillar-menu").hidden).toBe(
        true
      );
    });

    it("closes on a click elsewhere in the document", async () => {
      const element = renderPublished();
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      button.click();
      await flush();

      document.body.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes on Escape with focus back on the toggle", async () => {
      const element = renderPublished();
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      button.click();
      await flush();

      pressEscape(element);
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(element.shadowRoot.activeElement).toBe(button);
    });

    it("closes on Escape pressed with the focus outside the header, as after a click in Safari", async () => {
      const element = renderPublished();
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      button.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("true");

      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(element.shadowRoot.querySelector(".pillar-menu").hidden).toBe(
        true
      );
      expect(element.shadowRoot.activeElement).toBe(button);
    });

    it("leaves the menu alone on other keys pressed outside the header", async () => {
      const element = renderPublished();
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      button.click();
      await flush();

      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("true");
    });

    it("closes after a pillar link is followed and opens again on the next click", async () => {
      const element = renderPublished();
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      button.click();
      await flush();

      const link = element.shadowRoot.querySelector(".pillar-link");
      link.addEventListener("click", (event) => event.preventDefault());
      link.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("false");

      button.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("true");
    });

    it("toggles closed on a second click of the toggle", async () => {
      const element = renderPublished();
      const button = element.shadowRoot.querySelector(".pillars-toggle");
      button.click();
      await flush();
      button.click();
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
      expect(link.dataset.key).toBe("home");
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

    it("sends theme_changed with the new theme on each press", async () => {
      const element = render();
      const toggle = element.shadowRoot.querySelector(".theme-toggle");
      expect(trackEvent).not.toHaveBeenCalled();

      toggle.click();
      await flush();
      expect(trackEvent).toHaveBeenLastCalledWith("theme_changed", {
        theme: "dark"
      });

      toggle.click();
      await flush();
      expect(trackEvent).toHaveBeenLastCalledWith("theme_changed", {
        theme: "light"
      });
      expect(trackEvent).toHaveBeenCalledTimes(2);
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

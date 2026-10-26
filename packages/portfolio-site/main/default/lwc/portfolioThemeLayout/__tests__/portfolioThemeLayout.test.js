/**
 * @description       : Unit tests for portfolioThemeLayout LWC: header navigation (Work, Resume,
 *                      the "How it's built" menu with Docs and the API reference, Contact), the
 *                      phone menu, the theme toggle and its crossfade, motion following the
 *                      system setting with no motion button, the header shadow, and Back to top
 *                      in the header.
 *                      c/motionPreference is the real module.
 *                      c/pillarData is a fixed stand in.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { createElement } from "@lwc/engine-dom";
import PortfolioThemeLayout, {
  BACK_TO_TOP_SCREENS,
  BUILT_MENU_LABEL,
  CASE_STUDIES_ID,
  DOCS_URL,
  HERO_LOOKUP_MS,
  HERO_SELECTOR,
  THEME_FADE_MS,
  currentRouteUrl,
  findInContent,
  idSelector
} from "c/portfolioThemeLayout";
import { PILLARS, reset, setComingLetters } from "c/pillarData";
import { trackEvent } from "c/analyticsService";
import { CurrentPageReference } from "lightning/navigation";

// The page reference wire stands in for the site router's route changes.
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

// A fixed five pillar list, all live unless a test marks some as coming with
// setComingLetters, so these tests pass before and after the pillarData flags change.
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
        "Solution Architecture",
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

// c/analyticsService is mocked so this bundle tests on its own.
jest.mock(
  "c/analyticsService",
  () => ({
    __esModule: true,
    trackEvent: jest.fn(),
    EVENTS: {
      THEME_CHANGED: "theme_changed",
      BACK_TO_TOP_USED: "back_to_top_used",
      MOTION_TOGGLED: "motion_toggled"
    }
  }),
  { virtual: true }
);

// Every href the header links off the home page, in order: the brand, Work (the home page
// here), Resume, the five pillars, Docs, the API reference, then Contact.
const EXPECTED_HREFS = [
  "/portfolio/",
  "/portfolio/",
  "/portfolio/resume",
  "/portfolio/business-architecture",
  "/portfolio/nonprofit-solutions",
  "/portfolio/api-lab",
  "/portfolio/ai-lab",
  "/portfolio/delivery",
  "/portfolio/docs",
  "/portfolio/api-lab/reference",
  "/portfolio/contact"
];

const NAV_LABELS = ["Work", "Resume", "How it's built", "Contact"];

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

function render(content = []) {
  const element = createElement("c-portfolio-theme-layout", {
    is: PortfolioThemeLayout
  });
  document.body.appendChild(element);
  // The test shadow polyfill does not assign light DOM added from a test to the slot, so the
  // content slot hands back the page content directly, as a browser's slot does on the site.
  const slot = element.shadowRoot.querySelector(".region-content slot");
  slot.assignedElements = () => content;
  return element;
}

function flush() {
  return Promise.resolve();
}

/**
 * Renders the layout so that its document click listener sees what it sees on the published
 * site: a composed path that starts at the layout host and holds nothing inside its shadow
 * root. Only that listener gets the short path, so the shadow tree dispatches as
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

function goTo(path) {
  window.history.pushState({}, "", path);
}

function navLabels(element) {
  return Array.from(
    element.shadowRoot.querySelectorAll(".nav-list > .nav-item")
  ).map((item) => item.querySelector(".nav-link").textContent.trim());
}

describe("c-portfolio-theme-layout", () => {
  beforeEach(() => {
    // Most tests run on an inner page, where the header lists Home.
    goTo("/portfolio/resume");
    mockSystemTheme(false);
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-motion");
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
    it("links every site route from the brand, the pages and the Pillars menu", () => {
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

    it("lists Work, Resume, How it's built and Contact, with the name as the home link", () => {
      const element = render();
      const brand = element.shadowRoot.querySelector(".site-brand");
      expect(brand.textContent).toBe("Ryan Bumstead");
      expect(brand.getAttribute("href")).toBe("/portfolio/");
      expect(navLabels(element)).toEqual(NAV_LABELS);
      const work = element.shadowRoot.querySelector(
        '.nav-link[data-key="work"]'
      );
      expect(work.getAttribute("href")).toBe("/portfolio/");
      expect(work.getAttribute("aria-current")).toBeNull();
    });

    it("has no Home, Skills or Testimonials link in the header", () => {
      const element = render();
      ["home", "skills", "testimonials"].forEach((key) => {
        expect(
          element.shadowRoot.querySelector(`[data-key="${key}"]`)
        ).toBeNull();
      });
    });

    it("points Work at the case studies on the home page and keeps the name as a home link", () => {
      goTo("/portfolio/");
      const element = render();
      expect(navLabels(element)).toEqual(NAV_LABELS);
      expect(CASE_STUDIES_ID).toBe("case-studies");
      const work = element.shadowRoot.querySelector(
        '.nav-link[data-key="work"]'
      );
      expect(work.getAttribute("href")).toBe("/portfolio/#case-studies");
      const brand = element.shadowRoot.querySelector(".site-brand");
      expect(brand.getAttribute("href")).toBe("/portfolio/");
      expect(
        element.shadowRoot.querySelectorAll('[aria-current="page"]')
      ).toHaveLength(0);
    });

    it("reads the home page with or without the trailing slash", () => {
      goTo("/portfolio");
      expect(currentRouteUrl()).toBe("");
      goTo("/portfolio/");
      expect(currentRouteUrl()).toBe("");
      goTo("/portfolio/api-lab/reference/");
      expect(currentRouteUrl()).toBe("api-lab/reference");
    });

    it("shows the same links in the phone menu on the home page", async () => {
      goTo("/portfolio/");
      const element = render();
      element.shadowRoot.querySelector(".menu-toggle").click();
      await flush();
      const nav = element.shadowRoot.querySelector("nav");
      expect(nav.classList.contains("site-nav_open")).toBe(true);
      expect(nav.querySelector(".nav-link").dataset.key).toBe("work");
      expect(navLabels(element)).toEqual(NAV_LABELS);
    });

    it("repoints Work and moves aria-current when the route changes in place", async () => {
      goTo("/portfolio/");
      const element = render();
      const workHref = () =>
        element.shadowRoot
          .querySelector('.nav-link[data-key="work"]')
          .getAttribute("href");
      expect(workHref()).toBe("/portfolio/#case-studies");

      goTo("/portfolio/contact");
      // The test adapter's emit stands in for the router announcing the new route.
      // eslint-disable-next-line @lwc/lwc/no-unexpected-wire-adapter-usages
      CurrentPageReference.emit({
        type: "comm__namedPage",
        attributes: { name: "Contact__c" }
      });
      await flush();
      expect(workHref()).toBe("/portfolio/");
      const current = element.shadowRoot.querySelectorAll(
        '[aria-current="page"]'
      );
      expect(current).toHaveLength(1);
      expect(current[0].dataset.key).toBe("contact");

      goTo("/portfolio/");
      window.dispatchEvent(new PopStateEvent("popstate"));
      await flush();
      expect(workHref()).toBe("/portfolio/#case-studies");
      expect(
        element.shadowRoot.querySelectorAll('[aria-current="page"]')
      ).toHaveLength(0);
    });

    it("marks only the link to the page on screen with aria-current", () => {
      const element = render();
      const current = element.shadowRoot.querySelectorAll(
        '[aria-current="page"]'
      );
      expect(current).toHaveLength(1);
      expect(current[0].dataset.key).toBe("resume");
      expect(current[0].getAttribute("href")).toBe("/portfolio/resume");
    });

    it("marks the API reference link, not API Lab, on the API reference page", () => {
      goTo("/portfolio/api-lab/reference");
      const element = render();
      const current = element.shadowRoot.querySelectorAll(
        '[aria-current="page"]'
      );
      expect(current).toHaveLength(1);
      expect(current[0].dataset.key).toBe("api-reference");
      expect(current[0].classList.contains("docs-link")).toBe(true);
    });

    it("puts Contact last, right after the How it's built menu, linking /contact", () => {
      const element = render();
      const items = Array.from(
        element.shadowRoot.querySelectorAll(".nav-list > .nav-item")
      );
      const contact = items[items.length - 1].querySelector("a");
      expect(contact.textContent).toBe("Contact");
      expect(contact.getAttribute("href")).toBe("/portfolio/contact");
      expect(items[items.length - 2].classList.contains("pillars")).toBe(true);
    });

    it("stops listening for history changes when removed", () => {
      const remove = jest.spyOn(window, "removeEventListener");
      const element = render();
      document.body.removeChild(element);
      expect(remove).toHaveBeenCalledWith("popstate", expect.any(Function));
      remove.mockRestore();
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

    it("lists the API reference as an item of its own, last in the menu", () => {
      const element = render();
      expect(element.shadowRoot.querySelector(".pillar-sub-link")).toBeNull();
      const items = element.shadowRoot.querySelectorAll(".pillar-menu > li");
      const last = items[items.length - 1].querySelector("a");
      expect(last.dataset.key).toBe("api-reference");
      expect(last.querySelector(".pillar-label").textContent).toBe(
        "API reference"
      );
      expect(last.querySelector(".pillar-sas").textContent).toBe(
        "API Lab, every endpoint and response"
      );
      expect(last.getAttribute("href")).toBe("/portfolio/api-lab/reference");
    });

    it("names the menu and its button How it's built", () => {
      const element = render();
      const toggle = element.shadowRoot.querySelector(".pillars-toggle");
      expect(toggle.textContent.trim()).toBe(BUILT_MENU_LABEL);
      expect(BUILT_MENU_LABEL).toBe("How it's built");
      expect(
        element.shadowRoot
          .querySelector(".pillar-menu")
          .getAttribute("aria-label")
      ).toBe("How it's built");
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

    it("moves focus to its first link when it opens, and back to its button on Escape", async () => {
      const element = render();
      const button = element.shadowRoot.querySelector(".menu-toggle");
      button.click();
      await flush();
      const first = element.shadowRoot.querySelector(".site-nav .nav-link");
      expect(first.dataset.key).toBe("work");
      expect(element.shadowRoot.activeElement).toBe(first);

      pressEscape(element);
      await flush();
      expect(element.shadowRoot.activeElement).toBe(button);

      // Closing from the button leaves focus where it is.
      button.click();
      await flush();
      button.focus();
      button.click();
      await flush();
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
      expect(link.dataset.key).toBe("work");
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
  describe("Docs in the Pillars menu", () => {
    function docsLink(element) {
      return element.shadowRoot.querySelector(
        '.pillar-menu a[data-key="docs"]'
      );
    }

    it("puts Docs right after the five pillars, linking /docs", () => {
      const element = render();
      expect(DOCS_URL).toBe("docs");
      const link = docsLink(element);
      expect(link).not.toBeNull();
      expect(link.querySelector(".pillar-label").textContent).toBe("Docs");
      expect(link.getAttribute("href")).toBe("/portfolio/docs");
      const items = element.shadowRoot.querySelectorAll(".pillar-menu > li");
      expect(items).toHaveLength(7);
      expect(items[5].contains(link)).toBe(true);
      expect(items[5].classList.contains("built-item")).toBe(true);
      expect(link.getAttribute("aria-current")).toBeNull();
    });

    it("marks Docs as the current page on /docs, with a document chosen", () => {
      goTo("/portfolio/docs?doc=sas");
      const element = render();
      const current = element.shadowRoot.querySelectorAll(
        '[aria-current="page"]'
      );
      expect(current).toHaveLength(1);
      expect(current[0].dataset.key).toBe("docs");
    });

    it("closes the menus when Docs is followed", async () => {
      const element = render();
      element.shadowRoot.querySelector(".menu-toggle").click();
      await flush();
      element.shadowRoot.querySelector(".pillars-toggle").click();
      await flush();
      docsLink(element).click();
      await flush();
      expect(element.shadowRoot.querySelector(".pillar-menu").hidden).toBe(
        true
      );
      expect(
        element.shadowRoot
          .querySelector(".menu-toggle")
          .getAttribute("aria-expanded")
      ).toBe("false");
    });

    it("adds no header link of its own", () => {
      const element = render();
      expect(navLabels(element)).not.toContain("Docs");
    });
  });

  describe("motion", () => {
    const MOTION_KEY = "portfolio-motion";

    function mockSystemMotion(reduced) {
      const listeners = [];
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: reduced && query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: (type, fn) => listeners.push(fn),
        removeEventListener: jest.fn()
      }));
      return listeners;
    }

    function actionClasses(element) {
      return Array.from(
        element.shadowRoot.querySelector(".site-actions").children
      ).map((node) => node.getAttribute("class"));
    }

    it("has no motion button in the header, only the divider before the arrow, and the theme button sits between Back to top and the menu button", () => {
      const element = render();
      expect(element.shadowRoot.querySelector(".motion-toggle")).toBeNull();
      expect(
        element.shadowRoot.querySelector('[aria-label="Reduce motion"]')
      ).toBeNull();
      expect(actionClasses(element)).toEqual([
        "nav-divider",
        "icon-button back-to-top",
        "icon-button theme-toggle",
        "icon-button menu-toggle"
      ]);
      const theme = element.shadowRoot.querySelector(".theme-toggle");
      expect(theme.tagName).toBe("BUTTON");
      expect(theme.getAttribute("type")).toBe("button");
      expect(theme.getAttribute("aria-label")).toBe("Dark theme");
      expect(theme.getAttribute("aria-pressed")).toBe("false");
      expect(theme.getAttribute("title")).toBe("Switch to dark theme");
      expect(theme.nextElementSibling).toBe(
        element.shadowRoot.querySelector(".menu-toggle")
      );
      expect(
        element.shadowRoot.querySelectorAll(".site-actions button")
      ).toHaveLength(3);
      expect(element.shadowRoot.querySelector(".divider")).toBeNull();
    });

    it("has no motion button in the open phone menu, and the theme button still works there", async () => {
      const element = render();
      element.shadowRoot.querySelector(".menu-toggle").click();
      await flush();
      expect(
        element.shadowRoot
          .querySelector(".menu-toggle")
          .getAttribute("aria-expanded")
      ).toBe("true");
      expect(element.shadowRoot.querySelector(".motion-toggle")).toBeNull();
      expect(actionClasses(element)).toEqual([
        "nav-divider",
        "icon-button back-to-top",
        "icon-button theme-toggle",
        "icon-button menu-toggle"
      ]);
      element.shadowRoot.querySelector(".theme-toggle").click();
      await flush();
      expect(element.getAttribute("data-theme")).toBe("dark");
      expect(trackEvent).toHaveBeenCalledWith("theme_changed", {
        theme: "dark"
      });
    });

    it("follows a full motion system setting on the host only", () => {
      mockSystemMotion(false);
      const element = render();
      expect(element.getAttribute("data-motion")).toBe("full");
      expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    });

    it("follows a reduced motion system setting", () => {
      mockSystemMotion(true);
      const element = render();
      expect(element.getAttribute("data-motion")).toBe("reduce");
    });

    it("ignores a stored choice and removes it on load, leaving the theme choice", () => {
      mockSystemMotion(true);
      window.localStorage.setItem(MOTION_KEY, "full");
      window.localStorage.setItem(STORAGE_KEY, "dark");
      const element = render();
      expect(element.getAttribute("data-motion")).toBe("reduce");
      expect(window.localStorage.getItem(MOTION_KEY)).toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
      expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    });

    it("follows the system setting when it changes", async () => {
      const listeners = mockSystemMotion(false);
      const element = render();
      window.matchMedia.mockImplementation((query) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      }));
      listeners.forEach((fn) => fn({ matches: true }));
      await flush();
      expect(element.getAttribute("data-motion")).toBe("reduce");
    });

    it("never sends motion_toggled", async () => {
      mockSystemMotion(false);
      const element = render();
      element.shadowRoot.querySelector(".theme-toggle").click();
      element.shadowRoot.querySelector(".menu-toggle").click();
      await flush();
      const names = trackEvent.mock.calls.map((call) => call[0]);
      expect(names).toEqual(["theme_changed"]);
    });

    it("keeps working when localStorage throws on every call", () => {
      mockSystemMotion(true);
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
          getItem: () => {
            throw new Error("SecurityError");
          },
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
          removeItem: () => {
            throw new Error("SecurityError");
          }
        }
      });
      const element = render();
      expect(element.getAttribute("data-motion")).toBe("reduce");
    });

    it("stops listening for motion changes when removed", async () => {
      mockSystemMotion(false);
      const element = render();
      document.body.removeChild(element);
      document.dispatchEvent(
        new CustomEvent("portfolio-motion", {
          detail: { reduced: true }
        })
      );
      await flush();
      expect(element.getAttribute("data-motion")).toBe("full");
    });
  });

  describe("Work on the home page", () => {
    beforeEach(() => {
      window.scrollTo = jest.fn();
      window.scrollY = 0;
      goTo("/portfolio/");
    });

    // The case studies section sits inside a page component's shadow tree, and that component
    // is in the layout's content slot, as on the site.
    function caseStudies(top = 900) {
      const page = document.createElement("div");
      const root = page.attachShadow({ mode: "open" });
      const grid = document.createElement("div");
      const gridRoot = grid.attachShadow({ mode: "open" });
      const target = document.createElement("section");
      target.id = "case-studies";
      target.getBoundingClientRect = () => ({ top, bottom: top + 400 });
      gridRoot.appendChild(target);
      root.appendChild(grid);
      return { page, target };
    }

    it("finds the section through nested open shadow roots, by id or a suffixed id", () => {
      const { page, target } = caseStudies();
      expect(findInContent([page], idSelector("case-studies"))).toBe(target);
      expect(findInContent([page], idSelector("missing"))).toBeNull();
      target.id = "case-studies-12";
      expect(findInContent([page], idSelector("case-studies"))).toBe(target);
      expect(findInContent([target], "section")).toBe(target);
      expect(findInContent(null, "section")).toBeNull();
    });

    it("scrolls to the case studies under the header and moves focus there", async () => {
      const { page, target } = caseStudies(900);
      target.focus = jest.fn();
      const element = render([page]);
      element.shadowRoot.querySelector(".site-header").getBoundingClientRect =
        () => ({ height: 61 });
      const work = element.shadowRoot.querySelector(
        '.nav-link[data-key="work"]'
      );
      const click = new MouseEvent("click", {
        bubbles: true,
        cancelable: true
      });
      work.dispatchEvent(click);
      await flush();
      expect(click.defaultPrevented).toBe(true);
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 839,
        left: 0,
        behavior: "smooth"
      });
      expect(target.getAttribute("tabindex")).toBe("-1");
      expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(trackEvent).not.toHaveBeenCalled();
    });

    it("jumps without animation when reduced motion is asked for", async () => {
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      }));
      const element = render([caseStudies(500).page]);
      element.shadowRoot.querySelector('.nav-link[data-key="work"]').click();
      await flush();
      expect(window.scrollTo).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: "auto" })
      );
    });

    it("hands over to the grid's own reveal when it offers one", async () => {
      const { page, target } = caseStudies(900);
      target.revealHeading = jest.fn();
      const element = render([page]);
      element.shadowRoot.querySelector('.nav-link[data-key="work"]').click();
      await flush();
      expect(target.revealHeading).toHaveBeenCalledWith(false);
      expect(window.scrollTo).not.toHaveBeenCalled();
    });

    it("goes to the top when the page has no case studies", async () => {
      const element = render();
      element.shadowRoot.querySelector('.nav-link[data-key="work"]').click();
      await flush();
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "smooth"
      });
    });

    it("is a plain link to the home page from another page", async () => {
      goTo("/portfolio/resume");
      const element = render();
      const work = element.shadowRoot.querySelector(
        '.nav-link[data-key="work"]'
      );
      work.addEventListener("click", (event) => {
        // jsdom does not navigate. Record whether the layout stopped the link first.
        work.dataset.prevented = String(event.defaultPrevented);
        event.preventDefault();
      });
      work.click();
      await flush();
      expect(work.dataset.prevented).toBe("false");
      expect(window.scrollTo).not.toHaveBeenCalled();
    });

    it("closes the phone menu when followed", async () => {
      const element = render([caseStudies().page]);
      const menu = element.shadowRoot.querySelector(".menu-toggle");
      menu.click();
      await flush();
      element.shadowRoot.querySelector('.nav-link[data-key="work"]').click();
      await flush();
      expect(menu.getAttribute("aria-expanded")).toBe("false");
    });
  });

  describe("theme crossfade", () => {
    afterEach(() => {
      delete document.startViewTransition;
      delete document.getAnimations;
    });

    it("crossfades the change for 200 ms where the browser has view transitions", async () => {
      const timing = jest.fn();
      const other = jest.fn();
      document.getAnimations = () => [
        {
          effect: {
            pseudoElement: "::view-transition-new(root)",
            updateTiming: timing
          }
        },
        { effect: { pseudoElement: null, updateTiming: other } }
      ];
      document.startViewTransition = jest.fn((change) => {
        change();
        return { ready: Promise.resolve() };
      });
      const element = render();
      element.shadowRoot.querySelector(".theme-toggle").click();
      await flush();
      await flush();
      expect(document.startViewTransition).toHaveBeenCalledTimes(1);
      expect(element.getAttribute("data-theme")).toBe("dark");
      expect(THEME_FADE_MS).toBe(200);
      expect(timing).toHaveBeenCalledWith({ duration: 200 });
      expect(other).not.toHaveBeenCalled();
      expect(trackEvent).toHaveBeenCalledWith("theme_changed", {
        theme: "dark"
      });
    });

    it("changes the theme at once when motion is reduced", () => {
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      }));
      document.startViewTransition = jest.fn();
      const element = render();
      element.shadowRoot.querySelector(".theme-toggle").click();
      expect(document.startViewTransition).not.toHaveBeenCalled();
      expect(element.getAttribute("data-theme")).toBe("dark");
    });

    it("still changes the theme when the transition throws or is skipped", async () => {
      document.startViewTransition = jest.fn(() => {
        throw new Error("InvalidStateError");
      });
      const element = render();
      element.shadowRoot.querySelector(".theme-toggle").click();
      expect(element.getAttribute("data-theme")).toBe("dark");

      document.startViewTransition = jest.fn((change) => {
        change();
        return { ready: Promise.reject(new Error("AbortError")) };
      });
      element.shadowRoot.querySelector(".theme-toggle").click();
      await flush();
      expect(element.getAttribute("data-theme")).toBe("light");
    });
  });

  describe("Back to top in the header", () => {
    let frames;
    let hero;

    function scrollTo(y, height = 800) {
      window.innerHeight = height;
      window.scrollY = y;
      window.dispatchEvent(new CustomEvent("scroll"));
      frames.splice(0).forEach((callback) => callback());
      return flush();
    }

    function button(element) {
      return element.shadowRoot.querySelector('[data-id="back-to-top"]');
    }

    function shown(element) {
      return button(element).classList.contains("back-to-top_shown");
    }

    // A stand in for the home hero in the content slot, its bottom edge heroBottom px down
    // the page.
    function heroAt(heroBottom) {
      hero = document.createElement(HERO_SELECTOR);
      hero.getBoundingClientRect = () => ({
        bottom: heroBottom - (window.scrollY || 0)
      });
      // Connected, as the hero is on the site, so the layout keeps the one it found.
      document.body.appendChild(hero);
      return hero;
    }

    beforeEach(() => {
      frames = [];
      hero = null;
      window.requestAnimationFrame = jest.fn((callback) => {
        frames.push(callback);
        return frames.length;
      });
      window.scrollTo = jest.fn();
      mockSystemTheme(false);
    });

    afterEach(() => {
      delete window.requestAnimationFrame;
      window.scrollY = 0;
    });

    it("sits in the header actions, before the theme toggle, with a real label", () => {
      const element = render();
      const control = button(element);
      expect(control.tagName).toBe("BUTTON");
      expect(control.getAttribute("type")).toBe("button");
      expect(control.getAttribute("aria-label")).toBe("Back to top");
      expect(control.getAttribute("title")).toBe("Back to top");
      expect(control.closest(".site-actions")).not.toBeNull();
      expect(control.nextElementSibling).toBe(
        element.shadowRoot.querySelector(".theme-toggle")
      );
      expect(
        element.shadowRoot.querySelector('[data-id="floating-back-to-top"]')
      ).toBeNull();
    });

    it("keeps the header order: brand, links, divider, arrow, theme toggle, menu button", () => {
      const element = render();
      const root = element.shadowRoot;
      const bar = root.querySelector(".site-header__bar");
      const brand = root.querySelector(".site-brand");
      const nav = root.querySelector(".site-nav");
      const divider = root.querySelector('[data-id="nav-divider"]');
      const theme = root.querySelector(".theme-toggle");
      const menu = root.querySelector(".menu-toggle");
      expect(divider).not.toBeNull();
      expect([...bar.children]).toEqual([
        brand,
        nav,
        root.querySelector(".site-actions")
      ]);
      expect([...divider.parentElement.children]).toEqual([
        divider,
        button(element),
        theme,
        menu
      ]);
    });

    it("draws the divider as decoration that assistive technology skips", () => {
      const element = render();
      const divider = element.shadowRoot.querySelector(
        '[data-id="nav-divider"]'
      );
      expect(divider.tagName).toBe("SPAN");
      expect(divider.getAttribute("aria-hidden")).toBe("true");
      expect(divider.textContent).toBe("");
      expect(divider.hasAttribute("tabindex")).toBe(false);
    });

    it("marks the bar while the arrow shows, so the links slide back beside it", async () => {
      const element = render();
      const bar = element.shadowRoot.querySelector(".site-header__bar");
      expect(bar.classList.contains("site-header__bar_arrow-shown")).toBe(
        false
      );
      await scrollTo(800, 800);
      expect(shown(element)).toBe(true);
      expect(bar.classList.contains("site-header__bar_arrow-shown")).toBe(true);
      await scrollTo(0, 800);
      expect(bar.classList.contains("site-header__bar_arrow-shown")).toBe(
        false
      );
    });

    it("is hidden, out of the tab order and the accessibility tree, at the top", () => {
      const element = render();
      expect(shown(element)).toBe(false);
      expect(button(element).getAttribute("aria-hidden")).toBe("true");
      expect(button(element).getAttribute("tabindex")).toBe("-1");
    });

    it("appears after one screen height on a page with no hero", async () => {
      expect(BACK_TO_TOP_SCREENS).toBe(1);
      const element = render();
      await scrollTo(799, 800);
      expect(shown(element)).toBe(false);
      await scrollTo(800, 800);
      expect(shown(element)).toBe(true);
      expect(button(element).getAttribute("aria-hidden")).toBeNull();
      expect(button(element).getAttribute("tabindex")).toBe("0");
    });

    it("follows the screen height on a phone", async () => {
      const element = render();
      await scrollTo(843, 844);
      expect(shown(element)).toBe(false);
      await scrollTo(844, 844);
      expect(shown(element)).toBe(true);
    });

    it("appears once the page has scrolled past the hero, under the header", async () => {
      goTo("/portfolio/");
      const element = render([heroAt(1400)]);
      element.shadowRoot.querySelector(".site-header").getBoundingClientRect =
        () => ({ height: 60 });
      await scrollTo(1339, 800);
      expect(shown(element)).toBe(false);
      await scrollTo(1340, 800);
      expect(shown(element)).toBe(true);
    });

    it("uses one screen height when the hero is shorter than the header", async () => {
      const element = render([heroAt(40)]);
      element.shadowRoot.querySelector(".site-header").getBoundingClientRect =
        () => ({ height: 60 });
      await scrollTo(799, 800);
      expect(shown(element)).toBe(false);
      await scrollTo(800, 800);
      expect(shown(element)).toBe(true);
    });

    it("looks for a missing hero at most once a second, and again on a new route", async () => {
      expect(HERO_LOOKUP_MS).toBe(1000);
      let now = 5000;
      const clock = jest.spyOn(Date, "now").mockImplementation(() => now);
      const content = [];
      const element = render(content);
      const slot = element.shadowRoot.querySelector(".region-content slot");
      const assigned = jest.fn(() => content);
      slot.assignedElements = assigned;

      await scrollTo(100, 800);
      await scrollTo(200, 800);
      expect(assigned).toHaveBeenCalledTimes(1);

      // The hero renders later. It is found on the next look, a second on.
      content.push(heroAt(1400));
      now += 1000;
      await scrollTo(900, 800);
      expect(assigned).toHaveBeenCalledTimes(2);
      expect(shown(element)).toBe(false);

      // Found and connected, it is kept with no new look.
      await scrollTo(1500, 800);
      expect(assigned).toHaveBeenCalledTimes(2);
      expect(shown(element)).toBe(true);
      clock.mockRestore();
    });

    it("stays hidden when the viewport has no height", async () => {
      const element = render();
      await scrollTo(3000, 0);
      expect(shown(element)).toBe(false);
    });

    it("keeps its place in the header whether shown or not", async () => {
      const element = render();
      const before = button(element);
      await scrollTo(3000);
      expect(button(element)).toBe(before);
      await scrollTo(0);
      expect(button(element)).toBe(before);
    });

    it("sends back_to_top_used with no parameters when pressed", async () => {
      const element = render();
      await scrollTo(3000);
      button(element).click();
      await flush();
      expect(trackEvent).toHaveBeenCalledWith("back_to_top_used");
      expect(trackEvent.mock.calls.at(-1)).toHaveLength(1);
    });

    it("stays while it has focus, even when the page scrolls back up", async () => {
      const element = render();
      await scrollTo(3000);
      button(element).focus();
      await scrollTo(40);
      expect(shown(element)).toBe(true);

      button(element).blur();
      await flush();
      expect(shown(element)).toBe(false);
    });

    it("scrolls smoothly to the top and moves focus to the main content", async () => {
      const element = render();
      await scrollTo(3000);
      button(element).click();
      await flush();

      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "smooth"
      });
      const main = element.shadowRoot.querySelector('[data-id="main-content"]');
      expect(main.getAttribute("tabindex")).toBe("-1");
      expect(element.shadowRoot.activeElement).toBe(main);
      expect(shown(element)).toBe(false);
    });

    it("jumps without animation when reduced motion is asked for", async () => {
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      }));
      const element = render();
      await scrollTo(3000);
      button(element).click();

      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto"
      });
    });

    it("scrolls smoothly when a stored reduce is left from an earlier version", async () => {
      window.localStorage.setItem("portfolio-motion", "reduce");
      const element = render();
      await scrollTo(3000);
      button(element).click();
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "smooth"
      });
    });

    it("jumps without animation on a reduced system even with a stored full", async () => {
      window.matchMedia = jest.fn().mockImplementation((query) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      }));
      window.localStorage.setItem("portfolio-motion", "full");
      const element = render();
      await scrollTo(3000);
      button(element).click();
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto"
      });
    });

    it("no longer listens for the API reference, which it never overlaps now", () => {
      const add = jest.spyOn(document, "addEventListener");
      render();
      const types = add.mock.calls.map((call) => call[0]);
      expect(types).not.toContain("portfolio-reference");
    });

    it("stops listening to scroll when removed", () => {
      const remove = jest.spyOn(window, "removeEventListener");
      const element = render();
      document.body.removeChild(element);
      expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
      remove.mockRestore();
    });
  });

  describe("header shadow", () => {
    let frames;

    beforeEach(() => {
      frames = [];
      window.requestAnimationFrame = jest.fn((callback) => {
        frames.push(callback);
        return frames.length;
      });
    });

    afterEach(() => {
      delete window.requestAnimationFrame;
      window.scrollY = 0;
    });

    it("shows once content scrolls under the header and goes at the top", async () => {
      const element = render();
      const header = element.shadowRoot.querySelector("header");
      expect(header.className).toBe("site-header");

      window.innerHeight = 800;
      window.scrollY = 1;
      window.dispatchEvent(new CustomEvent("scroll"));
      frames.splice(0).forEach((callback) => callback());
      await flush();
      expect(header.classList.contains("site-header_raised")).toBe(true);

      window.scrollY = 0;
      window.dispatchEvent(new CustomEvent("scroll"));
      frames.splice(0).forEach((callback) => callback());
      await flush();
      expect(header.classList.contains("site-header_raised")).toBe(false);
    });

    it("reads the scroll once per frame", () => {
      render();
      window.dispatchEvent(new CustomEvent("scroll"));
      window.dispatchEvent(new CustomEvent("scroll"));
      window.dispatchEvent(new CustomEvent("resize"));
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    });
  });
});

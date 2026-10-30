/**
 * @description       : Unit tests for heroBanner LWC: the static hero (photo, name, meta line,
 *                      proof strip), the title line and the value sentence from the
 *                      ResumeController header wire, the start year from the timeline wire, the
 *                      two buttons, the profile links, the case studies button's scroll and
 *                      focus, the tour link that starts the tour at its first stop, and that the
 *                      pillars, Start here and the tour list are not in the hero.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { createElement } from "@lwc/engine-dom";
import HeroBanner from "c/heroBanner";
import getHeader from "@salesforce/apex/ResumeController.getHeader";
import getHomeCaseStudies from "@salesforce/apex/ProjectCardController.getHomeCaseStudies";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import { trackEvent } from "c/analyticsService";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/ResumeController.getHeader",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/ProjectCardController.getHomeCaseStudies",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/ResumeController.getTimeline",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    __esModule: true,
    trackEvent: jest.fn(),
    EVENTS: { TOUR_OPENED: "tour_opened" }
  }),
  { virtual: true }
);

const CASE = {
  key: "case-1",
  title: "Employer Hub",
  liveUrl: "/business-architecture"
};

const HEADER = {
  name: "Ryan Bumstead",
  title: "Salesforce Platform Architect",
  careerObjective: "  The long resume summary.  ",
  heroLine:
    "  Salesforce Platform Architect for higher education and nonprofits  ",
  valueSentence: "  I design Salesforce solutions and build them end to end.  ",
  linkedInUrl: "https://www.linkedin.com/in/example",
  gitHubUrl: "https://github.com/example"
};

function render() {
  const element = createElement("c-hero-banner", { is: HeroBanner });
  document.body.appendChild(element);
  return element;
}

function flush() {
  return Promise.resolve();
}

// The hero with one case study back from the read, so "See the case studies" shows.
async function renderWithCases() {
  const element = render();
  getHomeCaseStudies.emit([CASE]);
  await flush();
  return element;
}

function text(node) {
  return node.textContent.replace(/\s+/g, " ").trim();
}

function byId(element, id) {
  return element.shadowRoot.querySelector(`[data-id="${id}"]`);
}

describe("c-hero-banner", () => {
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
  });

  describe("static hero", () => {
    it("renders the name as the h1, the meta line and the photo without waiting on Apex", () => {
      const element = render();
      const root = element.shadowRoot;
      expect(root.querySelectorAll("h1")).toHaveLength(1);
      expect(text(root.querySelector("h1"))).toBe("Ryan Bumstead");
      expect(text(byId(element, "hero-meta"))).toBe(
        "Senior Solution Consultant at TELUS Digital · Greater Toledo, Ohio"
      );
      const photo = root.querySelector(".hero-photo");
      expect(photo.getAttribute("alt")).toBe("Ryan Bumstead");
      expect(photo.getAttribute("src")).toContain("Portfolio_Headshot");
      expect(photo.getAttribute("width")).toBe("132");
      expect(photo.getAttribute("height")).toBe("132");
    });

    it("shows the two proof points from the shared constant before any wire returns", () => {
      const element = render();
      const strip = byId(element, "proof-strip");
      expect(strip.tagName).toBe("UL");
      expect(strip.getAttribute("aria-label")).toBe("At a glance");
      expect(
        Array.from(strip.querySelectorAll("li")).map((item) => text(item))
      ).toEqual([
        "On Salesforce since 2017",
        "7 active Salesforce certifications"
      ]);
    });

    it("takes the start year from the timeline read, and keeps the fallback on an error", async () => {
      const element = render();
      getTimeline.emit({ work: [], salesforceStartYear: 2018 });
      await flush();
      const items = () =>
        Array.from(byId(element, "proof-strip").querySelectorAll("li")).map(
          (item) => text(item)
        );
      expect(items()).toEqual([
        "On Salesforce since 2018",
        "7 active Salesforce certifications"
      ]);
      getTimeline.error();
      await flush();
      expect(items()[0]).toBe("On Salesforce since 2017");
      getTimeline.emit({ work: [] });
      await flush();
      expect(items()[0]).toBe("On Salesforce since 2017");
    });

    it("never says Multi-Cloud Strategist or Technical Architect", async () => {
      const element = render();
      getHeader.emit(HEADER);
      await flush();
      const all = element.shadowRoot.textContent;
      expect(all).not.toMatch(/Multi-Cloud Strategist/i);
      expect(all).not.toMatch(/Technical Architect/i);
    });

    it("no longer holds Start here, the pillars, the tour list or numbered eyebrows", () => {
      const element = render();
      const root = element.shadowRoot;
      expect(byId(element, "start-paths")).toBeNull();
      expect(byId(element, "pillar-nav")).toBeNull();
      expect(byId(element, "tour")).toBeNull();
      expect(byId(element, "tour-button")).toBeNull();
      expect(root.querySelector(".section-label")).toBeNull();
      expect(root.querySelectorAll("h2")).toHaveLength(0);
    });
  });

  describe("header wire", () => {
    it("reads the header from getHeader, which takes no parameters", () => {
      render();
      expect(getHeader.getLastConfig()).toEqual({});
    });

    it("shows the title line and the value sentence trimmed, in order under the name", async () => {
      const element = render();
      expect(byId(element, "hero-line")).toBeNull();
      expect(byId(element, "hero-value")).toBeNull();
      getHeader.emit(HEADER);
      await flush();
      const line = byId(element, "hero-line");
      const value = byId(element, "hero-value");
      expect(text(line)).toBe(
        "Salesforce Platform Architect for higher education and nonprofits"
      );
      expect(text(value)).toBe(
        "I design Salesforce solutions and build them end to end."
      );
      const name = element.shadowRoot.querySelector("h1");
      // Each sits in a slot that holds its height before the read lands.
      expect(name.nextElementSibling).toBe(line.parentElement);
      expect(line.parentElement.nextElementSibling).toBe(value.parentElement);
      expect(value.parentElement.nextElementSibling).toBe(
        byId(element, "proof-strip")
      );
    });

    it("never shows the resume summary in the hero", async () => {
      const element = render();
      getHeader.emit(HEADER);
      await flush();
      expect(element.shadowRoot.textContent).not.toContain(
        "The long resume summary."
      );
      expect(element.shadowRoot.querySelector(".hero-bio")).toBeNull();
    });

    it("shows no title line and no value sentence when blank, not text, null or failed", async () => {
      const element = render();
      const none = () =>
        byId(element, "hero-line") === null &&
        byId(element, "hero-value") === null;
      getHeader.emit({ ...HEADER, heroLine: "   ", valueSentence: "" });
      await flush();
      expect(none()).toBe(true);

      getHeader.emit({ ...HEADER, heroLine: 42, valueSentence: {} });
      await flush();
      expect(none()).toBe(true);

      getHeader.emit(null);
      await flush();
      expect(none()).toBe(true);

      getHeader.error();
      await flush();
      expect(none()).toBe(true);
      expect(text(element.shadowRoot.querySelector("h1"))).toBe(
        "Ryan Bumstead"
      );
      expect(byId(element, "proof-strip")).not.toBeNull();
    });

    it("shows the value sentence alone when the title line is blank", async () => {
      const element = render();
      getHeader.emit({ ...HEADER, heroLine: null });
      await flush();
      expect(byId(element, "hero-line")).toBeNull();
      expect(
        byId(element, "hero-value").parentElement.previousElementSibling
          .previousElementSibling
      ).toBe(element.shadowRoot.querySelector("h1"));
    });

    it("keeps the title line and value slots in place, empty, before the header lands", () => {
      const element = render();
      const lineSlot = element.shadowRoot.querySelector(".hero-line-slot");
      const valueSlot = element.shadowRoot.querySelector(".hero-value-slot");
      expect(lineSlot.children).toHaveLength(0);
      expect(valueSlot.children).toHaveLength(0);
      expect(byId(element, "hero-line")).toBeNull();
      expect(byId(element, "hero-value")).toBeNull();
    });
  });

  describe("buttons and profile links", () => {
    it("offers See the case studies first and View the resume second, with their classes", async () => {
      const element = await renderWithCases();
      const actions = element.shadowRoot.querySelectorAll(".hero-actions a");
      expect(Array.from(actions).map((a) => text(a))).toEqual([
        "See the case studies ↓",
        "View the resume →"
      ]);
      expect(actions[0].getAttribute("href")).toBe("/portfolio/#case-studies");
      expect(actions[0].classList.contains("btn-primary")).toBe(true);
      expect(actions[1].getAttribute("href")).toBe("/portfolio/resume");
      expect(actions[1].classList.contains("btn-ghost")).toBe(true);
    });

    it("shows Resume and API docs links before the wire, and GitHub and LinkedIn once it returns", async () => {
      const element = render();
      const keys = () =>
        Array.from(element.shadowRoot.querySelectorAll(".profile-link")).map(
          (a) => a.dataset.key
        );
      expect(keys()).toEqual(["resume", "api-docs"]);

      getHeader.emit(HEADER);
      await flush();
      expect(keys()).toEqual(["github", "linkedin", "resume", "api-docs"]);

      const links = element.shadowRoot.querySelectorAll(".profile-link");
      expect(links[0].getAttribute("href")).toBe(HEADER.gitHubUrl);
      expect(links[0].getAttribute("target")).toBe("_blank");
      expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
      expect(links[1].getAttribute("href")).toBe(HEADER.linkedInUrl);
      expect(links[2].getAttribute("href")).toBe("/portfolio/resume");
      expect(links[2].hasAttribute("target")).toBe(false);
      expect(links[3].getAttribute("href")).toBe(
        "/portfolio/api-lab/reference"
      );
    });

    it("makes a stored URL with no scheme an absolute https link, and drops an unsafe one", async () => {
      const element = render();
      getHeader.emit({
        ...HEADER,
        linkedInUrl: "www.linkedin.com/in/ryanbumstead",
        // The script URL is the input under test, proving it never renders as a link.
        // eslint-disable-next-line no-script-url
        gitHubUrl: "javascript:alert(1)"
      });
      await flush();

      const links = Array.from(
        element.shadowRoot.querySelectorAll(".profile-link")
      );
      expect(links.map((a) => a.dataset.key)).toEqual([
        "linkedin",
        "resume",
        "api-docs"
      ]);
      expect(links[0].getAttribute("href")).toBe(
        "https://www.linkedin.com/in/ryanbumstead"
      );
    });

    it("adds Trailhead after LinkedIn from the stored profile URL, in a new tab", async () => {
      const element = render();
      getHeader.emit({
        ...HEADER,
        trailheadUrl: " https://www.salesforce.com/trailblazer/example "
      });
      await flush();
      const links = Array.from(
        element.shadowRoot.querySelectorAll(".profile-link")
      );
      expect(links.map((a) => a.dataset.key)).toEqual([
        "github",
        "linkedin",
        "trailhead",
        "resume",
        "api-docs"
      ]);
      const trailhead = links[2];
      expect(text(trailhead)).toBe("Trailhead");
      expect(trailhead.getAttribute("href")).toBe(
        "https://www.salesforce.com/trailblazer/example"
      );
      expect(trailhead.getAttribute("target")).toBe("_blank");
      expect(trailhead.getAttribute("rel")).toBe("noopener noreferrer");
      expect(trailhead.querySelector("svg").getAttribute("aria-hidden")).toBe(
        "true"
      );
    });

    it("shows no Trailhead link when the URL is missing or unsafe, and fixes a bare domain", async () => {
      const element = render();
      const keys = () =>
        Array.from(element.shadowRoot.querySelectorAll(".profile-link")).map(
          (a) => a.dataset.key
        );
      getHeader.emit(HEADER);
      await flush();
      expect(keys()).not.toContain("trailhead");
      // The script URL is the input under test, proving it never renders as a link.
      // eslint-disable-next-line no-script-url
      getHeader.emit({ ...HEADER, trailheadUrl: "javascript:alert(1)" });
      await flush();
      expect(keys()).not.toContain("trailhead");
      getHeader.emit({
        ...HEADER,
        trailheadUrl: "www.salesforce.com/trailblazer/example"
      });
      await flush();
      expect(
        element.shadowRoot
          .querySelector('.profile-link[data-key="trailhead"]')
          .getAttribute("href")
      ).toBe("https://www.salesforce.com/trailblazer/example");
    });
  });

  describe("case studies button shows only with a case study", () => {
    function caseButton(element) {
      return byId(element, "case-studies-button");
    }

    function actionKeys(element) {
      return Array.from(
        element.shadowRoot.querySelectorAll(".hero-actions a")
      ).map((a) => a.dataset.id);
    }

    it("reads getHomeCaseStudies, which takes no parameters, so it shares the grid's cache", () => {
      render();
      expect(getHomeCaseStudies.getLastConfig()).toEqual({});
    });

    it("shows only View the resume before the read returns", () => {
      const element = render();
      expect(caseButton(element)).toBeNull();
      expect(actionKeys(element)).toEqual(["resume-button"]);
    });

    it("shows only View the resume when there are no case studies", async () => {
      const element = render();
      getHomeCaseStudies.emit([]);
      await flush();
      expect(caseButton(element)).toBeNull();
      expect(actionKeys(element)).toEqual(["resume-button"]);
    });

    it("shows only View the resume when the read fails or no card has a title", async () => {
      const element = render();
      getHomeCaseStudies.error();
      await flush();
      expect(caseButton(element)).toBeNull();
      getHomeCaseStudies.emit([{ key: "a", title: "   " }, null]);
      await flush();
      expect(caseButton(element)).toBeNull();
    });

    it("shows only View the resume when no card has a link the grid would show", async () => {
      const element = render();
      getHomeCaseStudies.emit([
        { key: "a", title: "No link" },
        // eslint-disable-next-line no-script-url
        { key: "b", title: "Unsafe", liveUrl: "javascript:alert(1)" }
      ]);
      await flush();
      expect(caseButton(element)).toBeNull();
    });

    it("shows See the case studies first once one card comes back", async () => {
      const element = render();
      getHomeCaseStudies.emit([CASE]);
      await flush();
      expect(caseButton(element)).not.toBeNull();
      expect(actionKeys(element)).toEqual([
        "case-studies-button",
        "resume-button"
      ]);
      getHomeCaseStudies.emit([]);
      await flush();
      expect(caseButton(element)).toBeNull();
    });
  });

  describe("case studies button", () => {
    function addSection(parent) {
      const section = document.createElement("div");
      section.id = "case-studies";
      section.revealHeading = jest.fn(() => true);
      parent.appendChild(section);
      return section;
    }

    function click(element) {
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true
      });
      byId(element, "case-studies-button").dispatchEvent(event);
      return event;
    }

    it("asks the case study section to reveal its heading, smoothly by default", async () => {
      systemReduces(false);
      const section = addSection(document.body);
      const element = await renderWithCases();
      const event = click(element);
      expect(section.revealHeading).toHaveBeenCalledWith(false);
      expect(event.defaultPrevented).toBe(true);
    });

    it("asks for no smooth scroll when the system reduces motion", async () => {
      systemReduces(true);
      const section = addSection(document.body);
      const element = await renderWithCases();
      click(element);
      expect(section.revealHeading).toHaveBeenCalledWith(true);
    });

    it("finds the section inside another component's shadow root", async () => {
      systemReduces(false);
      const host = document.createElement("div");
      document.body.appendChild(host);
      const section = addSection(host.attachShadow({ mode: "open" }));
      const element = await renderWithCases();
      click(element);
      expect(section.revealHeading).toHaveBeenCalledTimes(1);
    });

    it("follows the home page #case-studies address when no section is on the page", async () => {
      const element = await renderWithCases();
      const event = click(element);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe("tour link", () => {
    function click(element) {
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true
      });
      byId(element, "tour-link").dispatchEvent(event);
      return event;
    }

    afterEach(() => {
      window.sessionStorage.clear();
    });

    it("is a quiet link under the buttons to the first stop, with the tour minutes", () => {
      const element = render();
      const link = byId(element, "tour-link");
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe(
        "/portfolio/business-architecture"
      );
      expect(text(link)).toBe("Have 10 minutes? Take the guided tour →");
      expect(link.querySelector('[aria-hidden="true"]').textContent).toBe("→");
      const actions = element.shadowRoot.querySelector(".hero-actions");
      expect(actions.contains(link)).toBe(false);
      expect(
        actions.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    it("starts the tour and lets the link go to the first stop, sending no tour_opened", () => {
      const started = jest.fn();
      document.addEventListener("portfolio-tour-start", started);
      const element = render();
      const event = click(element);
      document.removeEventListener("portfolio-tour-start", started);
      expect(window.sessionStorage.getItem("portfolio-tour")).toBe("1");
      expect(started).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(false);
      expect(trackEvent).not.toHaveBeenCalled();
    });

    it("still follows the link when storage is blocked", () => {
      const setItem = jest
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("blocked");
        });
      const element = render();
      const event = click(element);
      setItem.mockRestore();
      expect(event.defaultPrevented).toBe(false);
      expect(window.sessionStorage.getItem("portfolio-tour")).toBeNull();
    });
  });
});

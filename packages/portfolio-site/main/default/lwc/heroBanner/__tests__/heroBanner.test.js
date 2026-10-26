/**
 * @description       : Unit tests for heroBanner LWC: the static hero (photo, name, meta line,
 *                      proof strip), the title line and the value sentence from the
 *                      ResumeController header wire, the two buttons, the profile links, the
 *                      case studies button's scroll and focus, and that the pillars, Start here
 *                      and the tour are no longer in the hero.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { createElement } from "@lwc/engine-dom";
import HeroBanner from "c/heroBanner";
import getHeader from "@salesforce/apex/ResumeController.getHeader";

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

    it("never says Multi-Cloud Strategist or Technical Architect", async () => {
      const element = render();
      getHeader.emit(HEADER);
      await flush();
      const all = element.shadowRoot.textContent;
      expect(all).not.toMatch(/Multi-Cloud Strategist/i);
      expect(all).not.toMatch(/Technical Architect/i);
    });

    it("no longer holds Start here, the pillars, the tour or numbered eyebrows", () => {
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
      expect(name.nextElementSibling).toBe(line);
      expect(line.nextElementSibling).toBe(value);
      expect(value.nextElementSibling).toBe(byId(element, "proof-strip"));
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
      expect(element.shadowRoot.querySelector("h1").nextElementSibling).toBe(
        byId(element, "hero-value")
      );
    });
  });

  describe("buttons and profile links", () => {
    it("offers See the case studies first and View the resume second, with their classes", () => {
      const element = render();
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

    it("asks the case study section to reveal its heading, smoothly by default", () => {
      systemReduces(false);
      const section = addSection(document.body);
      const element = render();
      const event = click(element);
      expect(section.revealHeading).toHaveBeenCalledWith(false);
      expect(event.defaultPrevented).toBe(true);
    });

    it("asks for no smooth scroll when the system reduces motion", () => {
      systemReduces(true);
      const section = addSection(document.body);
      const element = render();
      click(element);
      expect(section.revealHeading).toHaveBeenCalledWith(true);
    });

    it("finds the section inside another component's shadow root", () => {
      systemReduces(false);
      const host = document.createElement("div");
      document.body.appendChild(host);
      const section = addSection(host.attachShadow({ mode: "open" }));
      const element = render();
      click(element);
      expect(section.revealHeading).toHaveBeenCalledTimes(1);
    });

    it("follows the home page #case-studies address when no section is on the page", () => {
      const element = render();
      const event = click(element);
      expect(event.defaultPrevented).toBe(false);
    });
  });
});

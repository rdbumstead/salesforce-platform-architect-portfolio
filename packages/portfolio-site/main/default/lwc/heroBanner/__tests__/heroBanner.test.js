/**
 * @description       : Unit tests for heroBanner LWC: the static hero, the bio and profile links
 *                      from the ResumeController header wire, the live pillar cards with the
 *                      "coming" line, and the tour (Round 4 plan WS4b, logs 155 and 164).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { createElement } from "@lwc/engine-dom";
import HeroBanner from "c/heroBanner";
import getResume from "@salesforce/apex/ResumeController.getResume";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/ResumeController.getResume",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

const HEADER = {
  name: "Ryan Bumstead",
  title: "Salesforce Platform Architect",
  careerObjective: "  I design Salesforce platforms that stay simple to run.  ",
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

describe("c-hero-banner", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  describe("hero", () => {
    it("renders the name, title, location and photo without waiting on Apex", () => {
      const element = render();
      const root = element.shadowRoot;
      expect(text(root.querySelector("h1"))).toBe("Ryan Bumstead");
      expect(text(root.querySelector(".hero-meta"))).toBe(
        "Salesforce Platform Architect · Greater Toledo, Ohio"
      );
      const photo = root.querySelector(".hero-photo");
      expect(photo.getAttribute("alt")).toBe("Ryan Bumstead");
      expect(photo.getAttribute("src")).toContain("Portfolio_Headshot");
    });

    it("never says Multi-Cloud Strategist or Technical Architect", async () => {
      const element = render();
      getResume.emit({ header: HEADER });
      await flush();
      const all = element.shadowRoot.textContent;
      expect(all).not.toMatch(/Multi-Cloud Strategist/i);
      expect(all).not.toMatch(/Technical Architect/i);
    });

    it("asks for the Architect persona so the resume page reuses the cached response", () => {
      render();
      expect(getResume.getLastConfig()).toEqual({ persona: "Architect" });
    });

    it("renders the bio from the header, trimmed", async () => {
      const element = render();
      expect(element.shadowRoot.querySelector(".hero-bio")).toBeNull();
      getResume.emit({ header: HEADER });
      await flush();
      expect(text(element.shadowRoot.querySelector(".hero-bio"))).toBe(
        "I design Salesforce platforms that stay simple to run."
      );
    });

    it("renders no bio and no placeholder when the bio is blank, the header is null or the wire fails", async () => {
      const element = render();
      getResume.emit({ header: { ...HEADER, careerObjective: "   " } });
      await flush();
      expect(element.shadowRoot.querySelector(".hero-bio")).toBeNull();

      getResume.emit({ header: null });
      await flush();
      expect(element.shadowRoot.querySelector(".hero-bio")).toBeNull();

      getResume.error();
      await flush();
      expect(element.shadowRoot.querySelector(".hero-bio")).toBeNull();
      expect(text(element.shadowRoot.querySelector("h1"))).toBe(
        "Ryan Bumstead"
      );
    });

    it("links straight to the resume from the hero", () => {
      const element = render();
      const resume = element.shadowRoot.querySelector(
        '[data-id="resume-button"]'
      );
      expect(resume.getAttribute("href")).toBe("/portfolio/resume");
      expect(text(resume)).toBe("View the resume →");
    });

    it("shows Resume and API docs links before the wire, and GitHub and LinkedIn once it returns", async () => {
      const element = render();
      const keys = () =>
        Array.from(element.shadowRoot.querySelectorAll(".profile-link")).map(
          (a) => a.dataset.key
        );
      expect(keys()).toEqual(["resume", "api-docs"]);

      getResume.emit({ header: HEADER });
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
  });

  describe("pillars", () => {
    it("shows cards for C, D and E only, in order, with K7 links", () => {
      const element = render();
      const cards = element.shadowRoot.querySelectorAll(".pillar-card");
      expect(Array.from(cards).map((card) => card.dataset.key)).toEqual([
        "api-lab",
        "ai-lab",
        "delivery"
      ]);
      const first = cards[0];
      expect(text(first.querySelector(".pillar-eyebrow"))).toBe(
        "Pillar C · API Lab"
      );
      expect(text(first.querySelector(".pillar-name"))).toBe(
        "Work Experience Verification API"
      );
      expect(first.querySelector(".pillar-link").getAttribute("href")).toBe(
        "/portfolio/api-lab"
      );
      expect(text(first.querySelector(".pillar-link"))).toBe("Open API Lab →");
      expect(
        Array.from(first.querySelectorAll(".tag")).map((tag) => text(tag))
      ).toEqual(["Apex REST", "OAuth 2.0", "OpenAPI"]);
      expect(text(first.querySelector(".pillar-code"))).toBe(
        "GET /sapi/v1/health 200"
      );
      expect(cards[1].querySelector(".pillar-code")).toBeNull();
    });

    it("has no being built card and says once that A and B are coming", () => {
      const element = render();
      const root = element.shadowRoot;
      expect(root.textContent).not.toMatch(/being built/i);
      expect(
        root.querySelector('[data-key="business-architecture"]')
      ).toBeNull();
      expect(root.querySelector('[data-key="nonprofit-solutions"]')).toBeNull();
      expect(text(root.querySelector('[data-id="coming-note"]'))).toBe(
        "Pillars A and B, Business Architecture and Pre-Sales Consultancy, are coming."
      );
    });

    it("labels the sections in the mockup's numbered style", () => {
      const element = render();
      const labels = Array.from(
        element.shadowRoot.querySelectorAll(".section-label")
      ).map((label) => text(label));
      expect(labels).toEqual(["01 / THE PILLARS", "02 / HOW TO EVALUATE ME"]);
    });
  });

  describe("tour", () => {
    it("lists one stop per live pillar and no stop for A or B", () => {
      const element = render();
      const steps = element.shadowRoot.querySelectorAll(".tour-step");
      expect(steps).toHaveLength(3);
      expect(
        Array.from(steps).map((step) => [
          text(step.querySelector(".tour-number")),
          text(step.querySelector(".tour-link")),
          step.querySelector(".tour-link").getAttribute("href"),
          text(step.querySelector(".tour-duration"))
        ])
      ).toEqual([
        ["01", "API Lab", "/portfolio/api-lab", "1 minute"],
        ["02", "AI Lab", "/portfolio/ai-lab", "1 minute"],
        ["03", "Delivery", "/portfolio/delivery", "1 minute"]
      ]);
    });

    it("counts the tour length from the stops", () => {
      const element = render();
      const root = element.shadowRoot;
      expect(text(root.querySelector('[data-id="tour-button"]'))).toBe(
        "Take the 3 minute tour ↓"
      );
      expect(text(root.querySelector('[data-id="tour-heading"]'))).toBe(
        "A 3 minute tour."
      );
    });

    it("moves focus to the tour heading from the hero button and the tour card", async () => {
      const element = render();
      const root = element.shadowRoot;
      const heading = root.querySelector('[data-id="tour-heading"]');
      heading.scrollIntoView = jest.fn();

      root.querySelector('[data-id="tour-button"]').click();
      await flush();
      expect(heading.scrollIntoView).toHaveBeenCalledTimes(1);
      expect(root.activeElement).toBe(heading);

      heading.blur();
      root.querySelector('[data-id="tour-card"]').click();
      await flush();
      expect(heading.scrollIntoView).toHaveBeenCalledTimes(2);
      expect(root.activeElement).toBe(heading);
    });
  });
});

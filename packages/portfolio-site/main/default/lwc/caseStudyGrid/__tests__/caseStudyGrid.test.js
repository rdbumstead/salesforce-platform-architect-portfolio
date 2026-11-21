/**
 * @description       : Unit tests for caseStudyGrid: the heading and intro, four featured cards and
 *                      the More work rows in order, the labelled lines (Outcome, My part,
 *                      Context, Decision) each left out when blank, the picture slot only on a
 *                      featured card with a figure key, no status pill, a card with no safe
 *                      link hidden, at most eight cards, the case_study_link_followed event
 *                      with position, total and tier, the case_studies_seen event once, nothing
 *                      at all on an empty or failed read, and the case-studies anchor with its
 *                      scroll and focus.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { createElement } from "@lwc/engine-dom";
import CaseStudyGrid, { isShownCase } from "c/caseStudyGrid";
import getHomeCaseStudies from "@salesforce/apex/ProjectCardController.getHomeCaseStudies";
import { trackEvent } from "c/analyticsService";

jest.mock(
  "@salesforce/apex/ProjectCardController.getHomeCaseStudies",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    __esModule: true,
    trackEvent: jest.fn(),
    EVENTS: {
      CASE_STUDY_LINK_FOLLOWED: "case_study_link_followed",
      CASE_STUDIES_SEEN: "case_studies_seen"
    }
  }),
  { virtual: true }
);

const CARDS = [
  {
    key: "b",
    title: "  Choosing the right platform for a literacy nonprofit  ",
    clientLine: "Adult literacy nonprofit · freelance",
    headlineMetric: "$0",
    headlineLabel: "software licence cost for 10 staff users",
    challenge: "  A small staff needed one system.  ",
    solution: "Chose donated licences.",
    businessValue: "Ten staff users on donated licences.",
    liveUrl: "https://ryanbumstead.com/nonprofit-solutions",
    tags: ["NPSP", " Platform selection ", "", "Cost"],
    myPart: "  Test my part  ",
    contextLine: "Test context",
    decisionLine: "Test decision",
    figureKey: "literacy-platform"
  },
  {
    key: "a",
    title: "An employer hub for an education provider",
    clientLine: null,
    headlineMetric: "9 objects",
    headlineLabel: null,
    challenge: "Partners had no single front door.",
    solution: null,
    businessValue: "One home per partner.",
    liveUrl: "/business-architecture",
    tags: []
  },
  {
    key: "e",
    title: "Building this site as a production org",
    clientLine: "Personal project · open source",
    headlineMetric: "1000 Apex tests",
    headlineLabel: "passing at the last successful deploy",
    challenge: "A resume gives a reviewer nothing to check.",
    solution: "This site is its own delivery evidence.",
    businessValue: "The numbers change when the pipeline does.",
    liveUrl: "/delivery",
    tags: null
  }
];

// The script URL is the input under test, proving a card with no safe link never shows.
const UNSAFE = {
  key: "u",
  title: "A card with an unsafe link",
  // eslint-disable-next-line no-script-url
  liveUrl: "javascript:alert(1)"
};

function projects(count) {
  return Array.from({ length: count }, (_, i) => ({
    key: `k${i}`,
    title: `Project ${i + 1}`,
    liveUrl: "/delivery"
  }));
}

function render() {
  const element = createElement("c-case-study-grid", { is: CaseStudyGrid });
  document.body.appendChild(element);
  return element;
}

function flush() {
  return Promise.resolve();
}

function text(node) {
  return node.textContent.replace(/\s+/g, " ").trim();
}

function cards(element) {
  return Array.from(element.shadowRoot.querySelectorAll('[data-id="card"]'));
}

describe("c-case-study-grid", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    window.matchMedia = originalMatchMedia;
    window.location.hash = "";
    jest.clearAllMocks();
  });

  it("reads getHomeCaseStudies, which takes no parameters", () => {
    render();
    expect(getHomeCaseStudies.getLastConfig()).toEqual({});
  });

  it("renders nothing and no anchor before the read, on empty, null or an error", async () => {
    const element = render();
    const empty = () =>
      element.shadowRoot.querySelector("section") === null &&
      !element.hasAttribute("id");
    expect(empty()).toBe(true);

    getHomeCaseStudies.emit([]);
    await flush();
    expect(empty()).toBe(true);

    getHomeCaseStudies.emit(CARDS);
    await flush();
    expect(empty()).toBe(false);
    expect(element.getAttribute("id")).toBe("case-studies");

    getHomeCaseStudies.emit(null);
    await flush();
    expect(empty()).toBe(true);

    getHomeCaseStudies.emit(CARDS);
    await flush();
    getHomeCaseStudies.error();
    await flush();
    expect(empty()).toBe(true);
  });

  it("shows the heading and intro once, then the cards in the order sent", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const root = element.shadowRoot;
    expect(text(root.querySelector("h2"))).toBe("Case studies");
    expect(text(root.querySelector(".section-intro"))).toBe(
      "Client work first, then the tools I built and run myself."
    );
    expect(
      cards(element).map((card) => text(card.querySelector("h3, h4")))
    ).toEqual([
      "Choosing the right platform for a literacy nonprofit",
      "An employer hub for an education provider",
      "Building this site as a production org"
    ]);
  });

  it("shows at most eight cards, four featured and the rest as More work rows, and drops a row with no title", async () => {
    const element = render();
    getHomeCaseStudies.emit([{ key: "x", title: "  " }, ...projects(10)]);
    await flush();
    expect(cards(element)).toHaveLength(8);
    const root = element.shadowRoot;
    expect(root.querySelectorAll('[data-tier="featured"]')).toHaveLength(4);
    expect(root.querySelectorAll('[data-tier="more"]')).toHaveLength(4);
    expect(text(root.querySelector('[data-id="more-heading"]'))).toBe(
      "More work"
    );
    expect(text(cards(element)[0].querySelector("h3"))).toBe("Project 1");
    expect(text(cards(element)[7].querySelector("h4"))).toBe("Project 8");
  });

  it("splits 3, 4, 5 and 8 projects into the right tiers", async () => {
    const element = render();
    for (const [count, featured, more] of [
      [3, 3, 0],
      [4, 4, 0],
      [5, 4, 1],
      [8, 4, 4]
    ]) {
      getHomeCaseStudies.emit(projects(count));
      await flush();
      const root = element.shadowRoot;
      expect(root.querySelectorAll('[data-tier="featured"]')).toHaveLength(
        featured
      );
      expect(root.querySelectorAll('[data-tier="more"]')).toHaveLength(more);
      expect(root.querySelector('[data-id="more-heading"]') !== null).toBe(
        more > 0
      );
    }
  });

  it("names the project first: title, then client line, then the Outcome, then My part", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const [first] = cards(element);
    const order = [
      ".card-title",
      '[data-id="client"]',
      '[data-id="metric"]',
      '[data-id="my-part"]'
    ].map((selector) => first.querySelector(selector));
    order.forEach((node) => expect(node).not.toBeNull());
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  it("labels the outcome and shows the number only with its label, and the client line only when set", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const [first, second, third] = cards(element);
    expect(text(first.querySelector('[data-id="metric"]'))).toBe(
      "Outcome $0 software licence cost for 10 staff users"
    );
    expect(second.querySelector('[data-id="metric"]')).toBeNull();
    expect(text(third.querySelector('[data-id="metric"]'))).toBe(
      "Outcome 1000 Apex tests passing at the last successful deploy"
    );
    expect(text(first.querySelector('[data-id="client"]'))).toBe(
      "Adult literacy nonprofit · freelance"
    );
    expect(second.querySelector('[data-id="client"]')).toBeNull();
  });

  it("shows My part, Context and Decision with their labels, trimmed, and leaves a blank line out", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const [first, second] = cards(element);
    expect(text(first.querySelector('[data-id="my-part"]'))).toBe(
      "My part Test my part"
    );
    expect(text(first.querySelector('[data-id="context"]'))).toBe(
      "Context Test context"
    );
    expect(text(first.querySelector('[data-id="decision"]'))).toBe(
      "Decision Test decision"
    );
    ["my-part", "context", "decision"].forEach((id) => {
      expect(second.querySelector(`[data-id="${id}"]`)).toBeNull();
    });
    expect(text(second)).not.toMatch(/null|undefined|My part|Context/);
  });

  it("draws the picture only on a featured card with a figure key", async () => {
    const element = render();
    getHomeCaseStudies.emit(
      projects(5).map((row, i) => ({
        ...row,
        figureKey: i === 1 ? null : "site-org"
      }))
    );
    await flush();
    const slots = element.shadowRoot.querySelectorAll('[data-id="figure"]');
    expect(slots).toHaveLength(3);
    slots.forEach((slot) => {
      expect(slot.classList.contains("card-figure")).toBe(true);
      expect(slot.dataset.figureKey).toBe("site-org");
      const figure = slot.querySelector("c-case-study-figure");
      expect(figure).not.toBeNull();
      expect(figure.figureKey).toBe("site-org");
    });
    const more = element.shadowRoot.querySelector('[data-tier="more"]');
    expect(more.querySelector('[data-id="figure"]')).toBeNull();
  });

  it("shows the number, title, My part and link on a More work row, with no Context, Decision or picture", async () => {
    const element = render();
    getHomeCaseStudies.emit(
      projects(5).map((row) => ({
        ...row,
        headlineMetric: "4 providers",
        headlineLabel: "in the chain",
        myPart: "Test my part",
        contextLine: "Test context",
        decisionLine: "Test decision",
        figureKey: "glassops"
      }))
    );
    await flush();
    const row = element.shadowRoot.querySelector('[data-tier="more"]');
    expect(text(row.querySelector('[data-id="metric"]'))).toBe(
      "4 providers in the chain"
    );
    expect(text(row.querySelector("h4"))).toBe("Project 5");
    expect(text(row.querySelector('[data-id="my-part"]'))).toBe(
      "My part Test my part"
    );
    expect(row.querySelector('[data-id="context"]')).toBeNull();
    expect(row.querySelector('[data-id="decision"]')).toBeNull();
    expect(row.querySelector('[data-id="figure"]')).toBeNull();
    expect(row.querySelectorAll("a")).toHaveLength(1);
  });

  it("shows no blocks, no topic chips, no status pill and one link on a card", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    cards(element).forEach((card) => {
      expect(card.querySelector("dl")).toBeNull();
      expect(card.querySelector(".tags")).toBeNull();
      expect(card.querySelectorAll("a")).toHaveLength(1);
      expect(card.querySelector(".status")).toBeNull();
      expect(text(card)).not.toMatch(/Live – Demo|Active Development/);
    });
  });

  it("hides a card with no link or an unsafe one, and shows nothing when none can show", async () => {
    const element = render();
    getHomeCaseStudies.emit([UNSAFE, { key: "n", title: "No link" }, ...CARDS]);
    await flush();
    expect(cards(element)).toHaveLength(3);
    expect(text(cards(element)[0].querySelector("h3"))).toBe(
      "Choosing the right platform for a literacy nonprofit"
    );
    getHomeCaseStudies.emit([UNSAFE]);
    await flush();
    expect(element.shadowRoot.querySelector("section")).toBeNull();
    expect(element.hasAttribute("id")).toBe(false);
  });

  it("decides which rows can show by a title and a safe link", () => {
    expect(isShownCase(CARDS[0])).toBe(true);
    expect(isShownCase(CARDS[1])).toBe(true);
    expect(isShownCase(UNSAFE)).toBe(false);
    expect(isShownCase({ title: "x" })).toBe(false);
    expect(isShownCase({ title: " ", liveUrl: "/docs" })).toBe(false);
    expect(isShownCase(null)).toBe(false);
  });

  it("gives each card one Read the case study link, to an https address or a site path", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const [first, second, third] = cards(element);
    const link = first.querySelector('[data-id="card-button"]');
    expect(link.getAttribute("href")).toBe(
      "https://ryanbumstead.com/nonprofit-solutions"
    );
    expect(text(link)).toBe("Read the case study →");
    expect(link.getAttribute("aria-label")).toBe(
      "Read the case study: Choosing the right platform for a literacy nonprofit"
    );
    expect(
      second.querySelector('[data-id="card-button"]').getAttribute("href")
    ).toBe("/portfolio/business-architecture");
    expect(
      third.querySelector('[data-id="card-button"]').getAttribute("href")
    ).toBe("/portfolio/delivery");
  });

  it("draws each card link as a plain text link, so the section holds no buttons", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const links = Array.from(
      element.shadowRoot.querySelectorAll('[data-id="card-button"]')
    );
    expect(links).toHaveLength(3);
    links.forEach((link) => {
      expect(link.classList.contains("card-link")).toBe(true);
      expect(link.classList.contains("nc-button")).toBe(false);
    });
    expect(element.shadowRoot.querySelectorAll(".nc-button")).toHaveLength(0);
  });

  it("sends case_study_link_followed with the title, position, total and featured tier", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const link = cards(element)[1].querySelector('[data-id="card-button"]');
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("case_study_link_followed", {
      name: "An employer hub for an education provider",
      position: 2,
      total: 3,
      tier: "featured"
    });
  });

  it("sends the more tier for a row after the fourth", async () => {
    const element = render();
    getHomeCaseStudies.emit(projects(6));
    await flush();
    const link = cards(element)[4].querySelector('[data-id="card-button"]');
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();
    expect(trackEvent).toHaveBeenCalledWith("case_study_link_followed", {
      name: "Project 5",
      position: 5,
      total: 6,
      tier: "more"
    });
  });

  it("reveals its heading on request: scroll and focus, smooth unless reduced", async () => {
    const element = render();
    expect(element.revealHeading(false)).toBe(false);
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const heading = element.shadowRoot.querySelector(
      '[data-id="case-heading"]'
    );
    heading.scrollIntoView = jest.fn();
    expect(element.revealHeading(false)).toBe(true);
    expect(heading.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start"
    });
    expect(element.shadowRoot.activeElement).toBe(heading);
    element.revealHeading(true);
    expect(heading.scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "auto",
      block: "start"
    });
  });

  it("moves to its heading when the address changes to #case-studies", async () => {
    window.matchMedia = jest.fn(() => ({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }));
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const heading = element.shadowRoot.querySelector(
      '[data-id="case-heading"]'
    );
    heading.scrollIntoView = jest.fn();
    window.location.hash = "case-studies";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(heading.scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start"
    });
    expect(element.shadowRoot.activeElement).toBe(heading);
  });

  it("moves to its heading once its cards render when the page opened on #case-studies", async () => {
    window.location.hash = "case-studies";
    const scroll = jest.fn();
    const original = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = scroll;
    try {
      const element = render();
      getHomeCaseStudies.emit(CARDS);
      await flush();
      await flush();
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(element.shadowRoot.activeElement).toBe(
        element.shadowRoot.querySelector('[data-id="case-heading"]')
      );
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original;
    }
  });
});

describe("c-case-study-grid case_studies_seen", () => {
  const OriginalObserver = window.IntersectionObserver;
  let observers;

  beforeEach(() => {
    observers = [];
    window.IntersectionObserver = jest.fn((callback) => {
      const observer = {
        callback,
        observe: jest.fn(),
        disconnect: jest.fn()
      };
      observers.push(observer);
      return observer;
    });
  });

  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    window.IntersectionObserver = OriginalObserver;
    jest.clearAllMocks();
  });

  function entry(ratio, shownHeight, windowHeight) {
    return {
      isIntersecting: ratio > 0 || shownHeight > 0,
      intersectionRatio: ratio,
      intersectionRect: { height: shownHeight },
      rootBounds: { height: windowHeight }
    };
  }

  it("sends nothing until half the section is on screen, then once", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledWith(
      element.shadowRoot.querySelector("section")
    );
    observers[0].callback([entry(0.2, 100, 800)]);
    expect(trackEvent).not.toHaveBeenCalled();
    observers[0].callback([entry(0.5, 400, 800)]);
    observers[0].callback([entry(0.9, 700, 800)]);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("case_studies_seen", {
      total: 3,
      featured: 3
    });
    expect(observers[0].disconnect).toHaveBeenCalled();
  });

  it("counts half the window as half a section that is taller than the window", async () => {
    render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    observers[0].callback([entry(0.3, 450, 844)]);
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("sends nothing without IntersectionObserver", async () => {
    window.IntersectionObserver = undefined;
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    expect(trackEvent).not.toHaveBeenCalled();
    expect(element.shadowRoot.querySelector("section")).not.toBeNull();
  });

  it("does not watch an empty read", async () => {
    render();
    getHomeCaseStudies.emit([]);
    await flush();
    expect(window.IntersectionObserver).not.toHaveBeenCalled();
  });
});

describe("c-case-study-grid live data marker", () => {
  it("places the live data marker with the sources the section reads", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const html = readFileSync(
      join(__dirname, "..", "caseStudyGrid.html"),
      "utf8"
    );
    const marker = html.match(/<c-data-source\s([^>]*)>\s*<\/c-data-source>/);
    expect(marker).not.toBeNull();
    expect(marker[1]).toMatch(
      /source-keys="ProjectCardController_HomeCaseStudies"/
    );
    expect(marker[1]).not.toMatch(/objects=/);
    expect(marker[1]).not.toMatch(/hide-counts/);
  });
});

describe("c-case-study-grid view source", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders one View source control with the caseStudyGrid key in the tools row, before the chip", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const row = element.shadowRoot.querySelector(".tools");
    const controls = row.querySelectorAll("c-view-source");
    expect(controls).toHaveLength(1);
    expect(controls[0].sourceKey).toBe("caseStudyGrid");
    expect(
      controls[0].compareDocumentPosition(row.querySelector("c-data-source")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("puts the tools row after the projects in the page order, for a phone", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const css = require("fs").readFileSync(
      require("path").join(__dirname, "..", "caseStudyGrid.css"),
      "utf8"
    );
    expect(css).toMatch(/\.tools\s*\{[^}]*order:\s*99/);
    expect(element.shadowRoot.querySelector(".tools")).not.toBeNull();
  });
});

/**
 * @description       : Unit tests for caseStudyGrid: three compact cards in order, each with
 *                      the number only with its label, the title as the card's one link and
 *                      the client line, a card with no safe link hidden, the
 *                      case_study_link_followed event, nothing at all on an empty or failed
 *                      read, and the case-studies anchor with its scroll and focus.
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
    EVENTS: { CASE_STUDY_LINK_FOLLOWED: "case_study_link_followed" }
  }),
  { virtual: true }
);

const CARDS = [
  {
    key: "b",
    title: "  Choosing the right platform for a literacy nonprofit  ",
    clientLine: "Regional adult literacy nonprofit · freelance",
    headlineMetric: "$0",
    headlineLabel: "software licence cost for 10 staff users",
    challenge: "  A small staff needed one system.  ",
    solution: "Chose donated licences.",
    businessValue: "Ten staff users on donated licences.",
    liveUrl: "https://ryanbumstead.com/nonprofit-solutions",
    tags: ["NPSP", " Platform selection ", "", "Cost"]
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
    liveUrl: "/docs",
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

  it("shows the heading and intro once, then three cards in the order sent", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const root = element.shadowRoot;
    expect(text(root.querySelector("h2"))).toBe("Case studies");
    expect(text(root.querySelector(".section-intro"))).toBe(
      "Client names are left out. Pick one for the problem, the call I made and how it turned out."
    );
    expect(
      cards(element).map((card) => text(card.querySelector("h3")))
    ).toEqual([
      "Choosing the right platform for a literacy nonprofit",
      "An employer hub for an education provider",
      "Building this site as a production org"
    ]);
  });

  it("shows at most three cards and drops a row with no title", async () => {
    const element = render();
    getHomeCaseStudies.emit([
      { key: "x", title: "  " },
      ...CARDS,
      { key: "z", title: "A fourth", liveUrl: "/delivery" }
    ]);
    await flush();
    expect(cards(element)).toHaveLength(3);
    expect(text(cards(element)[0].querySelector("h3"))).toBe(
      "Choosing the right platform for a literacy nonprofit"
    );
  });

  it("shows no blocks, no topic chips and no second link on a card", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    cards(element).forEach((card) => {
      expect(card.querySelector("dl")).toBeNull();
      expect(card.querySelector(".tags")).toBeNull();
      expect(card.querySelectorAll("a")).toHaveLength(1);
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

  it("shows the number only with its label, and the client line only when set", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const [first, second, third] = cards(element);
    expect(text(first.querySelector('[data-id="metric"]'))).toBe(
      "$0 software licence cost for 10 staff users"
    );
    expect(second.querySelector('[data-id="metric"]')).toBeNull();
    expect(text(third.querySelector('[data-id="metric"]'))).toBe(
      "1000 Apex tests passing at the last successful deploy"
    );
    expect(text(first.querySelector('[data-id="client"]'))).toBe(
      "Regional adult literacy nonprofit · freelance"
    );
    expect(second.querySelector('[data-id="client"]')).toBeNull();
  });

  it("makes the title the card's one link, to an https address or a site path", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const [first, second, third] = cards(element);
    const link = first.querySelector('h3 [data-id="card-link"]');
    expect(link.getAttribute("href")).toBe(
      "https://ryanbumstead.com/nonprofit-solutions"
    );
    expect(text(link)).toBe(
      "Choosing the right platform for a literacy nonprofit"
    );
    expect(link.getAttribute("aria-label")).toBeNull();
    expect(
      second.querySelector('[data-id="card-link"]').getAttribute("href")
    ).toBe("/portfolio/business-architecture");
    expect(
      third.querySelector('[data-id="card-link"]').getAttribute("href")
    ).toBe("/portfolio/docs");
    expect(first.querySelector(".card-go").getAttribute("aria-hidden")).toBe(
      "true"
    );
  });

  it("sends case_study_link_followed with the card title when a link is used", async () => {
    const element = render();
    getHomeCaseStudies.emit(CARDS);
    await flush();
    const link = cards(element)[1].querySelector('[data-id="card-link"]');
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("case_study_link_followed", {
      name: "An employer hub for an education provider"
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

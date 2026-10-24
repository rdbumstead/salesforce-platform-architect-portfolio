/**
 * @description       : Unit tests for byTheNumbers LWC.
 *                      PortfolioStatsController.getStats is a mocked wire adapter.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ByTheNumbers, {
  formatCount,
  formatPercent,
  testLine
} from "c/byTheNumbers";
import getStats from "@salesforce/apex/PortfolioStatsController.getStats";

jest.mock(
  "@salesforce/apex/PortfolioStatsController.getStats",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

function stats(overrides = {}) {
  return {
    testimonialsApproved: 3,
    testimonialsWaiting: 4,
    testimonialsByVibe: [
      { vibe: "Professional", approved: 2, waiting: 1 },
      { vibe: "Casual", approved: 1, waiting: 3 }
    ],
    deployRuns: 12,
    latestTestsRun: 965,
    latestTestsPassed: 965,
    latestCoverage: 98,
    tokensIssued: 4,
    ...overrides
  };
}

function mount() {
  const element = createElement("c-by-the-numbers", { is: ByTheNumbers });
  document.body.appendChild(element);
  return element;
}

function flush() {
  return Promise.resolve();
}

function text(element, selector) {
  const node = element.shadowRoot.querySelector(selector);
  return node ? node.textContent.replace(/\s+/g, " ").trim() : null;
}

describe("c-by-the-numbers", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("has an h2 heading tied to its section", () => {
    const element = mount();
    const heading = element.shadowRoot.querySelector("h2");
    const section = element.shadowRoot.querySelector("section");
    expect(heading.textContent).toBe("By the numbers");
    expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
  });

  it("shows a loading status before the counts arrive", () => {
    const element = mount();
    expect(text(element, ".note[role='status']")).toBe("Loading the counts.");
    expect(element.shadowRoot.querySelector("table")).toBeNull();
  });

  it("shows an error status and no numbers when the read fails", async () => {
    const element = mount();
    getStats.error();
    await flush();
    expect(text(element, ".note[role='status']")).toBe(
      "The counts could not be loaded."
    );
    expect(element.shadowRoot.querySelector(".stats")).toBeNull();
    expect(element.shadowRoot.querySelector("table")).toBeNull();
  });

  it("shows every count as text", async () => {
    const element = mount();
    getStats.emit(stats());
    await flush();
    expect(text(element, "[data-stat='deploys'] .value")).toBe("12");
    expect(text(element, "[data-stat='deploys'] .detail")).toBe(
      "Newest with tests: 965 of 965 Apex tests passed, 98% org coverage."
    );
    expect(text(element, "[data-stat='tokens'] .value")).toBe("4");
    expect(element.shadowRoot.querySelector("[role='status']")).toBeNull();
  });

  it("puts the testimonials in a table with a caption and headers", async () => {
    const element = mount();
    getStats.emit(stats());
    await flush();
    const table = element.shadowRoot.querySelector("table");
    expect(text(element, "caption")).toBe("Testimonials by vibe");
    const headers = [...table.querySelectorAll("thead th")].map((th) =>
      th.getAttribute("scope")
    );
    expect(headers).toEqual(["col", "col", "col"]);
    const rows = [...table.querySelectorAll("tbody tr")].map((row) =>
      [...row.children].map((cell) => cell.textContent.trim())
    );
    expect(rows).toEqual([
      ["Professional", "2", "1"],
      ["Casual", "1", "3"]
    ]);
    expect(text(element, "[data-total='approved']")).toBe("3");
    expect(text(element, "[data-total='waiting']")).toBe("4");
  });

  it("says so when no deploy has a test result", async () => {
    const element = mount();
    getStats.emit(
      stats({
        latestTestsRun: null,
        latestTestsPassed: null,
        latestCoverage: null
      })
    );
    await flush();
    expect(text(element, "[data-stat='deploys'] .detail")).toBe(
      "Newest with tests: No deploy has a test result yet."
    );
  });

  it("shows zero counts as 0", async () => {
    const element = mount();
    getStats.emit(
      stats({
        testimonialsApproved: 0,
        testimonialsWaiting: 0,
        testimonialsByVibe: [],
        deployRuns: 0,
        tokensIssued: 0
      })
    );
    await flush();
    expect(text(element, "[data-stat='deploys'] .value")).toBe("0");
    expect(text(element, "[data-stat='tokens'] .value")).toBe("0");
    expect(element.shadowRoot.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(text(element, "[data-total='approved']")).toBe("0");
  });

  it("recovers from an error when the counts arrive", async () => {
    const element = mount();
    getStats.error();
    await flush();
    getStats.emit(stats());
    await flush();
    expect(element.shadowRoot.querySelector("[role='status']")).toBeNull();
    expect(text(element, "[data-stat='tokens'] .value")).toBe("4");
  });
});

describe("formatting helpers", () => {
  it("formats counts with a separator and a missing count as 0", () => {
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(undefined)).toBe("0");
    expect(formatCount(null)).toBe("0");
  });

  it("formats coverage as a percentage", () => {
    expect(formatPercent(98)).toBe("98%");
    expect(formatPercent(97.5)).toBe("97.5%");
    expect(formatPercent(null)).toBe("");
  });

  it("builds the test line with or without coverage", () => {
    expect(testLine({ latestTestsRun: 10, latestTestsPassed: 9 })).toBe(
      "9 of 10 Apex tests passed."
    );
    expect(testLine({ latestTestsRun: 10 })).toBe("0 of 10 Apex tests passed.");
    expect(testLine(null)).toBe("No deploy has a test result yet.");
  });
});

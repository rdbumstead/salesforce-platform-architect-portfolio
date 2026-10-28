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
  APEX_LINE,
  COUNT_UP_MS,
  JEST_LINE,
  apexDetail,
  formatCount,
  formatDay,
  formatMonth,
  formatPercent,
  totalOf
} from "c/byTheNumbers";
import { APEX_GROUPS, JEST_GROUPS } from "../testGroups";
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
    testimonialsByVibe: [
      { vibe: "Professional", approved: 2 },
      { vibe: "Casual", approved: 1 }
    ],
    deployRuns: 12,
    latestTestsRun: 965,
    latestTestsPassed: 964,
    latestCoverage: 98,
    latestJestRun: 748,
    latestJestPassed: 747,
    tokensIssued: 4,
    coverLettersWritten: 1234,
    apiLabRequests: 56,
    countingSince: "2026-10-28",
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

  it("holds the tiles' space with six hidden tiles while the counts load", () => {
    const element = mount();
    const pending = element.shadowRoot.querySelector("ul[data-placeholder]");
    expect(pending).not.toBeNull();
    expect(pending.getAttribute("aria-hidden")).toBe("true");
    expect(pending.classList.contains("stats-pending")).toBe(true);
    expect(pending.querySelectorAll("li.stat")).toHaveLength(6);
  });

  it("drops the hidden tiles once the counts arrive", async () => {
    const element = mount();
    getStats.emit(stats());
    await flush();
    expect(element.shadowRoot.querySelector("ul[data-placeholder]")).toBeNull();
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
    expect(element.shadowRoot.querySelector("details")).toBeNull();
  });

  it("puts cover letters before the two API Lab counts, so those sit together", async () => {
    const element = mount();
    getStats.emit(stats());
    await flush();
    const order = Array.from(
      element.shadowRoot.querySelectorAll("[data-stat]")
    ).map((tile) => tile.dataset.stat);
    expect(order).toEqual([
      "deploys",
      "apex",
      "jest",
      "letters",
      "tokens",
      "requests"
    ]);
  });

  it("shows every count as text", async () => {
    const element = mount();
    getStats.emit(stats());
    await flush();
    expect(text(element, "[data-stat='deploys'] .value")).toBe("12");
    expect(text(element, "[data-stat='deploys'] .label")).toBe(
      "Production deploys recorded"
    );
    expect(text(element, "[data-stat='tokens'] .value")).toBe("4");
    expect(text(element, "[data-stat='tokens'] .label")).toBe(
      "API Lab evaluator tokens issued"
    );
    expect(element.shadowRoot.querySelector("[role='status']")).toBeNull();
  });

  it("shows Apex and Jest each with its count, detail and one plain line", async () => {
    const element = mount();
    getStats.emit(stats());
    await flush();
    expect(text(element, "[data-stat='apex'] .value")).toBe("964");
    expect(text(element, "[data-stat='apex'] .label")).toBe(
      "Apex tests passed"
    );
    expect(text(element, "[data-stat='apex'] .detail")).toBe(
      "of 965 run in the newest deploy, 98% org coverage."
    );
    expect(text(element, "[data-stat='apex'] .plain-line")).toBe(APEX_LINE);
    expect(text(element, "[data-stat='jest'] .value")).toBe("747");
    expect(text(element, "[data-stat='jest'] .label")).toBe(
      "Jest tests passed"
    );
    expect(text(element, "[data-stat='jest'] .detail")).toBe(
      "of 748 run in the newest deploy."
    );
    expect(text(element, "[data-stat='jest'] .plain-line")).toBe(JEST_LINE);
  });

  it("shows the two usage counters with the month counting began", async () => {
    const element = mount();
    getStats.emit(stats());
    await flush();
    expect(text(element, "[data-stat='letters'] .value")).toBe("1,234");
    expect(text(element, "[data-stat='letters'] .label")).toBe(
      "Cover letters written"
    );
    expect(text(element, "[data-stat='letters'] .detail")).toBe(
      "since October 2026"
    );
    expect(text(element, "[data-stat='requests'] .value")).toBe("56");
    expect(text(element, "[data-stat='requests'] .label")).toBe(
      "API Lab requests sent"
    );
    expect(text(element, "[data-stat='requests'] .detail")).toBe(
      "since October 2026"
    );
  });

  it("shows 0 and no month when nothing is counted", async () => {
    const element = mount();
    getStats.emit(
      stats({
        coverLettersWritten: 0,
        apiLabRequests: 0,
        countingSince: null
      })
    );
    await flush();
    expect(text(element, "[data-stat='letters'] .value")).toBe("0");
    expect(text(element, "[data-stat='requests'] .value")).toBe("0");
    expect(
      element.shadowRoot.querySelector("[data-stat='letters'] .detail")
    ).toBeNull();
    expect(
      element.shadowRoot.querySelector("[data-stat='requests'] .detail")
    ).toBeNull();
  });

  it("says so when no deploy has a test result", async () => {
    const element = mount();
    getStats.emit(
      stats({
        latestTestsRun: null,
        latestTestsPassed: null,
        latestCoverage: null,
        latestJestRun: null,
        latestJestPassed: null
      })
    );
    await flush();
    expect(text(element, "[data-stat='apex'] .message")).toBe(
      "No deploy has a test result yet."
    );
    expect(text(element, "[data-stat='jest'] .message")).toBe(
      "No deploy has a Jest result yet."
    );
    expect(element.shadowRoot.querySelector("[data-stat='apex'] .value")).toBe(
      null
    );
    expect(text(element, "[data-stat='apex'] .plain-line")).toBe(APEX_LINE);
  });

  it("shows the Apex count and says Jest is not counted yet when only Jest is missing", async () => {
    const element = mount();
    getStats.emit(stats({ latestJestRun: null, latestJestPassed: null }));
    await flush();
    expect(text(element, "[data-stat='apex'] .value")).toBe("964");
    expect(text(element, "[data-stat='jest'] .message")).toBe(
      "No deploy has a Jest result yet."
    );
  });

  it("shows zero counts as 0", async () => {
    const element = mount();
    getStats.emit(
      stats({
        testimonialsApproved: 0,
        testimonialsByVibe: [],
        deployRuns: 0,
        tokensIssued: 0
      })
    );
    await flush();
    expect(text(element, "[data-stat='deploys'] .value")).toBe("0");
    expect(text(element, "[data-stat='tokens'] .value")).toBe("0");
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

  it("keeps the note that nothing but counts is sent to the page", async () => {
    const element = mount();
    getStats.emit(stats());
    await flush();
    expect(text(element, "p.note")).toBe(
      "Each number is counted from Salesforce records. No record, name or message is sent to this page."
    );
    expect(text(element, ".eyebrow")).toBe("Counted from records");
  });

  describe("testimonials table", () => {
    it("is hidden until one testimonial is approved", async () => {
      const element = mount();
      getStats.emit(
        stats({
          testimonialsApproved: 0,
          testimonialsByVibe: [
            { vibe: "Professional", approved: 0 },
            { vibe: "Casual", approved: 0 }
          ]
        })
      );
      await flush();
      expect(element.shadowRoot.querySelector("table")).toBeNull();
    });

    it("shows a table with a caption and headers, and no waiting column", async () => {
      const element = mount();
      getStats.emit(stats());
      await flush();
      const table = element.shadowRoot.querySelector("table");
      expect(text(element, "caption")).toBe("Testimonials by vibe");
      const headers = [...table.querySelectorAll("thead th")].map((th) =>
        th.getAttribute("scope")
      );
      expect(headers).toEqual(["col", "col"]);
      const rows = [...table.querySelectorAll("tbody tr")].map((row) =>
        [...row.children].map((cell) => cell.textContent.trim())
      );
      expect(rows).toEqual([
        ["Professional", "2"],
        ["Casual", "1"]
      ]);
      expect(text(element, "[data-total='approved']")).toBe("3");
      expect(table.textContent.toLowerCase()).not.toContain("waiting");
    });

    it("never writes the word waiting anywhere in the panel", async () => {
      const element = mount();
      getStats.emit(stats());
      await flush();
      expect(element.shadowRoot.textContent.toLowerCase()).not.toContain(
        "waiting"
      );
    });
  });

  describe("what the tests cover", () => {
    it("is a closed disclosure with a summary", async () => {
      const element = mount();
      getStats.emit(stats());
      await flush();
      const details = element.shadowRoot.querySelector("details");
      expect(details).not.toBeNull();
      expect(details.open).toBe(false);
      expect(text(element, "summary")).toBe("What the tests cover");
    });

    it("lists each Apex and Jest group with its count, adding up to the total", async () => {
      const element = mount();
      getStats.emit(stats());
      await flush();
      const apexRows = [
        ...element.shadowRoot.querySelectorAll("[data-groups='apex'] li")
      ];
      const jestRows = [
        ...element.shadowRoot.querySelectorAll("[data-groups='jest'] li")
      ];
      expect(apexRows).toHaveLength(APEX_GROUPS.length);
      expect(jestRows).toHaveLength(JEST_GROUPS.length);
      expect(apexRows[0].querySelector(".group-name").textContent).toBe(
        APEX_GROUPS[0].name
      );
      expect(apexRows[0].querySelector(".group-count").textContent).toBe(
        formatCount(APEX_GROUPS[0].tests)
      );
      const headings = [...element.shadowRoot.querySelectorAll("h3")].map((h) =>
        h.textContent.replace(/\s+/g, " ").trim()
      );
      expect(headings).toEqual([
        `Apex tests, ${formatCount(totalOf(APEX_GROUPS))} in the repository`,
        `Jest tests, ${formatCount(totalOf(JEST_GROUPS))} in the repository`
      ]);
    });

    it("says when the groups were counted and why the Apex total can differ", async () => {
      const element = mount();
      getStats.emit(stats());
      await flush();
      const intro = text(element, ".covers-intro");
      expect(intro).toContain(
        "counted from the test files in the repository on"
      );
      expect(intro).toContain("so the two can differ");
    });
  });

  describe("count up", () => {
    let observers;
    let frames;
    let originalObserver;
    let originalMatchMedia;

    class FakeObserver {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        observers.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    }

    function runFrame(now) {
      const pending = frames;
      frames = [];
      pending.forEach((callback) => callback(now));
    }

    beforeEach(() => {
      observers = [];
      frames = [];
      originalObserver = window.IntersectionObserver;
      originalMatchMedia = window.matchMedia;
      window.IntersectionObserver = FakeObserver;
      jest
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((callback) => {
          frames.push(callback);
          return frames.length;
        });
      jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {
        frames = [];
      });
      Object.defineProperty(window, "scrollY", {
        value: 400,
        configurable: true
      });
    });

    afterEach(() => {
      window.IntersectionObserver = originalObserver;
      window.matchMedia = originalMatchMedia;
      Object.defineProperty(window, "scrollY", {
        value: 0,
        configurable: true
      });
      jest.restoreAllMocks();
    });

    async function mountWithCounts() {
      const element = mount();
      getStats.emit(stats());
      await flush();
      return element;
    }

    it("keeps the final number in the text from the start", async () => {
      const element = await mountWithCounts();
      expect(text(element, "[data-stat='letters'] .value")).toBe("1,234");
      expect(element.shadowRoot.querySelector(".value-live")).toBeNull();
      expect(observers).toHaveLength(1);
    });

    it("counts up to the final number after a scroll into view", async () => {
      const element = await mountWithCounts();
      observers[0].callback([{ isIntersecting: true }]);
      await flush();
      expect(observers[0].disconnected).toBe(true);

      runFrame(1000);
      await flush();
      const live = element.shadowRoot.querySelector(
        "[data-stat='letters'] .value-live"
      );
      expect(live.getAttribute("aria-hidden")).toBe("true");
      expect(live.textContent).toBe("0");
      expect(
        element.shadowRoot
          .querySelector("[data-stat='letters'] .value-final")
          .classList.contains("value-hidden")
      ).toBe(true);
      // The real number is still in the text for a screen reader.
      expect(
        element.shadowRoot.querySelector("[data-stat='letters'] .value-final")
          .textContent
      ).toBe("1,234");

      runFrame(1000 + COUNT_UP_MS / 2);
      await flush();
      const midway = Number(
        element.shadowRoot
          .querySelector("[data-stat='letters'] .value-live")
          .textContent.replace(/,/g, "")
      );
      expect(midway).toBeGreaterThan(0);
      expect(midway).toBeLessThan(1234);

      runFrame(1000 + COUNT_UP_MS);
      await flush();
      expect(element.shadowRoot.querySelector(".value-live")).toBeNull();
      expect(
        element.shadowRoot
          .querySelector("[data-stat='letters'] .value-final")
          .classList.contains("value-hidden")
      ).toBe(false);
      expect(text(element, "[data-stat='letters'] .value")).toBe("1,234");
      expect(frames).toHaveLength(0);
    });

    it("does not count when the counts are on screen at the top of the page", async () => {
      Object.defineProperty(window, "scrollY", {
        value: 0,
        configurable: true
      });
      const element = await mountWithCounts();
      observers[0].callback([{ isIntersecting: true }]);
      await flush();
      expect(frames).toHaveLength(0);
      expect(element.shadowRoot.querySelector(".value-live")).toBeNull();
    });

    it("waits while the counts are out of view", async () => {
      const element = await mountWithCounts();
      observers[0].callback([{ isIntersecting: false }]);
      await flush();
      expect(observers[0].disconnected).toBe(false);
      expect(frames).toHaveLength(0);
      expect(element.shadowRoot.querySelector(".value-live")).toBeNull();
    });

    it("does not count under reduced motion", async () => {
      window.matchMedia = jest.fn().mockReturnValue({ matches: true });
      await mountWithCounts();
      expect(observers).toHaveLength(0);
    });

    it("does not count where IntersectionObserver is missing", async () => {
      window.IntersectionObserver = undefined;
      const element = await mountWithCounts();
      expect(frames).toHaveLength(0);
      expect(text(element, "[data-stat='letters'] .value")).toBe("1,234");
    });

    it("stops watching and cancels the frame when removed", async () => {
      const element = await mountWithCounts();
      observers[0].callback([{ isIntersecting: true }]);
      await flush();
      document.body.removeChild(element);
      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("stops watching when removed before the counts scroll into view", async () => {
      const element = await mountWithCounts();
      document.body.removeChild(element);
      expect(observers[0].disconnected).toBe(true);
    });
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

  it("builds the Apex detail with or without coverage", () => {
    expect(apexDetail({ latestTestsRun: 10, latestCoverage: 90 })).toBe(
      "of 10 run in the newest deploy, 90% org coverage."
    );
    expect(apexDetail({ latestTestsRun: 10 })).toBe(
      "of 10 run in the newest deploy."
    );
    expect(apexDetail(null)).toBe("");
  });

  it("names the month and the day", () => {
    expect(formatMonth("2026-10-28")).toBe("October 2026");
    expect(formatMonth("2027-01-02")).toBe("January 2027");
    expect(formatMonth(null)).toBe("");
    expect(formatMonth("2026-13-01")).toBe("");
    expect(formatDay("2026-10-26")).toBe("26 October 2026");
    expect(formatDay("2026-13-26")).toBe("");
    expect(formatDay("")).toBe("");
  });

  it("adds up the groups", () => {
    expect(totalOf([{ tests: 2 }, { tests: 3 }])).toBe(5);
    expect(totalOf([])).toBe(0);
  });

  it("keeps the measured groups adding up to a total above zero", () => {
    expect(totalOf(APEX_GROUPS)).toBeGreaterThan(0);
    expect(totalOf(JEST_GROUPS)).toBeGreaterThan(0);
  });
});

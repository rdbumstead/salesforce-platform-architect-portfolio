/**
 * @description       : Unit tests for roadmapViewer LWC. DeliveryController.getRoadmap is a
 *                      mocked wire adapter fed with the RoadmapFeed shape the controller returns.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";
import { createElement } from "@lwc/engine-dom";
import RoadmapViewer, {
  COLUMNS,
  COLUMN_LIMIT,
  EMPTY_TEXT,
  STATUS_NOTES,
  ageLabel,
  parentLabel
} from "c/roadmapViewer";
import getRoadmap from "@salesforce/apex/DeliveryController.getRoadmap";
import { trackEvent } from "c/analyticsService";
import { setSimulating } from "c/outageSimulation";
import { showMe } from "c/tourShowMe";
import fs from "fs";
import path from "path";

jest.mock(
  "@salesforce/apex/DeliveryController.getRoadmap",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "c/analyticsService",
  () => ({
    trackEvent: jest.fn(),
    EVENTS: {
      ROADMAP_VIEWED: "roadmap_viewed",
      CHANGELOG_COMMIT_CLICKED: "changelog_commit_clicked",
      RESILIENCE_TEST_TRIGGERED: "resilience_test_triggered"
    }
  }),
  { virtual: true }
);

// Status names are deliberately unusual: placement must follow statusCategory only.
const ITEMS = [
  {
    key: "SPAP-900",
    summary: "Delivery pillar",
    status: "Backlog",
    statusCategory: "new",
    type: "Epic",
    epicKey: null,
    updatedAt: "2026-10-21T07:00:00.000Z"
  },
  {
    key: "SPAP-901",
    summary: "Seed to do story",
    status: "Ready",
    statusCategory: "new",
    type: "Story",
    epicKey: "SPAP-900",
    updatedAt: "2026-10-21T07:10:00.000Z"
  },
  {
    key: "SPAP-902",
    summary: "Seed in progress task",
    status: "Done-ish (renamed)",
    statusCategory: "indeterminate",
    type: "Task",
    epicKey: "SPAP-900",
    updatedAt: "2026-10-21T07:20:00.000Z"
  },
  {
    key: "SPAP-903",
    summary: "Seed done bug",
    status: "In Progress",
    statusCategory: "done",
    type: "Bug",
    epicKey: null,
    updatedAt: "2026-10-21T07:30:00.000Z"
  }
];

function feed(status, overrides = {}) {
  return {
    items: status === "EMPTY" ? [] : ITEMS,
    fetchedAt: status === "EMPTY" ? null : "2026-10-21T08:05:00.000Z",
    ageMinutes: status === "EMPTY" ? null : 4,
    status,
    ...overrides
  };
}

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

function createComponent() {
  const element = createElement("c-roadmap-viewer", { is: RoadmapViewer });
  document.body.appendChild(element);
  return element;
}

function q(element, selector) {
  return element.shadowRoot.querySelector(selector);
}

function keysIn(element, category) {
  const column = q(element, `.roadmap-column[data-category="${category}"]`);
  return [...column.querySelectorAll("li")].map((li) => li.dataset.key);
}

describe("c-roadmap-viewer", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
    setSimulating(false);
  });

  it("shows a loading line until the wire emits", async () => {
    const element = createComponent();
    await flushPromises();
    expect(q(element, '[data-id="loading"]')).not.toBeNull();
    expect(q(element, ".roadmap-board")).toBeNull();
  });

  it("places cards by statusCategory, never by status name", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("FRESH"));
    await flushPromises();

    const titles = [...element.shadowRoot.querySelectorAll(".column-title")];
    expect(
      titles.map((h) => h.textContent.replace(/\s+/g, " ").trim())
    ).toEqual(["To Do(2)", "In Progress(1)", "Done(1)"]);
    expect(keysIn(element, "new")).toEqual(["SPAP-900", "SPAP-901"]);
    expect(keysIn(element, "indeterminate")).toEqual(["SPAP-902"]);
    expect(keysIn(element, "done")).toEqual(["SPAP-903"]);
    expect(COLUMNS.map((c) => c.category)).toEqual([
      "new",
      "indeterminate",
      "done"
    ]);
  });

  it("drops an item with an unknown statusCategory", async () => {
    const element = createComponent();
    getRoadmap.emit(
      feed("FRESH", {
        items: [...ITEMS, { ...ITEMS[1], key: "SPAP-999", statusCategory: "x" }]
      })
    );
    await flushPromises();
    expect(element.shadowRoot.querySelectorAll("li")).toHaveLength(4);
    expect(q(element, 'li[data-key="SPAP-999"]')).toBeNull();
  });

  it("FRESH maps key, summary and type, labels the epic and shows the age", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("FRESH"));
    await flushPromises();

    const story = q(element, 'li[data-key="SPAP-901"]');
    expect(story.querySelector('[data-id="key"]').textContent).toBe("SPAP-901");
    expect(story.querySelector('[data-id="summary"]').textContent).toBe(
      "Seed to do story"
    );
    expect(story.querySelector('[data-id="type"]').textContent).toBe("Story");
    expect(story.querySelector('[data-id="epic-label"]')).toBeNull();
    expect(story.querySelector('[data-id="epic-key"]').textContent.trim()).toBe(
      "Part of SPAP-900"
    );

    const epic = q(element, 'li[data-key="SPAP-900"]');
    expect(epic.querySelector('[data-id="epic-label"]').textContent).toBe(
      "Epic"
    );
    expect(epic.classList.contains("card-epic")).toBe(true);
    expect(epic.querySelector('[data-id="epic-key"]')).toBeNull();

    const age = q(element, '[data-id="age-label"]');
    expect(age.textContent).toBe("Last updated 4 min ago");
    expect(age.classList.contains("age-stale")).toBe(false);
    expect(q(element, '[data-id="status-badge"]')).toBeNull();
    expect(q(element, '[data-id="unavailable"]')).toBeNull();
    expect(element.shadowRoot.textContent).not.toContain("Live Sync");
  });

  it("STALE keeps the board and shows the age label in the warning style", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("STALE", { ageMinutes: 240 }));
    await flushPromises();

    expect(element.shadowRoot.querySelectorAll("li")).toHaveLength(4);
    const age = q(element, '[data-id="age-label"]');
    expect(age.textContent).toBe("Last updated 240 min ago");
    expect(age.classList.contains("age-stale")).toBe(true);
  });

  it("EMPTY shows an honest empty line, not the outage line, and no board or age label", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("EMPTY"));
    await flushPromises();

    expect(q(element, '[data-id="empty"]').textContent.trim()).toBe(EMPTY_TEXT);
    expect(q(element, '[data-id="unavailable"]')).toBeNull();
    expect(q(element, ".roadmap-board")).toBeNull();
    expect(q(element, '[data-id="age-label"]')).toBeNull();
  });

  it("a feed with no items is empty, not an outage", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("FRESH", { items: [] }));
    await flushPromises();

    expect(q(element, '[data-id="empty"]')).not.toBeNull();
    expect(q(element, '[data-id="unavailable"]')).toBeNull();
  });

  it("names the epic as name and key, and falls back to the key alone", async () => {
    const element = createComponent();
    getRoadmap.emit(
      feed("FRESH", {
        items: [
          { ...ITEMS[1], epicName: "Delivery pillar" },
          { ...ITEMS[2], epicName: null }
        ]
      })
    );
    await flushPromises();

    const named = q(element, 'li[data-key="SPAP-901"] [data-id="epic-key"]');
    expect(named.textContent.trim()).toBe("Part of Delivery pillar");
    const keyOnly = q(element, 'li[data-key="SPAP-902"] [data-id="epic-key"]');
    expect(keyOnly.textContent.trim()).toBe("Part of SPAP-900");
    expect(parentLabel("Name", null)).toBe("");
  });

  it("puts epic cards above story cards in each column, keeping the order otherwise", async () => {
    const element = createComponent();
    const story = (key, category) => ({
      ...ITEMS[1],
      key,
      statusCategory: category
    });
    const epic = (key, category) => ({
      ...ITEMS[0],
      key,
      statusCategory: category
    });
    getRoadmap.emit(
      feed("FRESH", {
        items: [
          story("SPAP-1", "new"),
          epic("SPAP-2", "new"),
          story("SPAP-3", "new"),
          epic("SPAP-4", "new"),
          story("SPAP-5", "indeterminate"),
          epic("SPAP-6", "indeterminate")
        ]
      })
    );
    await flushPromises();

    expect(keysIn(element, "new")).toEqual([
      "SPAP-2",
      "SPAP-4",
      "SPAP-1",
      "SPAP-3"
    ]);
    expect(keysIn(element, "indeterminate")).toEqual(["SPAP-6", "SPAP-5"]);
  });

  describe("the column cap, every column", () => {
    // Twelve done items, SPAP-101 the newest, each one hour older than the last.
    // SPAP-112 (the oldest) and SPAP-104 are epics.
    function doneItems(count) {
      return Array.from({ length: count }, (unused, index) => ({
        key: `SPAP-${101 + index}`,
        summary: `Shipped ${index + 1}`,
        status: "Done",
        statusCategory: "done",
        type: index === 11 || index === 3 ? "Epic" : "Story",
        epicKey: null,
        updatedAt: new Date(
          Date.UTC(2026, 9, 21, 20 - index, 0, 0)
        ).toISOString()
      }));
    }

    function doneKeys(element) {
      return keysIn(element, "done");
    }

    it("shows every done card and no button at the limit", async () => {
      const element = createComponent();
      getRoadmap.emit(feed("FRESH", { items: doneItems(COLUMN_LIMIT) }));
      await flushPromises();

      expect(doneKeys(element)).toHaveLength(COLUMN_LIMIT);
      expect(q(element, '[data-id="show-all"]')).toBeNull();
    });

    it("shows the newest 8, epics first, then a real button that reveals the rest", async () => {
      const element = createComponent();
      // Feed order shuffled, so the cap must follow updatedAt.
      const items = doneItems(12).reverse();
      getRoadmap.emit(feed("FRESH", { items }));
      await flushPromises();

      expect(COLUMN_LIMIT).toBe(8);
      expect(doneKeys(element)).toEqual([
        "SPAP-104",
        "SPAP-108",
        "SPAP-107",
        "SPAP-106",
        "SPAP-105",
        "SPAP-103",
        "SPAP-102",
        "SPAP-101"
      ]);
      const column = q(element, '.roadmap-column[data-category="done"]');
      expect(
        column.querySelector(".column-title").textContent.replace(/\s+/g, "")
      ).toBe("Done(12)");

      const button = q(element, '[data-id="show-all"]');
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("button");
      expect(button.textContent.trim()).toBe("Show all 12 shipped");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      const list = q(
        element,
        '.roadmap-column[data-category="done"] [data-id="column-more"]'
      );
      expect(button.getAttribute("aria-controls")).toBe(list.id);

      button.click();
      await flushPromises();

      expect(doneKeys(element)).toEqual([
        "SPAP-104",
        "SPAP-108",
        "SPAP-107",
        "SPAP-106",
        "SPAP-105",
        "SPAP-103",
        "SPAP-102",
        "SPAP-101",
        "SPAP-112",
        "SPAP-111",
        "SPAP-110",
        "SPAP-109"
      ]);
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(button.textContent.trim()).toBe("Show fewer");

      button.click();
      await flushPromises();
      expect(doneKeys(element)).toHaveLength(COLUMN_LIMIT);
      expect(button.getAttribute("aria-expanded")).toBe("false");
    });

    // Twelve items in one open column, in feed order. Item 10 (index 9) and item 3 (index 2)
    // are epics, so one epic is inside the first 8 and one is past the cut.
    function openItems(category, count) {
      return Array.from({ length: count }, (unused, index) => ({
        key: `SPAP-${(category === "new" ? 201 : 301) + index}`,
        summary: `Open ${index + 1}`,
        status: category === "new" ? "To Do" : "In Progress",
        statusCategory: category,
        type: index === 9 || index === 2 ? "Epic" : "Story",
        epicKey: null,
        updatedAt: new Date(Date.UTC(2026, 9, 21, index, 0, 0)).toISOString()
      }));
    }

    function toggleIn(element, category) {
      return q(
        element,
        `.roadmap-column[data-category="${category}"] [data-id="show-all"]`
      );
    }

    ["new", "indeterminate"].forEach((category) => {
      it(`caps the ${category} column at 8 in feed order, epics first, with its own toggle`, async () => {
        const element = createComponent();
        const items = openItems(category, 12);
        getRoadmap.emit(feed("FRESH", { items }));
        await flushPromises();

        const firstEight = items.slice(0, COLUMN_LIMIT);
        const expectedVisible = [
          ...firstEight.filter((item) => item.type === "Epic"),
          ...firstEight.filter((item) => item.type !== "Epic")
        ].map((item) => item.key);
        expect(keysIn(element, category)).toEqual(expectedVisible);

        const column = q(
          element,
          `.roadmap-column[data-category="${category}"]`
        );
        const label = COLUMNS.find((c) => c.category === category).label;
        expect(
          column.querySelector(".column-title").textContent.replace(/\s+/g, "")
        ).toBe(`${label.replace(/\s+/g, "")}(12)`);

        const button = toggleIn(element, category);
        expect(button.tagName).toBe("BUTTON");
        expect(button.getAttribute("type")).toBe("button");
        expect(button.textContent.trim()).toBe("Show all 12");
        expect(button.getAttribute("aria-expanded")).toBe("false");
        const list = column.querySelector('[data-id="column-more"]');
        expect(button.getAttribute("aria-controls")).toBe(list.id);

        button.click();
        await flushPromises();

        const rest = items.slice(COLUMN_LIMIT);
        expect(keysIn(element, category)).toEqual([
          ...expectedVisible,
          ...rest.filter((item) => item.type === "Epic").map((i) => i.key),
          ...rest.filter((item) => item.type !== "Epic").map((i) => i.key)
        ]);
        expect(button.getAttribute("aria-expanded")).toBe("true");
        expect(button.textContent.trim()).toBe("Show fewer");

        button.click();
        await flushPromises();
        expect(keysIn(element, category)).toHaveLength(COLUMN_LIMIT);
        expect(button.getAttribute("aria-expanded")).toBe("false");
      });
    });

    it("keeps each column's toggle state separate", async () => {
      const element = createComponent();
      const items = [
        ...openItems("new", 12),
        ...openItems("indeterminate", 10),
        ...doneItems(12)
      ];
      getRoadmap.emit(feed("FRESH", { items }));
      await flushPromises();

      toggleIn(element, "new").click();
      await flushPromises();

      expect(keysIn(element, "new")).toHaveLength(12);
      expect(keysIn(element, "indeterminate")).toHaveLength(COLUMN_LIMIT);
      expect(keysIn(element, "done")).toHaveLength(COLUMN_LIMIT);
      expect(toggleIn(element, "new").getAttribute("aria-expanded")).toBe(
        "true"
      );
      expect(
        toggleIn(element, "indeterminate").getAttribute("aria-expanded")
      ).toBe("false");
      expect(toggleIn(element, "indeterminate").textContent.trim()).toBe(
        "Show all 10"
      );
      expect(toggleIn(element, "done").textContent.trim()).toBe(
        "Show all 12 shipped"
      );
      const ids = ["new", "indeterminate", "done"].map((c) =>
        toggleIn(element, c).getAttribute("aria-controls")
      );
      expect(new Set(ids).size).toBe(3);
    });

    it("caps each column at the columnLimit the feed serves", async () => {
      const element = createComponent();
      getRoadmap.emit(feed("FRESH", { items: doneItems(12), columnLimit: 3 }));
      await flushPromises();

      expect(doneKeys(element)).toHaveLength(3);
      expect(q(element, '[data-id="show-all"]').textContent.trim()).toBe(
        "Show all 12 shipped"
      );
    });

    it.each([0, -2, 2.5, "5", null])(
      "falls back to COLUMN_LIMIT when the feed serves %p",
      async (served) => {
        const element = createComponent();
        getRoadmap.emit(
          feed("FRESH", { items: doneItems(12), columnLimit: served })
        );
        await flushPromises();

        expect(doneKeys(element)).toHaveLength(COLUMN_LIMIT);
      }
    );
  });

  it("SIMULATED shows a Simulated badge with the board", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("SIMULATED"));
    await flushPromises();

    const badge = q(element, '[data-id="status-badge"]');
    expect(badge.textContent).toBe("Simulated");
    expect(badge.classList.contains("badge-simulated")).toBe(true);
    expect(element.shadowRoot.querySelectorAll("li")).toHaveLength(4);
  });

  it("DEGRADED shows a Degraded badge with the board", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("DEGRADED"));
    await flushPromises();

    const badge = q(element, '[data-id="status-badge"]');
    expect(badge.textContent).toBe("Degraded");
    expect(badge.classList.contains("badge-degraded")).toBe(true);
    expect(element.shadowRoot.querySelectorAll("li")).toHaveLength(4);
  });

  it("a wire error shows the unavailable message", async () => {
    const element = createComponent();
    getRoadmap.error({ message: "No access" });
    await flushPromises();

    expect(q(element, '[data-id="unavailable"]')).not.toBeNull();
    expect(element.shadowRoot.textContent).not.toContain("No access");
  });

  it("stacks the three columns into one below 768px", () => {
    const css = readFileSync(
      join(__dirname, "..", "roadmapViewer.css"),
      "utf8"
    );
    expect(css).toMatch(
      /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/
    );
    expect(css).toMatch(
      /@media \(max-width: 767px\)\s*\{\s*\.roadmap-board\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/
    );
  });

  it("sends roadmap_viewed once when the board loads", async () => {
    createComponent();
    getRoadmap.emit(feed("FRESH"));
    await flushPromises();
    getRoadmap.emit(feed("STALE"));
    await flushPromises();

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("roadmap_viewed");
  });

  it("renders the outage switch off, labelled, and reads with simulate false", async () => {
    const element = createComponent();
    await flushPromises();

    const input = q(element, '[data-id="simulate-switch"]');
    expect(input.type).toBe("checkbox");
    expect(input.getAttribute("role")).toBe("switch");
    expect(input.checked).toBe(false);
    expect(input.closest("label").textContent.trim()).toBe(
      "Simulate an outage"
    );
    expect(getRoadmap.getLastConfig()).toEqual({ simulate: false });
  });

  it("turning the switch on re-reads with simulate true and shows SIMULATED", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("FRESH"));
    await flushPromises();

    const input = q(element, '[data-id="simulate-switch"]');
    input.checked = true;
    input.dispatchEvent(new CustomEvent("change"));
    await flushPromises();
    expect(getRoadmap.getLastConfig()).toEqual({ simulate: true });
    expect(trackEvent).toHaveBeenCalledWith("resilience_test_triggered", {
      source: "roadmap"
    });

    getRoadmap.emit(feed("SIMULATED"));
    await flushPromises();
    expect(q(element, '[data-id="status-badge"]').textContent).toBe(
      "Simulated"
    );
    expect(element.shadowRoot.querySelectorAll("li")).toHaveLength(4);
    expect(q(element, '[data-id="status-note"]').textContent.trim()).toBe(
      STATUS_NOTES.SIMULATED
    );

    input.checked = false;
    input.dispatchEvent(new CustomEvent("change"));
    await flushPromises();
    expect(getRoadmap.getLastConfig()).toEqual({ simulate: false });
    expect(
      trackEvent.mock.calls.filter(
        ([name]) => name === "resilience_test_triggered"
      )
    ).toHaveLength(1);
  });

  it("puts the one outage switch beside the age label with its sentence", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("FRESH"));
    await flushPromises();
    const meta = q(element, ".roadmap-meta");
    expect(meta.querySelector('[data-id="age-label"]')).not.toBeNull();
    expect(meta.querySelector('[data-id="simulate-switch"]')).not.toBeNull();
    expect(element.shadowRoot.querySelectorAll('[role="switch"]')).toHaveLength(
      1
    );
    expect(q(element, '[data-id="simulate-hint"]').textContent.trim()).toBe(
      "See how the roadmap and Latest Updates behave if Jira or GitHub is down."
    );
  });

  it("follows the shared outage state when another panel's switch changes it", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("FRESH"));
    await flushPromises();
    setSimulating(true);
    await flushPromises();
    expect(getRoadmap.getLastConfig()).toEqual({ simulate: true });
    expect(q(element, '[data-id="simulate-switch"]').checked).toBe(true);
    // Removed, it stops listening.
    document.body.removeChild(element);
    setSimulating(false);
    await flushPromises();
    expect(getRoadmap.getLastConfig()).toEqual({ simulate: true });
  });

  describe("on a phone", () => {
    let listeners;
    let matches;

    function mockPhone(value) {
      matches = value;
      listeners = [];
      window.matchMedia = jest.fn(() => ({
        get matches() {
          return matches;
        },
        addEventListener: (type, fn) => listeners.push(fn),
        removeEventListener: (type, fn) => {
          listeners = listeners.filter((l) => l !== fn);
        }
      }));
    }

    afterEach(() => {
      delete window.matchMedia;
    });

    const tabs = (element) => [
      ...element.shadowRoot.querySelectorAll('[role="tab"]')
    ];

    it("shows no tabs and no tab roles on a wide screen", async () => {
      mockPhone(false);
      const element = createComponent();
      getRoadmap.emit(feed("FRESH"));
      await flushPromises();
      expect(tabs(element)).toHaveLength(0);
      expect(q(element, '[role="tabpanel"]')).toBeNull();
      expect(
        element.shadowRoot.querySelectorAll(".roadmap-column")
      ).toHaveLength(3);
      expect(q(element, ".column-hidden")).toBeNull();
    });

    it("puts the tour anchor on the In Progress heading beside the other columns", async () => {
      mockPhone(false);
      const element = createComponent();
      getRoadmap.emit(feed("FRESH"));
      await flushPromises();
      const anchors = element.shadowRoot.querySelectorAll("[data-tour-anchor]");
      expect(anchors).toHaveLength(1);
      expect(anchors[0].tagName).toBe("H3");
      expect(anchors[0].textContent).toContain("In Progress");
      showMe("E");
      await flushPromises();
      expect(element.shadowRoot.activeElement).toBe(anchors[0]);
    });

    it("turns the columns into tabs that open on In Progress", async () => {
      mockPhone(true);
      const element = createComponent();
      getRoadmap.emit(feed("FRESH"));
      await flushPromises();

      expect(q(element, '[role="tablist"]')).not.toBeNull();
      expect(tabs(element).map((t) => t.textContent.trim())).toEqual([
        "To Do (2)",
        "In Progress (1)",
        "Done (1)"
      ]);
      expect(tabs(element).map((t) => t.getAttribute("aria-selected"))).toEqual(
        ["false", "true", "false"]
      );
      expect(tabs(element).map((t) => t.getAttribute("tabindex"))).toEqual([
        "-1",
        "0",
        "-1"
      ]);
      const panels = [
        ...element.shadowRoot.querySelectorAll('[role="tabpanel"]')
      ];
      expect(panels.map((p) => p.hidden)).toEqual([true, false, true]);
      expect(panels.every((p) => p.getAttribute("aria-labelledby"))).toBe(true);
      // Every card is still in the page for the open tab.
      expect(keysIn(element, "indeterminate")).toEqual(["SPAP-902"]);
    });

    it("marks the active tab without changing its weight", async () => {
      mockPhone(true);
      const element = createComponent();
      getRoadmap.emit(feed("FRESH"));
      await flushPromises();
      expect(q(element, ".tab-active")).not.toBeNull();
      const css = fs.readFileSync(
        path.join(__dirname, "..", "roadmapViewer.css"),
        "utf8"
      );
      const rule = /\.tab-active \{[^}]*\}/.exec(css)[0];
      expect(rule).not.toMatch(/font-weight/);
    });

    it("answers stop E by opening In Progress and focusing its tab", async () => {
      mockPhone(true);
      const element = createComponent();
      getRoadmap.emit(feed("FRESH"));
      await flushPromises();
      tabs(element)[0].click();
      await flushPromises();
      expect(tabs(element)[1].getAttribute("aria-selected")).toBe("false");
      expect(
        element.shadowRoot.querySelectorAll("[data-tour-anchor]")
      ).toHaveLength(1);
      showMe("E");
      await flushPromises();
      expect(tabs(element)[1].getAttribute("aria-selected")).toBe("true");
      expect(element.shadowRoot.activeElement).toBe(tabs(element)[1]);
      expect(tabs(element)[1].hasAttribute("data-tour-anchor")).toBe(true);
    });

    it("stop E still opens In Progress while the outage switch is on", async () => {
      mockPhone(true);
      const element = createComponent();
      setSimulating(true);
      getRoadmap.emit(feed("SIMULATED"));
      await flushPromises();
      tabs(element)[0].click();
      await flushPromises();
      showMe("E");
      await flushPromises();
      expect(q(element, "c-outage-compare")).not.toBeNull();
      expect(tabs(element)[1].getAttribute("aria-selected")).toBe("true");
      expect(element.shadowRoot.activeElement).toBe(tabs(element)[1]);
    });

    it("ignores the other stops", async () => {
      mockPhone(true);
      const element = createComponent();
      getRoadmap.emit(feed("FRESH"));
      await flushPromises();
      tabs(element)[0].click();
      await flushPromises();
      showMe("A");
      await flushPromises();
      expect(tabs(element)[0].getAttribute("aria-selected")).toBe("true");
    });

    it("stops listening when it leaves the page", async () => {
      mockPhone(true);
      const element = createComponent();
      getRoadmap.emit(feed("FRESH"));
      await flushPromises();
      document.body.removeChild(element);
      expect(showMe("E")).toBe(true);
    });

    it("opens another tab on a click and moves with the arrow keys, Home and End", async () => {
      mockPhone(true);
      const element = createComponent();
      getRoadmap.emit(feed("FRESH"));
      await flushPromises();

      tabs(element)[2].click();
      await flushPromises();
      expect(tabs(element).map((t) => t.getAttribute("aria-selected"))).toEqual(
        ["false", "false", "true"]
      );
      const press = async (key) => {
        const event = new KeyboardEvent("keydown", { key, cancelable: true });
        tabs(element)
          .find((t) => t.getAttribute("aria-selected") === "true")
          .dispatchEvent(event);
        await flushPromises();
        return event.defaultPrevented;
      };
      expect(await press("ArrowRight")).toBe(true);
      expect(tabs(element)[0].getAttribute("aria-selected")).toBe("true");
      expect(element.shadowRoot.activeElement).toBe(tabs(element)[0]);
      await press("ArrowLeft");
      expect(tabs(element)[2].getAttribute("aria-selected")).toBe("true");
      await press("Home");
      expect(tabs(element)[0].getAttribute("aria-selected")).toBe("true");
      await press("End");
      expect(tabs(element)[2].getAttribute("aria-selected")).toBe("true");
      expect(await press("a")).toBe(false);
    });

    it("switches between tabs and columns when the screen width crosses 768px", async () => {
      mockPhone(false);
      const element = createComponent();
      getRoadmap.emit(feed("FRESH"));
      await flushPromises();
      expect(tabs(element)).toHaveLength(0);
      matches = true;
      listeners.forEach((fn) => fn({ matches: true }));
      await flushPromises();
      expect(tabs(element)).toHaveLength(3);
      matches = false;
      listeners.forEach((fn) => fn({ matches: false }));
      await flushPromises();
      expect(tabs(element)).toHaveLength(0);
      document.body.removeChild(element);
      expect(listeners).toHaveLength(0);
    });
  });

  it("DEGRADED explains itself in a live region, FRESH says nothing", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("DEGRADED"));
    await flushPromises();

    const note = q(element, '[data-id="status-note"]');
    expect(note.getAttribute("aria-live")).toBe("polite");
    expect(note.textContent.trim()).toBe(STATUS_NOTES.DEGRADED);

    getRoadmap.emit(feed("FRESH"));
    await flushPromises();
    expect(note.textContent.trim()).toBe("");
  });

  it("styles only with design tokens, never a hex colour", () => {
    const css = readFileSync(
      join(__dirname, "..", "roadmapViewer.css"),
      "utf8"
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toMatch(
      /\.simulate-input\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/
    );
  });

  it("formats the age label", () => {
    expect(ageLabel(0)).toBe("Last updated 0 min ago");
    expect(ageLabel(undefined)).toBe("");
  });
  it("places View source and then the live data marker at the right of the title row, as in the cards", () => {
    const element = createComponent();
    const row = q(element, ".roadmap-title-row");
    const control = row.querySelector("c-view-source");
    expect(control).not.toBeNull();
    expect(control.nextElementSibling.tagName).toBe("C-DATA-SOURCE");
    expect(row.lastElementChild.tagName).toBe("C-DATA-SOURCE");
    expect(row.firstElementChild.tagName).toBe("H2");
    expect(control.sourceKey).toBe("roadmapViewer");
  });
});

describe("c-roadmap-viewer live data marker", () => {
  it("places the live data marker with the sources the section reads", () => {
    const html = readFileSync(
      join(__dirname, "..", "roadmapViewer.html"),
      "utf8"
    );
    const marker = html.match(/<c-data-source\s([^>]*)>\s*<\/c-data-source>/);
    expect(marker).not.toBeNull();
    expect(marker[1]).toMatch(/source-keys="DeliveryController_JiraCache"/);
    expect(marker[1]).not.toMatch(/objects=/);
    expect(marker[1]).toMatch(/\shide-counts[\s>]/);
  });

  describe("outage compare", () => {
    it("shows above the board while SIMULATED, with Jira wording and the feed's age", async () => {
      const element = createComponent();
      getRoadmap.emit(
        feed("SIMULATED", {
          ageMinutes: 9,
          failureThreshold: 5,
          openMinutes: 45
        })
      );
      await flushPromises();
      const compare = q(element, "c-outage-compare");
      expect(compare).not.toBeNull();
      expect(compare.source).toBe("Jira");
      expect(compare.subject).toBe("the roadmap");
      expect(compare.ageMinutes).toBe(9);
      expect(compare.failureThreshold).toBe(5);
      expect(compare.openMinutes).toBe(45);
      expect(compare.fetchedAt).toBe("2026-10-21T08:05:00.000Z");
      // It sits above the board, and the board and badge stay.
      const position = compare.compareDocumentPosition(
        q(element, ".roadmap-board")
      );
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(q(element, '[data-id="status-badge"]').textContent).toBe(
        "Simulated"
      );
      expect(element.shadowRoot.querySelectorAll("li")).toHaveLength(4);
    });

    it.each(["FRESH", "STALE", "DEGRADED", "EMPTY"])(
      "is hidden for %s",
      async (status) => {
        const element = createComponent();
        getRoadmap.emit(feed(status));
        await flushPromises();
        expect(q(element, "c-outage-compare")).toBeNull();
      }
    );

    it("appears when the switch turns the feed to SIMULATED and goes when it is off", async () => {
      const element = createComponent();
      getRoadmap.emit(feed("FRESH"));
      await flushPromises();
      expect(q(element, "c-outage-compare")).toBeNull();
      q(element, '[data-id="simulate-switch"]').click();
      await flushPromises();
      expect(trackEvent).toHaveBeenCalledWith("resilience_test_triggered", {
        source: "roadmap"
      });
      getRoadmap.emit(feed("SIMULATED"));
      await flushPromises();
      expect(q(element, "c-outage-compare")).not.toBeNull();
      setSimulating(false);
      await flushPromises();
      getRoadmap.emit(feed("FRESH"));
      await flushPromises();
      expect(q(element, "c-outage-compare")).toBeNull();
    });
  });
});

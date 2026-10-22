/**
 * @description       : Unit tests for roadmapViewer LWC. DeliveryController.getRoadmap is a
 *                      mocked wire adapter fed with the plan K3 RoadmapFeed shape.
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
  STATUS_NOTES,
  ageLabel
} from "c/roadmapViewer";
import getRoadmap from "@salesforce/apex/DeliveryController.getRoadmap";
import { trackEvent } from "c/analyticsService";

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

  it("EMPTY shows the SAS wording and no board or age label", async () => {
    const element = createComponent();
    getRoadmap.emit(feed("EMPTY"));
    await flushPromises();

    expect(q(element, '[data-id="unavailable"]').textContent.trim()).toBe(
      "Roadmap temporarily unavailable"
    );
    expect(q(element, ".roadmap-board")).toBeNull();
    expect(q(element, '[data-id="age-label"]')).toBeNull();
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
});

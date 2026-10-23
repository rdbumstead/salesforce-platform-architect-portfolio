/**
 * @description       : Unit tests for experienceTimeline (Round 6 plan N6). The getTimeline wire
 *                      adapter and analyticsService are mocked.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/22/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ExperienceTimeline from "c/experienceTimeline";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import { trackEvent } from "c/analyticsService";
import { formatMonthYear, formatRoleDates } from "../experienceTimeline";

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
    EVENTS: { TIMELINE_TAB_CHANGED: "timeline_tab_changed" }
  }),
  { virtual: true }
);

const TIMELINE = {
  work: [
    {
      key: "a05000000000001AAA",
      title: "Technical Architect",
      employer: "Acme",
      startDate: "2024-01-01",
      endDate: null,
      isCurrent: true
    },
    {
      key: "a05000000000002AAA",
      title: "Developer",
      employer: "Globex",
      startDate: "2019-07-01",
      endDate: "2023-12-31",
      isCurrent: false
    }
  ],
  education: [
    {
      key: "a06000000000001AAA",
      school: "State University",
      credential: "BSc",
      fieldOfStudy: "Computer Science",
      completedDate: "2015-05-01"
    }
  ]
};

const flushPromises = () => new Promise((resolve) => process.nextTick(resolve));

async function render(data) {
  const element = createElement("c-experience-timeline", {
    is: ExperienceTimeline
  });
  document.body.appendChild(element);
  if (data !== undefined) {
    getTimeline.emit(data);
  }
  await flushPromises();
  return element;
}

const query = (element, selector) => element.shadowRoot.querySelector(selector);
const queryAll = (element, selector) =>
  Array.from(element.shadowRoot.querySelectorAll(selector));
const tab = (element, name) =>
  query(element, `[role="tab"][data-tab="${name}"]`);
const panel = (element, name) => query(element, `[data-panel="${name}"]`);

function keydown(target, key) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  );
}

describe("c-experience-timeline", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("renders nothing before the wire returns", async () => {
    const element = await render();
    expect(element.shadowRoot.childNodes).toHaveLength(0);
  });

  it("renders nothing when both lists are empty", async () => {
    const element = await render({ work: [], education: [] });
    expect(query(element, "section")).toBeNull();
    expect(element.shadowRoot.childNodes).toHaveLength(0);
  });

  it("renders nothing on an error", async () => {
    const element = createElement("c-experience-timeline", {
      is: ExperienceTimeline
    });
    document.body.appendChild(element);
    getTimeline.error();
    await flushPromises();
    expect(query(element, "section")).toBeNull();
  });

  it("renders the section in the home page style", async () => {
    const element = await render(TIMELINE);
    expect(query(element, ".section-label").textContent).toContain(
      "03 / WORK AND EDUCATION"
    );
    const heading = query(element, "h2.section-heading");
    expect(heading).not.toBeNull();
    expect(query(element, "section").getAttribute("aria-labelledby")).toBe(
      heading.getAttribute("id")
    );
  });

  it("renders an accessible tab list with Work selected first", async () => {
    const element = await render(TIMELINE);
    expect(query(element, '[role="tablist"]')).not.toBeNull();
    expect(queryAll(element, '[role="tab"]')).toHaveLength(2);
    expect(tab(element, "work").getAttribute("aria-selected")).toBe("true");
    expect(tab(element, "work").getAttribute("tabindex")).toBe("0");
    expect(tab(element, "education").getAttribute("aria-selected")).toBe(
      "false"
    );
    expect(tab(element, "education").getAttribute("tabindex")).toBe("-1");
    expect(panel(element, "work").getAttribute("role")).toBe("tabpanel");
    expect(panel(element, "work").hidden).toBe(false);
    expect(panel(element, "education").hidden).toBe(true);
    expect(tab(element, "work").getAttribute("aria-controls")).toBe(
      panel(element, "work").getAttribute("id")
    );
    expect(panel(element, "work").getAttribute("aria-labelledby")).toBe(
      tab(element, "work").getAttribute("id")
    );
  });

  it("shows each role as title, employer and date range", async () => {
    const element = await render(TIMELINE);
    const rows = queryAll(element, '[data-panel="work"] .entry');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".entry-title").textContent).toBe(
      "Technical Architect"
    );
    expect(rows[0].querySelector(".entry-org").textContent).toBe("Acme");
    expect(rows[0].querySelector(".entry-dates").textContent).toBe(
      "Jan 2024 to Present"
    );
    expect(rows[1].querySelector(".entry-dates").textContent).toBe(
      "Jul 2019 to Dec 2023"
    );
  });

  it("shows each school as school, credential and field, and completion", async () => {
    const element = await render(TIMELINE);
    const row = query(element, '[data-panel="education"] .entry');
    expect(row.querySelector(".entry-title").textContent).toBe(
      "State University"
    );
    expect(row.querySelector(".entry-org").textContent).toBe(
      "BSc, Computer Science"
    );
    expect(row.querySelector(".entry-dates").textContent).toBe("May 2015");
  });

  it("switches tabs on click and sends the analytics event", async () => {
    const element = await render(TIMELINE);
    tab(element, "education").click();
    await flushPromises();
    expect(tab(element, "education").getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(panel(element, "education").hidden).toBe(false);
    expect(panel(element, "work").hidden).toBe(true);
    expect(trackEvent).toHaveBeenCalledWith("timeline_tab_changed", {
      tab: "education"
    });
  });

  it("does not send an event when the active tab is clicked again", async () => {
    const element = await render(TIMELINE);
    tab(element, "work").click();
    await flushPromises();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("moves between tabs with the arrow, Home and End keys and moves focus", async () => {
    const element = await render(TIMELINE);
    const list = query(element, '[role="tablist"]');

    keydown(tab(element, "work"), "ArrowRight");
    await flushPromises();
    expect(tab(element, "education").getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(element.shadowRoot.activeElement).toBe(tab(element, "education"));

    keydown(tab(element, "education"), "ArrowRight");
    await flushPromises();
    expect(tab(element, "work").getAttribute("aria-selected")).toBe("true");
    expect(element.shadowRoot.activeElement).toBe(tab(element, "work"));

    keydown(tab(element, "work"), "ArrowLeft");
    await flushPromises();
    expect(tab(element, "education").getAttribute("aria-selected")).toBe(
      "true"
    );

    keydown(list, "Home");
    await flushPromises();
    expect(tab(element, "work").getAttribute("aria-selected")).toBe("true");

    keydown(list, "End");
    await flushPromises();
    expect(tab(element, "education").getAttribute("aria-selected")).toBe(
      "true"
    );
  });

  it("ignores other keys", async () => {
    const element = await render(TIMELINE);
    keydown(tab(element, "work"), "Enter");
    await flushPromises();
    expect(tab(element, "work").getAttribute("aria-selected")).toBe("true");
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("hides the Education tab when there are no schools", async () => {
    const element = await render({ work: TIMELINE.work, education: [] });
    expect(tab(element, "education")).toBeNull();
    expect(panel(element, "education")).toBeNull();
    expect(queryAll(element, '[role="tab"]')).toHaveLength(1);
    expect(tab(element, "work").getAttribute("aria-selected")).toBe("true");
  });

  it("hides the Work tab and selects Education when there are no roles", async () => {
    const element = await render({ work: [], education: TIMELINE.education });
    expect(tab(element, "work")).toBeNull();
    expect(panel(element, "work")).toBeNull();
    expect(tab(element, "education").getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(panel(element, "education").hidden).toBe(false);
  });

  it("stays on one tab when the only tab gets an arrow key", async () => {
    const element = await render({ work: TIMELINE.work, education: [] });
    keydown(tab(element, "work"), "ArrowRight");
    await flushPromises();
    expect(tab(element, "work").getAttribute("aria-selected")).toBe("true");
    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe("experienceTimeline date format", () => {
  it("formats an Apex date as Mon YYYY without a time zone shift", () => {
    expect(formatMonthYear("2024-01-01")).toBe("Jan 2024");
    expect(formatMonthYear("2023-12-31")).toBe("Dec 2023");
    expect(formatMonthYear(null)).toBe("");
    expect(formatMonthYear("not a date")).toBe("");
  });

  it("formats a role range", () => {
    expect(formatRoleDates({ startDate: "2024-01-01", isCurrent: true })).toBe(
      "Jan 2024 to Present"
    );
    expect(
      formatRoleDates({
        startDate: "2019-07-01",
        endDate: "2023-12-31",
        isCurrent: false
      })
    ).toBe("Jul 2019 to Dec 2023");
    expect(
      formatRoleDates({
        startDate: "2019-07-01",
        endDate: null,
        isCurrent: false
      })
    ).toBe("Jul 2019 to Present");
    expect(
      formatRoleDates({
        startDate: null,
        endDate: "2020-01-01",
        isCurrent: false
      })
    ).toBe("Jan 2020");
  });
});

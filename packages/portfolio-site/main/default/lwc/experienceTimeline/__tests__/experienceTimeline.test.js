/**
 * @description       : Unit tests for experienceTimeline. The getTimeline wire
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
import {
  formatMonthYear,
  formatRoleDates,
  toTabLimit
} from "../experienceTimeline";

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
    EVENTS: {
      TIMELINE_TAB_CHANGED: "timeline_tab_changed",
      TIMELINE_EXPANDED: "timeline_expanded"
    }
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
      "03 / WORK, EDUCATION AND CERTIFICATIONS"
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

const VERIFY_URL =
  "https://trailhead.salesforce.com/en/credentials/verification/?searchString=a+b+c";

const CERTIFICATIONS = [
  {
    id: "a07000000000001AAA",
    name: "Application Architect",
    issuer: "Salesforce",
    earnedDate: "2025-03-01"
  },
  {
    id: "a07000000000002AAA",
    name: "Platform Developer I",
    issuer: "Salesforce",
    earnedDate: "2022-11-15"
  }
];

function roles(count) {
  return Array.from({ length: count }, (unused, index) => ({
    key: `a0500000000010${index}AAA`,
    title: `Role ${index + 1}`,
    employer: "Acme",
    startDate: "2020-01-01",
    endDate: "2021-01-01",
    isCurrent: false
  }));
}

function schools(count) {
  return Array.from({ length: count }, (unused, index) => ({
    key: `a0600000000010${index}AAA`,
    school: `School ${index + 1}`,
    credential: "BSc",
    fieldOfStudy: null,
    completedDate: "2015-05-01"
  }));
}

const toggle = (element, name) =>
  query(element, `[data-panel="${name}"] button.toggle`);
const rows = (element, name) =>
  queryAll(element, `[data-panel="${name}"] .entry`);

describe("c-experience-timeline certifications tab", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("adds a Certifications tab last, with name, issuer and earned month", async () => {
    const element = await render({
      ...TIMELINE,
      certifications: CERTIFICATIONS
    });
    expect(
      queryAll(element, '[role="tab"]').map((node) => node.textContent.trim())
    ).toEqual(["Work", "Education", "Certifications"]);
    const certificationTab = tab(element, "certifications");
    expect(certificationTab.getAttribute("aria-selected")).toBe("false");
    expect(certificationTab.getAttribute("aria-controls")).toBe(
      panel(element, "certifications").getAttribute("id")
    );
    expect(panel(element, "certifications").hidden).toBe(true);
    const entries = rows(element, "certifications");
    expect(entries).toHaveLength(2);
    expect(entries[0].querySelector(".entry-title").textContent).toBe(
      "Application Architect"
    );
    expect(entries[0].querySelector(".entry-org").textContent).toBe(
      "Salesforce"
    );
    expect(entries[0].querySelector(".entry-dates").textContent).toBe(
      "Mar 2025"
    );
  });

  it("sends timeline_tab_changed with the certifications tab value", async () => {
    const element = await render({
      ...TIMELINE,
      certifications: CERTIFICATIONS
    });
    tab(element, "certifications").click();
    await flushPromises();
    expect(panel(element, "certifications").hidden).toBe(false);
    expect(trackEvent).toHaveBeenCalledWith("timeline_tab_changed", {
      tab: "certifications"
    });
  });

  it("reaches the Certifications tab with End and wraps with ArrowRight", async () => {
    const element = await render({
      ...TIMELINE,
      certifications: CERTIFICATIONS
    });
    keydown(tab(element, "work"), "End");
    await flushPromises();
    expect(tab(element, "certifications").getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(element.shadowRoot.activeElement).toBe(
      tab(element, "certifications")
    );
    keydown(tab(element, "certifications"), "ArrowRight");
    await flushPromises();
    expect(tab(element, "work").getAttribute("aria-selected")).toBe("true");
  });

  it("selects Certifications when it is the only list", async () => {
    const element = await render({
      work: [],
      education: [],
      certifications: CERTIFICATIONS
    });
    expect(queryAll(element, '[role="tab"]')).toHaveLength(1);
    expect(tab(element, "certifications").getAttribute("aria-selected")).toBe(
      "true"
    );
    expect(panel(element, "certifications").hidden).toBe(false);
  });

  it("hides the Certifications tab when there are none", async () => {
    const element = await render({ ...TIMELINE, certifications: [] });
    expect(tab(element, "certifications")).toBeNull();
    expect(panel(element, "certifications")).toBeNull();
  });

  it("links Verify on Trailhead with the exact href, in a new tab", async () => {
    const element = await render({
      ...TIMELINE,
      certifications: CERTIFICATIONS,
      verificationUrl: VERIFY_URL
    });
    const links = queryAll(element, '[data-id="verify-link"]');
    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link.closest('[data-panel="certifications"]')).not.toBeNull();
    expect(link.getAttribute("href")).toBe(VERIFY_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toBe("Verify on Trailhead, opens in a new tab");
  });

  it("shows no verification link without a usable value", async () => {
    // The script URL is the input under test, proving it never renders.
    // eslint-disable-next-line no-script-url
    for (const verificationUrl of [null, "", "javascript:alert(1)"]) {
      const element = await render({
        ...TIMELINE,
        certifications: CERTIFICATIONS,
        verificationUrl
      });
      expect(query(element, '[data-id="verify-link"]')).toBeNull();
      document.body.removeChild(element);
    }
  });
});

describe("c-experience-timeline View all", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  it("shows the first five and a View all N button that names its list", async () => {
    const element = await render({ work: roles(7), education: [] });
    expect(rows(element, "work")).toHaveLength(5);
    expect(
      rows(element, "work")[0].querySelector(".entry-title").textContent
    ).toBe("Role 1");
    const button = toggle(element, "work");
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.textContent.trim()).toBe("View all 7");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    const list = query(element, '[data-panel="work"] ol');
    expect(button.getAttribute("aria-controls")).toBe(list.getAttribute("id"));
  });

  it("reveals the rest in place, keeps focus, then shows fewer again", async () => {
    const element = await render({ work: roles(7), education: [] });
    let button = toggle(element, "work");
    button.focus();
    button.click();
    await flushPromises();

    button = toggle(element, "work");
    expect(rows(element, "work")).toHaveLength(7);
    expect(button.textContent.trim()).toBe("Show fewer");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(element.shadowRoot.activeElement).toBe(button);
    expect(trackEvent).toHaveBeenCalledWith("timeline_expanded", {
      tab: "work",
      expanded: true
    });

    button.click();
    await flushPromises();
    button = toggle(element, "work");
    expect(rows(element, "work")).toHaveLength(5);
    expect(button.textContent.trim()).toBe("View all 7");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(element.shadowRoot.activeElement).toBe(button);
    expect(trackEvent).toHaveBeenLastCalledWith("timeline_expanded", {
      tab: "work",
      expanded: false
    });
  });

  it("keeps each tab's own state", async () => {
    const element = await render({ work: roles(7), education: schools(6) });
    toggle(element, "work").click();
    await flushPromises();
    tab(element, "education").click();
    await flushPromises();
    expect(rows(element, "education")).toHaveLength(5);
    expect(toggle(element, "education").textContent.trim()).toBe("View all 6");
    tab(element, "work").click();
    await flushPromises();
    expect(rows(element, "work")).toHaveLength(7);
    expect(toggle(element, "work").textContent.trim()).toBe("Show fewer");
  });

  it("renders no button when a tab has the limit or fewer", async () => {
    const element = await render({ work: roles(5), education: schools(2) });
    expect(rows(element, "work")).toHaveLength(5);
    expect(toggle(element, "work")).toBeNull();
    expect(toggle(element, "education")).toBeNull();
  });

  it("uses the limit the server sends", async () => {
    const element = await render({
      work: roles(4),
      education: [],
      tabLimit: 2
    });
    expect(rows(element, "work")).toHaveLength(2);
    expect(toggle(element, "work").textContent.trim()).toBe("View all 4");
  });

  it("caps the Certifications tab the same way", async () => {
    const many = Array.from({ length: 6 }, (unused, index) => ({
      id: `a0700000000010${index}AAA`,
      name: `Certification ${index + 1}`,
      issuer: "Salesforce",
      earnedDate: "2024-01-01"
    }));
    const element = await render({
      work: [],
      education: [],
      certifications: many,
      verificationUrl: VERIFY_URL
    });
    expect(rows(element, "certifications")).toHaveLength(5);
    expect(toggle(element, "certifications").textContent.trim()).toBe(
      "View all 6"
    );
    expect(query(element, '[data-id="verify-link"]')).not.toBeNull();
  });
});

describe("experienceTimeline tab limit", () => {
  it("takes a whole number of one or more and falls back to five", () => {
    expect(toTabLimit(3)).toBe(3);
    expect(toTabLimit(1)).toBe(1);
    expect(toTabLimit(0)).toBe(5);
    expect(toTabLimit(-2)).toBe(5);
    expect(toTabLimit(2.5)).toBe(5);
    expect(toTabLimit("4")).toBe(5);
    expect(toTabLimit(undefined)).toBe(5);
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

/**
 * @description       : Unit tests for careerLine LWC: one stop per employer on the work track,
 *                      the part time rule for the stop title, the Earlier roles stop with one
 *                      line per role and the resume link, the disclosure buttons (several open
 *                      at once, aria-expanded and aria-controls, focus kept), Expand all and
 *                      Collapse all, the part time label and highlights in a panel, reduced
 *                      motion, the two analytics events, the resume button, and nothing on an
 *                      error. Employer names are invented.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { createElement } from "@lwc/engine-dom";
import CareerLine, {
  buildStops,
  employerYears,
  foldYears,
  foldsAway,
  formatYears,
  highlightsOf,
  isCurrentRole,
  rolesLabel,
  toStartYear
} from "c/careerLine";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import { trackEvent } from "c/analyticsService";
import { isReduced } from "c/motionPreference";

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
      CAREER_ROLE_OPENED: "career_role_opened",
      CAREER_TIMELINE_TOGGLED: "career_timeline_toggled"
    }
  }),
  { virtual: true }
);

jest.mock("c/motionPreference", () => ({
  __esModule: true,
  isReduced: jest.fn(() => false),
  onMotionChange: jest.fn(() => () => {})
}));

jest.mock(
  "@salesforce/apex/ResumeController.getTimeline",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

const WORK = [
  {
    key: "a01",
    title: "Lead Consultant",
    employer: "Northwind Digital",
    startDate: "2026-04-14",
    endDate: null,
    isCurrent: true,
    isPartTime: false,
    highlights: ["Led the platform rollout", "Cut onboarding time"]
  },
  {
    key: "a02",
    title: "Solution Architect",
    employer: "Freelance (part time)",
    startDate: "2021-10-01",
    endDate: null,
    isCurrent: true,
    isPartTime: true,
    highlights: []
  },
  {
    key: "a03",
    title: "Application Specialist",
    employer: "Lakeside College",
    startDate: "2017-07-01",
    endDate: "2021-06-30",
    isCurrent: false,
    isPartTime: false,
    highlights: ["One", "Two", "Three", "Four"]
  },
  {
    key: "a04",
    title: "Evening Instructor",
    employer: "Lakeside College",
    startDate: "2017-12-01",
    endDate: "2021-06-30",
    isCurrent: false,
    isPartTime: true,
    highlights: ["Taught evening classes"]
  },
  {
    key: "a05",
    title: "Support Technician",
    employer: "Harbor Retail",
    startDate: "2016-01-01",
    endDate: "2016-10-03",
    isCurrent: false,
    isPartTime: false,
    highlights: []
  },
  {
    key: "a06",
    title: "Store Manager",
    employer: "Pine Market",
    startDate: "2012-03-01",
    endDate: "2014-06-30",
    isCurrent: false,
    isPartTime: false,
    highlights: []
  }
];

const TIMELINE = { work: WORK, salesforceStartYear: 2017 };

function flushPromises() {
  return Promise.resolve();
}

async function mount(data = TIMELINE) {
  const element = createElement("c-career-line", { is: CareerLine });
  document.body.appendChild(element);
  getTimeline.emit(data);
  await flushPromises();
  return element;
}

function all(element, id) {
  return Array.from(element.shadowRoot.querySelectorAll(`[data-id="${id}"]`));
}

function one(element, id) {
  return element.shadowRoot.querySelector(`[data-id="${id}"]`);
}

function text(node) {
  return node.textContent.replace(/\s+/g, " ").trim();
}

function stopFor(element, employer) {
  return all(element, "stop").find(
    (stop) => text(stop.querySelector('[data-id="stop-employer"]')) === employer
  );
}

describe("c-career-line helpers", () => {
  it("reads years with to now for a role held now", () => {
    expect(formatYears({ startDate: "2026-04-14", isCurrent: true })).toBe(
      "2026 to now"
    );
    expect(
      formatYears({ startDate: "2021-01-01", endDate: "2026-02-01" })
    ).toBe("2021 to 2026");
    expect(
      formatYears({ startDate: "2016-01-01", endDate: "2016-10-03" })
    ).toBe("2016");
  });

  it("treats a role with no end date as held now", () => {
    expect(isCurrentRole({ endDate: null })).toBe(true);
    expect(isCurrentRole({ endDate: "2020-01-01", isCurrent: false })).toBe(
      false
    );
  });

  it("spans an employer from its earliest start", () => {
    expect(
      employerYears([
        { startDate: "2021-10-01", isCurrent: true },
        { startDate: "2026-04-01", isCurrent: true }
      ])
    ).toBe("2021 to now");
    expect(
      employerYears([
        { startDate: "2017-07-01", endDate: "2021-06-30" },
        { startDate: "2017-12-01", endDate: "2021-06-30" }
      ])
    ).toBe("2017 to 2021");
  });

  it("folds only roles that ended before the start year", () => {
    expect(foldsAway({ endDate: "2016-10-03" }, 2017)).toBe(true);
    expect(foldsAway({ endDate: "2017-07-02" }, 2017)).toBe(false);
    expect(foldsAway({ isCurrent: true }, 2017)).toBe(false);
    expect(
      foldYears([{ startDate: "2012-03-01", endDate: "2016-10-03" }])
    ).toBe("2012 to 2016");
  });

  it("falls back for a bad start year and caps highlights at three", () => {
    expect(toStartYear(2019)).toBe(2019);
    expect(toStartYear(null)).toBe(toStartYear(undefined));
    expect(highlightsOf({ highlights: ["a", " ", "b", "c", "d"] })).toEqual([
      "a",
      "b",
      "c"
    ]);
    expect(highlightsOf({})).toEqual([]);
    expect(rolesLabel(1)).toBe("1 role");
    expect(rolesLabel(4)).toBe("4 roles");
  });

  it("numbers the stops from 1 with the fold last", () => {
    const stops = buildStops(TIMELINE);
    expect(stops.map((stop) => stop.position)).toEqual([1, 2, 3, 4]);
    expect(stops[stops.length - 1].key).toBe("earlier-roles");
  });
});

describe("c-career-line", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
    isReduced.mockReturnValue(false);
  });

  it("renders one stop per employer as an ordered list, with the fold last", async () => {
    const element = await mount();
    const track = one(element, "track");
    expect(track.tagName).toBe("OL");
    const names = all(element, "stop-employer").map(text);
    expect(names).toEqual([
      "Northwind Digital",
      "Freelance (part time)",
      "Lakeside College",
      "Earlier roles"
    ]);
  });

  it("shows the span, the count and no filters, certs or school", async () => {
    const element = await mount();
    const spans = all(element, "stop-span").map(text);
    expect(spans).toEqual([
      "2026 to now",
      "2021 to now",
      "2017 to 2021",
      "2012 to 2016"
    ]);
    const toggles = all(element, "toggle").map(text);
    expect(toggles).toEqual([
      "1 role · Details ▾",
      "1 role · Details ▾",
      "2 roles · Details ▾",
      "2 roles · Details ▾"
    ]);
    expect(element.shadowRoot.querySelector(".filters")).toBeNull();
    expect(one(element, "verify-link")).toBeNull();
    expect(text(one(element, "career-heading"))).toBe("Work");
  });

  it("marks a current employer with a filled dot, a past one outlined, the fold gray", async () => {
    const element = await mount();
    const dots = all(element, "stop").map((stop) => stop.querySelector(".dot"));
    expect(dots[0].classList.contains("dot-current")).toBe(true);
    expect(dots[2].classList.contains("dot-current")).toBe(false);
    expect(dots[3].classList.contains("dot-fold")).toBe(true);
  });

  it("picks the full time title for a stop with an overlapping part time role", async () => {
    const element = await mount();
    const stop = stopFor(element, "Lakeside College");
    expect(text(stop.querySelector('[data-id="stop-title"]'))).toBe(
      "Application Specialist"
    );
  });

  it("uses the newest role when every role at an employer is part time", () => {
    const stops = buildStops({
      work: [
        {
          key: "p1",
          title: "Weekend Tutor",
          employer: "Maple Learning",
          startDate: "2020-01-01",
          endDate: "2022-01-01",
          isPartTime: true
        },
        {
          key: "p2",
          title: "Evening Tutor",
          employer: "Maple Learning",
          startDate: "2018-01-01",
          endDate: "2019-01-01",
          isPartTime: true
        }
      ],
      salesforceStartYear: 2017
    });
    expect(stops[0].title).toBe("Weekend Tutor");
  });

  it("adds part time to the years of a part time role in its panel", async () => {
    const element = await mount();
    const stop = stopFor(element, "Lakeside College");
    const years = Array.from(
      stop.querySelectorAll('[data-id="role-years"]')
    ).map(text);
    expect(years).toEqual(["2017 to 2021 · part time", "2017 to 2021"]);
    const titles = Array.from(
      stop.querySelectorAll('[data-id="role-title"]')
    ).map(text);
    expect(titles).toContain("Evening Instructor");
  });

  it("lists at most three highlights per role, each as its own bullet", async () => {
    const element = await mount();
    const stop = stopFor(element, "Lakeside College");
    const bullets = Array.from(stop.querySelectorAll('[data-id="highlight"]'));
    expect(bullets.map(text)).toEqual([
      "Taught evening classes",
      "One",
      "Two",
      "Three"
    ]);
  });

  it("lists each earlier role on one line with no bullets, then the resume link", async () => {
    const element = await mount();
    const stop = stopFor(element, "Earlier roles");
    const lines = Array.from(
      stop.querySelectorAll('[data-id="earlier-role"]')
    ).map(text);
    expect(lines).toEqual([
      "Support Technician, Harbor Retail, 2016",
      "Store Manager, Pine Market, 2012 to 2014"
    ]);
    expect(stop.querySelector('[data-id="highlight"]')).toBeNull();
    const link = stop.querySelector('[data-id="fold-resume-link"]');
    expect(text(link)).toBe("See the full resume →");
    expect(link.getAttribute("href")).toBe("/portfolio/resume");
  });

  it("flips aria-expanded and matches aria-controls to the panel id", async () => {
    const element = await mount();
    const button = all(element, "toggle")[0];
    const panel = all(element, "panel")[0];
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.id).toBeTruthy();
    button.click();
    await flushPromises();
    const after = all(element, "toggle")[0];
    expect(after.getAttribute("aria-expanded")).toBe("true");
    expect(text(after)).toBe("1 role · Hide ▴");
    after.click();
    await flushPromises();
    expect(all(element, "toggle")[0].getAttribute("aria-expanded")).toBe(
      "false"
    );
  });

  it("keeps focus on the pressed button", async () => {
    const element = await mount();
    const button = all(element, "toggle")[1];
    button.focus();
    button.click();
    await flushPromises();
    expect(element.shadowRoot.activeElement).toBe(all(element, "toggle")[1]);
  });

  it("lets several stops stay open at once", async () => {
    const element = await mount();
    all(element, "toggle")[0].click();
    await flushPromises();
    all(element, "toggle")[2].click();
    await flushPromises();
    const open = all(element, "toggle").map((button) =>
      button.getAttribute("aria-expanded")
    );
    expect(open).toEqual(["true", "false", "true", "false"]);
  });

  it("opens every panel with Expand all and flips to Collapse all", async () => {
    const element = await mount();
    const button = one(element, "expand-all");
    expect(text(button)).toBe("Expand all");
    button.click();
    await flushPromises();
    expect(
      all(element, "toggle").every(
        (toggle) => toggle.getAttribute("aria-expanded") === "true"
      )
    ).toBe(true);
    expect(text(one(element, "expand-all"))).toBe("Collapse all");
    one(element, "expand-all").click();
    await flushPromises();
    expect(
      all(element, "toggle").every(
        (toggle) => toggle.getAttribute("aria-expanded") === "false"
      )
    ).toBe(true);
    expect(text(one(element, "expand-all"))).toBe("Expand all");
  });

  it("reads Collapse all once the last single stop is opened by hand", async () => {
    const element = await mount();
    for (let i = 0; i < 4; i += 1) {
      all(element, "toggle")[i].click();
      await flushPromises();
    }
    expect(text(one(element, "expand-all"))).toBe("Collapse all");
  });

  it("sends career_role_opened with the position on open only", async () => {
    const element = await mount();
    all(element, "toggle")[2].click();
    await flushPromises();
    expect(trackEvent).toHaveBeenCalledWith("career_role_opened", {
      position: 3
    });
    all(element, "toggle")[2].click();
    await flushPromises();
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("sends career_timeline_toggled with expanded for Expand all and Collapse all", async () => {
    const element = await mount();
    one(element, "expand-all").click();
    await flushPromises();
    expect(trackEvent).toHaveBeenLastCalledWith("career_timeline_toggled", {
      expanded: true
    });
    one(element, "expand-all").click();
    await flushPromises();
    expect(trackEvent).toHaveBeenLastCalledWith("career_timeline_toggled", {
      expanded: false
    });
    expect(trackEvent).toHaveBeenCalledTimes(2);
  });

  it("turns the reveal off under reduced motion", async () => {
    isReduced.mockReturnValue(true);
    const element = await mount();
    expect(one(element, "career").classList.contains("career-still")).toBe(
      true
    );
  });

  it("keeps the reveal on when motion is allowed", async () => {
    const element = await mount();
    expect(one(element, "career").classList.contains("career-still")).toBe(
      false
    );
  });

  it("shows one primary resume button under the track", async () => {
    const element = await mount();
    const link = one(element, "resume-link");
    expect(text(link)).toBe("See the full resume →");
    expect(link.getAttribute("href")).toBe("/portfolio/resume");
    expect(link.classList.contains("btn-primary")).toBe(true);
    expect(element.shadowRoot.querySelectorAll(".btn-primary")).toHaveLength(1);
  });

  it("renders nothing on an error or with no roles", async () => {
    const element = createElement("c-career-line", { is: CareerLine });
    document.body.appendChild(element);
    getTimeline.error();
    await flushPromises();
    expect(one(element, "track")).toBeNull();
    getTimeline.emit({ work: [], salesforceStartYear: 2017 });
    await flushPromises();
    expect(one(element, "track")).toBeNull();
  });
});

/**
 * @description       : Unit tests for careerLine LWC. The timeline is computed from the read and
 *                      the visitor's clock, so these use synthetic timelines with invented names
 *                      and prove nothing is fixed in the code: the fixture timeline, no roles
 *                      before the start year, no start year, two current full time employers, a
 *                      part time employer that overlaps nothing, an employer with two stints, one
 *                      employer only, ten employers with short stints, and today moved to a later
 *                      year. Also the rows (path, Also line, pills, panels),
 *                      the disclosure buttons, Expand all, no subtitle, reduced motion, the two
 *                      analytics events, the resume button and nothing on an error. Today is
 *                      fixed at 10 November 2026 unless a test moves it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { createElement } from "@lwc/engine-dom";
import CareerLine, {
  buildScale,
  buildStops,
  buildTimeline,
  employerYears,
  foldYears,
  foldsAway,
  formatYears,
  highlightsOf,
  isCurrentRole,
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

const TODAY = new Date(2026, 10, 10);

function role(title, employer, start, end, extra = {}) {
  return {
    key: `${employer}-${title}-${start}`.toLowerCase().replace(/\W+/g, "-"),
    title,
    employer,
    startDate: start,
    endDate: end,
    isCurrent: !end,
    isPartTime: false,
    highlights: [],
    ...extra
  };
}

const WORK = [
  role("Lead Consultant", "Northwind Digital", "2026-04-14", null, {
    highlights: ["Led the platform rollout", "Cut onboarding time"]
  }),
  role("Solution Architect", "Freelance Studio", "2021-10-01", null, {
    isPartTime: true
  }),
  role(
    "Application Specialist",
    "Lakeside College",
    "2017-07-01",
    "2021-06-30",
    {
      highlights: ["One", "Two", "Three", "Four"]
    }
  ),
  role("Evening Instructor", "Lakeside College", "2017-12-01", "2021-06-30", {
    isPartTime: true,
    highlights: ["Taught evening classes"]
  }),
  role("Associate Analyst", "Lakeside College", "2016-01-04", "2017-06-30"),
  role("Support Technician", "Harbor Retail", "2015-01-01", "2015-10-03"),
  role("Store Manager", "Pine Market", "2012-03-01", "2014-06-30")
];

const TIMELINE = { work: WORK, salesforceStartYear: 2017 };

// A mirror of the scale for the fixture, written out here so the test checks the code.
function position(ms, today, startMs) {
  const linear = 0.14 + (0.86 * (ms - startMs)) / (today - startMs);
  return 1 - linear;
}

function utc(date) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

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

function within(row, id) {
  return row.querySelector(`[data-id="${id}"]`);
}

function rowFor(element, employer) {
  return all(element, "stop").find(
    (row) => text(row.querySelector('[data-id="stop-employer"]')) === employer
  );
}

function tickTexts(timeline) {
  return timeline.ribbon.ticks.map((tick) => tick.text);
}

beforeAll(() => {
  jest.useFakeTimers({
    now: TODAY,
    doNotFake: [
      "hrtime",
      "nextTick",
      "performance",
      "queueMicrotask",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "requestIdleCallback",
      "cancelIdleCallback",
      "setImmediate",
      "clearImmediate",
      "setInterval",
      "clearInterval",
      "setTimeout",
      "clearTimeout"
    ]
  });
});

afterAll(() => {
  jest.useRealTimers();
});

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

  it("spans an employer from its earliest start and folds years", () => {
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
    expect(
      foldYears([{ startDate: "2012-03-01", endDate: "2016-10-03" }])
    ).toBe("2012 to 2016");
  });

  it("folds only roles that ended before the start year, and none without one", () => {
    expect(foldsAway({ endDate: "2016-10-03" }, 2017)).toBe(true);
    expect(foldsAway({ endDate: "2017-07-02" }, 2017)).toBe(false);
    expect(foldsAway({ isCurrent: true }, 2017)).toBe(false);
    expect(foldsAway({ endDate: "2010-01-01" }, null)).toBe(false);
  });

  it("takes only a whole positive start year and caps highlights at three", () => {
    expect(toStartYear(2019)).toBe(2019);
    expect(toStartYear(null)).toBeNull();
    expect(toStartYear(undefined)).toBeNull();
    expect(toStartYear("2019")).toBeNull();
    expect(toStartYear(0)).toBeNull();
    expect(highlightsOf({ highlights: ["a", " ", "b", "c", "d"] })).toEqual([
      "a",
      "b",
      "c"
    ]);
    expect(highlightsOf({})).toEqual([]);
  });

  it("puts today at 0 and the earliest January at 1 on a linear scale", () => {
    const scale = buildScale({
      today: utc("2026-11-10"),
      earliest: utc("2012-03-01"),
      startYear: null,
      hasFold: false
    });
    expect(scale.share).toBe(0);
    expect(scale.compressed).toBe(false);
    expect(scale.position(utc("2026-11-10"))).toBeCloseTo(0, 9);
    expect(scale.position(utc("2012-01-01"))).toBeCloseTo(1, 9);
  });
});

describe("c-career-line timeline from synthetic data", () => {
  const today = utc("2026-11-10");
  const startMs = utc("2017-01-01");

  it("1. fixture: folds, compresses, orders, ticks and pills", () => {
    const timeline = buildTimeline(TIMELINE, TODAY);
    const stops = timeline.stops;
    expect(stops.map((stop) => stop.employer)).toEqual([
      "Northwind Digital",
      "Freelance Studio",
      "Lakeside College",
      "Earlier roles"
    ]);
    expect(stops.map((stop) => stop.position)).toEqual([1, 2, 3, 4]);
    expect(stops[3].isFold).toBe(true);
    expect(stops[3].roleCount).toBe(2);
    expect(stops[3].span).toBe("2012 to 2015");
    expect(stops[0].tone).toBe("now");
    expect(stops[1].tone).toBe("side");
    expect(stops[1].alongside).toBe(true);
    expect(stops[2].path.map((step) => step.text)).toEqual([
      "Associate Analyst",
      "Application Specialist"
    ]);
    expect(stops[2].also).toBe("Also Evening Instructor, part time");
    expect(timeline.scale.share).toBe(0.14);
    expect(timeline.scale.compressed).toBe(true);
    expect(timeline.ribbon).not.toHaveProperty("hasBreak");
    expect(timeline).not.toHaveProperty("subtitle");
    expect(tickTexts(timeline)).toEqual([
      "Today · 2026",
      "2023",
      "2021",
      "2019",
      "2017",
      "2012"
    ]);
    const bars = timeline.ribbon.mainBars;
    expect(bars).toHaveLength(3);
    const first = utc("2026-04-14");
    expect(bars[0].left).toBe(0);
    expect(bars[0].width).toBeCloseTo(
      position(first, today, startMs) - 0.002,
      6
    );
    expect(bars[2].left).toBeCloseTo(0.862, 6);
    expect(bars[2].left + bars[2].width).toBeCloseTo(1, 9);
    expect(timeline.ribbon.sideBars).toHaveLength(1);
  });

  it("2. no roles before the start year: no fold, no break, a linear scale", () => {
    const work = WORK.filter(
      (item) => !/Harbor|Pine|Associate/.test(item.employer + item.title)
    );
    const timeline = buildTimeline({ work, salesforceStartYear: 2017 }, TODAY);
    expect(timeline.stops.some((stop) => stop.isFold)).toBe(false);
    expect(timeline.scale.share).toBe(0);
    expect(timeline.scale.compressed).toBe(false);
    expect(timeline.scale.earliestYear).toBe(2017);
    expect(timeline.scale.position(utc("2017-01-01"))).toBeCloseTo(1, 9);
    expect(tickTexts(timeline)).not.toContain("Earlier roles");
  });

  it("3. no start year: no fold, no compression, every role on the list", () => {
    const timeline = buildTimeline({ work: WORK }, TODAY);
    expect(timeline.startYear).toBeNull();
    expect(timeline.stops.some((stop) => stop.isFold)).toBe(false);
    expect(timeline.stops.map((stop) => stop.employer)).toEqual([
      "Northwind Digital",
      "Freelance Studio",
      "Lakeside College",
      "Harbor Retail",
      "Pine Market"
    ]);
    expect(timeline.scale.share).toBe(0);
    expect(timeline.scale.earliestYear).toBe(2012);
    expect(timeline.scale.compressed).toBe(false);
    const bad = buildTimeline(
      { work: WORK, salesforceStartYear: "soon" },
      TODAY
    );
    expect(bad.stops.some((stop) => stop.isFold)).toBe(false);
    expect(tickTexts(timeline)[0]).toBe("Today · 2026");
    expect(tickTexts(timeline)[tickTexts(timeline).length - 1]).toBe("2012");
  });

  it("4. two current full time employers each show Now and stack on two lanes", async () => {
    const work = [
      role("Lead", "Alpha Works", "2024-01-01", null),
      role("Advisor", "Beta Labs", "2023-06-01", null)
    ];
    const timeline = buildTimeline({ work, salesforceStartYear: 2020 }, TODAY);
    expect(timeline.stops.map((stop) => stop.tone)).toEqual(["now", "now"]);
    expect(timeline.ribbon.mainLanes).toBe(2);
    expect(timeline.ribbon.mainBars.map((bar) => bar.lane).sort()).toEqual([
      0, 1
    ]);
    const element = await mount({ work, salesforceStartYear: 2020 });
    expect(all(element, "pill-now")).toHaveLength(2);
  });

  it("5. a part time employer that overlaps no full time employer reads Part time", async () => {
    const work = [
      role("Lead", "Alpha Works", "2023-01-01", null),
      role("Tutor", "Gamma Tutoring", "2018-01-01", "2019-06-30", {
        isPartTime: true
      })
    ];
    const data = { work, salesforceStartYear: 2017 };
    const timeline = buildTimeline(data, TODAY);
    expect(timeline.stops[1].alongside).toBe(false);
    const element = await mount(data);
    const pill = within(rowFor(element, "Gamma Tutoring"), "pill-part");
    expect(text(pill)).toBe("Part time");
    expect(within(rowFor(element, "Alpha Works"), "pill-part")).toBeNull();
    const overlap = await mount(TIMELINE);
    expect(text(within(rowFor(overlap, "Freelance Studio"), "pill-part"))).toBe(
      "Part time, alongside"
    );
  });

  it("6. an employer with two stints is one row and two bars", () => {
    const work = [
      role("Analyst", "Delta Group", "2023-01-01", "2024-06-30"),
      role("Analyst", "Delta Group", "2018-01-01", "2019-06-30"),
      role("Engineer", "Epsilon Corp", "2019-09-01", "2022-12-31")
    ];
    const timeline = buildTimeline({ work, salesforceStartYear: 2017 }, TODAY);
    expect(timeline.stops).toHaveLength(2);
    const delta = timeline.stops.find(
      (stop) => stop.employer === "Delta Group"
    );
    expect(delta.roleCount).toBe(2);
    expect(delta.stints).toHaveLength(2);
    expect(timeline.ribbon.mainBars).toHaveLength(3);
    const gap = timeline.ribbon.mainBars
      .filter((bar) => bar.stopKey === delta.key)
      .sort((a, b) => a.left - b.left);
    expect(gap[0].left + gap[0].width).toBeLessThan(gap[1].left);
  });

  it("7. one employer only", async () => {
    const data = {
      work: [role("Owner", "Zeta Solo", "2019-03-01", null)],
      salesforceStartYear: 2017
    };
    const timeline = buildTimeline(data, TODAY);
    expect(timeline.stops).toHaveLength(1);
    expect(timeline.ribbon.mainBars).toHaveLength(1);
    expect(timeline.scale.compressed).toBe(false);
    expect(timeline.scale.earliestYear).toBe(2019);
    const element = await mount(data);
    expect(all(element, "stop")).toHaveLength(1);
    expect(one(element, "expand-all")).not.toBeNull();
  });

  it("8. ten employers with short stints: one bar each on one lane, ticks apart, no labels", async () => {
    const work = [];
    for (let index = 0; index < 10; index += 1) {
      const year = 2026 - index;
      work.push(
        role(
          `Role ${index}`,
          `Employer Number ${index} Ltd`,
          `${year - 1}-02-01`,
          index === 0 ? null : `${year - 1}-09-30`
        )
      );
    }
    const data = { work, salesforceStartYear: 2017 };
    const timeline = buildTimeline(data, TODAY);
    expect(timeline.stops).toHaveLength(10);
    expect(timeline.ribbon.mainBars).toHaveLength(10);
    expect(timeline.ribbon.mainLanes).toBe(1);
    const at = timeline.ribbon.ticks.map((tick) => tick.at);
    at.slice(1).forEach((value, index) => {
      expect(value - at[index]).toBeGreaterThanOrEqual(0.06);
    });
    const element = await mount(data);
    expect(all(element, "bar")).toHaveLength(10);
    expect(one(element, "ribbon-label")).toBeNull();
  });

  it("9. today moved to a later year moves the bars and the Today tick with no code change", () => {
    const before = buildTimeline(TIMELINE, TODAY);
    const later = buildTimeline(TIMELINE, new Date(2028, 5, 1));
    expect(tickTexts(later)[0]).toBe("Today · 2028");
    expect(later.ribbon.mainBars[0].width).toBeGreaterThan(
      before.ribbon.mainBars[0].width
    );
    expect(later.ribbon.mainBars[0].left).toBe(0);
    const cutMs = utc("2017-01-01");
    const first = utc("2026-04-14");
    expect(later.ribbon.mainBars[0].width).toBeCloseTo(
      position(first, utc("2028-06-01"), cutMs) - 0.002,
      6
    );
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

  it("renders the heading with no subtitle, the caption and one row for each employer, newest first", async () => {
    const element = await mount();
    expect(text(one(element, "career-heading"))).toBe("Work");
    expect(one(element, "subtitle")).toBeNull();
    expect(element.shadowRoot.textContent).not.toMatch(/On Salesforce since/);
    expect(text(one(element, "caption"))).toBe(
      "Newest on the left. Bars are to scale, and years before 2017 are compressed."
    );
    expect(one(element, "track").tagName).toBe("OL");
    expect(all(element, "stop-employer").map(text)).toEqual([
      "Northwind Digital",
      "Freelance Studio",
      "Lakeside College",
      "Earlier roles"
    ]);
    expect(all(element, "stop-years").map(text)).toEqual([
      "2026 to now",
      "2021 to now",
      "2016 to 2021",
      "2012 to 2015"
    ]);
  });

  it("leaves out the compression note with no start year", async () => {
    const element = await mount({ work: WORK });
    expect(text(one(element, "caption"))).toBe(
      "Newest on the left. Bars are to scale."
    );
  });

  it("shows the path ending on the newest full time title, and the Also line", async () => {
    const element = await mount();
    const lakeside = rowFor(element, "Lakeside College");
    expect(text(within(lakeside, "stop-path"))).toBe(
      "Associate Analyst→Application Specialist"
    );
    expect(text(within(lakeside, "stop-also"))).toBe(
      "Also Evening Instructor, part time"
    );
    expect(text(within(lakeside, "stop-count"))).toBe("3 roles");
    const freelance = rowFor(element, "Freelance Studio");
    expect(text(within(freelance, "stop-path"))).toBe("Solution Architect");
    expect(within(freelance, "stop-also")).toBeNull();
    expect(within(freelance, "stop-count")).toBeNull();
  });

  it("marks every current employer Now, part time included, and the fold with a count and its employers", async () => {
    const element = await mount();
    const now = all(element, "stop").map((row) =>
      Boolean(within(row, "pill-now"))
    );
    expect(now).toEqual([true, true, false, false]);
    const freelance = rowFor(element, "Freelance Studio");
    expect(text(within(freelance, "pill-now"))).toBe("Now");
    expect(text(within(freelance, "pill-part"))).toBe("Part time, alongside");
    const early = rowFor(element, "Earlier roles");
    expect(text(within(early, "stop-path"))).toBe("Harbor Retail, Pine Market");
    expect(text(within(early, "stop-count"))).toBe("2 roles");
  });

  it("lists every role in the panel with its years and at most three highlights", async () => {
    const element = await mount();
    const lakeside = rowFor(element, "Lakeside College");
    const titles = Array.from(
      lakeside.querySelectorAll('[data-id="role-title"]')
    ).map(text);
    expect(titles).toEqual([
      "Application Specialist",
      "Evening Instructor",
      "Associate Analyst"
    ]);
    const years = Array.from(
      lakeside.querySelectorAll('[data-id="role-years"]')
    ).map(text);
    expect(years).toEqual([
      "2017 to 2021",
      "2017 to 2021 · part time",
      "2016 to 2017"
    ]);
    const bullets = Array.from(
      lakeside.querySelectorAll('[data-id="highlight"]')
    ).map(text);
    expect(bullets).toEqual(["One", "Two", "Three", "Taught evening classes"]);
  });

  it("lists each earlier role in the Earlier roles panel", async () => {
    const element = await mount();
    const early = rowFor(element, "Earlier roles");
    const lines = Array.from(
      early.querySelectorAll('[data-id="earlier-role"]')
    ).map(text);
    expect(lines).toEqual([
      "Support Technician, Harbor Retail2015",
      "Store Manager, Pine Market2012 to 2014"
    ]);
    expect(early.querySelector('[data-id="fold-resume-link"]')).toBeNull();
  });

  it("draws the bars, the dot and the lane label with no break mark, and hides the ribbon from assistive tech", async () => {
    const element = await mount();
    expect(one(element, "ribbon").getAttribute("aria-hidden")).toBe("true");
    expect(all(element, "bar")).toHaveLength(4);
    expect(one(element, "now-dot")).not.toBeNull();
    expect(one(element, "break")).toBeNull();
    expect(element.shadowRoot.querySelector(".break")).toBeNull();
    expect(all(element, "tick").map(text)[0]).toBe("Today · 2026");
    expect(all(element, "side-label").map(text)).toEqual(["Freelance Studio"]);
  });

  it("makes each row head a button with aria-expanded, aria-controls and a labelled region", async () => {
    const element = await mount();
    const button = all(element, "toggle")[0];
    const panel = all(element, "panel")[0];
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("role")).toBe("region");
    expect(panel.getAttribute("aria-labelledby")).toBe(button.id);
    button.click();
    await flushPromises();
    expect(all(element, "toggle")[0].getAttribute("aria-expanded")).toBe(
      "true"
    );
    all(element, "toggle")[0].click();
    await flushPromises();
    expect(all(element, "toggle")[0].getAttribute("aria-expanded")).toBe(
      "false"
    );
  });

  it("keeps focus on the pressed button and lets several rows stay open", async () => {
    const element = await mount();
    const button = all(element, "toggle")[1];
    button.focus();
    button.click();
    await flushPromises();
    expect(element.shadowRoot.activeElement).toBe(all(element, "toggle")[1]);
    all(element, "toggle")[3].click();
    await flushPromises();
    expect(
      all(element, "toggle").map((item) => item.getAttribute("aria-expanded"))
    ).toEqual(["false", "true", "false", "true"]);
  });

  it("opens every row with Expand all and flips to Collapse all, and back", async () => {
    const element = await mount();
    expect(text(one(element, "expand-all"))).toBe("Expand all");
    one(element, "expand-all").click();
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
  });

  it("reads Collapse all once the last single row is opened by hand", async () => {
    const element = await mount();
    for (let i = 0; i < 4; i += 1) {
      all(element, "toggle")[i].click();
      await flushPromises();
    }
    expect(text(one(element, "expand-all"))).toBe("Collapse all");
  });

  it("opens a row from its bar and pairs the hover", async () => {
    const element = await mount();
    const bar = all(element, "bar").find(
      (item) => item.dataset.key === "employer-lakeside-college"
    );
    bar.dispatchEvent(new CustomEvent("mouseenter"));
    await flushPromises();
    expect(
      rowFor(element, "Lakeside College").classList.contains("is-hot")
    ).toBe(true);
    bar.dispatchEvent(new CustomEvent("mouseleave"));
    bar.click();
    await flushPromises();
    expect(
      rowFor(element, "Lakeside College").classList.contains("is-open")
    ).toBe(true);
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

  it("shows one primary resume button under the list", async () => {
    const element = await mount();
    const link = one(element, "resume-link");
    expect(text(link)).toBe("See the full resume →");
    expect(link.getAttribute("href")).toBe("/portfolio/resume");
    expect(link.classList.contains("nc-button")).toBe(true);
    expect(link.classList.contains("nc-button_secondary")).toBe(false);
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

  it("labels the part time lane with the employer name as the read sends it", async () => {
    const work = [
      role("Lead", "Alpha Works", "2023-01-01", null),
      role("Tutor", "Gamma Tutoring", "2021-01-01", null, { isPartTime: true }),
      role("Coach", "Delta Club (Part Time)", "2022-01-01", null, {
        isPartTime: true
      })
    ];
    const element = await mount({ work, salesforceStartYear: 2017 });
    expect(all(element, "side-label").map(text)).toEqual([
      "Gamma Tutoring",
      "Delta Club (Part Time)"
    ]);
  });

  it("keeps the current dot inside its bar", async () => {
    const element = await mount();
    const dot = one(element, "now-dot");
    expect(dot.parentElement.classList.contains("bar-now")).toBe(true);
  });

  it("builds the same stops from buildStops as from buildTimeline", () => {
    expect(buildStops(TIMELINE, TODAY).map((stop) => stop.key)).toEqual(
      buildTimeline(TIMELINE, TODAY).stops.map((stop) => stop.key)
    );
  });
});

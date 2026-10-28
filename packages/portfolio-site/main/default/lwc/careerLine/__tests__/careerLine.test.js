/**
 * @description       : Unit tests for careerLine LWC: every role, certification and school on
 *                      one line from getTimeline, the earlier roles fold by the start year, the
 *                      highlights from getResume for the Architect persona, the selector and its
 *                      event, opening and closing a point (aria-expanded, one at a time, Escape
 *                      with focus back), the verify link, the phone list of every point, and
 *                      nothing on an error or with no points.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { createElement } from "@lwc/engine-dom";
import CareerLine, {
  HIGHLIGHT_PERSONA,
  buildPoints,
  foldYears,
  foldsAway,
  formatMonthYear,
  formatYears,
  highlightsById,
  isCurrentRole,
  mergeByDate,
  spokenYears,
  toStartYear
} from "c/careerLine";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import getResume from "@salesforce/apex/ResumeController.getResume";
import { trackEvent } from "c/analyticsService";

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
      CAREER_TIMELINE_FILTERED: "career_timeline_filtered",
      CAREER_TIMELINE_SHOW_ALL: "career_timeline_show_all"
    }
  }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/ResumeController.getTimeline",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/ResumeController.getResume",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

const VERIFY = "https://trailhead.example.com/credentials?id=1+2";

const WORK = [
  {
    key: "a01",
    title: "Senior Solution Consultant",
    employer: "TELUS Digital",
    startDate: "2026-04-14",
    endDate: null,
    isCurrent: true
  },
  {
    key: "a02",
    title: "Salesforce Application Architect",
    employer: "Independent Consultant",
    startDate: "2021-10-01",
    endDate: null,
    isCurrent: true
  },
  {
    key: "a03",
    title: "CRM Developer",
    employer: "Creighton University",
    startDate: "2025-08-01",
    endDate: "2026-04-10",
    isCurrent: false
  },
  {
    key: "a05",
    title: "IT Project Assistant",
    employer: "Metropolitan Community College",
    startDate: "2017-01-02",
    endDate: "2017-07-02",
    isCurrent: false
  },
  {
    key: "a04",
    title: "POS Technician",
    employer: "Fiserv, Inc",
    startDate: "2016-01-01",
    endDate: "2016-10-03",
    isCurrent: false
  },
  {
    key: "a06",
    title: "Customer Service Manager",
    employer: "Walmart Stores, Inc",
    startDate: "2012-03-01",
    endDate: "2014-06-30",
    isCurrent: false
  }
];

const CERTIFICATIONS = [
  {
    id: "c01",
    name: "Data 360 Consultant",
    issuer: "Salesforce",
    earnedDate: "2025-03-17"
  },
  {
    id: "c02",
    name: "Platform Administrator",
    issuer: "Salesforce",
    earnedDate: "2024-06-01"
  }
];

const EDUCATION = [
  {
    key: "e01",
    school: "Metropolitan Community College",
    credential: "Associate's Degree",
    fieldOfStudy: null,
    completedDate: "2025-05-01"
  }
];

const TIMELINE = {
  work: WORK,
  education: EDUCATION,
  certifications: CERTIFICATIONS,
  verificationUrl: VERIFY,
  tabLimit: 5,
  salesforceStartYear: 2017
};

const RESUME = {
  roles: [
    { id: "a01", highlights: [" Led the design. ", "Shipped it."] },
    { id: "a02", highlights: ["Built a site."] },
    { id: "a03", highlights: ["Moved the data."] },
    { id: "a05", highlights: [] }
  ]
};

// The order the line draws TIMELINE in: roles in server order, the certifications and the
// school by date among them, the fold last.
const ORDER = [
  "a01",
  "a02",
  "a03",
  "e01",
  "c01",
  "c02",
  "a05",
  "earlier-roles"
];

function render() {
  const element = createElement("c-career-line", { is: CareerLine });
  document.body.appendChild(element);
  return element;
}

function flush() {
  return Promise.resolve();
}

function text(node) {
  return node.textContent.replace(/\s+/g, " ").trim();
}

async function renderWithData(timeline = TIMELINE) {
  const element = render();
  getTimeline.emit(timeline);
  getResume.emit(RESUME);
  await flush();
  return element;
}

function all(element, selector) {
  return Array.from(element.shadowRoot.querySelectorAll(selector));
}

function linePoints(element) {
  return all(element, '[data-id="line-point"]');
}

function lineButton(element, key) {
  return element.shadowRoot.querySelector(
    `[data-list="line"][data-point-button][data-key="${key}"]`
  );
}

function stackButton(element, key) {
  return element.shadowRoot.querySelector(
    `[data-list="stack"][data-point-button][data-key="${key}"]`
  );
}

function linePanel(element) {
  return element.shadowRoot.querySelector('[data-id="line-panel"]');
}

function panelItems(element) {
  return all(element, '[data-id="line-panel"] .highlights li').map((node) =>
    text(node)
  );
}

function filter(element, kind) {
  return element.shadowRoot.querySelector(`[data-kind="${kind}"]`);
}

function escape(element) {
  element.shadowRoot
    .querySelector("section")
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
}

function keysOf(nodes) {
  return nodes.map((node) => node.dataset.key);
}

describe("c-career-line", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  describe("helpers", () => {
    it("writes a past role as a range and a current one as its start year with a plus", () => {
      expect(formatYears(WORK[2])).toBe("2025 to 2026");
      expect(formatYears(WORK[0])).toBe("2026+");
      expect(
        formatYears({ startDate: "2016-01-01", endDate: "2016-10-03" })
      ).toBe("2016");
      expect(formatYears({ endDate: "2016-10-03" })).toBe("2016");
      expect(formatYears({ startDate: "2017-01-02" })).toBe("2017+");
      expect(formatYears({ isCurrent: true })).toBe("");
    });

    it("speaks a current role as since its start year, active", () => {
      expect(spokenYears(WORK[0])).toBe("since 2026, active");
      expect(spokenYears({ isCurrent: true })).toBe("active");
      expect(spokenYears(WORK[2])).toBe("2025 to 2026");
      expect(isCurrentRole({ startDate: "2017-01-02" })).toBe(true);
    });

    it("keys highlights by role Id, trimmed, and ignores rows with no Id", () => {
      const byId = highlightsById({
        roles: [
          { id: "x", highlights: [" a ", "", null] },
          { highlights: ["b"] }
        ]
      });
      expect(byId.get("x")).toEqual(["a"]);
      expect(byId.size).toBe(1);
      expect(highlightsById(null).size).toBe(0);
    });

    it("writes a date as month and year without the time zone", () => {
      expect(formatMonthYear("2025-03-01")).toBe("Mar 2025");
      expect(formatMonthYear("")).toBe("");
      expect(formatMonthYear(null)).toBe("");
    });

    it("takes the start year from the server, else 2017", () => {
      expect(toStartYear(2018)).toBe(2018);
      expect(toStartYear(undefined)).toBe(2017);
      expect(toStartYear("2018")).toBe(2017);
    });

    it("folds only a past role that ended before the start year", () => {
      expect(foldsAway(WORK[4], 2017)).toBe(true);
      expect(foldsAway(WORK[3], 2017)).toBe(false);
      expect(foldsAway(WORK[0], 2017)).toBe(false);
      expect(
        foldsAway({ startDate: "2010-01-01", endDate: "2018-01-01" }, 2017)
      ).toBe(false);
      expect(foldsAway({ isCurrent: false, endDate: null }, 2017)).toBe(false);
    });

    it("gives the fold the years of the roles in it", () => {
      expect(foldYears([WORK[4], WORK[5]])).toBe("2012 to 2016");
      expect(foldYears([{ endDate: "2016-10-03" }])).toBe("2016");
      expect(foldYears([{}])).toBe("");
    });

    it("puts dated points before the first role last held before them, the rest after", () => {
      const roles = [
        { key: "r1", when: "9999-12-31" },
        { key: "r2", when: null },
        { key: "r3", when: "2020-01-01" }
      ];
      const dated = [
        { key: "d1", when: "2019-01-01" },
        { key: "d2", when: "2021-01-01" },
        { key: "d3", when: "" }
      ];
      expect(mergeByDate(roles, dated).map((point) => point.key)).toEqual([
        "r1",
        "r2",
        "d2",
        "r3",
        "d1",
        "d3"
      ]);
    });

    it("builds the points with the fold last, and no fold when nothing folds", () => {
      expect(buildPoints(TIMELINE).map((point) => point.key)).toEqual(ORDER);
      const noFold = buildPoints({ work: WORK.slice(0, 3) });
      expect(noFold.map((point) => point.key)).toEqual(["a01", "a02", "a03"]);
      expect(buildPoints(null)).toEqual([]);
    });

    it("folds by the year the server sends", () => {
      const points = buildPoints({ ...TIMELINE, salesforceStartYear: 2018 });
      const fold = points[points.length - 1];
      expect(fold.foldRoles.map((role) => role.key)).toEqual([
        "a05",
        "a04",
        "a06"
      ]);
      expect(fold.years).toBe("2012 to 2017");
    });

    it("leaves out a role with no title, a certification with no name and a school with no name", () => {
      const points = buildPoints({
        work: [{ key: "x", title: " " }],
        certifications: [{ id: "c", name: "" }],
        education: [{ key: "s", school: "", credential: "" }]
      });
      expect(points).toEqual([]);
    });
  });

  describe("reads", () => {
    it("reads getTimeline and getResume for the Architect persona", async () => {
      render();
      await flush();
      expect(getResume.getLastConfig()).toEqual({
        persona: HIGHLIGHT_PERSONA
      });
      expect(HIGHLIGHT_PERSONA).toBe("Architect");
    });

    it("holds the highlights read until the section nears the screen", async () => {
      const original = global.IntersectionObserver;
      let notify;
      const disconnect = jest.fn();
      global.IntersectionObserver = jest.fn((callback) => {
        notify = callback;
        return { observe: jest.fn(), disconnect };
      });
      try {
        render();
        await flush();
        // The test adapter passes an unset parameter through. The platform holds the read.
        expect(getResume.getLastConfig().persona).toBeUndefined();
        notify([{ isIntersecting: false }]);
        await flush();
        expect(getResume.getLastConfig().persona).toBeUndefined();
        notify([{ isIntersecting: true }]);
        await flush();
        expect(getResume.getLastConfig()).toEqual({
          persona: HIGHLIGHT_PERSONA
        });
        expect(disconnect).toHaveBeenCalled();
      } finally {
        global.IntersectionObserver = original;
      }
    });

    it("renders nothing before the read, on an error or with no points", async () => {
      const element = render();
      await flush();
      expect(element.shadowRoot.querySelector("section")).toBeNull();
      getTimeline.error();
      await flush();
      expect(element.shadowRoot.querySelector("section")).toBeNull();
      getTimeline.emit({ work: [], education: [], certifications: [] });
      await flush();
      expect(element.shadowRoot.querySelector("section")).toBeNull();
    });

    it("hides again when a later read fails", async () => {
      const element = await renderWithData();
      expect(element.shadowRoot.querySelector("section")).not.toBeNull();
      getTimeline.error();
      await flush();
      expect(element.shadowRoot.querySelector("section")).toBeNull();
    });
  });

  describe("the line", () => {
    it("has an h2 a screen reader can find and a real ordered list", async () => {
      const element = await renderWithData();
      const heading = element.shadowRoot.querySelector(
        '[data-id="career-heading"]'
      );
      expect(text(heading)).toBe("Career, newest first");
      expect(element.shadowRoot.querySelector("ol.line")).not.toBeNull();
    });

    it("shows every kind on one line, newest first, the fold last", async () => {
      const element = await renderWithData();
      expect(keysOf(linePoints(element))).toEqual(ORDER);
      expect(linePoints(element).map((node) => node.dataset.type)).toEqual([
        "role",
        "role",
        "role",
        "school",
        "certification",
        "certification",
        "role",
        "fold"
      ]);
    });

    it("draws a role with its employer, title and years, a current one with the Active tag", async () => {
      const element = await renderWithData();
      const first = linePoints(element)[0];
      expect(text(first.querySelector(".point-first"))).toBe("TELUS Digital,");
      expect(text(first.querySelector(".point-second"))).toBe(
        "Senior Solution Consultant,"
      );
      expect(text(first.querySelector('.years [aria-hidden="true"]'))).toBe(
        "2026+"
      );
      expect(text(first.querySelector(".years .visually-hidden"))).toBe(
        "since 2026, active"
      );
      expect(
        first.querySelector(".active-tag").getAttribute("aria-hidden")
      ).toBe("true");
      expect(first.classList.contains("point-current")).toBe(true);
      expect(linePoints(element)[2].querySelector(".active-tag")).toBeNull();
    });

    it("draws a certification on its year and the school on its completion", async () => {
      const element = await renderWithData();
      const school = linePoints(element)[3];
      expect(text(school.querySelector(".point-first"))).toBe(
        "Metropolitan Community College,"
      );
      expect(text(school.querySelector(".point-second"))).toBe(
        "Associate's Degree,"
      );
      expect(text(school.querySelector('.years [aria-hidden="true"]'))).toBe(
        "Completed 2025"
      );
      const certification = linePoints(element)[4];
      expect(text(certification.querySelector(".point-first"))).toBe(
        "Certification,"
      );
      expect(text(certification.querySelector(".point-second"))).toBe(
        "Data 360 Consultant,"
      );
      expect(text(certification.querySelector(".years .visually-hidden"))).toBe(
        "earned 2025"
      );
    });

    it("draws the fold as Earlier roles with its years", async () => {
      const element = await renderWithData();
      const fold = linePoints(element)[7];
      expect(text(fold.querySelector(".point-first"))).toBe("Earlier roles,");
      expect(fold.querySelector(".point-second")).toBeNull();
      expect(text(fold.querySelector('.years [aria-hidden="true"]'))).toBe(
        "2012 to 2016"
      );
    });

    it("makes a role a button only when it has highlights, and every other point a button", async () => {
      const element = await renderWithData();
      expect(lineButton(element, "a01")).not.toBeNull();
      expect(lineButton(element, "a05")).toBeNull();
      expect(lineButton(element, "c01")).not.toBeNull();
      expect(lineButton(element, "e01")).not.toBeNull();
      expect(lineButton(element, "earlier-roles")).not.toBeNull();
      expect(
        element.shadowRoot
          .querySelector('[data-id="line"]')
          .getAttribute("tabindex")
      ).toBeNull();
    });

    it("shows plain roles when the highlight read fails, with a tab stop on the line", async () => {
      const element = render();
      getTimeline.emit({ work: WORK.slice(0, 3) });
      getResume.error();
      await flush();
      expect(all(element, "[data-point-button]")).toHaveLength(0);
      expect(
        element.shadowRoot
          .querySelector('[data-id="line"]')
          .getAttribute("tabindex")
      ).toBe("0");
    });
  });

  describe("the selector", () => {
    it("offers All and each kind present, opening on All", async () => {
      const element = await renderWithData();
      const options = all(element, "[data-kind]");
      expect(options.map((node) => text(node))).toEqual([
        "All",
        "Work",
        "Education",
        "Certifications"
      ]);
      expect(options.map((node) => node.getAttribute("aria-pressed"))).toEqual([
        "true",
        "false",
        "false",
        "false"
      ]);
      expect(
        element.shadowRoot
          .querySelector('[data-id="filters"]')
          .getAttribute("role")
      ).toBe("group");
    });

    it("leaves out a kind with no points, and hides with only one kind", async () => {
      const element = await renderWithData({ ...TIMELINE, education: [] });
      expect(filter(element, "education")).toBeNull();
      expect(filter(element, "work")).not.toBeNull();
      getTimeline.emit({ work: WORK });
      await flush();
      expect(
        element.shadowRoot.querySelector('[data-id="filters"]')
      ).toBeNull();
    });

    it("narrows the line in place and sends career_timeline_filtered with the kind", async () => {
      const element = await renderWithData();
      filter(element, "work").click();
      await flush();
      expect(keysOf(linePoints(element))).toEqual([
        "a01",
        "a02",
        "a03",
        "a05",
        "earlier-roles"
      ]);
      expect(filter(element, "work").getAttribute("aria-pressed")).toBe("true");
      expect(trackEvent).toHaveBeenCalledWith("career_timeline_filtered", {
        kind: "work"
      });
      filter(element, "education").click();
      await flush();
      expect(keysOf(linePoints(element))).toEqual(["e01"]);
      filter(element, "certifications").click();
      await flush();
      expect(keysOf(linePoints(element))).toEqual(["c01", "c02"]);
      filter(element, "all").click();
      await flush();
      expect(keysOf(linePoints(element))).toEqual(ORDER);
      expect(trackEvent).toHaveBeenCalledTimes(4);
    });

    it("starts the line from its newest point again after the new points render", async () => {
      const element = await renderWithData();
      const line = element.shadowRoot.querySelector('[data-id="line"]');
      const writes = [];
      Object.defineProperty(line, "scrollLeft", {
        configurable: true,
        get: () => 120,
        set(value) {
          writes.push(value);
        }
      });
      filter(element, "work").click();
      expect(writes).toEqual([]);
      await flush();
      expect(writes).toEqual([0]);
    });

    it("sends nothing when the kind already shown is pressed", async () => {
      const element = await renderWithData();
      filter(element, "all").click();
      await flush();
      expect(trackEvent).not.toHaveBeenCalled();
    });

    it("closes an open point the new kind hides, and keeps one it still shows", async () => {
      const element = await renderWithData();
      lineButton(element, "c01").click();
      await flush();
      filter(element, "certifications").click();
      await flush();
      expect(linePanel(element).hidden).toBe(false);
      filter(element, "work").click();
      await flush();
      expect(linePanel(element).hidden).toBe(true);
    });
  });

  describe("opening a point", () => {
    it("opens a role's highlights under the line with aria-expanded and aria-controls", async () => {
      const element = await renderWithData();
      const button = lineButton(element, "a01");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(button.getAttribute("aria-controls")).toBe(linePanel(element).id);
      expect(linePanel(element).hidden).toBe(true);
      button.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(linePanel(element).hidden).toBe(false);
      expect(text(linePanel(element).querySelector(".panel-title"))).toBe(
        "Senior Solution Consultant"
      );
      expect(text(linePanel(element).querySelector(".panel-meta"))).toBe(
        "TELUS Digital, 2026+, Active"
      );
      expect(panelItems(element)).toEqual(["Led the design.", "Shipped it."]);
    });

    it("sends career_role_opened with the role's position, and nothing for other points", async () => {
      const element = await renderWithData();
      lineButton(element, "a03").click();
      await flush();
      expect(trackEvent).toHaveBeenCalledWith("career_role_opened", {
        position: 3
      });
      lineButton(element, "a03").click();
      await flush();
      lineButton(element, "c01").click();
      await flush();
      lineButton(element, "earlier-roles").click();
      await flush();
      expect(trackEvent).toHaveBeenCalledTimes(1);
    });

    it("opens a certification's issuer, earned date and verify link", async () => {
      const element = await renderWithData();
      lineButton(element, "c01").click();
      await flush();
      const panel = linePanel(element);
      expect(text(panel.querySelector(".panel-title"))).toBe(
        "Data 360 Consultant"
      );
      expect(panel.querySelector(".panel-meta")).toBeNull();
      expect(panelItems(element)).toEqual(["Salesforce, earned Mar 2025"]);
      const link = panel.querySelector('[data-id="panel-verify-link"]');
      expect(link.getAttribute("href")).toBe(VERIFY);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(text(link)).toBe("Verify on Trailhead, opens in a new tab");
    });

    it("opens a certification with no verify link when the server sends none", async () => {
      const element = await renderWithData({
        ...TIMELINE,
        verificationUrl: null
      });
      lineButton(element, "c02").click();
      await flush();
      expect(
        linePanel(element).querySelector('[data-id="panel-verify-link"]')
      ).toBeNull();
    });

    it("opens the school's name and completion", async () => {
      const element = await renderWithData({
        ...TIMELINE,
        education: [{ ...EDUCATION[0], fieldOfStudy: "Information Technology" }]
      });
      lineButton(element, "e01").click();
      await flush();
      expect(text(linePanel(element).querySelector(".panel-title"))).toBe(
        "Associate's Degree"
      );
      expect(panelItems(element)).toEqual([
        "Information Technology",
        "Metropolitan Community College, completed May 2025"
      ]);
    });

    it("opens the fold's list of each earlier role's employer, title and years", async () => {
      const element = await renderWithData();
      lineButton(element, "earlier-roles").click();
      await flush();
      const panel = linePanel(element);
      expect(text(panel.querySelector(".panel-title"))).toBe("Earlier roles");
      expect(text(panel.querySelector(".panel-meta"))).toBe("2012 to 2016");
      expect(panelItems(element)).toEqual([
        "Fiserv, Inc, POS Technician, 2016",
        "Walmart Stores, Inc, Customer Service Manager, 2012 to 2014"
      ]);
    });

    it("keeps one point open at a time", async () => {
      const element = await renderWithData();
      lineButton(element, "a01").click();
      await flush();
      lineButton(element, "a02").click();
      await flush();
      expect(lineButton(element, "a01").getAttribute("aria-expanded")).toBe(
        "false"
      );
      expect(lineButton(element, "a02").getAttribute("aria-expanded")).toBe(
        "true"
      );
    });

    it("closes when the open point is pressed again", async () => {
      const element = await renderWithData();
      lineButton(element, "a01").click();
      await flush();
      lineButton(element, "a01").click();
      await flush();
      expect(linePanel(element).hidden).toBe(true);
    });

    it("closes on Escape and puts focus back on the point's button", async () => {
      const element = await renderWithData();
      lineButton(element, "c01").click();
      await flush();
      escape(element);
      await flush();
      expect(linePanel(element).hidden).toBe(true);
      expect(element.shadowRoot.activeElement).toBe(lineButton(element, "c01"));
    });

    it("ignores other keys and Escape with nothing open", async () => {
      const element = await renderWithData();
      const section = element.shadowRoot.querySelector("section");
      escape(element);
      lineButton(element, "a01").click();
      await flush();
      section.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      await flush();
      expect(linePanel(element).hidden).toBe(false);
    });
  });

  describe("the verify link", () => {
    it("shows once under the line with the certifications in view", async () => {
      const element = await renderWithData();
      const link = element.shadowRoot.querySelector('[data-id="verify-link"]');
      expect(link.getAttribute("href")).toBe(VERIFY);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(text(link)).toBe("Verify on Trailhead, opens in a new tab");
      filter(element, "certifications").click();
      await flush();
      expect(
        element.shadowRoot.querySelector('[data-id="verify-link"]')
      ).not.toBeNull();
      filter(element, "work").click();
      await flush();
      expect(
        element.shadowRoot.querySelector('[data-id="verify-link"]')
      ).toBeNull();
    });

    it("hides with no certifications or a link that is not http or https", async () => {
      const element = await renderWithData({
        ...TIMELINE,
        certifications: []
      });
      expect(
        element.shadowRoot.querySelector('[data-id="verify-link"]')
      ).toBeNull();
      getTimeline.emit({ ...TIMELINE, verificationUrl: "ftp://example.com" });
      await flush();
      expect(
        element.shadowRoot.querySelector('[data-id="verify-link"]')
      ).toBeNull();
    });
  });

  describe("the phone list", () => {
    function toggle(element) {
      return element.shadowRoot.querySelector('[data-id="stack-toggle"]');
    }

    function stackKeys(element) {
      return keysOf(all(element, '[data-id="stack-point"]'));
    }

    it("lists the newest 4 in a real list and offers the rest", async () => {
      const element = await renderWithData();
      expect(element.shadowRoot.querySelector("ol.stack")).not.toBeNull();
      expect(stackKeys(element)).toEqual(ORDER.slice(0, 4));
      expect(keysOf(linePoints(element))).toEqual(ORDER);
      expect(text(toggle(element))).toBe("Show all 8");
      expect(toggle(element).getAttribute("aria-expanded")).toBe("false");
      expect(toggle(element).getAttribute("aria-controls")).toBe(
        element.shadowRoot.querySelector("ol.stack").id
      );
    });

    it("shows every point in place, keeps focus on the button, and sends the kind", async () => {
      const element = await renderWithData();
      toggle(element).focus();
      toggle(element).click();
      await flush();
      expect(stackKeys(element)).toEqual(ORDER);
      expect(text(toggle(element))).toBe("Show fewer");
      expect(toggle(element).getAttribute("aria-expanded")).toBe("true");
      expect(element.shadowRoot.activeElement).toBe(toggle(element));
      expect(trackEvent).toHaveBeenCalledWith("career_timeline_show_all", {
        kind: "all"
      });
      toggle(element).click();
      await flush();
      expect(stackKeys(element)).toEqual(ORDER.slice(0, 4));
      expect(trackEvent).toHaveBeenCalledTimes(1);
    });

    it("counts the active filter, folds back when the filter changes, and hides the button with 4 or fewer", async () => {
      const element = await renderWithData();
      toggle(element).click();
      await flush();
      filter(element, "work").click();
      await flush();
      expect(stackKeys(element)).toEqual(["a01", "a02", "a03", "a05"]);
      expect(text(toggle(element))).toBe("Show all 5");
      filter(element, "education").click();
      await flush();
      expect(stackKeys(element)).toEqual(["e01"]);
      expect(toggle(element)).toBeNull();
      filter(element, "all").click();
      await flush();
      expect(stackKeys(element)).toEqual(ORDER.slice(0, 4));
      expect(text(toggle(element))).toBe("Show all 8");
      expect(toggle(element).getAttribute("aria-expanded")).toBe("false");
    });

    it("opens a point in place under it, one at a time, and closes on Escape", async () => {
      const element = await renderWithData();
      toggle(element).click();
      await flush();
      const first = stackButton(element, "a01");
      expect(first.getAttribute("aria-controls")).toBe(
        all(element, '[data-id="stack-panel"]')[0].id
      );
      first.click();
      await flush();
      expect(all(element, '[data-id="stack-panel"]')[0].hidden).toBe(false);
      expect(linePanel(element).hidden).toBe(true);
      stackButton(element, "c01").click();
      await flush();
      expect(first.getAttribute("aria-expanded")).toBe("false");
      const openPanels = all(element, '[data-id="stack-panel"]').filter(
        (panel) => !panel.hidden
      );
      expect(openPanels).toHaveLength(1);
      expect(
        openPanels[0].querySelector('[data-id="panel-verify-link"]')
      ).not.toBeNull();
      escape(element);
      await flush();
      expect(element.shadowRoot.activeElement).toBe(
        stackButton(element, "c01")
      );
    });
  });

  describe("motion", () => {
    const originalMatchMedia = window.matchMedia;

    function systemReduces(matches) {
      window.matchMedia = jest.fn(() => ({
        matches,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      }));
    }

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    it("fades the opening in under full motion", async () => {
      systemReduces(false);
      const element = await renderWithData();
      lineButton(element, "a01").click();
      await flush();
      expect(linePanel(element).classList.contains("panel-reveal")).toBe(true);
    });

    it("opens at once under reduced motion", async () => {
      systemReduces(true);
      const element = await renderWithData();
      lineButton(element, "a01").click();
      await flush();
      expect(linePanel(element).classList.contains("panel-reveal")).toBe(false);
    });
  });
});

describe("c-career-line live data marker", () => {
  it("places the live data marker with the sources the section reads", () => {
    const { readFileSync } = require("fs");
    const { join } = require("path");
    const html = readFileSync(join(__dirname, "..", "careerLine.html"), "utf8");
    const marker = html.match(/<c-data-source\s([^>]*)>\s*<\/c-data-source>/);
    expect(marker).not.toBeNull();
    expect(marker[1]).toMatch(
      /source-keys="ResumeController_TimelineRoles,ResumeController_Education,ResumeController_Certifications,ResumeController_Highlights"/
    );
    expect(marker[1]).not.toMatch(/objects=/);
    expect(marker[1]).not.toMatch(/hide-counts/);
  });
});

/**
 * @description       : Unit tests for careerLine LWC: every role, certification and school on
 *                      one line from getTimeline, the earlier roles fold by the start year and
 *                      list under it, every point plain with nothing that opens, the selector
 *                      and its event, the resume and verify links under the line, the phone list
 *                      of every point, and nothing on an error or with no points. The grouping
 *                      block covers employers and issuer and year groups and the phone list.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { createElement } from "@lwc/engine-dom";
import CareerLine, {
  buildPoints,
  employerYears,
  foldYears,
  foldsAway,
  formatYears,
  isCurrentRole,
  mergeByDate,
  shortCertificationName,
  spokenYears,
  toStartYear
} from "c/careerLine";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
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

// The order the line draws TIMELINE in: one point per employer in server order, one per issuer
// and year for the certifications, the school by date among them, the fold last.
const CERTS_2025 = "certifications-salesforce-2025";
const CERTS_2024 = "certifications-salesforce-2024";
const ORDER = [
  "a01",
  "a02",
  "a03",
  "e01",
  CERTS_2025,
  CERTS_2024,
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
  await flush();
  return element;
}

function all(element, selector) {
  return Array.from(element.shadowRoot.querySelectorAll(selector));
}

function linePoints(element) {
  return all(element, '[data-id="line-point"]');
}

function filter(element, kind) {
  return element.shadowRoot.querySelector(`[data-kind="${kind}"]`);
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
      expect(fold.titles.map((role) => role.key)).toEqual([
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
    it("reads getTimeline only, with nothing else to load", async () => {
      render();
      await flush();
      expect(getTimeline.getLastConfig()).toEqual({});
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
      expect(text(heading)).toBe("Career timeline");
      expect(heading.classList.contains("visually-hidden")).toBe(false);
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
        "Salesforce \u00b7 2025,"
      );
      expect(text(certification.querySelector(".point-second"))).toBe(
        "Data 360 Consultant,"
      );
      expect(certification.querySelector(".years .visually-hidden")).toBeNull();
    });

    it("draws the fold as Earlier roles with its years and each role listed under it", async () => {
      const element = await renderWithData();
      const fold = linePoints(element)[7];
      expect(text(fold.querySelector(".point-first"))).toBe("Earlier roles,");
      expect(
        text(fold.querySelector('.group-years [aria-hidden="true"]'))
      ).toBe("2012 to 2016");
      const titles = Array.from(
        fold.querySelectorAll('[data-id="line-title"]')
      );
      expect(
        titles.map((node) => text(node.querySelector(".point-second")))
      ).toEqual([
        "Fiserv, Inc, POS Technician,",
        "Walmart Stores, Inc, Customer Service Manager,"
      ]);
      expect(
        titles.map((node) =>
          text(node.querySelector('.years [aria-hidden="true"]'))
        )
      ).toEqual(["2016", "2012 to 2014"]);
    });

    it("draws every point as plain text, with nothing that opens and a tab stop on the line", async () => {
      const element = await renderWithData();
      expect(
        all(element, "button[aria-expanded]").filter(
          (node) => node.dataset.id !== "stack-toggle"
        )
      ).toHaveLength(0);
      expect(all(element, "[data-point-button]")).toHaveLength(0);
      expect(
        element.shadowRoot.querySelector('[data-id="line-panel"]')
      ).toBeNull();
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
      expect(keysOf(linePoints(element))).toEqual([CERTS_2025, CERTS_2024]);
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
  });

  describe("the links under the line", () => {
    it("always offers the resume for the full details, beside the verify link", async () => {
      const element = await renderWithData();
      const resume = element.shadowRoot.querySelector(
        '[data-id="resume-link"]'
      );
      expect(text(resume)).toBe("View full details on my resume");
      expect(resume.getAttribute("href")).toBe("/portfolio/resume");
      expect(resume.getAttribute("target")).toBeNull();
      const foot = element.shadowRoot.querySelector(".career-foot");
      expect(
        Array.from(foot.querySelectorAll("a")).map((a) => a.dataset.id)
      ).toEqual(["resume-link", "verify-link"]);
      filter(element, "work").click();
      await flush();
      expect(
        element.shadowRoot.querySelector('[data-id="resume-link"]')
      ).not.toBeNull();
      expect(
        element.shadowRoot.querySelector('[data-id="verify-link"]')
      ).toBeNull();
    });

    it("shows the verify link once under the line with the certifications in view", async () => {
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
  });

  describe("grouping", () => {
    const GROUPED = {
      work: [
        {
          key: "t1",
          title: "Senior Solution Consultant",
          employer: "TELUS Digital",
          startDate: "2026-04-14",
          endDate: null,
          isCurrent: true
        },
        {
          key: "i1",
          title: "Salesforce Application Architect",
          employer: "Independent Consultant (part time)",
          startDate: "2021-10-01",
          endDate: null,
          isCurrent: true
        },
        {
          key: "c2",
          title: "CRM Developer",
          employer: "Creighton University",
          startDate: "2025-08-01",
          endDate: "2026-04-10",
          isCurrent: false
        },
        {
          key: "c1",
          title: "Application Administrator",
          employer: "Creighton University",
          startDate: "2021-06-01",
          endDate: "2025-08-01",
          isCurrent: false
        },
        {
          key: "m2",
          title: "CAET Services Specialist II",
          employer: "Metropolitan Community College",
          startDate: "2017-07-02",
          endDate: "2021-06-01",
          isCurrent: false
        },
        {
          key: "m3",
          title: "Non-Credit Instructor",
          employer: "Metropolitan Community College",
          startDate: "2017-12-01",
          endDate: "2021-06-01",
          isCurrent: false
        },
        {
          key: "m1",
          title: "IT Project Assistant",
          employer: "Metropolitan Community College",
          startDate: "2017-01-02",
          endDate: "2017-07-02",
          isCurrent: false
        },
        {
          key: "f1",
          title: "POS Technician",
          employer: "Fiserv, Inc",
          startDate: "2016-01-01",
          endDate: "2016-10-03",
          isCurrent: false
        }
      ],
      certifications: [
        {
          id: "k1",
          name: "Salesforce Certified Agentforce Specialist",
          issuer: "Salesforce",
          earnedDate: "2025-06-01"
        },
        {
          id: "k2",
          name: "Salesforce Certified Data 360 Consultant",
          issuer: "Salesforce",
          earnedDate: "2025-03-17"
        },
        {
          id: "k3",
          name: "Salesforce Certified Platform Administrator",
          issuer: "Salesforce",
          earnedDate: "2024-06-01"
        },
        {
          id: "k4",
          name: "Other Vendor Practitioner",
          issuer: "Other Vendor",
          earnedDate: "2025-02-01"
        },
        {
          id: "k5",
          name: "Retired Thing",
          issuer: "Salesforce",
          earnedDate: "2024-01-01",
          isRetired: true
        }
      ],
      verificationUrl: VERIFY,
      salesforceStartYear: 2017
    };

    function titleLabels(element, pointKey) {
      const point = element.shadowRoot.querySelector(
        `[data-id="line-point"][data-key="${pointKey}"]`
      );
      return Array.from(point.querySelectorAll(".title-item")).map((item) =>
        text(item.querySelector(".point-second")).replace(/,$/, "")
      );
    }

    function groupYears(element, pointKey) {
      const node = element.shadowRoot.querySelector(
        `[data-id="line-point"][data-key="${pointKey}"] .group-years [aria-hidden="true"]`
      );
      return node ? text(node) : null;
    }

    async function grouped() {
      const element = render();
      getTimeline.emit(GROUPED);
      await flush();
      return element;
    }

    it("makes one point per employer, certifications by issuer and year, folded roles last", async () => {
      const element = await grouped();
      expect(keysOf(linePoints(element))).toEqual([
        "t1",
        "i1",
        "employer-creighton-university",
        "certifications-salesforce-2025",
        "certifications-other-vendor-2025",
        "certifications-salesforce-2024",
        "employer-metropolitan-community-college",
        "earlier-roles"
      ]);
    });

    it("lists every title at an employer, newest first, with its own years", async () => {
      const element = await grouped();
      expect(titleLabels(element, "employer-creighton-university")).toEqual([
        "CRM Developer",
        "Application Administrator"
      ]);
      const creighton = element.shadowRoot.querySelector(
        '[data-id="line-point"][data-key="employer-creighton-university"]'
      );
      expect(
        Array.from(creighton.querySelectorAll(".title-item .years")).map(
          (node) => text(node.querySelector('[aria-hidden="true"]'))
        )
      ).toEqual(["2025 to 2026", "2021 to 2025"]);
    });

    it("keeps two roles held at once, the later start first", async () => {
      const element = await grouped();
      expect(
        titleLabels(element, "employer-metropolitan-community-college")
      ).toEqual([
        "Non-Credit Instructor",
        "CAET Services Specialist II",
        "IT Project Assistant"
      ]);
    });

    it("gives an employer its earliest start to its latest end", async () => {
      const element = await grouped();
      expect(groupYears(element, "employer-creighton-university")).toBe(
        "2021 to 2026"
      );
      expect(
        groupYears(element, "employer-metropolitan-community-college")
      ).toBe("2017 to 2021");
    });

    it("writes a plus on the earliest start year when any role at the employer is current", () => {
      const points = buildPoints({
        work: [
          {
            key: "x2",
            title: "Lead",
            employer: "Acme",
            startDate: "2024-01-01",
            endDate: null,
            isCurrent: true
          },
          {
            key: "x1",
            title: "Analyst",
            employer: "Acme",
            startDate: "2019-01-01",
            endDate: "2023-12-31",
            isCurrent: false
          }
        ]
      });
      expect(points).toHaveLength(1);
      expect(points[0].years).toBe("2019+");
      expect(points[0].yearsSpoken).toBe("since 2019, active");
      expect(points[0].isCurrent).toBe(true);
      expect(points[0].titles.map((title) => title.key)).toEqual(["x2", "x1"]);
      expect(employerYears([{ isCurrent: true }])).toBe("");
    });

    it("draws an employer with one role like a role point, with its title shown", async () => {
      const element = await grouped();
      const point = element.shadowRoot.querySelector(
        '[data-id="line-point"][data-key="t1"]'
      );
      expect(text(point.querySelector(".point-first"))).toBe("TELUS Digital,");
      expect(titleLabels(element, "t1")).toEqual([
        "Senior Solution Consultant"
      ]);
      expect(point.querySelector(".group-years")).toBeNull();
      expect(text(point.querySelector('.years [aria-hidden="true"]'))).toBe(
        "2026+"
      );
      expect(point.querySelector(".active-tag")).not.toBeNull();
    });

    it("folds the roles before the Salesforce start year and lists them under the fold", async () => {
      const element = await grouped();
      expect(titleLabels(element, "earlier-roles")).toEqual([
        "Fiserv, Inc, POS Technician"
      ]);
      expect(groupYears(element, "earlier-roles")).toBe("2016");
    });

    it("groups certifications by issuer and earned year, newest first, prefix dropped", async () => {
      const element = await grouped();
      const heading = (key) =>
        text(
          element.shadowRoot.querySelector(
            `[data-id="line-point"][data-key="${key}"] .point-first`
          )
        );
      expect(heading("certifications-salesforce-2025")).toBe(
        "Salesforce · 2025,"
      );
      expect(heading("certifications-other-vendor-2025")).toBe(
        "Other Vendor · 2025,"
      );
      expect(titleLabels(element, "certifications-salesforce-2025")).toEqual([
        "Agentforce Specialist",
        "Data 360 Consultant"
      ]);
      expect(titleLabels(element, "certifications-salesforce-2024")).toEqual([
        "Platform Administrator"
      ]);
      expect(titleLabels(element, "certifications-other-vendor-2025")).toEqual([
        "Other Vendor Practitioner"
      ]);
    });

    it("hides a retired certification", async () => {
      const element = await grouped();
      expect(element.shadowRoot.textContent).not.toContain("Retired Thing");
    });

    it("drops the prefix only when it is the issuer's own", () => {
      expect(
        shortCertificationName(
          "Salesforce Certified Platform App Builder",
          "Salesforce"
        )
      ).toBe("Platform App Builder");
      expect(shortCertificationName("Data 360 Consultant", "Salesforce")).toBe(
        "Data 360 Consultant"
      );
      expect(
        shortCertificationName("Salesforce Certified Admin", "Other Vendor")
      ).toBe("Salesforce Certified Admin");
      expect(
        shortCertificationName("Salesforce Certified ", "Salesforce")
      ).toBe("Salesforce Certified");
      expect(shortCertificationName(" X ", "")).toBe("X");
    });

    it("keeps every name visible under every filter", async () => {
      const element = await grouped();
      filter(element, "work").click();
      await flush();
      expect(keysOf(linePoints(element))).toEqual([
        "t1",
        "i1",
        "employer-creighton-university",
        "employer-metropolitan-community-college",
        "earlier-roles"
      ]);
      expect(titleLabels(element, "employer-creighton-university")).toEqual([
        "CRM Developer",
        "Application Administrator"
      ]);
      filter(element, "certifications").click();
      await flush();
      expect(keysOf(linePoints(element))).toEqual([
        "certifications-salesforce-2025",
        "certifications-other-vendor-2025",
        "certifications-salesforce-2024"
      ]);
      expect(titleLabels(element, "certifications-salesforce-2025")).toEqual([
        "Agentforce Specialist",
        "Data 360 Consultant"
      ]);
    });

    it("keeps newest 4 points then Show all on the phone list", async () => {
      const element = await grouped();
      const keys = () => keysOf(all(element, '[data-id="stack-point"]'));
      expect(keys()).toEqual([
        "t1",
        "i1",
        "employer-creighton-university",
        "certifications-salesforce-2025"
      ]);
      const toggle = element.shadowRoot.querySelector(
        '[data-id="stack-toggle"]'
      );
      expect(text(toggle)).toBe("Show all 8");
      toggle.click();
      await flush();
      expect(keys()).toHaveLength(8);
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
      /source-keys="ResumeController_TimelineRoles,ResumeController_Education,ResumeController_Certifications"/
    );
    expect(marker[1]).not.toMatch(/objects=/);
    expect(marker[1]).not.toMatch(/hide-counts/);
  });
});

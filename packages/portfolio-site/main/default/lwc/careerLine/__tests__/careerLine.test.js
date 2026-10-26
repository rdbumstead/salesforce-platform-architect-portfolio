/**
 * @description       : Unit tests for careerLine LWC: the roles newest first from getTimeline,
 *                      the highlights from getResume for the Architect persona, nothing on an
 *                      error or with no roles, opening and closing a role (aria-expanded, one
 *                      at a time, Escape with focus back), the phone list of three, and the
 *                      full timeline opening and closing in place.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import { createElement } from "@lwc/engine-dom";
import CareerLine, {
  HIGHLIGHT_PERSONA,
  PHONE_ROLES,
  formatYears,
  highlightsById,
  isCurrentRole,
  spokenYears
} from "c/careerLine";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import getResume from "@salesforce/apex/ResumeController.getResume";
import { trackEvent } from "c/analyticsService";

// The nested full timeline sends its own two events through the same mock.
jest.mock(
  "c/analyticsService",
  () => ({
    __esModule: true,
    trackEvent: jest.fn(),
    EVENTS: {
      CAREER_ROLE_OPENED: "career_role_opened",
      CAREER_TIMELINE_TOGGLED: "career_timeline_toggled",
      TIMELINE_TAB_CHANGED: "timeline_tab_changed",
      TIMELINE_EXPANDED: "timeline_expanded"
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
    key: "a04",
    title: "POS Technician",
    employer: "Fiserv, Inc",
    startDate: "2016-01-01",
    endDate: "2016-10-03",
    isCurrent: false
  }
];

const TIMELINE = {
  work: WORK,
  education: [],
  certifications: [],
  verificationUrl: null,
  tabLimit: 5
};

const RESUME = {
  roles: [
    { id: "a01", highlights: [" Led the design. ", "Shipped it."] },
    { id: "a02", highlights: ["Built a site."] },
    { id: "a03", highlights: ["Moved the data."] },
    { id: "a04", highlights: [] }
  ]
};

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

async function renderWithData() {
  const element = render();
  getTimeline.emit(TIMELINE);
  getResume.emit(RESUME);
  await flush();
  return element;
}

function lineButtons(element) {
  return Array.from(
    element.shadowRoot.querySelectorAll('[data-list="line"][data-role-button]')
  );
}

function stackButtons(element) {
  return Array.from(
    element.shadowRoot.querySelectorAll('[data-list="stack"][data-role-button]')
  );
}

function linePanel(element) {
  return element.shadowRoot.querySelector('[data-id="line-panel"]');
}

function toggle(element) {
  return element.shadowRoot.querySelector('[data-id="timeline-toggle"]');
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
      expect(formatYears(WORK[0])).toBe("2026+");
      expect(formatYears(WORK[2])).toBe("2025 to 2026");
      expect(formatYears(WORK[3])).toBe("2016");
      expect(formatYears({ endDate: "2021-06-18" })).toBe("2021");
      expect(formatYears({ isCurrent: true })).toBe("");
      expect(formatYears({ startDate: "2017-01-02" })).toBe("2017+");
    });

    it("speaks a current role as since its start year, active", () => {
      expect(spokenYears(WORK[0])).toBe("since 2026, active");
      expect(spokenYears({ isCurrent: true })).toBe("active");
      expect(spokenYears(WORK[2])).toBe("2025 to 2026");
      expect(isCurrentRole({ startDate: "2017-01-02" })).toBe(true);
      expect(isCurrentRole(WORK[3])).toBe(false);
    });

    it("keys highlights by role Id, trimmed, and ignores rows with no Id", () => {
      const byId = highlightsById({
        roles: [...RESUME.roles, null, { highlights: ["x"] }]
      });
      expect(byId.get("a01")).toEqual(["Led the design.", "Shipped it."]);
      expect(byId.get("a04")).toEqual([]);
      expect(byId.size).toBe(4);
      expect(highlightsById(null).size).toBe(0);
    });
  });

  describe("reads", () => {
    it("reads getTimeline and getResume for the Architect persona", () => {
      render();
      expect(getTimeline.getLastConfig()).toEqual({});
      expect(HIGHLIGHT_PERSONA).toBe("Architect");
      expect(getResume.getLastConfig()).toEqual({ persona: "Architect" });
    });

    it("renders nothing before the read, on an error or with no roles", async () => {
      const element = render();
      expect(element.shadowRoot.querySelector(".career")).toBeNull();
      getTimeline.error();
      await flush();
      expect(element.shadowRoot.querySelector(".career")).toBeNull();
      getTimeline.emit({ ...TIMELINE, work: [] });
      await flush();
      expect(element.shadowRoot.querySelector(".career")).toBeNull();
      getTimeline.emit({ ...TIMELINE, work: null });
      await flush();
      expect(element.shadowRoot.querySelector(".career")).toBeNull();
    });

    it("hides again when a later read fails", async () => {
      const element = await renderWithData();
      expect(element.shadowRoot.querySelector(".career")).not.toBeNull();
      getTimeline.error();
      await flush();
      expect(element.shadowRoot.querySelector(".career")).toBeNull();
    });
  });

  describe("the line", () => {
    it("has an h2 a screen reader can find and a real ordered list", async () => {
      const element = await renderWithData();
      const heading = element.shadowRoot.querySelector("h2");
      expect(text(heading)).toBe("Career, newest role first");
      const line = element.shadowRoot.querySelector('[data-id="line"]');
      expect(line.tagName).toBe("OL");
      expect(line.querySelectorAll(":scope > li")).toHaveLength(4);
    });

    it("shows every role newest first with the employer, the title and the years", async () => {
      const element = await renderWithData();
      const points = Array.from(
        element.shadowRoot.querySelectorAll('[data-id="line-role"]')
      );
      expect(
        points.map((point) =>
          text(point.querySelector(".employer")).replace(/,$/, "")
        )
      ).toEqual([
        "TELUS Digital",
        "Independent Consultant",
        "Creighton University",
        "Fiserv, Inc"
      ]);
      expect(text(points[0].querySelector(".role-title"))).toBe(
        "Senior Solution Consultant,"
      );
      expect(points[0].classList.contains("point-current")).toBe(true);
      expect(points[2].classList.contains("point-current")).toBe(false);
    });

    it("shows a current role's start year with a plus and an Active tag, spoken once", async () => {
      const element = await renderWithData();
      const points = element.shadowRoot.querySelectorAll(
        '[data-id="line-role"]'
      );
      const years = (point) => ({
        shown: text(point.querySelector('.years [aria-hidden="true"]')),
        spoken: text(point.querySelector(".years .visually-hidden")),
        tag: point.querySelector(".active-tag")
      });
      const current = years(points[0]);
      expect(current.shown).toBe("2026+");
      expect(current.spoken).toBe("since 2026, active");
      expect(text(current.tag)).toBe("Active");
      expect(current.tag.getAttribute("aria-hidden")).toBe("true");
      const past = years(points[2]);
      expect(past.shown).toBe("2025 to 2026");
      expect(past.spoken).toBe("2025 to 2026");
      expect(past.tag).toBeNull();
      // The plain point, with no highlights, carries the same parts.
      expect(years(points[3]).shown).toBe("2016");
      expect(years(points[3]).tag).toBeNull();
      const stack = element.shadowRoot.querySelectorAll(
        '[data-id="stack-role"]'
      );
      expect(years(stack[0]).shown).toBe("2026+");
      expect(text(years(stack[0]).tag)).toBe("Active");
    });

    it("makes a role a button only when it has highlights", async () => {
      const element = await renderWithData();
      expect(lineButtons(element).map((b) => b.dataset.key)).toEqual([
        "a01",
        "a02",
        "a03"
      ]);
      const plain = element.shadowRoot.querySelectorAll(
        '[data-id="line-role"]'
      )[3];
      expect(plain.querySelector("button")).toBeNull();
    });

    it("shows plain points when the highlight read fails", async () => {
      const element = render();
      getTimeline.emit(TIMELINE);
      getResume.error();
      await flush();
      expect(
        element.shadowRoot.querySelectorAll('[data-id="line-role"]')
      ).toHaveLength(4);
      expect(lineButtons(element)).toHaveLength(0);
      // With nothing to focus inside, the scroll region takes a tab stop.
      expect(
        element.shadowRoot
          .querySelector('[data-id="line"]')
          .getAttribute("tabindex")
      ).toBe("0");
    });
  });

  describe("opening a role", () => {
    it("opens the highlights under the line with aria-expanded and aria-controls", async () => {
      const element = await renderWithData();
      const [first] = lineButtons(element);
      expect(first.getAttribute("aria-expanded")).toBe("false");
      expect(first.getAttribute("aria-controls")).toBeTruthy();
      expect(linePanel(element).hidden).toBe(true);

      first.click();
      await flush();
      expect(first.getAttribute("aria-expanded")).toBe("true");
      const panel = linePanel(element);
      expect(panel.hidden).toBe(false);
      expect(text(panel.querySelector(".panel-title"))).toBe(
        "Senior Solution Consultant"
      );
      expect(text(panel.querySelector(".panel-meta"))).toBe(
        "TELUS Digital, 2026+, Active"
      );
      expect(
        Array.from(panel.querySelectorAll(".highlights li")).map(text)
      ).toEqual(["Led the design.", "Shipped it."]);
    });

    it("sends career_role_opened with the role's position on each opening only", async () => {
      const element = await renderWithData();
      const [, second] = lineButtons(element);
      second.click();
      await flush();
      second.click();
      await flush();
      stackButtons(element)[0].click();
      await flush();
      expect(trackEvent.mock.calls).toEqual([
        ["career_role_opened", { position: 2 }],
        ["career_role_opened", { position: 1 }]
      ]);
    });

    it("keeps one role open at a time", async () => {
      const element = await renderWithData();
      const [first, second] = lineButtons(element);
      first.click();
      await flush();
      second.click();
      await flush();
      expect(first.getAttribute("aria-expanded")).toBe("false");
      expect(second.getAttribute("aria-expanded")).toBe("true");
      expect(
        Array.from(linePanel(element).querySelectorAll(".highlights li")).map(
          text
        )
      ).toEqual(["Built a site."]);
    });

    it("closes when the open role is pressed again", async () => {
      const element = await renderWithData();
      const [first] = lineButtons(element);
      first.click();
      await flush();
      first.click();
      await flush();
      expect(first.getAttribute("aria-expanded")).toBe("false");
      expect(linePanel(element).hidden).toBe(true);
    });

    it("closes on Escape and puts focus back on the role's button", async () => {
      const element = await renderWithData();
      const [, second] = lineButtons(element);
      second.click();
      await flush();
      linePanel(element).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await flush();
      expect(second.getAttribute("aria-expanded")).toBe("false");
      expect(linePanel(element).hidden).toBe(true);
      expect(element.shadowRoot.activeElement).toBe(second);
    });

    it("ignores other keys and Escape with nothing open", async () => {
      const element = await renderWithData();
      const [first] = lineButtons(element);
      first.click();
      await flush();
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
      await flush();
      expect(first.getAttribute("aria-expanded")).toBe("true");
      first.click();
      await flush();
      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true
      });
      first.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe("the phone list", () => {
    it("lists the latest three roles in a real list", async () => {
      const element = await renderWithData();
      expect(PHONE_ROLES).toBe(3);
      const stack = element.shadowRoot.querySelector('[data-id="stack"]');
      expect(stack.tagName).toBe("OL");
      const items = stack.querySelectorAll('[data-id="stack-role"]');
      expect(items).toHaveLength(3);
      expect(
        Array.from(items).map((item) =>
          text(item.querySelector(".employer")).replace(/,$/, "")
        )
      ).toEqual([
        "TELUS Digital",
        "Independent Consultant",
        "Creighton University"
      ]);
    });

    it("opens a role in place under it, one at a time, and closes on Escape", async () => {
      const element = await renderWithData();
      const [first, second] = stackButtons(element);
      const panels = () =>
        Array.from(
          element.shadowRoot.querySelectorAll('[data-id="stack-panel"]')
        );
      expect(panels().every((panel) => panel.hidden)).toBe(true);

      first.click();
      await flush();
      expect(first.getAttribute("aria-expanded")).toBe("true");
      expect(panels()[0].hidden).toBe(false);
      expect(first.nextElementSibling).toBe(panels()[0]);
      // The line's own button for the same role stays closed.
      expect(lineButtons(element)[0].getAttribute("aria-expanded")).toBe(
        "false"
      );
      expect(linePanel(element).hidden).toBe(true);

      second.click();
      await flush();
      expect(first.getAttribute("aria-expanded")).toBe("false");
      expect(panels()[0].hidden).toBe(true);
      expect(panels()[1].hidden).toBe(false);

      panels()[1].dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await flush();
      expect(panels()[1].hidden).toBe(true);
      expect(element.shadowRoot.activeElement).toBe(second);
    });
  });

  describe("the full timeline", () => {
    it("is a button, closed at first, with no timeline in the page", async () => {
      const element = await renderWithData();
      const button = toggle(element);
      expect(button.tagName).toBe("BUTTON");
      expect(text(button)).toBe("See the full timeline");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(button.getAttribute("aria-controls")).toBeTruthy();
      expect(
        element.shadowRoot.querySelector("c-experience-timeline")
      ).toBeNull();
      expect(element.shadowRoot.querySelector("a")).toBeNull();
    });

    it("opens the timeline in place, moves focus to its heading, and closes it again", async () => {
      const element = await renderWithData();
      const button = toggle(element);
      button.click();
      await flush();
      const region = element.shadowRoot.querySelector(
        '[data-id="full-timeline"]'
      );
      expect(button.getAttribute("aria-expanded")).toBe("true");
      expect(text(button)).toBe("Hide the full timeline");
      expect(region.hidden).toBe(false);
      const nested = region.querySelector("c-experience-timeline");
      expect(nested).not.toBeNull();
      // Until the timeline's data arrives, focus waits on the region.
      expect(element.shadowRoot.activeElement).toBe(region);
      getTimeline.emit(TIMELINE);
      await flush();
      expect(element.shadowRoot.activeElement).toBe(nested);
      expect(nested.shadowRoot.activeElement).toBe(
        nested.shadowRoot.querySelector('[data-id="timeline-heading"]')
      );

      button.click();
      await flush();
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(text(button)).toBe("See the full timeline");
      expect(region.hidden).toBe(true);
      expect(
        element.shadowRoot.querySelector("c-experience-timeline")
      ).toBeNull();
      expect(element.shadowRoot.activeElement).toBe(button);
    });

    it("sends career_timeline_toggled with expanded on each press", async () => {
      const element = await renderWithData();
      toggle(element).click();
      await flush();
      toggle(element).click();
      await flush();
      expect(trackEvent.mock.calls).toEqual([
        ["career_timeline_toggled", { expanded: true }],
        ["career_timeline_toggled", { expanded: false }]
      ]);
    });

    it("leaves Escape inside the opened timeline to the timeline", async () => {
      const element = await renderWithData();
      lineButtons(element)[0].click();
      toggle(element).click();
      await flush();
      const nested = element.shadowRoot.querySelector("c-experience-timeline");
      nested.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
      await flush();
      expect(lineButtons(element)[0].getAttribute("aria-expanded")).toBe(
        "true"
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
      lineButtons(element)[0].click();
      toggle(element).click();
      await flush();
      expect(linePanel(element).classList.contains("panel-reveal")).toBe(true);
      expect(
        element.shadowRoot
          .querySelector('[data-id="full-timeline"]')
          .classList.contains("panel-reveal")
      ).toBe(true);
    });

    it("opens at once under reduced motion", async () => {
      systemReduces(true);
      const element = await renderWithData();
      lineButtons(element)[0].click();
      toggle(element).click();
      await flush();
      expect(linePanel(element).classList.contains("panel-reveal")).toBe(false);
      expect(
        element.shadowRoot
          .querySelector('[data-id="full-timeline"]')
          .classList.contains("panel-reveal")
      ).toBe(false);
    });
  });
});

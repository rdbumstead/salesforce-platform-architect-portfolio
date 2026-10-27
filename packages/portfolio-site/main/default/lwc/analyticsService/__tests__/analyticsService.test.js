/**
 * @description       : Unit tests for the analyticsService module. Covers the
 *                      event list, the hand off to the head script's listener, the call into
 *                      gtag when no listener takes the event, and the silent paths with no tag
 *                      or a failing tag.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { BRIDGE_EVENT, EVENTS, trackEvent } from "c/analyticsService";

const L4_NAMES = [
  "api_test_executed",
  "api_reference_opened",
  "ai_generation_completed",
  "ai_complete_failure",
  "resume_downloaded",
  "roadmap_viewed",
  "changelog_commit_clicked",
  "governance_run_link_clicked",
  "finops_quota_visibility",
  "theme_changed",
  "resilience_test_triggered"
];

// Appended to the first list under the append only rule.
const M6_NAMES = [
  "skills_view_changed",
  "skill_selected",
  "erd_scope_changed",
  "erd_node_selected",
  "gallery_asset_opened",
  "matrix_weight_changed",
  "matrix_reset"
];

// Appended later under the same rule.
const N6_NAMES = ["timeline_tab_changed"];

// Appended last under the same rule.
const R7_NAMES = ["skills_persona_filtered"];

// Appended for view source, contact, testimonials, the home page, the graph,
// Back to top and the timeline, under the same rule.
const SITE_NAMES = [
  "view_source_opened",
  "view_source_file_selected",
  "contact_form_submitted",
  "testimonial_submitted",
  "testimonials_filtered",
  "case_study_opened",
  "start_path_followed",
  "graph_zoom_used",
  "back_to_top_used",
  "timeline_expanded"
];

// Appended for the motion toggle, the docs page and the API Lab sections, under the same rule.
const MOTION_DOCS_LAB_NAMES = [
  "motion_toggled",
  "docs_opened",
  "api_lab_section_toggled"
];

// Appended for the home page case study links and the skills graph layout controls.
const CASE_STUDY_GRAPH_NAMES = [
  "case_study_link_followed",
  "graph_layout_changed"
];

// Appended for the home page career line.
const CAREER_NAMES = ["career_role_opened", "career_timeline_toggled"];

// Appended for the one career timeline's selector and the tour's two entry points.
const TIMELINE_TOUR_NAMES = ["career_timeline_filtered", "tour_opened"];

describe("c/analyticsService", () => {
  afterEach(() => {
    delete window.gtag;
  });

  it("lists exactly the event names the site sends", () => {
    expect(Object.values(EVENTS).sort()).toEqual(
      [
        ...L4_NAMES,
        ...M6_NAMES,
        ...N6_NAMES,
        ...R7_NAMES,
        ...SITE_NAMES,
        ...MOTION_DOCS_LAB_NAMES,
        ...CASE_STUDY_GRAPH_NAMES,
        ...CAREER_NAMES,
        ...TIMELINE_TOUR_NAMES
      ].sort()
    );
  });

  it("keeps the newest names last, in the order they were appended", () => {
    const newest = [
      ...SITE_NAMES,
      ...MOTION_DOCS_LAB_NAMES,
      ...CASE_STUDY_GRAPH_NAMES,
      ...CAREER_NAMES,
      ...TIMELINE_TOUR_NAMES
    ];
    expect(Object.values(EVENTS).slice(-newest.length)).toEqual(newest);
  });

  it("names the career line events under their keys", () => {
    expect(EVENTS.CAREER_ROLE_OPENED).toBe("career_role_opened");
    expect(EVENTS.CAREER_TIMELINE_TOGGLED).toBe("career_timeline_toggled");
  });

  it("names the timeline selector and tour events under their keys", () => {
    expect(EVENTS.CAREER_TIMELINE_FILTERED).toBe("career_timeline_filtered");
    expect(EVENTS.TOUR_OPENED).toBe("tour_opened");
  });

  it("names the motion, docs and API Lab section events under their keys", () => {
    expect(EVENTS.MOTION_TOGGLED).toBe("motion_toggled");
    expect(EVENTS.DOCS_OPENED).toBe("docs_opened");
    expect(EVENTS.API_LAB_SECTION_TOGGLED).toBe("api_lab_section_toggled");
  });

  it("names the case study link and graph layout events under their keys", () => {
    expect(EVENTS.CASE_STUDY_LINK_FOLLOWED).toBe("case_study_link_followed");
    expect(EVENTS.GRAPH_LAYOUT_CHANGED).toBe("graph_layout_changed");
  });

  it("cannot be changed at runtime", () => {
    expect(Object.isFrozen(EVENTS)).toBe(true);
  });

  it("does nothing and returns false without window.gtag", () => {
    expect(window.gtag).toBeUndefined();
    expect(() => trackEvent(EVENTS.ROADMAP_VIEWED)).not.toThrow();
    expect(trackEvent(EVENTS.ROADMAP_VIEWED)).toBe(false);
  });

  it("sends the event with its params through gtag", () => {
    window.gtag = jest.fn();
    const sent = trackEvent(EVENTS.API_TEST_EXECUTED, {
      path: "/sapi/v1/skills",
      status: 200
    });
    expect(sent).toBe(true);
    expect(window.gtag).toHaveBeenCalledTimes(1);
    expect(window.gtag).toHaveBeenCalledWith("event", "api_test_executed", {
      path: "/sapi/v1/skills",
      status: 200
    });
  });

  it("sends an empty params object when none is given", () => {
    window.gtag = jest.fn();
    trackEvent(EVENTS.FINOPS_QUOTA_VISIBILITY);
    expect(window.gtag).toHaveBeenCalledWith(
      "event",
      "finops_quota_visibility",
      {}
    );
  });

  it("does not hand the caller's params object to gtag", () => {
    window.gtag = jest.fn();
    const params = { theme: "dark" };
    trackEvent(EVENTS.THEME_CHANGED, params);
    const sentParams = window.gtag.mock.calls[0][2];
    expect(sentParams).toEqual(params);
    expect(sentParams).not.toBe(params);
  });

  it("swallows an error thrown by gtag", () => {
    window.gtag = jest.fn(() => {
      throw new Error("tag failed");
    });
    expect(() => trackEvent(EVENTS.ROADMAP_VIEWED)).not.toThrow();
    expect(trackEvent(EVENTS.ROADMAP_VIEWED)).toBe(false);
  });

  it("ignores a gtag that is not a function", () => {
    window.gtag = "not a function";
    expect(trackEvent(EVENTS.ROADMAP_VIEWED)).toBe(false);
  });

  describe("through the head script's listener", () => {
    let listener;

    afterEach(() => {
      document.removeEventListener(BRIDGE_EVENT, listener);
    });

    function listen(cancel) {
      listener = jest.fn((event) => {
        if (cancel) {
          event.preventDefault();
        }
      });
      document.addEventListener(BRIDGE_EVENT, listener);
    }

    it("hands the name and a copy of the params to the listener, and stops there when it takes it", () => {
      listen(true);
      window.gtag = jest.fn();
      const params = { theme: "dark" };
      expect(trackEvent(EVENTS.THEME_CHANGED, params)).toBe(true);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.type).toBe("portfolio-analytics");
      expect(event.cancelable).toBe(true);
      expect(event.detail).toEqual({
        name: "theme_changed",
        params: { theme: "dark" }
      });
      expect(event.detail.params).not.toBe(params);
      expect(window.gtag).not.toHaveBeenCalled();
    });

    it("sends {} to the listener when no params are given", () => {
      listen(true);
      trackEvent(EVENTS.BACK_TO_TOP_USED);
      expect(listener.mock.calls[0][0].detail).toEqual({
        name: "back_to_top_used",
        params: {}
      });
    });

    it("falls back to gtag when the listener does not take the event", () => {
      listen(false);
      window.gtag = jest.fn();
      expect(trackEvent(EVENTS.ROADMAP_VIEWED)).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(window.gtag).toHaveBeenCalledWith("event", "roadmap_viewed", {});
    });

    it("returns false when nothing takes the event and there is no gtag", () => {
      listen(false);
      expect(trackEvent(EVENTS.ROADMAP_VIEWED)).toBe(false);
    });

    it("dispatches nothing for a blank name", () => {
      listen(true);
      expect(trackEvent("")).toBe(false);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  it("returns false and does not throw when dispatching fails", () => {
    const dispatch = jest
      .spyOn(document, "dispatchEvent")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(() => trackEvent(EVENTS.ROADMAP_VIEWED)).not.toThrow();
    expect(trackEvent(EVENTS.ROADMAP_VIEWED)).toBe(false);
    dispatch.mockRestore();
  });

  it("refuses a blank event name", () => {
    window.gtag = jest.fn();
    expect(trackEvent("")).toBe(false);
    expect(trackEvent(undefined)).toBe(false);
    expect(window.gtag).not.toHaveBeenCalled();
  });
});

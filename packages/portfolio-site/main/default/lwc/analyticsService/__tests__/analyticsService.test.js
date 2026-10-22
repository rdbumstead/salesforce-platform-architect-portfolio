/**
 * @description       : Unit tests for the analyticsService module (Round 4 plan L4). Covers the
 *                      event list, the call into gtag, and the silent paths with no tag or a
 *                      failing tag.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { EVENTS, trackEvent } from "c/analyticsService";

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
  "theme_changed"
];

describe("c/analyticsService", () => {
  afterEach(() => {
    delete window.gtag;
  });

  it("lists exactly the L4 event names", () => {
    expect(Object.values(EVENTS).sort()).toEqual([...L4_NAMES].sort());
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

  it("refuses a blank event name", () => {
    window.gtag = jest.fn();
    expect(trackEvent("")).toBe(false);
    expect(trackEvent(undefined)).toBe(false);
    expect(window.gtag).not.toHaveBeenCalled();
  });
});

import {
  IS_STATIC,
  builtAt,
  utcLabel,
  localLabel,
  buildWording,
  siteOrigin
} from "c/siteHost";

/** Puts the visitor in one zone for a test, whatever zone the machine is in. */
function visitorIn(timeZone) {
  jest.restoreAllMocks();
  const Real = Intl.DateTimeFormat;
  jest
    .spyOn(Intl, "DateTimeFormat")
    .mockImplementation(
      (locale, options) => new Real(locale, { timeZone, ...options })
    );
}

const AT = "2026-11-19T01:33:09.000Z";

describe("c-site-host", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("says the Salesforce site reads its data as the page loads", () => {
    expect(IS_STATIC).toBe(false);
    expect(builtAt()).toBeNull();
  });

  it("gives the page's own origin on the Salesforce site", () => {
    expect(siteOrigin()).toBe(window.location.origin);
  });

  it("writes a build time in UTC with UTC written out", () => {
    expect(utcLabel("2026-11-03T14:05:09.000Z")).toBe(
      "Nov 3, 2026, 2:05 PM UTC"
    );
    expect(utcLabel(AT)).toBe("Nov 19, 2026, 1:33 AM UTC");
  });

  it("writes the same moment in the visitor's own zone with the zone shown", () => {
    visitorIn("America/New_York");
    expect(localLabel(AT)).toBe("Nov 18, 2026, 8:33 PM EST");
    visitorIn("Asia/Tokyo");
    expect(localLabel(AT)).toMatch(/^Nov 19, 2026, 10:33 AM (GMT\+9|JST)$/);
  });

  it("never shows a bare date: every stamp carries a zone", () => {
    visitorIn("America/Los_Angeles");
    expect(localLabel(AT)).toMatch(/ [A-Z]{3,4}$/);
    expect(utcLabel(AT)).toMatch(/ UTC$/);
  });

  it("returns nothing for a missing or unreadable time", () => {
    expect(utcLabel(null)).toBe("");
    expect(utcLabel("not a date")).toBe("");
    expect(localLabel(undefined)).toBe("");
  });

  it("writes the marker words for a section read at build time", () => {
    visitorIn("America/New_York");
    const words = buildWording(AT);
    expect(words.markerLabel).toBe(
      "From Salesforce · built Nov 18, 2026, 8:33 PM EST"
    );
    expect(words.markerShort).toBe("");
    expect(words.explanation).toContain(
      "when the site was built, on Nov 18, 2026, 8:33 PM EST (Nov 19, 2026, 1:33 AM UTC)"
    );
    expect(words.explanation).toContain("allowlisted API");
  });
});

import {
  IS_STATIC,
  builtAt,
  utcLabel,
  localLabel,
  buildWording,
  siteOrigin
} from "c/siteHost";

describe("c-site-host", () => {
  it("says the Salesforce site reads its data as the page loads", () => {
    expect(IS_STATIC).toBe(false);
    expect(builtAt()).toBeNull();
  });

  it("gives the page's own origin on the Salesforce site", () => {
    expect(siteOrigin()).toBe(window.location.origin);
  });

  it("writes a build time in UTC", () => {
    expect(utcLabel("2026-11-03T14:05:09.000Z")).toBe("3 Nov 2026, 14:05 UTC");
  });

  it("returns nothing for a missing or unreadable time", () => {
    expect(utcLabel(null)).toBe("");
    expect(utcLabel("not a date")).toBe("");
    expect(localLabel(undefined)).toBe("");
  });

  it("writes the marker words for a section read at build time", () => {
    const words = buildWording("2026-11-03T14:05:09.000Z");
    expect(words.markerLabel).toBe(
      "From Salesforce · built 3 Nov 2026, 14:05 UTC"
    );
    expect(words.markerShort).toBe("From Salesforce · built 3 Nov 2026");
    expect(words.explanation).toContain(
      "when the site was built, on 3 Nov 2026, 14:05 UTC"
    );
    expect(words.explanation).toContain("allowlisted API");
  });
});

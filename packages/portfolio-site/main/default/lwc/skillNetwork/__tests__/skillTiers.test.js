/**
 * @description       : Unit tests for the skill tier rules in skillTiers.js: the priority with
 *                      its default, the link count, the evidence rule for Core, the views and
 *                      the default view, and the public labels.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/14/2026
 **/
import {
  CORE_MIN_LINKS,
  DEFAULT_PRIORITY,
  DEFAULT_TIER_VIEW,
  TIER_CORE,
  TIER_EXTENDED,
  TIER_FULL,
  TIER_LABELS,
  TIER_VIEWS,
  isInView,
  linkCountOf,
  priorityOf,
  tierOf,
  tierView
} from "../skillTiers";

describe("skillTiers", () => {
  describe("priorityOf", () => {
    it.each([
      ["1", 1],
      ["2", 2],
      ["3", 3],
      [1, 1],
      [3, 3]
    ])("reads %p as %p", (value, expected) => {
      expect(priorityOf(value)).toBe(expected);
    });

    it.each([null, undefined, "", "0", "4", "high", 1.5])(
      "counts %p as the default, 2",
      (value) => {
        expect(priorityOf(value)).toBe(DEFAULT_PRIORITY);
        expect(DEFAULT_PRIORITY).toBe(2);
      }
    );
  });

  describe("linkCountOf", () => {
    it("adds roles, projects and certifications", () => {
      expect(
        linkCountOf({
          roleIds: ["r1", "r2"],
          projectIds: ["p1"],
          certificationIds: ["c1"]
        })
      ).toBe(4);
    });

    it("counts a missing list as none", () => {
      expect(linkCountOf({ roleIds: ["r1"] })).toBe(1);
      expect(linkCountOf(undefined)).toBe(0);
    });
  });

  describe("tierOf", () => {
    it("puts priority 1 with two links in Core", () => {
      expect(CORE_MIN_LINKS).toBe(2);
      expect(tierOf("1", 2)).toBe(TIER_CORE);
      expect(tierOf("1", 5)).toBe(TIER_CORE);
    });

    it("puts priority 1 with fewer than two links in Extended", () => {
      expect(tierOf("1", 1)).toBe(TIER_EXTENDED);
      expect(tierOf("1", 0)).toBe(TIER_EXTENDED);
    });

    it("puts priority 2 in Extended however many links it has", () => {
      expect(tierOf("2", 0)).toBe(TIER_EXTENDED);
      expect(tierOf("2", 9)).toBe(TIER_EXTENDED);
    });

    it("puts priority 3 in Full toolkit however many links it has", () => {
      expect(tierOf("3", 0)).toBe(TIER_FULL);
      expect(tierOf("3", 9)).toBe(TIER_FULL);
    });

    it("treats a blank priority as 2", () => {
      expect(tierOf(null, 4)).toBe(TIER_EXTENDED);
    });
  });

  describe("views", () => {
    it("opens on Core", () => {
      expect(DEFAULT_TIER_VIEW).toBe("core");
      expect(tierView(undefined).value).toBe("core");
      expect(tierView("nonsense").value).toBe("core");
    });

    it("offers three views, narrowest first, each adding the next tier", () => {
      expect(TIER_VIEWS.map((view) => view.label)).toEqual([
        "Core",
        "Core and Extended",
        "Full toolkit"
      ]);
      expect(TIER_VIEWS.map((view) => view.rank)).toEqual([1, 2, 3]);
    });

    it("shows only Core in the Core view", () => {
      expect(isInView(TIER_CORE, "core")).toBe(true);
      expect(isInView(TIER_EXTENDED, "core")).toBe(false);
      expect(isInView(TIER_FULL, "core")).toBe(false);
    });

    it("shows Core and Extended in the middle view", () => {
      expect(isInView(TIER_CORE, "extended")).toBe(true);
      expect(isInView(TIER_EXTENDED, "extended")).toBe(true);
      expect(isInView(TIER_FULL, "extended")).toBe(false);
    });

    it("shows every tier in Full toolkit", () => {
      [TIER_CORE, TIER_EXTENDED, TIER_FULL].forEach((tier) =>
        expect(isInView(tier, "full")).toBe(true)
      );
    });
  });

  it("names the tiers with the public labels only", () => {
    expect(Object.values(TIER_LABELS)).toEqual([
      "Core",
      "Extended",
      "Full toolkit"
    ]);
    const words = [
      ...Object.values(TIER_LABELS),
      ...TIER_VIEWS.map((view) => view.label)
    ]
      .join(" ")
      .toLowerCase();
    ["low", "weak", "minor"].forEach((word) =>
      expect(words).not.toContain(word)
    );
  });
});

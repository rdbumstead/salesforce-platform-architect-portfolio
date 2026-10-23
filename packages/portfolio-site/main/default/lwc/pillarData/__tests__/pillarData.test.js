/**
 * @description       : Unit tests for the pillarData service module (Round 4 plan, contract L3).
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import {
  PILLARS,
  LIVE_PILLARS,
  COMING_PILLARS,
  pillarByLetter
} from "c/pillarData";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

// Route URLs from the Round 3 plan, K7. Short SAS names as in the mockup and heroBanner.
const EXPECTED = [
  [
    "A",
    "Business Architecture",
    "Business Architecture",
    "/portfolio/business-architecture",
    false
  ],
  [
    "B",
    "Nonprofit Solutions",
    "Solution Architecture",
    "/portfolio/nonprofit-solutions",
    false
  ],
  [
    "C",
    "API Lab",
    "Work Experience Verification API",
    "/portfolio/api-lab",
    false
  ],
  ["D", "AI Lab", "AI & Innovation", "/portfolio/ai-lab", false],
  ["E", "Delivery", "Agile Delivery & DevOps", "/portfolio/delivery", false]
];

describe("c/pillarData", () => {
  it("lists the five pillars A to E in order with K7 hrefs", () => {
    expect(PILLARS).toHaveLength(5);
    PILLARS.forEach((pillar, index) => {
      const [letter, pageLabel, sasName, href, inProgress] = EXPECTED[index];
      expect(pillar.letter).toBe(letter);
      expect(pillar.pageLabel).toBe(pageLabel);
      expect(pillar.sasName).toBe(sasName);
      expect(pillar.href).toBe(href);
      expect(pillar.inProgress).toBe(inProgress);
    });
  });

  it("gives every pillar a summary, a tour line and at least one tag", () => {
    PILLARS.forEach((pillar) => {
      expect(pillar.summary.length).toBeGreaterThan(0);
      expect(pillar.tour.length).toBeGreaterThan(0);
      expect(pillar.tags.length).toBeGreaterThan(0);
    });
  });

  it("carries a code line only for pillar C", () => {
    const withCode = PILLARS.filter((pillar) => pillar.code);
    expect(withCode.map((pillar) => pillar.letter)).toEqual(["C"]);
    expect(withCode[0].code).toBe("GET /sapi/v1/health  200");
  });

  it("uses unique keys and letters", () => {
    expect(new Set(PILLARS.map((pillar) => pillar.key)).size).toBe(5);
    expect(new Set(PILLARS.map((pillar) => pillar.letter)).size).toBe(5);
  });

  it("is frozen so no consumer can change the shared list", () => {
    expect(Object.isFrozen(PILLARS)).toBe(true);
    expect(Object.isFrozen(PILLARS[0])).toBe(true);
    expect(Object.isFrozen(PILLARS[0].tags)).toBe(true);
  });

  it("finds a pillar by letter in either case", () => {
    expect(pillarByLetter("D").pageLabel).toBe("AI Lab");
    expect(pillarByLetter("e").pageLabel).toBe("Delivery");
    expect(pillarByLetter(" c ").pageLabel).toBe("API Lab");
  });

  it("returns undefined for an unknown or missing letter", () => {
    expect(pillarByLetter("F")).toBeUndefined();
    expect(pillarByLetter("")).toBeUndefined();
    expect(pillarByLetter(undefined)).toBeUndefined();
    expect(pillarByLetter(3)).toBeUndefined();
  });

  it("has all five pillars live and none coming (Round 5 plan, M9)", () => {
    expect(LIVE_PILLARS.map((pillar) => pillar.letter)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E"
    ]);
    expect(COMING_PILLARS).toHaveLength(0);
    expect(PILLARS.filter((pillar) => pillar.inProgress)).toHaveLength(0);
    expect(Object.isFrozen(LIVE_PILLARS)).toBe(true);
    expect(Object.isFrozen(COMING_PILLARS)).toBe(true);
  });

  it("names no client in the pillar A and B copy and says nothing is being built", () => {
    const copy = PILLARS.map((pillar) =>
      [pillar.summary, pillar.tour, ...pillar.tags].join(" ")
    ).join(" ");
    expect(copy).not.toMatch(
      /being built|coming|college|MCC|GLA|Metropolitan|Greenville/i
    );
  });

  it("keeps the pillar A and B tour lines and summaries from the Round 5 plan", () => {
    expect(pillarByLetter("A").tour).toBe(
      "See how a business process maps to its data model, drawn live from the org."
    );
    expect(pillarByLetter("A").summary).toBe(
      "How an employer hub for an education provider models a business process and its data."
    );
    expect(pillarByLetter("B").tour).toBe(
      "Follow the pre-sales reasoning behind a platform choice for a literacy program."
    );
    expect(pillarByLetter("B").summary).toBe(
      "A solution design, decision matrix and cost comparison for a regional adult literacy nonprofit."
    );
    expect(pillarByLetter("A").tags).toEqual(["Employer Hub", "Data model"]);
    expect(pillarByLetter("B").tags).toEqual([
      "Solution design",
      "Decision matrix"
    ]);
  });

  it("gives pillar C the API reference sub link and no other pillar any", () => {
    const withLinks = PILLARS.filter((pillar) => pillar.subLinks.length);
    expect(withLinks.map((pillar) => pillar.letter)).toEqual(["C"]);
    expect(withLinks[0].subLinks).toEqual([
      {
        key: "api-reference",
        label: "API reference",
        url: "api-lab/reference",
        href: "/portfolio/api-lab/reference"
      }
    ]);
    expect(Object.isFrozen(withLinks[0].subLinks[0])).toBe(true);
  });
});

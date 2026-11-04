/**
 * @description       : Unit tests for the pillar summaries on the static site, where c/siteHost
 *                      says IS_STATIC. The Salesforce wording is pinned in pillarData.test.js.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/02/2026
 **/
import { PILLARS, pillarByLetter } from "c/pillarData";

jest.mock(
  "@salesforce/community/basePath",
  () => ({ __esModule: true, default: "/portfolio" }),
  { virtual: true }
);

jest.mock("c/siteHost", () => ({ __esModule: true, IS_STATIC: true }), {
  virtual: true
});

describe("c-pillar-data on the static site", () => {
  it("describes the headless design with a claim no kill switch can break", () => {
    expect(pillarByLetter("A").summary).toBe(
      "How an employer hub for an education provider models a business process and its data. The page is built from records in my org."
    );
    expect(pillarByLetter("B").summary).toBe(
      "A solution design, decision matrix and cost comparison for an adult literacy nonprofit. The matrix runs in your browser."
    );
    expect(pillarByLetter("C").summary).toBe(
      "Call the portfolio REST API and read the headers it returns."
    );
    expect(pillarByLetter("D").summary).toBe(
      "Generate a cover letter grounded in the portfolio data."
    );
    expect(pillarByLetter("E").summary).toBe(
      "The Jira roadmap and the commits that shipped this site, as of the last build."
    );
  });

  it("says nothing is live in any summary", () => {
    expect(PILLARS.map((pillar) => pillar.summary).join(" ")).not.toMatch(
      /\blive\b/i
    );
  });

  it("does not expose the static wording as a field", () => {
    PILLARS.forEach((pillar) => {
      expect(pillar).not.toHaveProperty("staticSummary");
    });
  });
});

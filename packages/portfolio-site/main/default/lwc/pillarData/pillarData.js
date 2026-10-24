/**
 * @description       : The one list of the five portfolio pillars.
 *                      A service module with no template. heroBanner and portfolioThemeLayout import it.
 *                      Nobody else edits it. Text follows the agreed home mockup, route URLs follow
 *                      the urlPrefix of each route in the Portfolio1 site bundle.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import basePath from "@salesforce/community/basePath";

/**
 * Builds a site relative href from the community base path and a route URL.
 * @param {string} url route URL
 * @returns {string} href
 */
function toHref(url) {
  return `${basePath || ""}/${url}`;
}

const SOURCE = [
  {
    key: "business-architecture",
    letter: "A",
    pageLabel: "Business Architecture",
    sasName: "Business Architecture",
    url: "business-architecture",
    summary:
      "How an employer hub for an education provider models a business process and its data.",
    tour: "See how a business process maps to its data model, drawn live from the org.",
    tags: ["Employer Hub", "Data model"],
    inProgress: false
  },
  {
    key: "nonprofit-solutions",
    letter: "B",
    pageLabel: "Solution Architecture",
    sasName: "Solution Architecture",
    url: "nonprofit-solutions",
    summary:
      "A solution design, decision matrix and cost comparison for a regional adult literacy nonprofit.",
    tour: "Follow the pre-sales reasoning behind a platform choice for a literacy program.",
    tags: ["Solution design", "Decision matrix"],
    inProgress: false
  },
  {
    key: "api-lab",
    letter: "C",
    pageLabel: "API Lab",
    sasName: "Work Experience Verification API",
    url: "api-lab",
    summary: "Call the portfolio REST API and read the headers it returns.",
    tour: "Send a request and check the status, request id and rate limit headers.",
    tags: ["Apex REST", "OAuth 2.0", "OpenAPI"],
    inProgress: false,
    code: "GET /sapi/v1/health  200",
    subLinks: [
      { key: "api-reference", label: "API reference", url: "api-lab/reference" }
    ]
  },
  {
    key: "ai-lab",
    letter: "D",
    pageLabel: "AI Lab",
    sasName: "AI & Innovation",
    url: "ai-lab",
    summary: "Generate a cover letter grounded in the portfolio data.",
    tour: "Paste a job description and see what the generator writes.",
    tags: ["Grounded generation", "Fallback chain"],
    inProgress: false
  },
  {
    key: "delivery",
    letter: "E",
    pageLabel: "Delivery",
    sasName: "Agile Delivery & DevOps",
    url: "delivery",
    summary: "The Jira roadmap and the commits that shipped this site.",
    tour: "See the roadmap from Jira and the latest commits from GitHub.",
    tags: ["Jira", "GitHub Actions"],
    inProgress: false
  }
];

/**
 * The five pillars, A to E, in tour order. Each entry is frozen, tags and sub links included.
 * Fields: key, letter, pageLabel, sasName, url, href, summary, tour, tags, inProgress, subLinks,
 * and code where a pillar has a code line to show.
 * inProgress marks a pillar that is coming: the home page leaves it out of the cards and the
 * tour, and the header menu marks it "coming".
 */
export const PILLARS = Object.freeze(
  SOURCE.map((pillar) =>
    Object.freeze({
      ...pillar,
      href: toHref(pillar.url),
      tags: Object.freeze([...pillar.tags]),
      subLinks: Object.freeze(
        (pillar.subLinks || []).map((link) =>
          Object.freeze({ ...link, href: toHref(link.url) })
        )
      )
    })
  )
);

/** The pillars a visitor can open today, in tour order. */
export const LIVE_PILLARS = Object.freeze(
  PILLARS.filter((pillar) => !pillar.inProgress)
);

/** The pillars that are coming. */
export const COMING_PILLARS = Object.freeze(
  PILLARS.filter((pillar) => pillar.inProgress)
);

/**
 * Finds one pillar by its letter, case insensitive.
 * @param {string} letter A to E
 * @returns {object|undefined} the pillar, or undefined when no pillar has that letter
 */
export function pillarByLetter(letter) {
  if (typeof letter !== "string") {
    return undefined;
  }
  const wanted = letter.trim().toUpperCase();
  return PILLARS.find((pillar) => pillar.letter === wanted);
}

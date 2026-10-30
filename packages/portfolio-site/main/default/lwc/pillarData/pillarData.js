/**
 * @description       : The one list of the five portfolio pillars, and the home page's proof
 *                      points. A service module with no template. siteBuildSection,
 *                      portfolioThemeLayout, heroBanner, homeTestimonials and tourBar import it.
 *                      Nobody else edits it. Text follows the agreed home mockup, route URLs follow
 *                      the urlPrefix of each route in the Portfolio1 site bundle.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
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
    tour: "Open a dashboard image, then find Account in the live data model.",
    tourMinutes: 2,
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
    tour: "Move one weight in the matrix and watch the ranking change.",
    tourMinutes: 3,
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
    tour: "Press Execute GET and find X-Request-Id and X-RateLimit-Limit.",
    tourMinutes: 1,
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
    tour: "Paste a job posting, press Generate, read the letter (about 40 s).",
    tourMinutes: 3,
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
    tour: "Find In Progress on the Jira board, then the latest commit below.",
    tourMinutes: 1,
    tags: ["Jira", "GitHub Actions"],
    inProgress: false
  }
];

/**
 * The five pillars, A to E, in tour order. Each entry is frozen, tags and sub links included.
 * Fields: key, letter, pageLabel, sasName, url, href, summary, tour, tourMinutes, tags,
 * inProgress, subLinks, and code where a pillar has a code line to show.
 * tour is the stop's task line in the tour bar, at most TOUR_TASK_MAX characters, and doubles as
 * its "Show me" button. tourMinutes is the time the stop asks of a careful reader.
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

/**
 * The year the owner started on Salesforce, used until ResumeController.getTimeline returns the
 * Salesforce_Start_Year setting, so the hero's proof strip paints at once. Keep it equal to
 * that record.
 */
export const SALESFORCE_START_YEAR = 2017;

/**
 * The proof strip's start line for a year: "On Salesforce since 2017".
 * @param {number} year the start year, or anything else for the fallback year
 * @returns {string} the line
 */
export function salesforceSince(year) {
  const shown =
    Number.isInteger(year) && year > 0 ? year : SALESFORCE_START_YEAR;
  return `On Salesforce since ${shown}`;
}

/**
 * The home hero's proof strip, in order, with the fallback year. Static, so it paints at once.
 * Each one was checked against the owner's Trailhead profile and his word. The count of active
 * certifications is here once, so every place that shows it agrees.
 */
export const ACTIVE_CERTIFICATIONS = "7 active Salesforce certifications";

/**
 * The chip text for a counted number of active certifications.
 * @param {number} count the count
 * @returns {string} the text
 */
export function activeCertificationsText(count) {
  return `${count} active Salesforce certifications`;
}
export const PROOF_POINTS = Object.freeze([
  salesforceSince(SALESFORCE_START_YEAR),
  ACTIVE_CERTIFICATIONS
]);

/** The longest a stop's task line may be, so it wraps to two lines at most on a phone. */
export const TOUR_TASK_MAX = 70;

/** The pillars a visitor can open today, in tour order. */
export const LIVE_PILLARS = Object.freeze(
  PILLARS.filter((pillar) => !pillar.inProgress)
);

/**
 * How long the tour takes: the sum of the live pillars' own minutes, so a pillar going live or
 * coming out changes the total by itself. Every place that names the tour reads this.
 */
export const TOUR_MINUTES = LIVE_PILLARS.reduce(
  (total, pillar) => total + pillar.tourMinutes,
  0
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

/**
 * @description       : Home page hero with pillar navigation and the five-minute "How to Evaluate Me" tour.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { LightningElement } from "lwc";
import basePath from "@salesforce/community/basePath";

// One entry per pillar. Names follow docs/guides/03-SAS.md section 5, URLs follow the
// urlPrefix of each route in the Portfolio1 site bundle.
const PILLARS = [
  {
    key: "business-architecture",
    letter: "A",
    sasName: "Business Architecture",
    pageLabel: "Business Architecture",
    url: "business-architecture",
    summary: "How the Employer Hub models a business process and its data.",
    tourStep:
      "Open Business Architecture to see how a business process maps to the data model. This page is being built.",
    inProgress: true
  },
  {
    key: "nonprofit-solutions",
    letter: "B",
    sasName: "Pre-Sales Consultancy",
    pageLabel: "Nonprofit Solutions",
    url: "nonprofit-solutions",
    summary:
      "A solution design and decision matrix for a nonprofit literacy program.",
    tourStep:
      "Open Nonprofit Solutions to follow the pre-sales reasoning behind a platform choice. This page is being built.",
    inProgress: true
  },
  {
    key: "api-lab",
    letter: "C",
    sasName: "Work Experience Verification API",
    pageLabel: "API Lab",
    url: "api-lab",
    summary: "Call the portfolio REST API and read the headers it returns.",
    tourStep:
      "Open the API Lab, send a request and check the status, request id and rate limit headers.",
    inProgress: false
  },
  {
    key: "ai-lab",
    letter: "D",
    sasName: "AI & Innovation",
    pageLabel: "AI Lab",
    url: "ai-lab",
    summary: "Generate a cover letter grounded in the portfolio data.",
    tourStep:
      "Open the AI Lab, paste a job description and see what the generator writes.",
    inProgress: false
  },
  {
    key: "delivery",
    letter: "E",
    sasName: "Agile Delivery & DevOps",
    pageLabel: "Delivery",
    url: "delivery",
    summary: "The Jira roadmap and the commits that shipped this site.",
    tourStep:
      "Open Delivery to see the roadmap from Jira and the latest commits from GitHub.",
    inProgress: false
  }
];

const MINUTES_PER_STEP = 1;

/**
 * Builds a site relative href from the community base path and a route URL.
 * @param {string} url route URL
 * @returns {string} href
 */
function toHref(url) {
  return `${basePath || ""}/${url}`;
}

export default class HeroBanner extends LightningElement {
  get pillars() {
    return PILLARS.map((pillar) => ({
      ...pillar,
      href: toHref(pillar.url),
      heading: `Pillar ${pillar.letter}: ${pillar.sasName}`,
      linkLabel: `Go to ${pillar.pageLabel}`
    }));
  }

  get tourSteps() {
    return PILLARS.map((pillar, index) => ({
      key: pillar.key,
      number: index + 1,
      href: toHref(pillar.url),
      title: `Pillar ${pillar.letter}: ${pillar.pageLabel}`,
      text: pillar.tourStep,
      duration: `${MINUTES_PER_STEP} minute`
    }));
  }

  get tourMinutes() {
    return PILLARS.length * MINUTES_PER_STEP;
  }
}

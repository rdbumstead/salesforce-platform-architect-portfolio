/**
 * @description       : Site theme layout. Renders the header navigation for every portfolio page,
 *                      the page content in the unnamed slot, and the footer region.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement } from "lwc";
import basePath from "@salesforce/community/basePath";

// Route URLs match the urlPrefix of each route in the Portfolio1 site bundle.
const PAGES = [
  { key: "home", label: "Home", url: "" },
  { key: "resume", label: "Resume", url: "resume" },
  { key: "skills", label: "Skills", url: "skills" },
  { key: "testimonials", label: "Testimonials", url: "testimonials" }
];

// Pillar names follow docs/guides/03-SAS.md section 5.
const PILLARS = [
  {
    key: "business-architecture",
    letter: "A",
    label: "Business Architecture",
    sasName: "Pillar A: Business Architecture (Employer Hub)",
    url: "business-architecture"
  },
  {
    key: "nonprofit-solutions",
    letter: "B",
    label: "Nonprofit Solutions",
    sasName: "Pillar B: Pre-Sales Consultancy (Nonprofit Literacy Solutions)",
    url: "nonprofit-solutions"
  },
  {
    key: "api-lab",
    letter: "C",
    label: "API Lab",
    sasName: "Pillar C: Work Experience Verification API",
    url: "api-lab"
  },
  {
    key: "ai-lab",
    letter: "D",
    label: "AI Lab",
    sasName: "Pillar D: AI & Innovation",
    url: "ai-lab"
  },
  {
    key: "delivery",
    letter: "E",
    label: "Delivery",
    sasName: "Pillar E: Agile Delivery & DevOps",
    url: "delivery"
  }
];

/**
 * Builds a site relative href from the community base path and a route URL.
 * @param {string} url route URL, empty for Home
 * @returns {string} href
 */
function toHref(url) {
  const base = basePath || "";
  return url ? `${base}/${url}` : `${base}/`;
}

/**
 * @slot header
 * @slot footer
 */
export default class PortfolioThemeLayout extends LightningElement {
  menuOpen = false;

  get homeHref() {
    return toHref("");
  }

  get pages() {
    return PAGES.map((page) => ({ ...page, href: toHref(page.url) }));
  }

  get pillars() {
    return PILLARS.map((pillar) => ({
      ...pillar,
      href: toHref(pillar.url),
      ariaLabel: `${pillar.label}, ${pillar.sasName}`
    }));
  }

  get menuExpanded() {
    return this.menuOpen ? "true" : "false";
  }

  get navClass() {
    return this.menuOpen ? "site-nav site-nav_open" : "site-nav";
  }

  get menuButtonLabel() {
    return this.menuOpen ? "Close menu" : "Menu";
  }

  handleMenuToggle() {
    this.menuOpen = !this.menuOpen;
  }

  handleNavClick() {
    this.menuOpen = false;
  }
}

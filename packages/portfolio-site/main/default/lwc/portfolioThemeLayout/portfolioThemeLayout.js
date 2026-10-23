/**
 * @description       : Site theme layout. Renders the slim sticky header for every portfolio page
 *                      (name, Home, Resume, Skills, Testimonials, a Pillars menu and the theme toggle), the
 *                      page content in the unnamed slot, and the footer region.
 *                      Owns the theme (Round 4 plan, contract L2): the stylesheet follows the system
 *                      setting, and the toggle writes data-theme and the portfolio-theme storage key.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement } from "lwc";
import basePath from "@salesforce/community/basePath";
import { PILLARS } from "c/pillarData";
import { trackEvent, EVENTS } from "c/analyticsService";

// Route URLs match the urlPrefix of each route in the Portfolio1 site bundle (K7).
// Home comes first and shares its href with the brand link (Round 6 plan, N1).
const PAGES = [
  { key: "home", label: "Home", url: "" },
  { key: "resume", label: "Resume", url: "resume" },
  { key: "skills", label: "Skills", url: "skills" },
  { key: "testimonials", label: "Testimonials", url: "testimonials" }
];

const THEME_STORAGE_KEY = "portfolio-theme";
const THEMES = ["light", "dark"];
const DARK_QUERY = "(prefers-color-scheme: dark)";

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
 * Reads the visitor's saved theme. Storage can be missing or throw (private mode, blocked
 * site data), and the page must work either way.
 * @returns {string|null} "light", "dark" or null for "follow the system"
 */
function readStoredTheme() {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Saves the visitor's theme choice. A failure only means the choice is not remembered.
 * @param {string} theme "light" or "dark"
 */
function storeTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage is unavailable. The theme still applies for this page view.
  }
}

/**
 * The media query list for the system dark setting, or null where matchMedia is missing.
 * @returns {MediaQueryList|null} the query list
 */
function darkQuery() {
  try {
    return typeof window.matchMedia === "function"
      ? window.matchMedia(DARK_QUERY)
      : null;
  } catch {
    return null;
  }
}

/**
 * @slot header
 * @slot footer
 */
export default class PortfolioThemeLayout extends LightningElement {
  menuOpen = false;
  pillarsOpen = false;
  // "light" or "dark" once the visitor has chosen, null while the system setting decides.
  chosenTheme = null;
  systemDark = false;

  _query = null;
  // True while a click that passed through the Pillars wrapper bubbles up to the document.
  _clickInPillars = false;

  _onSystemChange = (event) => {
    this.systemDark = event.matches;
  };

  // On the published site the document listener sees a composed path that stops at this
  // host, so it cannot tell a click in the menu from a click on the page in the slot (log 240).
  // The wrapper marks its own clicks in handlePillarsClick, which runs first, and this
  // listener closes the menu only for a click that was not marked.
  _onDocumentClick = () => {
    const inside = this._clickInPillars;
    this._clickInPillars = false;
    if (this.pillarsOpen && !inside) {
      this.pillarsOpen = false;
    }
  };

  // Safari does not focus a button on a mouse click, so after a click on the toggle the focus is
  // outside the header and its keydown handler never hears Escape. This listener closes the
  // Pillars menu from anywhere. The header handler runs first when the focus is inside it.
  _onDocumentKeydown = (event) => {
    if (event.key === "Escape" && this.pillarsOpen) {
      this.pillarsOpen = false;
      this.focusControl(".pillars-toggle");
    }
  };

  connectedCallback() {
    this._query = darkQuery();
    this.systemDark = Boolean(this._query && this._query.matches);
    if (this._query && typeof this._query.addEventListener === "function") {
      this._query.addEventListener("change", this._onSystemChange);
    }
    this.chosenTheme = readStoredTheme();
    if (this.chosenTheme) {
      this.applyTheme(this.chosenTheme);
    }
    document.addEventListener("click", this._onDocumentClick);
    document.addEventListener("keydown", this._onDocumentKeydown);
  }

  disconnectedCallback() {
    if (this._query && typeof this._query.removeEventListener === "function") {
      this._query.removeEventListener("change", this._onSystemChange);
    }
    document.removeEventListener("click", this._onDocumentClick);
    document.removeEventListener("keydown", this._onDocumentKeydown);
  }

  /**
   * Writes data-theme on the html element, which styles.css reads, and on this host, whose
   * :host rules mirror the tokens for every slotted page.
   * @param {string} theme "light" or "dark"
   */
  applyTheme(theme) {
    try {
      document.documentElement.setAttribute("data-theme", theme);
    } catch {
      // The host attribute below still carries the theme to every page inside the layout.
    }
    this.template.host.setAttribute("data-theme", theme);
  }

  get isDark() {
    return this.chosenTheme ? this.chosenTheme === "dark" : this.systemDark;
  }

  get themePressed() {
    return this.isDark ? "true" : "false";
  }

  get themeTitle() {
    return this.isDark ? "Switch to light theme" : "Switch to dark theme";
  }

  get homeHref() {
    return toHref("");
  }

  get pages() {
    return PAGES.map((page) => ({ ...page, href: toHref(page.url) }));
  }

  get pillars() {
    return PILLARS.map((pillar) => ({
      key: pillar.key,
      letter: pillar.letter,
      pageLabel: pillar.pageLabel,
      sasName: pillar.sasName,
      href: pillar.href,
      inProgress: pillar.inProgress,
      subLinks: pillar.subLinks,
      hasSubLinks: pillar.subLinks.length > 0,
      subLabel: `${pillar.pageLabel} pages`
    }));
  }

  get menuExpanded() {
    return this.menuOpen ? "true" : "false";
  }

  get pillarsExpanded() {
    return this.pillarsOpen ? "true" : "false";
  }

  get pillarsHidden() {
    return !this.pillarsOpen;
  }

  get navClass() {
    return this.menuOpen ? "site-nav site-nav_open" : "site-nav";
  }

  get menuButtonLabel() {
    return this.menuOpen ? "Close menu" : "Open menu";
  }

  handleThemeToggle() {
    const next = this.isDark ? "light" : "dark";
    this.chosenTheme = next;
    this.applyTheme(next);
    storeTheme(next);
    trackEvent(EVENTS.THEME_CHANGED, { theme: next });
  }

  handleMenuToggle() {
    this.menuOpen = !this.menuOpen;
    if (!this.menuOpen) {
      this.pillarsOpen = false;
    }
  }

  handlePillarsClick() {
    this._clickInPillars = true;
  }

  handlePillarsToggle() {
    this.pillarsOpen = !this.pillarsOpen;
  }

  handleNavClick() {
    this.menuOpen = false;
    this.pillarsOpen = false;
  }

  handleKeydown(event) {
    if (event.key !== "Escape") {
      return;
    }
    if (this.pillarsOpen) {
      this.pillarsOpen = false;
      this.focusControl(".pillars-toggle");
    } else if (this.menuOpen) {
      this.menuOpen = false;
      this.focusControl(".menu-toggle");
    }
  }

  focusControl(selector) {
    const target = this.template.querySelector(selector);
    if (target) {
      target.focus();
    }
  }
}

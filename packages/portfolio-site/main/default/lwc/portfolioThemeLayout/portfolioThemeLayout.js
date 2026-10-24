/**
 * @description       : Site theme layout. Renders the slim sticky header for every portfolio page
 *                      (name, Home, Resume, Skills, Testimonials, Contact, a Pillars menu and the
 *                      theme toggle), the page content in the unnamed slot, and the footer region.
 *                      Home is left out of the links on the home page itself, in the desktop
 *                      header and the phone menu alike, and the name stays a home link
 *                      everywhere. The link to the page on screen carries aria-current="page".
 *                      Owns the theme: the stylesheet follows the system
 *                      setting, and the toggle writes data-theme and the portfolio-theme storage key.
 *                      Beside it, the motion toggle (aria-pressed when motion is reduced) stores
 *                      the visitor's choice through c/motionPreference, defaults to the system
 *                      setting, mirrors the choice on the host as data-motion and sends
 *                      motion_toggled. The Pillars menu ends with a Docs link to /docs.
 *                      A floating "Back to top" button appears once the visitor has
 *                      scrolled one screen height and rises above the footer when the footer is
 *                      in view. It sits right after the main content in the tab order, scrolls to
 *                      the top (instantly when motion is reduced), moves focus to the
 *                      top of the main content and sends back_to_top_used. While the API
 *                      reference has rendered Redoc on the page, a portfolio-reference document
 *                      event marks the button, and below Redoc's own 50rem breakpoint, where
 *                      Redoc shows its floating menu button in the same corner, it is hidden.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
import { CurrentPageReference } from "lightning/navigation";
import basePath from "@salesforce/community/basePath";
import { PILLARS } from "c/pillarData";
import { trackEvent, EVENTS } from "c/analyticsService";
import {
  applyStoredMotion,
  isReduced,
  onMotionChange,
  scrollBehavior,
  setMotion,
  MOTION_FULL,
  MOTION_REDUCE
} from "c/motionPreference";

// Route URLs match the urlPrefix of each route in the Portfolio1 site bundle.
// Home comes first and shares its href with the brand link. It is left out on the home page.
const PAGES = [
  { key: "home", label: "Home", url: "" },
  { key: "resume", label: "Resume", url: "resume" },
  { key: "skills", label: "Skills", url: "skills" },
  { key: "testimonials", label: "Testimonials", url: "testimonials" },
  { key: "contact", label: "Contact", url: "contact" }
];

const THEME_STORAGE_KEY = "portfolio-theme";
const THEMES = ["light", "dark"];
const DARK_QUERY = "(prefers-color-scheme: dark)";
// The route of the architecture docs page, linked from the Pillars menu.
export const DOCS_URL = "docs";
// The document event c-api-reference sends with { mounted } when Redoc renders or goes away.
export const REFERENCE_EVENT = "portfolio-reference";
// The button appears once the visitor has scrolled one screen height.
export const BACK_TO_TOP_SCREENS = 1;

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
 * The current route URL in the same form as PAGES urls: the path after the base path with no
 * leading or trailing slash, so the home page is "".
 * @returns {string} route URL
 */
export function currentRouteUrl() {
  let path = "";
  try {
    path = window.location.pathname || "";
  } catch {
    path = "";
  }
  const base = basePath || "";
  if (base && (path === base || path.startsWith(`${base}/`))) {
    path = path.slice(base.length);
  }
  return path.replace(/^\/+|\/+$/g, "");
}

/**
 * The route URL an href points at, in the same form as currentRouteUrl.
 * @param {string} href site relative href
 * @returns {string} route URL
 */
function routeOfHref(href) {
  const base = basePath || "";
  let path = href || "";
  if (base && (path === base || path.startsWith(`${base}/`))) {
    path = path.slice(base.length);
  }
  return path.replace(/^\/+|\/+$/g, "");
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

  // True while motion is reduced, by the visitor's choice or the system setting.
  motionReduced = false;
  _stopMotion = null;
  // True while the API reference has Redoc rendered on the page.
  referenceMounted = false;

  showBackToTop = false;
  // How far the footer reaches into the viewport, so the button can sit above it.
  backToTopLift = 0;
  _scrollFrame = null;

  // The layout stays on screen while the site changes routes in place, so the current route
  // is read again each time the page reference changes.
  routeUrl = currentRouteUrl();

  @wire(CurrentPageReference)
  wiredPageReference() {
    this.routeUrl = currentRouteUrl();
  }

  _onPopState = () => {
    this.routeUrl = currentRouteUrl();
  };

  _onScroll = () => {
    if (this._scrollFrame !== null) {
      return;
    }
    const schedule =
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame.bind(window)
        : (callback) => setTimeout(callback, 0);
    this._scrollFrame = schedule(() => {
      this._scrollFrame = null;
      this.updateBackToTop();
    });
  };

  _onSystemChange = (event) => {
    this.systemDark = event.matches;
  };

  _onReference = (event) => {
    this.referenceMounted = Boolean(
      event && event.detail && event.detail.mounted
    );
  };

  // On the published site the document listener sees a composed path that stops at this
  // host, so it cannot tell a click in the menu from a click on the page in the slot.
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
    applyStoredMotion();
    this.applyMotion(isReduced());
    this._stopMotion = onMotionChange((reduced) => this.applyMotion(reduced));
    document.addEventListener(REFERENCE_EVENT, this._onReference);
    document.addEventListener("click", this._onDocumentClick);
    document.addEventListener("keydown", this._onDocumentKeydown);
    window.addEventListener("scroll", this._onScroll, { passive: true });
    window.addEventListener("resize", this._onScroll, { passive: true });
    window.addEventListener("popstate", this._onPopState);
    this.routeUrl = currentRouteUrl();
  }

  renderedCallback() {
    // The router can update the address after it has told the page about the new route.
    const now = currentRouteUrl();
    if (now !== this.routeUrl) {
      this.routeUrl = now;
    }
  }

  disconnectedCallback() {
    if (this._query && typeof this._query.removeEventListener === "function") {
      this._query.removeEventListener("change", this._onSystemChange);
    }
    if (this._stopMotion) {
      this._stopMotion();
      this._stopMotion = null;
    }
    document.removeEventListener(REFERENCE_EVENT, this._onReference);
    document.removeEventListener("click", this._onDocumentClick);
    document.removeEventListener("keydown", this._onDocumentKeydown);
    window.removeEventListener("scroll", this._onScroll);
    window.removeEventListener("resize", this._onScroll);
    window.removeEventListener("popstate", this._onPopState);
  }

  /**
   * Shows the floating button once the page is scrolled one screen height, and lifts it above
   * the footer while the footer is on screen, so it never covers the footer.
   */
  updateBackToTop() {
    const viewport = window.innerHeight || 0;
    const threshold = viewport * BACK_TO_TOP_SCREENS;
    const scrolled =
      viewport > 0 && (window.scrollY || window.pageYOffset || 0) >= threshold;
    const footer = this.template.querySelector(".region-footer");
    const footerTop = footer ? footer.getBoundingClientRect().top : viewport;
    this.backToTopLift = Math.max(0, Math.ceil(viewport - footerTop));
    // WebKit scrolls the page when a fixed button takes focus. A focused button stays put, so
    // focus is never dropped to the page body under a keyboard visitor.
    const button = this.template.querySelector(
      '[data-id="floating-back-to-top"]'
    );
    const focused = Boolean(button) && this.template.activeElement === button;
    this.showBackToTop = scrolled || focused;
  }

  handleBackToTopBlur() {
    this.updateBackToTop();
  }

  get backToTopClass() {
    return this.referenceMounted
      ? "back-to-top back-to-top_beside-reference"
      : "back-to-top";
  }

  get backToTopStyle() {
    return this.backToTopLift > 0
      ? `bottom: calc(${this.backToTopLift}px + var(--pf-space-4));`
      : "";
  }

  handleBackToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: scrollBehavior() });
    const main = this.template.querySelector(".region-content");
    if (main) {
      main.focus({ preventScroll: true });
    }
    this.showBackToTop = false;
    trackEvent(EVENTS.BACK_TO_TOP_USED);
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

  /**
   * Mirrors the motion state on this host as data-motion, which the layout's own CSS reads.
   * @param {boolean} reduced true when motion is reduced
   */
  applyMotion(reduced) {
    this.motionReduced = reduced;
    this.template.host.setAttribute(
      "data-motion",
      reduced ? MOTION_REDUCE : MOTION_FULL
    );
  }

  get motionPressed() {
    return this.motionReduced ? "true" : "false";
  }

  get motionTitle() {
    return this.motionReduced ? "Turn motion back on" : "Reduce motion";
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

  get docsHref() {
    return toHref(DOCS_URL);
  }

  get docsCurrent() {
    return this.currentFor(this.docsHref);
  }

  get isHomePage() {
    return this.routeUrl === "";
  }

  /** "page" for the link to the route on screen, null for every other link. */
  currentFor(href) {
    return routeOfHref(href) === this.routeUrl ? "page" : null;
  }

  get pages() {
    return PAGES.filter(
      (page) => !(page.key === "home" && this.isHomePage)
    ).map((page) => {
      const href = toHref(page.url);
      return { ...page, href, current: this.currentFor(href) };
    });
  }

  get pillars() {
    return PILLARS.map((pillar) => ({
      key: pillar.key,
      letter: pillar.letter,
      pageLabel: pillar.pageLabel,
      sasName: pillar.sasName,
      href: pillar.href,
      current: this.currentFor(pillar.href),
      inProgress: pillar.inProgress,
      subLinks: pillar.subLinks.map((link) => ({
        ...link,
        current: this.currentFor(link.href)
      })),
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

  handleMotionToggle() {
    const next = this.motionReduced ? MOTION_FULL : MOTION_REDUCE;
    // setMotion sends the portfolio-motion event, which applyMotion hears through
    // onMotionChange. Applying here too keeps the button right where storage fails.
    setMotion(next);
    this.applyMotion(next === MOTION_REDUCE);
    trackEvent(EVENTS.MOTION_TOGGLED, { motion: next });
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

/**
 * @description       : Site theme layout. Renders the slim sticky header for every portfolio page,
 *                      the page content in the unnamed slot, and the footer region.
 *                      The header holds the name (a home link everywhere) at the left, and at the
 *                      right Home, Resume, Skills, a "How it's built" menu, Testimonials and
 *                      Contact, a thin divider
 *                      drawn in CSS (aria-hidden), then the Back to top arrow, the theme toggle
 *                      and the phone menu button. While the arrow is hidden the links and the
 *                      divider slide over its place, so the divider always sits beside the next
 *                      control, and they slide back as it appears. Home links to the home page from
 *                      every page and, already on the home page, scrolls to the top and moves focus
 *                      to the page content, as the Back to top arrow does. The menu lists
 *                      "Take the 10 minute tour" first, which starts the tour and goes to its
 *                      first stop, then the five pillars from c/pillarData, then Docs and each
 *                      pillar's own pages (the API reference) as items of their own. The tour
 *                      bar (c-tour-bar) sits right under the header and shows only while a
 *                      tour runs. When the bar moves the visitor to a stop, focus goes to the
 *                      new page's main heading (its h1, found through the open shadow trees,
 *                      given tabindex -1 for as long as it has focus), or to the page content
 *                      when none shows within TOUR_HEADING_WAIT_MS. Ending the tour moves focus
 *                      to the page content. On a phone the bar is pinned to the bottom and the
 *                      layout pads the page by its height. The link to the page on screen
 *                      carries aria-current="page". Skills and Testimonials are in the footer too.
 *                      Owns the theme: the stylesheet follows the system setting, and the toggle
 *                      writes data-theme and the portfolio-theme storage key, with a 200 ms
 *                      crossfade where the browser supports view transitions.
 *                      Motion follows the system "reduce motion" setting alone through
 *                      c/motionPreference, mirrored on the host as data-motion. There is no
 *                      motion button, and a choice an earlier version stored is removed on load.
 *                      The menus fade and slide in, a soft shadow shows under the header once the
 *                      page scrolls under it, and the theme crossfades, all only under full motion.
 *                      The Back to top arrow sits in the header in the same place on every page
 *                      and width. It appears once the page has scrolled past the home hero, or
 *                      one screen height on a page with no hero, stays while it has focus,
 *                      scrolls to the top (instantly when motion is reduced), moves focus to the
 *                      top of the main content and sends back_to_top_used.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 12/26/2025
 **/
import { LightningElement, wire } from "lwc";
import { CurrentPageReference } from "lightning/navigation";
import basePath from "@salesforce/community/basePath";
import getHeader from "@salesforce/apex/ResumeController.getHeader";
import { PILLARS } from "c/pillarData";
import { trackEvent, EVENTS } from "c/analyticsService";
import {
  forgetStoredMotion,
  isReduced,
  onMotionChange,
  scrollBehavior,
  MOTION_FULL,
  MOTION_REDUCE
} from "c/motionPreference";
import { startTour, firstStopHref, TOUR_LABEL } from "c/tourBar";

// The header links in order, with the "How it's built" menu between Skills and Testimonials. All
// are plain route links. URLs match the urlPrefix of each route in the Portfolio1 site bundle.
// Home is the route with an empty URL, so it carries aria-current="page" on the home page only.
const PAGES = [
  { key: "home", label: "Home", url: "" },
  { key: "resume", label: "Resume", url: "resume" },
  { key: "skills", label: "Skills", url: "skills" },
  {
    key: "testimonials",
    label: "Testimonials",
    url: "testimonials",
    afterMenu: true
  },
  { key: "contact", label: "Contact", url: "contact", afterMenu: true }
];

// The label of the menu that holds the pillars, Docs and the API reference.
export const BUILT_MENU_LABEL = "How it's built";

const THEME_STORAGE_KEY = "portfolio-theme";
const THEMES = ["light", "dark"];
const DARK_QUERY = "(prefers-color-scheme: dark)";
// The route of the architecture docs page, an item of its own in the menu.
export const DOCS_URL = "docs";
// The home hero. Back to top appears once the page has scrolled past it.
export const HERO_SELECTOR = "c-hero-banner";
// On a page with no hero the arrow appears once the visitor has scrolled one screen height.
export const BACK_TO_TOP_SCREENS = 1;
// How often, at most, the layout looks for the hero again while none is on the page. The look
// walks the page's shadow trees, so it is not repeated on every scroll frame.
export const HERO_LOOKUP_MS = 1000;
// The length of the theme crossfade.
export const THEME_FADE_MS = 200;
// How long the layout waits for the next stop's main heading before it focuses the content.
export const TOUR_HEADING_WAIT_MS = 5000;
// How often it looks for that heading while it waits.
export const TOUR_HEADING_POLL_MS = 100;
// The line under the tour row in the "How it's built" menu.
export const TOUR_MENU_NOTE = "Five stops, with one task on each";

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
 * The selector for an id. A shadow tree that is not native can add a suffix to the id, so a
 * suffixed id matches too.
 * @param {string} id the id
 * @returns {string} a CSS selector
 */
export function idSelector(id) {
  return `[id="${id}"], [id^="${id}-"]`;
}

/**
 * Finds the first element that matches the selector in the page content: the elements given to
 * the layout's content slot, their descendants, and the open shadow trees inside them, because
 * each component renders its sections inside its own shadow tree.
 * @param {Element[]} roots the elements assigned to the content slot
 * @param {string} selector a CSS selector
 * @returns {Element|null} the element
 */
export function findInContent(roots, selector) {
  const visitTree = (root) => {
    const direct = root.querySelector(selector);
    if (direct) {
      return direct;
    }
    for (const node of root.querySelectorAll("*")) {
      if (node.shadowRoot) {
        const found = visitTree(node.shadowRoot);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };
  try {
    for (const root of roots || []) {
      if (root.matches(selector)) {
        return root;
      }
      const found =
        visitTree(root) || (root.shadowRoot && visitTree(root.shadowRoot));
      if (found) {
        return found;
      }
    }
  } catch {
    return null;
  }
  return null;
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
 * Runs the change inside a view transition, so the old and new colours crossfade, and sets the
 * transition's animations to THEME_FADE_MS. Where the browser has no view transitions, or one
 * fails to start, the change simply applies at once.
 * @param {Function} change applies the new theme
 */
function crossfade(change) {
  let transition = null;
  try {
    if (typeof document.startViewTransition === "function") {
      transition = document.startViewTransition(change);
    }
  } catch {
    transition = null;
  }
  if (!transition) {
    change();
    return;
  }
  if (transition.ready && typeof transition.ready.then === "function") {
    transition.ready
      .then(() => {
        if (typeof document.getAnimations !== "function") {
          return;
        }
        document.getAnimations().forEach((animation) => {
          const pseudo = animation.effect && animation.effect.pseudoElement;
          if (pseudo && pseudo.startsWith("::view-transition")) {
            animation.effect.updateTiming({ duration: THEME_FADE_MS });
          }
        });
      })
      .catch(() => {
        // The transition was skipped. The theme has still changed.
      });
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
  // True while a click that passed through the menu wrapper bubbles up to the document.
  _clickInPillars = false;

  _stopMotion = null;
  // True from a press that opens the phone menu until its first link has focus.
  _focusFirstLink = false;

  showBackToTop = false;
  // The hero found on the page, and when the layout last looked for one.
  _hero = null;
  _heroLookedAt = -Infinity;
  // True once page content has scrolled under the sticky header.
  headerRaised = false;
  _scrollFrame = null;
  // The room the tour bar takes at the bottom of a phone screen, in px.
  tourSpace = 0;
  // The header's height in px, where the tour bar sticks on a wide screen.
  headerHeight = 0;
  // Where a move by the tour bar started: the route and the main heading on screen then.
  _tourFrom = null;
  _tourTimer = null;

  // The layout stays on screen while the site changes routes in place, so the current route
  // is read again each time the page reference changes.
  routeUrl = currentRouteUrl();

  @wire(CurrentPageReference)
  wiredPageReference() {
    this.routeUrl = currentRouteUrl();
    this._heroLookedAt = -Infinity;
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
      this.updateScrollState();
    });
  };

  _onSystemChange = (event) => {
    this.systemDark = event.matches;
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
  // menu from anywhere. The header handler runs first when the focus is inside it.
  _onDocumentKeydown = (event) => {
    if (event.key === "Escape" && this.pillarsOpen) {
      this.pillarsOpen = false;
      this.focusControl(".pillars-toggle");
    }
  };

  // Starts the home hero's header read as soon as the layout connects, before the page's own
  // components have loaded. It is the same cacheable read with the same (empty) parameters as
  // c-hero-banner's wire, so the hero is served from the one cached result when it mounts.
  // Nothing here uses the result.
  @wire(getHeader)
  wiredHeader() {}

  /**
   * The skip link's address. A plain fragment is not followed into the shadow root, so the
   * click handler moves focus instead. The address keeps the link a real link.
   * @returns {string} the href
   */
  get skipHref() {
    return `${basePath || ""}/#main-content`;
  }

  /**
   * Moves focus to the main region instead of following the link.
   * @param {Event} event the click
   */
  handleSkipClick(event) {
    event.preventDefault();
    this.focusContent();
  }

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
    forgetStoredMotion();
    this.applyMotion(isReduced());
    this._stopMotion = onMotionChange((reduced) => this.applyMotion(reduced));
    document.addEventListener("click", this._onDocumentClick);
    document.addEventListener("keydown", this._onDocumentKeydown);
    window.addEventListener("scroll", this._onScroll, { passive: true });
    window.addEventListener("resize", this._onScroll, { passive: true });
    window.addEventListener("popstate", this._onPopState);
    this.routeUrl = currentRouteUrl();
  }

  renderedCallback() {
    if (this._focusFirstLink) {
      this._focusFirstLink = false;
      this.focusControl(".site-nav_open .nav-link");
    }
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
    document.removeEventListener("click", this._onDocumentClick);
    document.removeEventListener("keydown", this._onDocumentKeydown);
    window.removeEventListener("scroll", this._onScroll);
    window.removeEventListener("resize", this._onScroll);
    window.removeEventListener("popstate", this._onPopState);
    this.stopHeadingWait();
  }

  /**
   * The elements the page gives the content slot, where the page's own components live.
   * @returns {Element[]} the slotted elements
   */
  contentRoots() {
    const slot = this.template.querySelector(".region-content slot");
    return slot && typeof slot.assignedElements === "function"
      ? slot.assignedElements({ flatten: true })
      : [];
  }

  /**
   * The home hero, when it is on the page. A found hero is kept while it stays connected. With
   * none found, the page is searched again at most once every HERO_LOOKUP_MS, because pages
   * render after the layout and the search walks every shadow tree.
   * @returns {Element|null} the hero
   */
  heroElement() {
    if (this._hero && this._hero.isConnected) {
      return this._hero;
    }
    this._hero = null;
    const now = Date.now();
    if (now - this._heroLookedAt < HERO_LOOKUP_MS) {
      return null;
    }
    this._heroLookedAt = now;
    this._hero = findInContent(this.contentRoots(), HERO_SELECTOR);
    return this._hero;
  }

  /**
   * The scroll position past which Back to top appears: the bottom of the home hero under the
   * header when the hero is on the page, one screen height otherwise.
   * @param {number} viewport the window height
   * @returns {number} the threshold in px
   */
  backToTopThreshold(viewport) {
    const screen = viewport * BACK_TO_TOP_SCREENS;
    const hero = this.heroElement();
    if (!hero) {
      return screen;
    }
    const header = this.template.querySelector(".site-header");
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const heroBottom =
      hero.getBoundingClientRect().bottom + (window.scrollY || 0);
    const past = Math.ceil(heroBottom - headerHeight);
    return past > 0 ? past : screen;
  }

  /**
   * Raises the header once content scrolls under it, and shows Back to top once the page is
   * past the threshold. A focused arrow stays, so focus is never dropped under a keyboard
   * visitor.
   */
  updateScrollState() {
    const viewport = window.innerHeight || 0;
    const y = window.scrollY || window.pageYOffset || 0;
    this.headerRaised = y > 0;
    const scrolled = viewport > 0 && y >= this.backToTopThreshold(viewport);
    const button = this.template.querySelector('[data-id="back-to-top"]');
    const focused = Boolean(button) && this.template.activeElement === button;
    this.showBackToTop = scrolled || focused;
    this.measureHeader();
  }

  /**
   * Keeps the header's height, so the tour bar on a wide screen sticks right under it. Set only
   * when it changes, so a render does not ask for another.
   */
  measureHeader() {
    const header = this.template.querySelector(".site-header");
    const height = header
      ? Math.round(header.getBoundingClientRect().height)
      : 0;
    if (height !== this.headerHeight) {
      this.headerHeight = height;
    }
  }

  // Where the tour bar sticks on a wide screen: under the header. A phone pins it to the
  // bottom in its own CSS, which wins over this.
  get tourBarStyle() {
    return this.headerHeight > 0 ? `top: ${this.headerHeight}px;` : "";
  }

  handleBackToTopBlur() {
    this.updateScrollState();
  }

  get headerClass() {
    return this.headerRaised ? "site-header site-header_raised" : "site-header";
  }

  // The bar knows whether the arrow shows, so the links and the divider can close the arrow's
  // place while it is hidden.
  get barClass() {
    return this.showBackToTop
      ? "site-header__bar site-header__bar_arrow-shown"
      : "site-header__bar";
  }

  get backToTopClass() {
    return this.showBackToTop
      ? "icon-button back-to-top back-to-top_shown"
      : "icon-button back-to-top";
  }

  // Hidden from the tab order and from assistive technology until it is shown.
  get backToTopHidden() {
    return this.showBackToTop ? null : "true";
  }

  get backToTopTabIndex() {
    return this.showBackToTop ? "0" : "-1";
  }

  handleBackToTop() {
    this.goToTop();
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
    this.template.host.setAttribute(
      "data-motion",
      reduced ? MOTION_REDUCE : MOTION_FULL
    );
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

  get isHomePage() {
    return this.routeUrl === "";
  }

  /** "page" for the link to the route on screen, null for every other link. */
  currentFor(href) {
    return routeOfHref(href) === this.routeUrl ? "page" : null;
  }

  get pagesBeforeMenu() {
    return this.pages.filter((page) => !page.afterMenu);
  }

  get pagesAfterMenu() {
    return this.pages.filter((page) => page.afterMenu);
  }

  get pages() {
    return PAGES.map((page) => {
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
      inProgress: pillar.inProgress
    }));
  }

  // Docs, then every pillar's own pages, each an item of its own after the pillars.
  get builtLinks() {
    const docsHref = toHref(DOCS_URL);
    const links = [
      {
        key: "docs",
        label: "Docs",
        description: "Architecture specification and decision records",
        href: docsHref,
        current: this.currentFor(docsHref),
        isDocs: true
      }
    ];
    PILLARS.forEach((pillar) => {
      (pillar.subLinks || []).forEach((link) => {
        links.push({
          key: link.key,
          label: link.label,
          description: `${pillar.pageLabel}, every endpoint and response`,
          href: link.href,
          current: this.currentFor(link.href),
          isDocs: false
        });
      });
    });
    return links;
  }

  get builtMenuLabel() {
    return BUILT_MENU_LABEL;
  }

  get tourHref() {
    return firstStopHref();
  }

  get tourLabel() {
    return TOUR_LABEL;
  }

  get tourMenuNote() {
    return TOUR_MENU_NOTE;
  }

  // The page keeps room at the bottom for the tour bar while it is pinned on a phone.
  get wrapperStyle() {
    return this.tourSpace > 0 ? `padding-bottom: ${this.tourSpace}px;` : "";
  }

  /**
   * The menu's tour row: closes the menus and starts the tour. The link then goes to the first
   * stop as a plain link does.
   */
  handleTourStart() {
    this.handleNavClick();
    startTour();
  }

  handleTourSpace(event) {
    const height = event && event.detail ? Number(event.detail.height) : 0;
    this.tourSpace = Number.isFinite(height) && height > 0 ? height : 0;
    this.measureHeader();
  }

  /** The bar is about to move the visitor: note the route and the main heading on screen. */
  handleTourNavigate() {
    this.stopHeadingWait();
    this._tourFrom = {
      route: this.routeUrl,
      heading: findInContent(this.contentRoots(), "h1")
    };
  }

  /**
   * A stop has arrived after a move by the bar. Focus goes to the new page's main heading once
   * it shows, a heading other than the one on screen when the move started, or to the content
   * when none shows in time. On the same page the heading on screen is the one.
   */
  handleTourArrive() {
    const from = this._tourFrom || { route: null, heading: null };
    this._tourFrom = null;
    this.stopHeadingWait();
    const samePage = from.route === this.routeUrl;
    const started = Date.now();
    const look = () => {
      const heading = findInContent(this.contentRoots(), "h1");
      if (
        heading &&
        heading.isConnected &&
        (samePage || heading !== from.heading)
      ) {
        this._tourTimer = null;
        this.focusHeading(heading);
        return;
      }
      if (Date.now() - started >= TOUR_HEADING_WAIT_MS) {
        this._tourTimer = null;
        this.focusContent();
        return;
      }
      this._tourTimer = setTimeout(look, TOUR_HEADING_POLL_MS);
    };
    look();
  }

  /** The tour has ended or its ending was closed: focus goes to the page content. */
  handleTourLeave() {
    this.stopHeadingWait();
    this.focusContent();
  }

  stopHeadingWait() {
    if (this._tourTimer !== null) {
      clearTimeout(this._tourTimer);
      this._tourTimer = null;
    }
  }

  /**
   * Moves focus to a heading without scrolling. A heading is no focus target of its own, so it
   * holds tabindex -1 while it has focus and loses it again on blur.
   * @param {Element} heading the page's main heading
   */
  focusHeading(heading) {
    try {
      if (!heading.hasAttribute("tabindex")) {
        heading.setAttribute("tabindex", "-1");
        const clear = () => {
          heading.removeAttribute("tabindex");
          heading.removeEventListener("blur", clear);
        };
        heading.addEventListener("blur", clear);
      }
      heading.focus({ preventScroll: true });
    } catch {
      this.focusContent();
    }
  }

  focusContent() {
    const main = this.template.querySelector(".region-content");
    if (main) {
      main.focus({ preventScroll: true });
    }
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
    const change = () => {
      this.chosenTheme = next;
      this.applyTheme(next);
    };
    if (isReduced()) {
      change();
    } else {
      crossfade(change);
    }
    storeTheme(next);
    trackEvent(EVENTS.THEME_CHANGED, { theme: next });
  }

  handleMenuToggle() {
    this.menuOpen = !this.menuOpen;
    if (!this.menuOpen) {
      this.pillarsOpen = false;
    }
    // The phone menu sits before its button in the page, so a Tab from the button would skip
    // it. Focus moves to its first link once it shows, and Escape brings it back to the button.
    this._focusFirstLink = this.menuOpen;
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

  /**
   * Home on the home page scrolls to the top and moves focus to the page content, the same
   * landing as the Back to top arrow, and sends no event. Elsewhere it is a plain link to the
   * home page.
   * @param {Event} event the click
   */
  handleHomeClick(event) {
    this.handleNavClick();
    if (!this.isHomePage) {
      return;
    }
    event.preventDefault();
    // The scroll waits until the closed phone menu has left the header, because a header that
    // shrinks mid scroll stops a smooth scroll short in WebKit.
    Promise.resolve().then(() => this.goToTop());
  }

  /** Scrolls to the top and puts focus on the page content without scrolling again. */
  goToTop() {
    window.scrollTo({ top: 0, left: 0, behavior: scrollBehavior() });
    const main = this.template.querySelector(".region-content");
    if (main) {
      main.focus({ preventScroll: true });
    }
  }

  handleNavLinkClick(event) {
    if (event.currentTarget.dataset.key === "home") {
      this.handleHomeClick(event);
    } else {
      this.handleNavClick();
    }
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

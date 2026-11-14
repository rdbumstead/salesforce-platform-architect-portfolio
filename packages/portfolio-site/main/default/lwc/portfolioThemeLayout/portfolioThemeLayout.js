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
import getRedirect from "@salesforce/apex/SiteRedirectController.getRedirect";
import { IS_STATIC } from "c/siteHost";
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
// Below this window width the navigation folds behind the menu button, as in the CSS.
export const PHONE_MENU_WIDTH = 768;

/**
 * True when the window is narrow enough for the phone menu.
 * @returns {boolean} whether the phone menu is in use
 */
export function isPhoneWidth() {
  return (window.innerWidth || 0) < PHONE_MENU_WIDTH;
}

/**
 * True when a scroll of this direction, started over the open phone menu, would move the page:
 * the menu has nothing to scroll, or it is already at that end of its list.
 * @param {Element} scroller the open menu
 * @param {number} dy the wheel delta, or the opposite of a finger's movement, positive to scroll down
 * @returns {boolean} whether the scroll would reach the page
 */
export function menuPassesScroll(scroller, dy) {
  if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 1) {
    return true;
  }
  if (!dy) {
    return false;
  }
  const atTop = scroller.scrollTop <= 0;
  const atBottom =
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
  return dy < 0 ? atTop : atBottom;
}

/**
 * True when a point on the screen falls inside an element's box. The layout tests the point
 * instead of the event path, because the published site stops the path at the host.
 * @param {Element} element the element
 * @param {number} x the point's clientX
 * @param {number} y the point's clientY
 * @returns {boolean} whether the point is inside
 */
function pointIn(element, x, y) {
  const box = element.getBoundingClientRect();
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

/** The query parameter the redirect adds, and the value that says the Salesforce site sent the visitor. */
export const ARRIVAL_PARAM = "from";
export const ARRIVAL_VALUE = "sf";

/** The query parameter that keeps a visitor on the Salesforce site, and the key that remembers it for the tab. */
export const BYPASS_PARAM = "stay";
export const BYPASS_VALUE = "1";
export const BYPASS_KEY = "portfolio-redirect-stay";

/** The hosts an http target may name. Any other target must be https. */
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

/** The one place the layout leaves the page, so a test can watch it. */
export const navigation = {
  replace(address) {
    window.location.replace(address);
  }
};

/**
 * The address a Salesforce site visitor is sent to, or null when the page stays. The page
 * stays unless the switch is on, the page's host is the one host in the settings, the target
 * is a usable address on another host and the visitor did not ask to stay.
 * The path keeps everything after the site prefix and the other query parameters are kept.
 * The address ends with from=sf, which the static site removes again on arrival.
 * @param {{enabled: boolean, target: string, host: string}} config the settings
 * @param {{hostname: string, pathname: string, search: string, hash: string}} where the page
 * @param {string} prefix the site's path prefix, such as "/portfolio", or ""
 * @param {boolean} stay true when the visitor asked to stay
 * @returns {string|null} the address, or null
 */
export function redirectDestination(config, where, prefix, stay) {
  if (!config || config.enabled !== true || stay || !where) {
    return null;
  }
  const host = String(config.host || "").toLowerCase();
  if (!host || host !== String(where.hostname || "").toLowerCase()) {
    return null;
  }
  let target;
  try {
    target = new URL(config.target);
  } catch {
    return null;
  }
  const secure = target.protocol === "https:";
  const local =
    target.protocol === "http:" && LOCAL_HOSTS.includes(target.hostname);
  if ((!secure && !local) || target.hostname.toLowerCase() === host) {
    return null;
  }
  let path = where.pathname || "/";
  const base = prefix || "";
  if (base && (path === base || path.startsWith(`${base}/`))) {
    path = path.slice(base.length) || "/";
  }
  const query = new URLSearchParams(where.search || "");
  query.set(ARRIVAL_PARAM, ARRIVAL_VALUE);
  return `${target.origin}${path}?${query.toString()}${where.hash || ""}`;
}

/**
 * True when the visitor asked to stay on the Salesforce site, with stay=1 in the address now
 * or earlier in this tab. The request is remembered for the tab, so a reload keeps it.
 * @param {string} search the address's query string
 * @returns {boolean} true to stay
 */
export function wantsToStay(search) {
  const asked =
    new URLSearchParams(search || "").get(BYPASS_PARAM) === BYPASS_VALUE;
  try {
    if (asked) {
      window.sessionStorage.setItem(BYPASS_KEY, BYPASS_VALUE);
      return true;
    }
    return window.sessionStorage.getItem(BYPASS_KEY) === BYPASS_VALUE;
  } catch {
    return asked;
  }
}

/**
 * Removes from=sf from the address bar without a page load, so the first page view and every
 * later one carry a clean address. Other parameters and the hash stay.
 * @param {{pathname: string, search: string, hash: string}} where the page address
 * @param {{state: any, replaceState: Function}} history the window history
 * @returns {boolean} true when the visitor arrived from the Salesforce site
 */
export function stripArrival(where, history) {
  try {
    const query = new URLSearchParams(where.search || "");
    if (query.get(ARRIVAL_PARAM) !== ARRIVAL_VALUE) {
      return false;
    }
    query.delete(ARRIVAL_PARAM);
    const rest = query.toString();
    history.replaceState(
      history.state,
      "",
      `${where.pathname}${rest ? `?${rest}` : ""}${where.hash || ""}`
    );
    return true;
  } catch {
    return false;
  }
}

/** The attribute the page's head script puts on the root element after it has removed from=sf itself. */
export const ARRIVAL_ATTRIBUTE = "data-redirect-arrival";

/**
 * Whether the visitor was sent here by the Salesforce site. The head script of the static page
 * removes from=sf before the analytics tag can read the address, and leaves the attribute so
 * this module still knows. When the head script is not there, this removes it itself.
 * @param {{pathname: string, search: string, hash: string}} where the page address
 * @param {{state: any, replaceState: Function}} history the window history
 * @param {{getAttribute: Function}} root the document's root element
 * @returns {boolean} true when the visitor arrived from the Salesforce site
 */
export function readArrival(where, history, root) {
  let marked = false;
  try {
    marked = root.getAttribute(ARRIVAL_ATTRIBUTE) === ARRIVAL_VALUE;
  } catch {
    marked = false;
  }
  return stripArrival(where, history) || marked;
}

// Read while the module loads. Only the static site is ever sent here, so the Salesforce site
// never strips anything.
let arrivedFromSalesforce =
  IS_STATIC && typeof window !== "undefined"
    ? readArrival(window.location, window.history, document.documentElement)
    : false;

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

  // The header's height outside the open phone menu, in px, so the menu ends at the bottom edge.
  menuRoom = 0;
  // The element that holds the page still while the phone menu is open, and the last finger
  // position it saw.
  _menuGuard = null;
  _touchY = null;

  @wire(CurrentPageReference)
  wiredPageReference() {
    this.followRoute(currentRouteUrl());
    this._heroLookedAt = -Infinity;
  }

  _onPopState = () => {
    this.followRoute(currentRouteUrl());
  };

  _onResize = () => {
    this._onScroll();
    if (!this.menuOpen) {
      return;
    }
    if (isPhoneWidth()) {
      this.measureMenu();
    } else {
      // The phone menu is gone at this width, so it closes and gives the page back.
      this.closePhoneMenu();
    }
  };

  _onMenuTouchStart = (event) => {
    const touches = event.touches || [];
    this._touchY = touches.length === 1 ? touches[0].clientY : null;
  };

  // Zoom is never blocked. A move with two or more fingers is a pinch and goes through
  // untouched. The finger left after a pinch starts clean on its next move.
  _onMenuTouchMove = (event) => {
    const touches = event.touches || [];
    if (touches.length !== 1) {
      this._touchY = null;
      return;
    }
    const touch = touches[0];
    const dy = this._touchY === null ? 0 : this._touchY - touch.clientY;
    this._touchY = touch.clientY;
    this.holdPage(event, touch.clientX, touch.clientY, dy);
  };

  // Ctrl with the wheel, and a trackpad pinch in Chromium, is a zoom and goes through untouched.
  _onMenuWheel = (event) => {
    if (event.ctrlKey) {
      return;
    }
    this.holdPage(event, event.clientX, event.clientY, event.deltaY);
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
    // The audit tools look the skip link target up with document.getElementById, which does not
    // reach into a shadow root. The host sits in the page, so it carries the id the link points at.
    // The click handler still moves focus to the main region.
    if (!this.hasAttribute("id")) {
      this.setAttribute("id", "main-content");
    }
    this._query = darkQuery();
    this.systemDark = Boolean(this._query && this._query.matches);
    if (this._query && typeof this._query.addEventListener === "function") {
      this._query.addEventListener("change", this._onSystemChange);
    }
    this.chosenTheme = readStoredTheme();
    if (this.chosenTheme) {
      this.applyTheme(this.chosenTheme);
    }
    if (IS_STATIC) {
      this.reportArrival();
    } else {
      this.redirectVisitor();
    }
    forgetStoredMotion();
    this.applyMotion(isReduced());
    this._stopMotion = onMotionChange((reduced) => this.applyMotion(reduced));
    document.addEventListener("click", this._onDocumentClick);
    document.addEventListener("keydown", this._onDocumentKeydown);
    window.addEventListener("scroll", this._onScroll, { passive: true });
    window.addEventListener("resize", this._onResize, { passive: true });
    window.addEventListener("popstate", this._onPopState);
    this.routeUrl = currentRouteUrl();
  }

  /**
   * Records the arrival of a visitor the Salesforce site sent here, once per page load.
   */
  reportArrival() {
    if (arrivedFromSalesforce) {
      arrivedFromSalesforce = false;
      trackEvent(EVENTS.REDIRECT_ARRIVED, { source: ARRIVAL_VALUE });
    }
  }

  /**
   * On the Salesforce site, sends the visitor to the static site when the settings say so. A
   * failed read leaves the page as it is.
   */
  redirectVisitor() {
    try {
      if (wantsToStay(window.location.search)) {
        return;
      }
      Promise.resolve(getRedirect())
        .then((config) => {
          const destination = redirectDestination(
            config,
            window.location,
            basePath || "",
            wantsToStay(window.location.search)
          );
          if (destination) {
            navigation.replace(destination);
          }
        })
        .catch(() => {});
    } catch {
      // The redirect is a convenience. The page works without it.
    }
  }

  renderedCallback() {
    if (this._focusFirstLink) {
      this._focusFirstLink = false;
      this.focusControl(".site-nav_open .nav-link");
    }
    // The router can update the address after it has told the page about the new route.
    this.followRoute(currentRouteUrl());
    this.syncMenuGuard();
    if (this.menuOpen) {
      this.measureMenu();
    }
  }

  /**
   * Keeps the current route. A route change closes the phone menu, as a tap on one of its
   * links does, so a page never arrives with the menu still holding it.
   * @param {string} url the route address now
   */
  followRoute(url) {
    if (url === this.routeUrl) {
      return;
    }
    this.routeUrl = url;
    if (this.menuOpen) {
      this.closePhoneMenu();
    }
  }

  closePhoneMenu() {
    this.menuOpen = false;
    this.pillarsOpen = false;
  }

  /**
   * Holds the page still while the phone menu is open. A touch or wheel scroll goes through
   * only when it starts inside the menu and the menu still has room to scroll that way. The
   * CSS stops a scroll that started in the menu from carrying on to the page once the menu
   * reaches its end. The listeners are on only while the menu is open, so the page scrolls
   * at full speed the rest of the time.
   */
  syncMenuGuard() {
    const want = this.menuOpen
      ? this.template.querySelector(".portfolio-layout-wrapper")
      : null;
    if (want === this._menuGuard) {
      return;
    }
    this.releaseMenuGuard();
    if (want) {
      want.addEventListener("touchstart", this._onMenuTouchStart, {
        passive: true
      });
      want.addEventListener("touchmove", this._onMenuTouchMove, {
        passive: false
      });
      want.addEventListener("wheel", this._onMenuWheel, { passive: false });
      this._menuGuard = want;
    }
  }

  releaseMenuGuard() {
    const guard = this._menuGuard;
    if (!guard) {
      return;
    }
    guard.removeEventListener("touchstart", this._onMenuTouchStart);
    guard.removeEventListener("touchmove", this._onMenuTouchMove);
    guard.removeEventListener("wheel", this._onMenuWheel);
    this._menuGuard = null;
    this._touchY = null;
  }

  /**
   * Cancels a scroll that would move the page behind the open phone menu.
   * @param {Event} event the touchmove or wheel event
   * @param {number} x where the finger or pointer is, clientX
   * @param {number} y where it is, clientY
   * @param {number} dy the scroll direction, positive to scroll down
   */
  holdPage(event, x, y, dy) {
    if (!this.menuOpen || !isPhoneWidth() || !event.cancelable) {
      return;
    }
    const menu = this.template.querySelector(".site-nav_open");
    if (menu && pointIn(menu, x, y) && !menuPassesScroll(menu, dy)) {
      return;
    }
    event.preventDefault();
  }

  /**
   * Keeps how much of the header's height is not the open phone menu: the bar above it and the
   * padding and border below it. Set only when it changes, so a render does not ask for another.
   */
  measureMenu() {
    const menu = this.template.querySelector(".site-nav_open");
    const header = this.template.querySelector(".site-header");
    if (!menu || !header) {
      return;
    }
    const box = menu.getBoundingClientRect();
    const outside = header.getBoundingClientRect().bottom - box.bottom;
    const room = Math.max(Math.round(box.top + outside), 0);
    if (room !== this.menuRoom) {
      this.menuRoom = room;
    }
  }

  // The open phone menu and the header around it end at the bottom of the screen. The CSS has
  // a fallback until the layout has measured them.
  get navStyle() {
    return this.menuOpen && this.menuRoom > 0
      ? `--site-menu-room: ${this.menuRoom}px;`
      : "";
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
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("popstate", this._onPopState);
    this.releaseMenuGuard();
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
      menuNote: pillar.menuNote,
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

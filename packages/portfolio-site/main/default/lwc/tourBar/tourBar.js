/**
 * @description       : The 10 minute tour's bar, placed by the theme layout under the header.
 *                      Opt in: it renders nothing unless a tour is running, and a tour runs only
 *                      after the visitor starts one from the hero's link or the first row of the
 *                      header's "How it's built" menu (startTour). The only thing remembered is
 *                      that a tour is running, one session storage key (portfolio-tour). The stop
 *                      is worked out from the page the visitor is on, against the live pillars
 *                      in c/pillarData, and nothing goes in the address. If storage throws, no
 *                      tour starts and the site works as it does without one.
 *                      On a stop the bar shows the progress row ("Stop 3 of 5, API Lab" and the
 *                      stop's minutes, announced politely), the stop's task line as a button that
 *                      asks the page to show the control it names (showMe from c/tourShowMe),
 *                      Back and Next as links to the stops either side, and End tour. Next on the
 *                      last stop is Finish, which shows "That's the tour. Thanks for taking
 *                      it." and a Close button, with no links because the header already has
 *                      them. The ending goes away when closed or on the next page. On a page that is not a stop the bar shows nothing and the tour
 *                      waits for the next stop page.
 *                      Moving by the bar, or starting, tells the layout (tournavigate) so it can
 *                      move focus to the new page's main heading when the stop arrives
 *                      (tourarrive). End tour and Close tell it too (tourleave), so focus never
 *                      drops with the bar. On a phone the bar is pinned to the bottom of the
 *                      screen and reports its height (tourspace) so the layout pads the page.
 *                      Analytics: tour_step_viewed { stop, pillar } once per arrival at a stop,
 *                      tour_exited { stop } from End tour, tour_finished when the ending shows.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/27/2026
 **/
import { LightningElement, api } from "lwc";
import basePath from "@salesforce/community/basePath";
import { LIVE_PILLARS, TOUR_MINUTES } from "c/pillarData";
import { trackEvent, EVENTS } from "c/analyticsService";
import { showMe } from "c/tourShowMe";

/** The session storage key that holds that a tour is running, and nothing else. */
export const TOUR_STORAGE_KEY = "portfolio-tour";

/** The document event startTour sends, so a bar already on screen hears a start. */
export const TOUR_START_EVENT = "portfolio-tour-start";

/** The width under which the bar is pinned to the bottom of the screen. */
export const PHONE_QUERY = "(max-width: 767.98px)";

/**
 * Builds a site relative href from the community base path and a route URL.
 * @param {string} url route URL
 * @returns {string} href
 */
function toHref(url) {
  return `${basePath || ""}/${url}`;
}

/**
 * Whether a tour is running. Storage can be missing or throw, and then no tour runs.
 * @returns {boolean} true while a tour is running
 */
export function isTourRunning() {
  try {
    return window.sessionStorage.getItem(TOUR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Starts a tour: remembers it for this visit and tells a bar already on screen. The caller's
 * link then goes to the first stop as a plain link would.
 * @returns {boolean} true when the tour could start
 */
export function startTour() {
  try {
    window.sessionStorage.setItem(TOUR_STORAGE_KEY, "1");
  } catch {
    return false;
  }
  try {
    document.dispatchEvent(new CustomEvent(TOUR_START_EVENT));
  } catch {
    // The bar reads the key again on the next page.
  }
  return true;
}

/** Ends a running tour for the rest of the visit. */
export function endTour() {
  try {
    window.sessionStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    // Nothing was stored.
  }
}

/**
 * The stop a route is, as an index into the live pillars, or -1 for a page that is no stop.
 * @param {string} routeUrl the route URL with no leading or trailing slash, "" for home
 * @returns {number} the index
 */
export function stopIndexFor(routeUrl) {
  if (typeof routeUrl !== "string" || !routeUrl) {
    return -1;
  }
  return LIVE_PILLARS.findIndex((pillar) => pillar.url === routeUrl);
}

/**
 * "1 minute" or "3 minutes".
 * @param {number} minutes whole minutes
 * @returns {string} the text
 */
export function minutesText(minutes) {
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/** The href of the tour's first stop, which both entry points link to. */
export function firstStopHref() {
  return LIVE_PILLARS.length ? toHref(LIVE_PILLARS[0].url) : toHref("");
}

/** "Take the 10 minute tour", from the live stops' minutes, never typed. */
export const TOUR_LABEL = `Take the ${TOUR_MINUTES} minute tour`;

/**
 * The media query list for the phone width, or null where matchMedia is missing.
 * @returns {MediaQueryList|null} the query list
 */
function phoneQuery() {
  try {
    return typeof window.matchMedia === "function"
      ? window.matchMedia(PHONE_QUERY)
      : null;
  } catch {
    return null;
  }
}

export default class TourBar extends LightningElement {
  running = false;
  ending = false;
  _routeUrl = "";
  // The route an arrival was last counted for, so one arrival counts once.
  _arrivedRoute = null;
  // The route the ending was shown on. The ending goes on the next route.
  _endingRoute = null;
  // True from a move by the bar, or a start, until the stop it leads to arrives.
  _awaitingArrival = false;
  _phone = null;
  _resizeObserver = null;
  _reportedSpace = -1;
  _connected = false;
  // True from Finish until the ending heading has focus.
  _focusEnding = false;

  _onStart = () => {
    this.running = isTourRunning();
    this.ending = false;
    this._endingRoute = null;
    this._arrivedRoute = null;
    this.announceNavigate();
    this.checkArrival();
  };

  _onPhoneChange = () => {
    this.reportSpace();
  };

  /** The route on screen, from the layout, in the form "" for home and "api-lab" for a page. */
  @api
  get routeUrl() {
    return this._routeUrl;
  }

  set routeUrl(value) {
    const next = typeof value === "string" ? value : "";
    const changed = next !== this._routeUrl;
    this._routeUrl = next;
    if (!changed) {
      return;
    }
    if (this.ending && next !== this._endingRoute) {
      this.ending = false;
      this._endingRoute = null;
    }
    // A new route is a new arrival, even back on a stop seen before.
    this._arrivedRoute = null;
    this.running = isTourRunning();
    if (this._connected) {
      this.checkArrival();
    }
  }

  connectedCallback() {
    this._connected = true;
    this.running = isTourRunning();
    document.addEventListener(TOUR_START_EVENT, this._onStart);
    this._phone = phoneQuery();
    if (this._phone && typeof this._phone.addEventListener === "function") {
      this._phone.addEventListener("change", this._onPhoneChange);
    }
    this.checkArrival();
  }

  renderedCallback() {
    if (this._focusEnding) {
      this.focusEnding();
    }
    this.observeSize();
    this.reportSpace();
  }

  disconnectedCallback() {
    this._connected = false;
    document.removeEventListener(TOUR_START_EVENT, this._onStart);
    if (this._phone && typeof this._phone.removeEventListener === "function") {
      this._phone.removeEventListener("change", this._onPhoneChange);
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  /** The stop on screen, as an index into the live pillars, or -1. */
  get stopIndex() {
    return this.running ? stopIndexFor(this._routeUrl) : -1;
  }

  get stop() {
    return this.stopIndex >= 0 ? LIVE_PILLARS[this.stopIndex] : null;
  }

  get showStop() {
    return Boolean(this.stop) && !this.ending;
  }

  get shown() {
    return this.showStop || this.ending;
  }

  get regionLabel() {
    return `The ${TOUR_MINUTES} minute tour`;
  }

  get progressText() {
    if (this.ending) {
      return "That's the tour. Thanks for taking it.";
    }
    const stop = this.stop;
    return stop
      ? `Stop ${this.stopIndex + 1} of ${LIVE_PILLARS.length}, ${stop.pageLabel}`
      : "";
  }

  get minutesLabel() {
    const stop = this.stop;
    return stop ? minutesText(stop.tourMinutes) : "";
  }

  get taskText() {
    const stop = this.stop;
    return stop ? stop.tour : "";
  }

  get hasBack() {
    return this.stopIndex > 0;
  }

  get backHref() {
    return this.hasBack ? toHref(LIVE_PILLARS[this.stopIndex - 1].url) : null;
  }

  get backLabel() {
    return this.hasBack
      ? `Back to ${LIVE_PILLARS[this.stopIndex - 1].pageLabel}`
      : "";
  }

  get isLastStop() {
    return this.stopIndex === LIVE_PILLARS.length - 1;
  }

  get nextHref() {
    return this.stopIndex >= 0 && !this.isLastStop
      ? toHref(LIVE_PILLARS[this.stopIndex + 1].url)
      : null;
  }

  get nextLabel() {
    return this.nextHref
      ? `Next, ${LIVE_PILLARS[this.stopIndex + 1].pageLabel}`
      : "";
  }

  get barClass() {
    return this.ending ? "tour-bar tour-bar_ending" : "tour-bar";
  }

  /**
   * Counts an arrival at a stop once, and tells the layout when the arrival follows a move by
   * the bar or a start, so it can move focus to the page's main heading.
   */
  checkArrival() {
    const stop = this.stop;
    if (!stop || this.ending) {
      return;
    }
    if (this._arrivedRoute === this._routeUrl) {
      return;
    }
    this._arrivedRoute = this._routeUrl;
    trackEvent(EVENTS.TOUR_STEP_VIEWED, {
      stop: stop.letter,
      pillar: stop.key
    });
    if (this._awaitingArrival) {
      this._awaitingArrival = false;
      this.dispatchEvent(new CustomEvent("tourarrive"));
    }
  }

  /** Tells the layout a move is starting, so it can note the heading on screen now. */
  announceNavigate() {
    this._awaitingArrival = true;
    this.dispatchEvent(new CustomEvent("tournavigate"));
  }

  handleShowMe() {
    const stop = this.stop;
    if (stop) {
      showMe(stop.letter);
    }
  }

  handleMove() {
    this.announceNavigate();
  }

  handleFinish() {
    endTour();
    this.running = false;
    this.ending = true;
    this._endingRoute = this._routeUrl;
    this._arrivedRoute = null;
    trackEvent(EVENTS.TOUR_FINISHED);
    // The Finish button leaves with the stop row, so focus moves to the ending's heading.
    this._focusEnding = true;
  }

  handleEnd() {
    const stop = this.stop;
    endTour();
    this.running = false;
    this._arrivedRoute = null;
    this._awaitingArrival = false;
    if (stop) {
      trackEvent(EVENTS.TOUR_EXITED, { stop: stop.letter });
    }
    this.dispatchEvent(new CustomEvent("tourleave"));
  }

  handleClose() {
    this.ending = false;
    this._endingRoute = null;
    this.dispatchEvent(new CustomEvent("tourleave"));
  }

  /** Watches the bar's size, so the page padding follows it when the text wraps. */
  observeSize() {
    if (this._resizeObserver || typeof window.ResizeObserver !== "function") {
      return;
    }
    try {
      this._resizeObserver = new window.ResizeObserver(() =>
        this.reportSpace()
      );
      this._resizeObserver.observe(this.template.host);
    } catch {
      this._resizeObserver = null;
    }
  }

  focusEnding() {
    const heading = this.template.querySelector('[data-id="tour-progress"]');
    if (heading) {
      this._focusEnding = false;
      heading.focus({ preventScroll: true });
    }
  }

  /**
   * Tells the layout how much room to leave at the bottom of the page: the bar's height while
   * it is pinned on a phone, 0 otherwise. Sent only when the number changes.
   */
  reportSpace() {
    let space = 0;
    if (this.shown && this._phone && this._phone.matches) {
      const bar = this.template.querySelector('[data-id="tour-bar"]');
      space = bar ? Math.ceil(bar.getBoundingClientRect().height) : 0;
    }
    if (space !== this._reportedSpace) {
      this._reportedSpace = space;
      this.dispatchEvent(
        new CustomEvent("tourspace", { detail: { height: space } })
      );
    }
  }
}

/**
 * @description       : The visitor's motion preference, in one place for every component that
 *                      animates or scrolls smoothly. isReduced() follows the system "reduce
 *                      motion" setting alone. The site has no motion control of its own, so a
 *                      value an earlier version stored under the portfolio-motion key is ignored,
 *                      and forgetStoredMotion() removes it. onMotionChange() hears a change of the
 *                      system setting, and a portfolio-motion document event with { reduced }
 *                      for a change that lasts only for the page view. Storage and matchMedia can
 *                      be missing or throw (private mode, blocked site data, Jest), and every
 *                      function still answers without throwing.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/24/2026
 **/

/** The localStorage key an earlier version used for the visitor's choice. Read by nothing now. */
export const MOTION_STORAGE_KEY = "portfolio-motion";

/** The document event that changes the preference for the current page view. */
export const MOTION_EVENT = "portfolio-motion";

/** The two motion states, as the layout writes them in its data-motion attribute. */
export const MOTION_REDUCE = "reduce";
export const MOTION_FULL = "full";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * The media query list for the system setting, or null where matchMedia is missing.
 * @returns {MediaQueryList|null} the query list
 */
function reducedQuery() {
  try {
    return typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
      ? window.matchMedia(REDUCED_MOTION_QUERY)
      : null;
  } catch {
    return null;
  }
}

/**
 * Whether the system asks for reduced motion.
 * @returns {boolean} true when the system setting is "reduce"
 */
export function systemPrefersReduced() {
  const query = reducedQuery();
  return Boolean(query && query.matches);
}

/**
 * Whether motion should be reduced right now. Only the system setting decides.
 * @returns {boolean} true when animations and smooth scrolls should be skipped
 */
export function isReduced() {
  return systemPrefersReduced();
}

/**
 * Removes a choice an earlier version of the site stored, so no stale value stays in the
 * visitor's browser. The layout calls it once on load. A failure changes nothing.
 * @returns {boolean} true when a stored value was found and removed
 */
export function forgetStoredMotion() {
  try {
    if (window.localStorage.getItem(MOTION_STORAGE_KEY) === null) {
      return false;
    }
    window.localStorage.removeItem(MOTION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Calls back with the new value whenever it changes: on a change of the system setting, and on
 * a portfolio-motion document event.
 * @param {function(boolean): void} callback receives true when motion should be reduced
 * @returns {function(): void} removes both listeners
 */
export function onMotionChange(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }
  const onEvent = (event) => {
    const reduced =
      event && event.detail && typeof event.detail.reduced === "boolean"
        ? event.detail.reduced
        : isReduced();
    callback(reduced);
  };
  const onSystem = () => {
    callback(systemPrefersReduced());
  };
  const query = reducedQuery();
  try {
    document.addEventListener(MOTION_EVENT, onEvent);
  } catch {
    // No document. Only the system listener below can fire.
  }
  if (query && typeof query.addEventListener === "function") {
    query.addEventListener("change", onSystem);
  }
  return () => {
    try {
      document.removeEventListener(MOTION_EVENT, onEvent);
    } catch {
      // Nothing to remove.
    }
    if (query && typeof query.removeEventListener === "function") {
      query.removeEventListener("change", onSystem);
    }
  };
}

/**
 * The scroll behaviour to pass to scrollTo or scrollIntoView.
 * @returns {string} "auto" when motion is reduced, "smooth" otherwise
 */
export function scrollBehavior() {
  return isReduced() ? "auto" : "smooth";
}

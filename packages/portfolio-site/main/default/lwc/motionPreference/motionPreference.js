/**
 * @description       : The visitor's motion preference, in one place for every component that
 *                      animates or scrolls smoothly. isReduced() answers with the visitor's own
 *                      choice when one is stored under the portfolio-motion key, and with the
 *                      system "reduce motion" setting otherwise. setMotion() stores a choice,
 *                      writes data-motion on the html element and sends a portfolio-motion
 *                      document event with { motion, reduced }. onMotionChange() hears that
 *                      event and also a change of the system setting while no choice is stored.
 *                      Storage and matchMedia can be missing or throw (private mode, blocked
 *                      site data, Jest), and every function still answers without throwing.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/

/** The localStorage key that holds the visitor's choice. */
export const MOTION_STORAGE_KEY = "portfolio-motion";

/** The document event sent when the visitor changes the choice. */
export const MOTION_EVENT = "portfolio-motion";

/** The two stored values. */
export const MOTION_REDUCE = "reduce";
export const MOTION_FULL = "full";
const MOTIONS = [MOTION_REDUCE, MOTION_FULL];

/** The attribute written on the html element, for stylesheets that follow the choice. */
export const MOTION_ATTRIBUTE = "data-motion";

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
 * The visitor's stored choice.
 * @returns {string|null} "reduce", "full" or null when the system setting decides
 */
export function getStoredMotion() {
  try {
    const value = window.localStorage.getItem(MOTION_STORAGE_KEY);
    return MOTIONS.includes(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Whether motion should be reduced right now: the visitor's choice if set, else the system.
 * @returns {boolean} true when animations and smooth scrolls should be skipped
 */
export function isReduced() {
  const stored = getStoredMotion();
  return stored ? stored === MOTION_REDUCE : systemPrefersReduced();
}

/**
 * Writes the choice on the html element. A failure leaves the page as it was.
 * @param {string} motion "reduce" or "full"
 */
function writeAttribute(motion) {
  try {
    document.documentElement.setAttribute(MOTION_ATTRIBUTE, motion);
  } catch {
    // No document. The stored choice and isReduced() still work.
  }
}

/**
 * Writes the stored choice, if there is one, on the html element. The layout calls it once on
 * load so stylesheets match the choice before the visitor touches the toggle.
 * @returns {string|null} the stored choice, or null when there is none
 */
export function applyStoredMotion() {
  const stored = getStoredMotion();
  if (stored) {
    writeAttribute(stored);
  }
  return stored;
}

/**
 * Stores the visitor's choice and tells every listener.
 * @param {string} motion "reduce" or "full"
 * @returns {boolean} true when the value was one of the two and the event was sent
 */
export function setMotion(motion) {
  if (!MOTIONS.includes(motion)) {
    return false;
  }
  try {
    window.localStorage.setItem(MOTION_STORAGE_KEY, motion);
  } catch {
    // Storage is unavailable. The choice still applies for this page view through the event.
  }
  writeAttribute(motion);
  try {
    document.dispatchEvent(
      new CustomEvent(MOTION_EVENT, {
        detail: { motion, reduced: motion === MOTION_REDUCE }
      })
    );
  } catch {
    return false;
  }
  return true;
}

/**
 * Calls back with the new isReduced() value whenever it changes: on a portfolio-motion event,
 * and on a change of the system setting while the visitor has no stored choice.
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
    if (!getStoredMotion()) {
      callback(systemPrefersReduced());
    }
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

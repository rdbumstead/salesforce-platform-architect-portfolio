/**
 * @description       : The tour's "Show me" handshake. The tour bar lives in the theme layout and
 *                      cannot reach into a pillar page component's shadow root, so it asks
 *                      instead: showMe(stop) dispatches a portfolio-tour-show-me document event
 *                      with { stop }, the same channel the analytics bridge and the motion
 *                      preference already use on the site. The one component that holds that
 *                      stop's control calls onShowMe(stop, callback) when it connects, keeps the
 *                      returned function, calls it when it disconnects, and in the callback
 *                      calls revealAnchor(this.template) to scroll its own element marked
 *                      data-tour-anchor into view and move focus to it. Every function answers
 *                      without throwing when the document or the element is missing.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/27/2026
 **/
import { scrollBehavior } from "c/motionPreference";

/** The document event the tour bar sends and each stop's owning component hears. */
export const SHOW_ME_EVENT = "portfolio-tour-show-me";

/** The attribute that marks the one control a stop's task line is about. */
export const ANCHOR_ATTRIBUTE = "data-tour-anchor";

/**
 * Asks the component that owns a stop to show its control.
 * @param {string} stop the stop letter, A to E
 * @returns {boolean} true when the event was dispatched
 */
export function showMe(stop) {
  if (typeof stop !== "string" || stop.length === 0) {
    return false;
  }
  try {
    document.dispatchEvent(
      new CustomEvent(SHOW_ME_EVENT, { detail: { stop: stop.toUpperCase() } })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Calls back whenever the tour bar asks for this stop.
 * @param {string} stop the stop letter this component owns, A to E
 * @param {function(): void} callback runs on each request for that stop
 * @returns {function(): void} removes the listener
 */
export function onShowMe(stop, callback) {
  if (typeof stop !== "string" || typeof callback !== "function") {
    return () => {};
  }
  const wanted = stop.toUpperCase();
  const listener = (event) => {
    if (event && event.detail && event.detail.stop === wanted) {
      callback();
    }
  };
  try {
    document.addEventListener(SHOW_ME_EVENT, listener);
  } catch {
    return () => {};
  }
  return () => {
    try {
      document.removeEventListener(SHOW_ME_EVENT, listener);
    } catch {
      // Nothing to remove.
    }
  };
}

/**
 * Scrolls the element marked data-tour-anchor inside a component's template into view, with
 * the visitor's motion preference, and moves focus to it without a second scroll.
 * @param {object} template the component's this.template
 * @returns {boolean} true when an anchor was found and shown
 */
export function revealAnchor(template) {
  try {
    const anchor =
      template && typeof template.querySelector === "function"
        ? template.querySelector(`[${ANCHOR_ATTRIBUTE}]`)
        : null;
    if (!anchor) {
      return false;
    }
    if (typeof anchor.scrollIntoView === "function") {
      anchor.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    }
    if (typeof anchor.focus === "function") {
      anchor.focus({ preventScroll: true });
    }
    return true;
  } catch {
    return false;
  }
}

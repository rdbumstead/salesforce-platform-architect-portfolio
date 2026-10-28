/**
 * @description       : Tells a component whether a media query matches, at once and again on every
 *                      change, and hands back a function that stops listening. A card uses it to
 *                      move View source and the live data marker out of its title row when the row
 *                      has no room for them. Where the browser has no matchMedia, as in Jest, it
 *                      reports false once.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/28/2026
 **/

/**
 * Calls onChange with whether the query matches, now and whenever that changes.
 * @param {string} query a media query, for example "(max-width: 767px)"
 * @param {function(boolean)} onChange receives true while the query matches
 * @returns {function} stops listening, safe to call more than once
 */
export function watchMedia(query, onChange) {
  if (typeof window.matchMedia !== "function") {
    onChange(false);
    return () => {};
  }
  const list = window.matchMedia(query);
  const update = () => onChange(Boolean(list.matches));
  update();
  if (typeof list.addEventListener !== "function") {
    return () => {};
  }
  list.addEventListener("change", update);
  return () => list.removeEventListener("change", update);
}

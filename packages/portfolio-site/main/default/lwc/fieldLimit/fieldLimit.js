/**
 * @description       : The one way a form says how much of a text box's limit is used. Every
 *                      limited box shows "n of max characters". Once the text comes within
 *                      NEAR_SHARE of the limit, or within NEAR_MINIMUM characters for a short
 *                      box, the line also says how many are left and is marked near, so the
 *                      component can colour it. At the limit it says the limit is reached.
 *                      Numbers are grouped by thousands.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/28/2026
 **/

/** The share of the limit left at which a box counts as near it. */
export const NEAR_SHARE = 0.1;
/** A short box is near its limit within this many characters, whatever the share. */
export const NEAR_MINIMUM = 10;

const count = (value) => Number(value).toLocaleString("en-US");

/**
 * How a box's length reads against its limit.
 * @param {string} value the text in the box
 * @param {number} max the box's limit
 * @returns {{ text: string, isNear: boolean, isFull: boolean, className: string }}
 */
export function limitState(value, max) {
  const used = (value || "").length;
  const left = Math.max(0, max - used);
  const isFull = used >= max;
  const isNear = isFull || left <= Math.max(NEAR_MINIMUM, max * NEAR_SHARE);
  let text = `${count(used)} of ${count(max)} characters`;
  if (isFull) {
    text += ", limit reached";
  } else if (isNear) {
    text += `, ${count(left)} left`;
  }
  return {
    text,
    isNear,
    isFull,
    className: isNear ? "field-limit field-limit_near" : "field-limit"
  };
}

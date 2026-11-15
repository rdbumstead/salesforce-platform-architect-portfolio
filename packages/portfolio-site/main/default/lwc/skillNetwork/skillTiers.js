/**
 * @description       : Skill tiers for the Skills page. Each skill sits in one of three tiers,
 *                      shown in public as "Core", "Extended" and "Full toolkit". The tier
 *                      comes from Skill__c.Selection_Priority__c (1, 2 or 3, and 2 when blank) and
 *                      one evidence rule: a priority 1 skill is Core only when at least two roles,
 *                      projects or certifications link to it in total. With fewer links it shows
 *                      in "Extended". The page opens on Core, and a visitor widens the view
 *                      to Core and "Extended", then to every skill. Pure functions only.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/14/2026
 **/

// Tier ranks. A lower rank is shown first, and a view shows every tier up to its own rank.
export const TIER_CORE = 1;
export const TIER_EXTENDED = 2;
export const TIER_FULL = 3;

// The public names. Nothing else names a tier on the page.
export const TIER_LABELS = Object.freeze({
  [TIER_CORE]: "Core",
  [TIER_EXTENDED]: "Extended",
  [TIER_FULL]: "Full toolkit"
});

// The picklist default for a skill with no priority set.
export const DEFAULT_PRIORITY = 2;

// A priority 1 skill needs this many links in total to show as Core.
export const CORE_MIN_LINKS = 2;

// The views a visitor can choose, narrowest first. Each one adds the next tier.
export const TIER_VIEWS = Object.freeze([
  Object.freeze({ value: "core", label: "Core", rank: TIER_CORE }),
  Object.freeze({
    value: "extended",
    label: "Core and Extended",
    rank: TIER_EXTENDED
  }),
  Object.freeze({ value: "full", label: "Full toolkit", rank: TIER_FULL })
]);

// The page opens on Core.
export const DEFAULT_TIER_VIEW = "core";

/**
 * The priority as a number from 1 to 3. A blank, unknown or out of range value counts as the
 * picklist default, 2.
 * @param {string|number|null|undefined} value the Selection_Priority__c value
 * @returns {number} 1, 2 or 3
 */
export function priorityOf(value) {
  const number = Number(value);
  return value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isInteger(number) &&
    number >= 1 &&
    number <= 3
    ? number
    : DEFAULT_PRIORITY;
}

/**
 * The links behind a skill: every distinct role, project and certification linked to it.
 * @param {{ roleIds: Array, projectIds: Array, certificationIds: Array }} skill from the model
 * @returns {number} the total
 */
export function linkCountOf(skill) {
  const size = (list) => (Array.isArray(list) ? list.length : 0);
  return (
    size(skill && skill.roleIds) +
    size(skill && skill.projectIds) +
    size(skill && skill.certificationIds)
  );
}

/**
 * The tier of one skill. Priority 1 with at least two links is Core, priority 1 with fewer is
 * "Extended", priority 2 is "Extended" and priority 3 is "Full toolkit".
 * @param {string|number|null|undefined} priority the Selection_Priority__c value
 * @param {number} linkCount the skill's links in total
 * @returns {number} TIER_CORE, TIER_EXTENDED or TIER_FULL
 */
export function tierOf(priority, linkCount) {
  const value = priorityOf(priority);
  if (value === 1) {
    return linkCount >= CORE_MIN_LINKS ? TIER_CORE : TIER_EXTENDED;
  }
  return value === 2 ? TIER_EXTENDED : TIER_FULL;
}

/**
 * The view for a value, or the default view when the value is not one of them.
 * @param {string} value a TIER_VIEWS value
 * @returns {{ value: string, label: string, rank: number }} the view
 */
export function tierView(value) {
  return (
    TIER_VIEWS.find((view) => view.value === value) ||
    TIER_VIEWS.find((view) => view.value === DEFAULT_TIER_VIEW)
  );
}

/**
 * True when a skill of this tier shows in the chosen view.
 * @param {number} tier the skill's tier
 * @param {string} viewValue a TIER_VIEWS value
 * @returns {boolean} whether it shows
 */
export function isInView(tier, viewValue) {
  return tier <= tierView(viewValue).rank;
}

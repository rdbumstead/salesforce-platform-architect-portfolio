/**
 * The rule built selection: what a selector model would pick, worked out by fixed rules with no
 * model. The evaluation harness's fake provider and the site's edge template letter both use it,
 * so the two can never drift. Pure code with no I/O, so a Pages Function can import it.
 *
 * The rules: rank the requirement categories by how many of their label and keywords occur in
 * the posting's title and text, keep the top three, and pick for each the two evidence items
 * tagged with it, highest priority first. Skills and projects are those tagged with a top
 * category, matched items before the rest, then by priority. Only the current role carries
 * bullets. The same posting and snapshot always give the same selection.
 *
 * viewForMode is the one filter for what a mode may read. Visitor mode keeps public and verified
 * items only, and the edge letter builds from that view, so an unverified item never reaches a
 * visitor.
 */

import { currentRole } from "./snapshot.js";

export const VIEW_MODES = ["owner", "visitor"];

const FAMILIES = ["engineer", "architect", "consultant", "admin"];

/** The items a mode may use: visitor mode sees public and verified items only. */
export function viewForMode(snapshot, mode) {
  if (!VIEW_MODES.includes(mode)) throw new Error(`Unknown mode "${mode}".`);
  const items = snapshot.items.filter(
    (item) =>
      item.visibility === "public" &&
      (mode === "owner" || item.verified === true)
  );
  return { ...snapshot, items };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when phrase occurs in text as whole words, ignoring case. */
export function hasPhrase(text, phrase) {
  if (!phrase) return false;
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9])${escapeRegExp(phrase.toLowerCase())}($|[^A-Za-z0-9])`
  );
  return pattern.test(String(text).toLowerCase());
}

/**
 * Ranks categories by how many of their keywords occur in text. Returns
 * [{ id, hits }] with at least one hit, most hits first, ties in the file's order.
 */
export function rankCategories(text, categories) {
  return categories
    .map((category, index) => ({
      id: category.id,
      index,
      hits: [category.label, ...category.keywords].filter((word) =>
        hasPhrase(text, word)
      ).length
    }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.index - b.index)
    .map(({ id, hits }) => ({ id, hits }));
}

/** The hard filter kinds and the words that identify each in a flag. */
export const HARD_FILTER_WORDS = {
  degree: ["degree", "bachelor", "bachelor's", "master", "master's"],
  location: [
    "on site",
    "onsite",
    "on-site",
    "relocate",
    "relocation",
    "in the office",
    "hybrid",
    "location"
  ],
  citizenship: [
    "citizen",
    "citizenship",
    "clearance",
    "work authorization",
    "visa",
    "sponsorship"
  ]
};

export function titleFamily(title) {
  const lower = String(title).toLowerCase();
  if (lower.includes("architect")) return "architect";
  if (lower.includes("consultant")) return "consultant";
  if (lower.includes("admin")) return "admin";
  return lower.includes("engineer") || lower.includes("developer")
    ? "engineer"
    : FAMILIES[0];
}

function byPriority(a, b) {
  return a.priority - b.priority;
}

/**
 * The selection, in the selector's answer shape.
 * @param {object} context posting { title, text }, snapshot (the mode's view), categories
 */
export function buildRuleSelection({ posting, snapshot, categories }) {
  const items = snapshot.items;
  const ranked = rankCategories(
    `${posting.title}\n${posting.text}`,
    categories
  ).slice(0, 3);
  const family = titleFamily(posting.title);
  const headline =
    items.find((item) => item.id === `headline-${family}`) ||
    items.find((item) => item.type === "headline");
  const summary = items.find((item) => item.type === "summary");
  const topIds = new Set(ranked.map((entry) => entry.id));
  const scored = (list) =>
    [...list].sort((a, b) => {
      const hitA = a.tags.some((tag) => topIds.has(tag)) ? 0 : 1;
      const hitB = b.tags.some((tag) => topIds.has(tag)) ? 0 : 1;
      return hitA - hitB || byPriority(a, b);
    });
  // Only the current role, the one at the owner's current employer, carries the 4 to 6
  // bullets. Any other role marked current is included with none.
  const mainRole = currentRole(snapshot).role;
  const bulletsFor = (role) =>
    mainRole && role.id === mainRole.id
      ? scored(
          items.filter(
            (item) => item.type === "bullet" && item.roleId === role.id
          )
        ).slice(0, 4)
      : [];
  const requirements = ranked.map((entry) => {
    const evidence = items
      .filter(
        (item) =>
          item.type !== "headline" &&
          item.type !== "summary" &&
          item.tags.includes(entry.id)
      )
      .sort(byPriority)
      .slice(0, 2);
    const label =
      categories.find((category) => category.id === entry.id)?.label ||
      entry.id;
    return {
      requirement: label,
      match: evidence.length ? "strong" : "gap",
      evidence_ids: evidence.map((item) => item.id),
      note: ""
    };
  });
  const tagged = (type) =>
    scored(
      items.filter(
        (item) => item.type === type && item.tags.some((tag) => topIds.has(tag))
      )
    );
  const skills = tagged("skill").slice(0, 5);
  const projects = tagged("project").slice(0, 2);
  const flags = Object.entries(HARD_FILTER_WORDS)
    .filter(
      ([kind, list]) =>
        kind !== "location" &&
        list.some((word) => hasPhrase(posting.text, word))
    )
    .map(([kind]) => `Posting asks for ${kind}`);
  if (/on site|in the office/i.test(posting.text))
    flags.push("Posting asks for on site location");
  return {
    title_family: family,
    top_requirements: requirements,
    headline_id: headline?.id || "",
    summary_id: summary?.id || "",
    roles: snapshot.roles.map((role) => ({
      role_id: role.id,
      include: role.current,
      bullet_ids: bulletsFor(role).map((item) => item.id)
    })),
    skill_ids: skills.map((item) => item.id),
    project_ids: projects.map((item) => item.id),
    hard_filter_flags: flags,
    missing_evidence_suggestions: requirements
      .filter((entry) => entry.match === "gap")
      .map((entry) => `No evidence for ${entry.requirement}`)
  };
}

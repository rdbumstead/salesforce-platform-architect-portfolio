/** Small text helpers shared by the pipeline, the fake provider and the scorer. */

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when phrase occurs in text as whole words, ignoring case. */
export function hasPhrase(text, phrase) {
  if (!phrase) return false;
  const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(phrase.toLowerCase())}($|[^A-Za-z0-9])`);
  return pattern.test(String(text).toLowerCase());
}

/**
 * Ranks categories by how many of their keywords occur in text. Returns
 * [{ id, hits }] with at least one hit, most hits first, ties in the file's order.
 */
export function rankCategories(text, categories) {
  return categories
    .map((category, index) => ({ id: category.id, index, hits: [category.label, ...category.keywords].filter((word) => hasPhrase(text, word)).length }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.index - b.index)
    .map(({ id, hits }) => ({ id, hits }));
}

/** Words of a text, lower case, letters and digits only. */
export function words(text) {
  return String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
}

export function wordCount(text) {
  return String(text).split(/\s+/).filter(Boolean).length;
}

/** The hard filter kinds and the words that identify each in a flag. */
export const HARD_FILTER_WORDS = {
  degree: ['degree', 'bachelor', "bachelor's", 'master', "master's"],
  location: ['on site', 'onsite', 'on-site', 'relocate', 'relocation', 'in the office', 'hybrid', 'location'],
  citizenship: ['citizen', 'citizenship', 'clearance', 'work authorization', 'visa', 'sponsorship']
};

/** The hard filter kinds a list of flags covers. */
export function hardFilterKinds(flags) {
  const text = (flags || []).map((flag) => (typeof flag === 'string' ? flag : JSON.stringify(flag))).join(' \n ');
  return Object.entries(HARD_FILTER_WORDS)
    .filter(([, list]) => list.some((word) => hasPhrase(text, word)))
    .map(([kind]) => kind);
}

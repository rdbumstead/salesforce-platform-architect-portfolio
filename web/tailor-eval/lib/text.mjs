/** Small text helpers shared by the pipeline, the fake provider and the scorer. */

// hasPhrase, rankCategories and HARD_FILTER_WORDS live with the rule built selection, which the
// site's edge letter uses too.
import { HARD_FILTER_WORDS, hasPhrase } from '../../functions/_lib/tailor/select.js';

export { HARD_FILTER_WORDS, hasPhrase, rankCategories } from '../../functions/_lib/tailor/select.js';

/** Words of a text, lower case, letters and digits only. */
export function words(text) {
  return String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
}

export function wordCount(text) {
  return String(text).split(/\s+/).filter(Boolean).length;
}

/** The hard filter kinds a list of flags covers. */
export function hardFilterKinds(flags) {
  const text = (flags || []).map((flag) => (typeof flag === 'string' ? flag : JSON.stringify(flag))).join(' \n ');
  return Object.entries(HARD_FILTER_WORDS)
    .filter(([, list]) => list.some((word) => hasPhrase(text, word)))
    .map(([kind]) => kind);
}

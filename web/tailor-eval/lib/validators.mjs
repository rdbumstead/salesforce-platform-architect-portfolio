/**
 * The one place the harness reaches the validators. They live in the site's functions folder,
 * under functions/_lib/tailor/index.js, and the harness calls them exactly as the pipeline will.
 * Tests pass their own module instead, so the harness can be checked without them.
 */
export const VALIDATORS_PATH = '../../functions/_lib/tailor/index.js';

/**
 * What the harness relies on from each:
 *   validateSelection(text, snapshot, { mode }) takes the raw answer and returns selection and blocksExport
 *   validateLetter(text, { selection, snapshot, blocklist, employer, mode }) adds wordCount, paragraphCount, verifyItems
 *   validateResume(text, { selection, snapshot }) adds blocksExport
 *   checkGrounding(letter, texts, { allow }) with selectedEvidenceTexts and groundingAllowList
 *   parseBlocklist(raw) for SITE_DENYLIST
 */
export const VALIDATOR_NAMES = ['validateSelection', 'validateLetter', 'validateResume', 'checkGrounding', 'parseBlocklist', 'selectedEvidenceTexts', 'groundingAllowList'];

/** Checks a module has every validator and returns just those functions. */
export function pickValidators(module) {
  const missing = VALIDATOR_NAMES.filter((name) => typeof module?.[name] !== 'function');
  if (missing.length) throw new Error(`The validator module is missing ${missing.join(', ')}.`);
  return Object.fromEntries(VALIDATOR_NAMES.map((name) => [name, module[name]]));
}

/** Loads the real validators, or the module at the given path relative to this file. */
export async function loadValidators(modulePath = VALIDATORS_PATH) {
  const url = new URL(modulePath, import.meta.url);
  let module;
  try {
    module = await import(url.href);
  } catch (error) {
    throw new Error(`Could not load the validators from ${url.pathname}: ${error.message}`);
  }
  return pickValidators(module);
}

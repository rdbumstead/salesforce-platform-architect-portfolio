/**
 * The tailoring validators: plain code that checks what the selector and the cover letter model
 * return before anything reaches the owner or a visitor. Each returns { ok, errors, warnings },
 * every entry { code, message, offending }.
 */

export {
  validateSelection,
  MODES,
  TITLE_FAMILIES,
  MATCHES,
  LIMITS
} from "./validate-selection.js";
export {
  validateLetter,
  letterBody,
  BANNED_PHRASES,
  BANNED_WORDS,
  WORD_RANGE,
  PARAGRAPHS,
  LETTER_MODES
} from "./validate-letter.js";
export { validateResume } from "./validate-resume.js";
export {
  checkGrounding,
  selectedEvidenceTexts,
  groundingAllowList,
  nameRuns
} from "./grounding.js";
export { parseBlocklist } from "./blocklist.js";
export {
  termMatcher,
  findNumbers,
  countWords,
  paragraphs,
  cleanText,
  foldLookAlikes,
  mixedScriptWords
} from "./text.js";

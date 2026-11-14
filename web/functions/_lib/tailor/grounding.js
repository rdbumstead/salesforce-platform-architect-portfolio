/**
 * The grounding check: every number and every product or tool name in a cover letter must appear
 * in the text of the evidence the letter was written from. No model and no dependency, so names
 * are found by their shape, and the rule leans towards catching a planted name over avoiding a
 * false alarm.
 *
 * Numbers: digits ("400+", "10,000+", "~90%", "10k", "3.5") and the spelled out numbers zero to
 * twenty. Values are compared, so "two" is grounded by "2", "10k" by "10,000" and "90%" by "~90%".
 * "one" in "one of", "no one" and the like is a word, not a count.
 *
 * Names: a run of name shaped words is one candidate. A word is name shaped when it starts with a
 * capital ("Salesforce"), has a capital after a small letter ("GitHub", "iOS") or mixes letters and
 * digits ("S3"). Hyphens split words ("AI-assisted" gives "AI"), slashes do not ("CI/CD").
 * A run is grounded when the whole run appears in the evidence or the allow list, ignoring case
 * and as whole words. When it does not, each word is checked alone: a word found nowhere fails the
 * letter, and a run whose words are each found but never together is a warning, since that is
 * either a planted product built from real words ("Service Cloud" from "Service" and "Cloud") or
 * an ordinary pairing ("Salesforce Experience Cloud").
 *
 * The first word of a sentence is skipped when it is an ordinary opener: on the OPENERS list,
 * ending in "ing", "ly" or "ed", or found in lower case elsewhere in the letter or the evidence,
 * with or without a plural "s". Any other sentence opener is checked like every other word.
 *
 * Always grounded: the words on ALWAYS (the pronoun I, months, weekdays, salutation words), which
 * also end a run so "At Quillmark Digital I design" gives "Quillmark Digital", and
 * the caller's allow list, which holds the candidate's name, the current employer and the
 * posting's company and title. Text inside a [VERIFY ...] marker is skipped, since the marker
 * already says the claim needs the owner's check and the letter validator lists it.
 *
 * Known misses: a tool name written in lower case ("kubernetes"), a capitalised word that also
 * appears in the evidence in any case ("Marketing" when the evidence says "marketing"), a planted
 * name at a sentence start that ends in "ing", "ly" or "ed", and a number written as a word above
 * twenty or as a fraction ("half").
 */

import { finish, issue } from "./result.js";
import { around, findNumbers, normalise, termMatcher } from "./text.js";

export const ALWAYS = new Set([
  "i",
  "i'm",
  "i've",
  "i'd",
  "i'll",
  "dear",
  "hiring",
  "team",
  "manager",
  "managers",
  "committee",
  "sincerely",
  "regards",
  "mr",
  "ms",
  "mrs",
  "dr",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
]);

export const OPENERS = new Set(
  (
    "a an the this that these those there here it its i my our we you your he she they their his her " +
    "in at as on of to by for from with without within into onto over under after before during since " +
    "until while when where which who whom whose what why how if because although though unless and but " +
    "or so yet nor also then now today recently currently previously earlier later next first second " +
    "third finally beyond across through throughout along among between around above below both each " +
    "every all any some most many much more another other such one two three thank thanks best kind " +
    "warm sincerely regards dear hello hi please let together outside inside alongside instead rather " +
    "just only even still again already often"
  ).split(" ")
);

const STRONG = /(\p{Ll}\p{Lu})|(^\p{Lu}{2,})|(\p{L}.*\p{N})|(\p{N}.*\p{L})/u;
const CAPITAL = /^\p{Lu}/u;
const LEADING = /^[("'[{<]+/u;
const TRAILING = /[)"'\]}>,.!?:;]+$/u;
const BREAKS_AFTER = /[)"\]},.!?:;]$/u;

function isNameShaped(word) {
  return /\p{L}/u.test(word) && (CAPITAL.test(word) || STRONG.test(word));
}

/** Splits the letter into sentences of cleaned words, each word with its run break flag. */
function sentences(letter) {
  const out = [];
  for (const line of letter.split(/\n+/)) {
    for (const sentence of line.split(/(?<=[.!?])\s+/u)) {
      const words = [];
      for (const raw of sentence
        .replace(/(?<=\p{L})-(?=\p{L})/gu, " ")
        .split(/\s+/)) {
        if (!raw) continue;
        const breakBefore = LEADING.test(raw);
        const breakAfter = BREAKS_AFTER.test(raw);
        const word = raw
          .replace(LEADING, "")
          .replace(TRAILING, "")
          .replace(/'s$/u, "");
        if (word)
          words.push({ word, breakBefore, breakAfter, index: words.length });
      }
      if (words.length) out.push(words);
    }
  }
  return out;
}

function isOpener(word, lowerWords) {
  const lower = word.toLowerCase();
  if (STRONG.test(word)) return false;
  const single = lower.replace(/s$/u, "");
  return (
    OPENERS.has(lower) ||
    /(ing|ly|ed)$/u.test(lower) ||
    lowerWords.has(lower) ||
    lowerWords.has(single) ||
    lowerWords.has(`${single}s`)
  );
}

/** Every candidate run of name shaped words in the letter. */
export function nameRuns(letter, evidence = "") {
  const lowerWords = new Set(
    `${letter}\n${evidence}`.match(
      /(?<![\p{L}\p{N}])\p{Ll}[\p{Ll}']*(?![\p{L}\p{N}])/gu
    ) || []
  );
  const runs = [];
  for (const words of sentences(letter)) {
    let run = [];
    const close = () => {
      if (run.length) runs.push(run.map((entry) => entry.word));
      run = [];
    };
    words.forEach((entry, position) => {
      if (entry.breakBefore) close();
      const candidate =
        isNameShaped(entry.word) &&
        !ALWAYS.has(entry.word.toLowerCase()) &&
        !(position === 0 && isOpener(entry.word, lowerWords));
      if (candidate) run.push(entry);
      else close();
      if (entry.breakAfter) close();
    });
    close();
  }
  return runs;
}

function found(term, text) {
  return termMatcher(term).test(text);
}

/** The text of everything the selection put on the resume or named as evidence, for the check. */
export function selectedEvidenceTexts(selection, snapshot) {
  if (!selection || !snapshot || !Array.isArray(snapshot.items)) return [];
  const items = new Map(snapshot.items.map((item) => [item.id, item]));
  const roles = new Map((snapshot.roles || []).map((role) => [role.id, role]));
  const included = (selection.roles || []).filter(
    (entry) => entry && entry.include
  );
  const ids = [
    selection.headline_id,
    selection.summary_id,
    ...included.flatMap((entry) => entry.bullet_ids || []),
    ...(selection.skill_ids || []),
    ...(selection.project_ids || []),
    ...(selection.top_requirements || []).flatMap(
      (entry) => (entry && entry.evidence_ids) || []
    )
  ];
  const texts = [...new Set(ids)]
    .map((id) => items.get(id))
    .filter(Boolean)
    .map((item) => item.text);
  included.forEach((entry) => {
    const role = roles.get(entry.role_id);
    if (role)
      texts.push(
        [role.employer, role.title, role.start, role.end]
          .filter(Boolean)
          .join(" ")
      );
  });
  return texts.filter((text) => typeof text === "string" && text.trim());
}

/** The always grounded names for one run: the candidate, the employer, the posting's company and title. */
export function groundingAllowList(snapshot, { company, title } = {}) {
  const owner = (snapshot && snapshot.owner) || {};
  return [owner.name, owner.currentEmployer, company, title].filter(
    (term) => typeof term === "string" && term.trim()
  );
}

export function checkGrounding(letterText, evidenceTexts, { allow = [] } = {}) {
  const errors = [];
  const warnings = [];
  const evidenceList = Array.isArray(evidenceTexts)
    ? evidenceTexts.filter((text) => typeof text === "string" && text.trim())
    : [];
  if (!evidenceList.length) {
    errors.push(
      issue(
        "grounding.no_evidence",
        "No evidence text was given, so nothing in the letter can be grounded",
        ""
      )
    );
    return finish(errors, warnings, { checked: { numbers: 0, names: 0 } });
  }
  const letter = normalise(letterText).replace(/\[VERIFY\b[^\]\n]*\]?/giu, " ");
  const evidence = normalise(evidenceList.join("\n"));
  const ground = `${evidence}\n${normalise(allow.join("\n"))}`;

  const values = new Set(findNumbers(ground).map((entry) => entry.value));
  const numbers = findNumbers(letter);
  numbers.forEach((entry) => {
    if (!values.has(entry.value)) {
      errors.push(
        issue(
          "grounding.number",
          `The number "${entry.text}" is not in the evidence`,
          around(letter, entry.index, entry.text.length)
        )
      );
    }
  });

  const runs = nameRuns(letter, evidence);
  runs.forEach((run) => {
    const phrase = run.join(" ");
    if (found(phrase, ground)) return;
    const missing = run.filter((word) => !found(word, ground));
    if (missing.length) {
      errors.push(
        issue(
          "grounding.name",
          `"${missing.join(" ")}" is not in the evidence`,
          phrase
        )
      );
    } else if (run.length > 1) {
      warnings.push(
        issue(
          "grounding.name_combination",
          "Each word is in the evidence but never together",
          phrase
        )
      );
    }
  });

  return finish(errors, warnings, {
    checked: { numbers: numbers.length, names: runs.length }
  });
}

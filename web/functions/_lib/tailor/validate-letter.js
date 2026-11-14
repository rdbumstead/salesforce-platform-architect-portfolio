/**
 * Checks a generated cover letter. Every failure carries the offending text.
 *
 * Errors: an em dash, an en dash used as a dash, a semicolon, a banned phrase, "distressed",
 * "troubled" or "failing", a body outside 300 to 400 words, a body that is not exactly five
 * paragraphs, a blocklisted term, a letter that never names the current employer, any invisible
 * character, and a word that mixes Latin letters with Cyrillic or Greek ones.
 *
 * Warnings: each [VERIFY] marker, which the owner resolves before export, a spaced hyphen
 * standing in for a dash, and a selection with fewer than three requirements that have evidence. With
 * fewer than three the letter keeps five paragraphs and the opener and close carry more, so the
 * thin evidence is reported and does not fail the letter.
 *
 * How the rules read the text:
 * - Every rule reads a cleaned copy: each character in NFKC form, curly quotes as straight ones,
 *   and every invisible character (category Cf, such as a soft hyphen, a zero width space or a
 *   bidi control) removed, so a term split by one still matches. Offending text is quoted from the
 *   original letter, invisible characters included.
 * - NFKC leaves look alike letters from other scripts alone, so a Cyrillic "o" inside a Latin word
 *   is caught two ways: the word fails as mixed script, and the blocklist match folds the common
 *   Cyrillic and Greek look alikes to Latin first (the table in text.js).
 * - An en dash between two digits with no space ("2021\u20132025") is a range and passes. Any
 *   other en dash is a dash and fails.
 * - Phrases and words match whole, ignoring case, after curly quotes are read as straight ones.
 *   "I'm confident that" counts as "I am confident that". Inflected forms such as "aligned with"
 *   are not in the list and are not caught.
 * - "leveraged", "leverages" and "leveraging" are always verbs. A bare "leverage" is a noun only
 *   when the word before it is one a noun takes ("the", "a", "of", "more", "real", "have" and the
 *   like, listed in NOUN_BEFORE), and a verb everywhere else, so an unknown case fails.
 * - "distressed", "troubled" and "failing" fail wherever they appear. Telling whether they refer to
 *   a client needs a model, and a false alarm costs a regeneration, not a leak.
 * - A first block that is one short greeting line ("Dear Hiring Team,") and a last block that is a
 *   sign off ("Sincerely,", a name) are left out of the word and paragraph counts.
 * - The blocklist uses the leak scan's whole word rule. A hit reports the letter's own text.
 * - The greeting and sign off are set aside by `letterBody`, whose rule waits on a decision.
 */

import { parseBlocklist } from "./blocklist.js";
import { finish, issue } from "./result.js";
import {
  around,
  aroundOriginal,
  cleanText,
  countWords,
  foldLookAlikes,
  mixedScriptWords,
  paragraphs,
  sliceOriginal,
  termMatcher
} from "./text.js";

export const WORD_RANGE = [300, 400];
export const PARAGRAPHS = 5;
export const MIN_EVIDENCED_REQUIREMENTS = 3;

export const BANNED_PHRASES = [
  "aligns with",
  "is compelling",
  "resonates with",
  "passionate about",
  "proven track record",
  "demonstrates my commitment to",
  "I am confident that",
  "I'm confident that",
  "I would welcome the opportunity"
];

export const BANNED_WORDS = ["distressed", "troubled", "failing"];

export const NOUN_BEFORE = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "any",
  "some",
  "no",
  "more",
  "most",
  "much",
  "less",
  "little",
  "real",
  "enough",
  "financial",
  "negotiating",
  "bargaining",
  "of",
  "with",
  "without",
  "for",
  "as",
  "my",
  "our",
  "your",
  "their",
  "its",
  "his",
  "her",
  "have",
  "has",
  "had",
  "gain",
  "gains",
  "gained",
  "give",
  "gives",
  "gave"
]);

const GREETING = /^(dear|hello|hi|to)\b[^\n]*[,:]$/i;
const SIGN_OFF =
  /^(sincerely|best|best regards|kind regards|warm regards|regards|respectfully|thank you|thanks|cheers|yours truly|yours sincerely|with thanks)\s*,/i;

function every(pattern, text) {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))];
}

/** The letter's body blocks, with a greeting line and a sign off block set aside. */
export function letterBody(text) {
  const blocks = paragraphs(text);
  let start = 0;
  let end = blocks.length;
  if (
    end > 0 &&
    !blocks[0].includes("\n") &&
    countWords(blocks[0]) <= 6 &&
    GREETING.test(blocks[0])
  )
    start = 1;
  if (
    end > start &&
    SIGN_OFF.test(blocks[end - 1]) &&
    countWords(blocks[end - 1]) <= 8
  )
    end -= 1;
  return blocks.slice(start, end);
}

function checkPunctuation(text, errors, warnings, show) {
  every(/[\u2014\u2015]/u, text).forEach((match) =>
    errors.push(
      issue(
        "letter.em_dash",
        "The letter uses an em dash",
        show(match.index, 1)
      )
    )
  );
  every(/\u2013/u, text).forEach((match) => {
    const range =
      /\d/.test(text[match.index - 1] || "") &&
      /\d/.test(text[match.index + 1] || "");
    if (!range)
      errors.push(
        issue(
          "letter.en_dash",
          "The letter uses an en dash as a dash",
          show(match.index, 1)
        )
      );
  });
  every(/[;\u037e\uff1b]/u, text).forEach((match) =>
    errors.push(
      issue(
        "letter.semicolon",
        "The letter uses a semicolon",
        show(match.index, 1)
      )
    )
  );
  every(/\s(?:-|--)\s/u, text).forEach((match) =>
    warnings.push(
      issue(
        "letter.spaced_hyphen",
        "A spaced hyphen stands in for a dash",
        show(match.index, match[0].length)
      )
    )
  );
}

function checkPhrases(text, errors, show) {
  BANNED_PHRASES.forEach((phrase) => {
    every(termMatcher(phrase), text).forEach((match) =>
      errors.push(
        issue(
          "letter.banned_phrase",
          `The letter uses the banned phrase "${phrase}"`,
          show(match.index, match[0].length)
        )
      )
    );
  });
  every(
    /(?<![\p{L}\p{N}])leverag(?:ed|es|ing)(?![\p{L}\p{N}])/iu,
    text
  ).forEach((match) =>
    errors.push(
      issue(
        "letter.banned_phrase",
        'The letter uses "leverage" as a verb',
        show(match.index, match[0].length)
      )
    )
  );
  every(/(?<![\p{L}\p{N}])leverage(?![\p{L}\p{N}])/iu, text).forEach(
    (match) => {
      const before = text.slice(0, match.index).match(/([\p{L}]+)\s+$/u);
      const previous = before ? before[1].toLowerCase() : "";
      if (!NOUN_BEFORE.has(previous)) {
        errors.push(
          issue(
            "letter.banned_phrase",
            'The letter uses "leverage" as a verb',
            show(match.index, match[0].length)
          )
        );
      }
    }
  );
  BANNED_WORDS.forEach((word) => {
    every(termMatcher(word), text).forEach((match) =>
      errors.push(
        issue(
          "letter.banned_word",
          `The letter uses "${word}"`,
          show(match.index, match[0].length)
        )
      )
    );
  });
}

function blocklistTerms(blocklist, errors) {
  let parsed;
  if (Array.isArray(blocklist)) parsed = parseBlocklist(blocklist.join("\n"));
  else if (blocklist && Array.isArray(blocklist.terms))
    parsed = parseBlocklist(blocklist.terms.join("\n"));
  else parsed = parseBlocklist(blocklist);
  parsed.errors.forEach((entry) => errors.push(entry));
  return parsed.terms;
}

function evidencedRequirements(selection) {
  const requirements =
    selection && Array.isArray(selection.top_requirements)
      ? selection.top_requirements
      : [];
  return requirements.filter(
    (entry) =>
      entry &&
      entry.match !== "gap" &&
      Array.isArray(entry.evidence_ids) &&
      entry.evidence_ids.length > 0
  );
}

export function validateLetter(
  text,
  { selection, snapshot, blocklist, employer } = {}
) {
  const errors = [];
  const warnings = [];
  if (typeof text !== "string" || !text.trim()) {
    errors.push(issue("letter.empty", "The letter is empty", ""));
    return finish(errors, warnings, {
      wordCount: 0,
      paragraphCount: 0,
      verifyItems: []
    });
  }
  const clean = cleanText(text);
  const letter = clean.text;
  const show = (index, length) => aroundOriginal(clean, index, length);

  clean.invisible.forEach((entry) =>
    errors.push(
      issue(
        "letter.invisible",
        `The letter holds an invisible character, ${entry.codePoint}`,
        around(clean.source, entry.index, 1)
      )
    )
  );
  mixedScriptWords(letter).forEach((entry) =>
    errors.push(
      issue(
        "letter.mixed_script",
        "A word mixes Latin letters with Cyrillic or Greek ones",
        sliceOriginal(clean, entry.index, entry.word.length)
      )
    )
  );

  checkPunctuation(letter, errors, warnings, show);
  checkPhrases(letter, errors, show);

  const body = letterBody(letter);
  const wordCount = body.reduce((sum, block) => sum + countWords(block), 0);
  if (wordCount < WORD_RANGE[0] || wordCount > WORD_RANGE[1]) {
    errors.push(
      issue(
        "letter.word_count",
        `The letter must run ${WORD_RANGE[0]} to ${WORD_RANGE[1]} words`,
        `${wordCount} words`
      )
    );
  }
  if (body.length !== PARAGRAPHS) {
    errors.push(
      issue(
        "letter.paragraph_count",
        `The letter must have exactly ${PARAGRAPHS} paragraphs`,
        `${body.length} paragraphs`
      )
    );
  }

  const folded = foldLookAlikes(letter);
  blocklistTerms(blocklist, errors).forEach((term) => {
    every(termMatcher(foldLookAlikes(term)), folded).forEach((match) =>
      errors.push(
        issue(
          "letter.blocklisted",
          "The letter names a blocklisted term",
          sliceOriginal(clean, match.index, match[0].length)
        )
      )
    );
  });

  const current =
    employer || (snapshot && snapshot.owner && snapshot.owner.currentEmployer);
  if (!current || !String(current).trim()) {
    errors.push(
      issue(
        "letter.employer_unknown",
        "No current employer was given to check the letter against",
        ""
      )
    );
  } else if (!termMatcher(cleanText(current).text).test(letter)) {
    errors.push(
      issue(
        "letter.employer_missing",
        "The letter does not name the current employer",
        String(current)
      )
    );
  }

  const verifyItems = every(/\[VERIFY\b[^\]\n]*\]?/iu, letter).map(
    (match) => match[0]
  );
  verifyItems.forEach((marker) =>
    warnings.push(
      issue("letter.verify", "A [VERIFY] item needs the owner's check", marker)
    )
  );

  if (!selection || !Array.isArray(selection.top_requirements)) {
    errors.push(
      issue(
        "letter.selection_missing",
        "No selection was given, so the evidence cannot be counted",
        ""
      )
    );
  } else {
    const evidenced = evidencedRequirements(selection);
    if (evidenced.length < MIN_EVIDENCED_REQUIREMENTS) {
      warnings.push(
        issue(
          "letter.thin_evidence",
          `Fewer than ${MIN_EVIDENCED_REQUIREMENTS} requirements have evidence, so the opener and close carry more`,
          `${evidenced.length} with evidence`
        )
      );
    }
  }

  return finish(errors, warnings, {
    wordCount,
    paragraphCount: body.length,
    verifyItems
  });
}

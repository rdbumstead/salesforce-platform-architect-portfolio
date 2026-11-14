/**
 * Text helpers shared by the tailoring validators. Pure code, no dependency and no I/O.
 */

/**
 * A whole word matcher for one term, the same rule as the public build's leak scan: no letter or
 * digit may touch either end, matching ignores case, and a space in a term matches any run of
 * whitespace. So "abc" matches "ABC", "(abc)" and "abc.org" but not "abcde" or "xabc".
 */
export function termMatcher(term, flags = "iu") {
  const escaped = String(term)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags);
}

/** The text around a match, so a failure shows where the offending text sits. */
export function around(text, index, length, reach = 30) {
  const start = Math.max(0, index - reach);
  const end = Math.min(text.length, index + length + reach);
  return `${start > 0 ? "..." : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "..." : ""}`;
}

/** Curly apostrophes and quotes read as straight ones, so a phrase check is not dodged by a glyph. */
export function normalise(text) {
  return String(text || "")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00a0/g, " ");
}

/** A word is a run of non space characters holding at least one letter or digit. */
export function countWords(text) {
  return String(text || "")
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** Paragraphs are blocks separated by one or more blank lines. */
export function paragraphs(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

export const SPELLED = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20
};

const DIGITS =
  /(?<![\p{L}\p{N}.,])([~$]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?([%+]|[kK](?![\p{L}\p{N}])|[xX](?![\p{L}\p{N}]))?(?![\p{L}\p{N}])/gu;
const WORDS = new RegExp(
  `(?<![\\p{L}\\p{N}])(${Object.keys(SPELLED).join("|")})(?![\\p{L}\\p{N}])`,
  "giu"
);

/** "one" in these places is an ordinary word, not a count: "one of", "no one", "this one". */
const ONE_BEFORE = new Set([
  "no",
  "the",
  "this",
  "that",
  "which",
  "each",
  "every",
  "any",
  "someone",
  "anyone"
]);
const ONE_AFTER = new Set(["of", "another"]);

function neighbours(text, start, end) {
  const before = text.slice(0, start).match(/([\p{L}]+)\s*$/u);
  const after = text.slice(end).match(/^\s*([\p{L}]+)/u);
  return [
    before ? before[1].toLowerCase() : "",
    after ? after[1].toLowerCase() : ""
  ];
}

/**
 * Every number in a text: digits with an optional thousands comma, decimal, "~" or "$" in front
 * and "%", "+", "k" or "x" after, so "400+", "10,000+", "~90%" and "10k" all count, plus the
 * spelled out numbers zero to twenty. Digits joined to letters ("S3", "B2B") are names, not
 * numbers. An ISO date ("2026-04") gives its year only. Each entry has the text as written and
 * its value, "10k" and "10,000" both 10000.
 */
export function findNumbers(text) {
  // An ISO date counts as its year only, so "2026-04" does not ground a "4" in a letter.
  const source = String(text || "").replace(
    /(?<=(?<![\p{L}\p{N}])\d{4})-\d{2}(?:-\d{2})?(?![\p{L}\p{N}])/gu,
    (part) => " ".repeat(part.length)
  );
  const found = [];
  for (const match of source.matchAll(DIGITS)) {
    const [, , whole, fraction = "", suffix = ""] = match;
    let value = Number(whole.replace(/,/g, "") + fraction);
    if (/^k$/i.test(suffix)) value *= 1000;
    found.push({ text: match[0], value, index: match.index });
  }
  for (const match of source.matchAll(WORDS)) {
    const word = match[1].toLowerCase();
    if (word === "one") {
      const [before, after] = neighbours(
        source,
        match.index,
        match.index + match[0].length
      );
      if (ONE_BEFORE.has(before) || ONE_AFTER.has(after)) continue;
    }
    found.push({ text: match[0], value: SPELLED[word], index: match.index });
  }
  return found.sort((a, b) => a.index - b.index);
}

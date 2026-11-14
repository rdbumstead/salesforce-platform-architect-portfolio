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

/**
 * Characters a reader cannot see: every format character (Unicode category Cf, which holds the
 * soft hyphen, the zero width space, joiner and non joiner, the word joiner, the byte order mark
 * and the bidi controls) plus the combining grapheme joiner and the Hangul filler letters.
 */
const INVISIBLE = /[\p{Cf}\u034f\u115f\u1160\u3164\uffa0]/u;

/**
 * A copy of the text for the rules to read: each character in Unicode NFKC form (so a full width
 * letter or semicolon reads as the plain one), curly quotes read as straight ones, and every
 * invisible character removed, so a term split by one still matches. `map[i]` is the index in the
 * original of the copy's character i, so a failure can quote the original text. `invisible`
 * lists each removed character as { codePoint: "U+00AD", index }.
 */
export function cleanText(text) {
  const source = String(text === undefined || text === null ? "" : text);
  let out = "";
  const map = [];
  const invisible = [];
  let index = 0;
  for (const character of source) {
    if (INVISIBLE.test(character)) {
      const code = character.codePointAt(0).toString(16).toUpperCase();
      invisible.push({ codePoint: `U+${code.padStart(4, "0")}`, index });
    } else {
      const plain = normalise(character.normalize("NFKC"));
      for (let unit = 0; unit < plain.length; unit += 1) map.push(index);
      out += plain;
    }
    index += character.length;
  }
  map.push(source.length);
  return { source, text: out, map, invisible };
}

/** The original text behind a span of the cleaned copy. */
export function originalSpan(clean, index, length) {
  const start = clean.map[index] ?? clean.source.length;
  const end = clean.map[index + length] ?? clean.source.length;
  return { start, length: Math.max(end - start, 1) };
}

/** The original text around a span of the cleaned copy, for a failure's offending text. */
export function aroundOriginal(clean, index, length) {
  const span = originalSpan(clean, index, length);
  return around(clean.source, span.start, span.length);
}

/** The original text of a span of the cleaned copy, invisible characters included. */
export function sliceOriginal(clean, index, length) {
  const span = originalSpan(clean, index, length);
  return clean.source.slice(span.start, span.start + span.length);
}

/**
 * Cyrillic and Greek letters that look like Latin ones, folded to the Latin letter. Used only to
 * match the blocklist. The table is small on purpose: the common look alikes in the two scripts a
 * keyboard reaches most easily. It does not cover Armenian, Cherokee, mathematical letters that
 * NFKC leaves alone, or letters that look alike only in some fonts. Every entry is one UTF-16 unit
 * to one, so the cleaned copy's index map still holds.
 */
const LOOK_ALIKES = {
  // Cyrillic small: a e o p c y x i j s d l h q w
  0x0430: "a",
  0x0435: "e",
  0x043e: "o",
  0x0440: "p",
  0x0441: "c",
  0x0443: "y",
  0x0445: "x",
  0x0456: "i",
  0x0458: "j",
  0x0455: "s",
  0x0501: "d",
  0x04cf: "l",
  0x04bb: "h",
  0x051b: "q",
  0x051d: "w",
  // Cyrillic capital: A B E K M H O P C T X Y I J S
  0x0410: "A",
  0x0412: "B",
  0x0415: "E",
  0x041a: "K",
  0x041c: "M",
  0x041d: "H",
  0x041e: "O",
  0x0420: "P",
  0x0421: "C",
  0x0422: "T",
  0x0425: "X",
  0x04ae: "Y",
  0x0406: "I",
  0x0408: "J",
  0x0405: "S",
  // Greek small: a o i k v p u x
  0x03b1: "a",
  0x03bf: "o",
  0x03b9: "i",
  0x03ba: "k",
  0x03bd: "v",
  0x03c1: "p",
  0x03c5: "u",
  0x03c7: "x",
  // Greek capital: A B E Z H I K M N O P T Y X
  0x0391: "A",
  0x0392: "B",
  0x0395: "E",
  0x0396: "Z",
  0x0397: "H",
  0x0399: "I",
  0x039a: "K",
  0x039c: "M",
  0x039d: "N",
  0x039f: "O",
  0x03a1: "P",
  0x03a4: "T",
  0x03a5: "Y",
  0x03a7: "X"
};

export function foldLookAlikes(text) {
  let out = "";
  for (const character of String(text || "")) {
    out += LOOK_ALIKES[character.codePointAt(0)] || character;
  }
  return out;
}

/** Words that mix Latin letters with Cyrillic or Greek ones, which a sound English text never holds. */
export function mixedScriptWords(text) {
  const found = [];
  for (const match of String(text || "").matchAll(/[\p{L}\p{M}]+/gu)) {
    const word = match[0];
    if (
      /\p{Script=Latin}/u.test(word) &&
      /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(word)
    ) {
      found.push({ word, index: match.index });
    }
  }
  return found;
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
 * spelled out numbers zero to twenty. Digits joined to letters ("B2B", "Web3") are names, not
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

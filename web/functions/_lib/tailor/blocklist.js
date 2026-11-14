/**
 * Reads the client blocklist from the SITE_DENYLIST secret, the same list the public build's leak
 * scan uses: comma or newline separated, each term cleaned as the letter is (NFKC, invisible
 * characters removed) and trimmed, empty terms dropped. Terms shorter
 * than three characters are dropped as the leak scan drops them, since a one or two letter term
 * would match inside ordinary text, and a warning says how many went.
 *
 * An empty list is an error result, never a silent pass, because a letter checked against no
 * terms proves nothing. The result never repeats a term in a message, since the terms are private.
 */

import { finish, issue } from "./result.js";
import { cleanText } from "./text.js";

export const MIN_TERM_LENGTH = 3;

export function parseBlocklist(raw) {
  const errors = [];
  const warnings = [];
  const listed = String(raw === undefined || raw === null ? "" : raw)
    .split(/[\n,]/)
    .map((term) => cleanText(term).text.trim())
    .filter(Boolean);
  const terms = [
    ...new Set(listed.filter((term) => term.length >= MIN_TERM_LENGTH))
  ];
  const short = listed.filter((term) => term.length < MIN_TERM_LENGTH).length;
  if (short) {
    warnings.push(
      issue(
        "blocklist.short_term",
        `Terms shorter than ${MIN_TERM_LENGTH} characters are not checked`,
        `${short} dropped`
      )
    );
  }
  if (!terms.length) {
    errors.push(
      issue(
        "blocklist.empty",
        "SITE_DENYLIST holds no terms, so no output can be checked for client names",
        ""
      )
    );
  }
  return finish(errors, warnings, { terms });
}

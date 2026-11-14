/**
 * The result every tailoring validator returns: { ok, errors, warnings }, where each entry is
 * { code, message, offending }. An error fails the check. A warning is shown to the owner and
 * never fails it on its own. Pure code, no dependency and no I/O, so it runs in a Pages Function.
 */

export function issue(code, message, offending = "") {
  return { code, message, offending: String(offending) };
}

export function finish(errors, warnings, extra = {}) {
  return { ok: errors.length === 0, errors, warnings, ...extra };
}

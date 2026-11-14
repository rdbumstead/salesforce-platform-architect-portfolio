/**
 * Reads the resume snapshot the way every tailoring check must. Pure code, no dependency and no I/O.
 */

import { issue } from "./result.js";

/**
 * The current role: the one role marked current whose employer equals owner.currentEmployer
 * (compared after trimming, case kept). A person can hold more than one current role, such as a
 * main job and an ongoing freelance one, and only the role at the current employer is "the current
 * role" the resume rules mean. Every other role, current or not, is an older role for those rules.
 *
 * Returns { role, error }. The error, when there is one, is an issue: no currentEmployer, no
 * current role at it, or more than one, since in each case "the current role" has no meaning.
 */
export function currentRole(snapshot) {
  const employer =
    snapshot &&
    snapshot.owner &&
    typeof snapshot.owner.currentEmployer === "string"
      ? snapshot.owner.currentEmployer.trim()
      : "";
  if (!employer) {
    return {
      role: null,
      error: issue(
        "selection.no_current_employer",
        "The snapshot names no owner.currentEmployer, so it has no current role",
        ""
      )
    };
  }
  const roles = Array.isArray(snapshot.roles) ? snapshot.roles : [];
  const matches = roles.filter(
    (role) =>
      role &&
      role.current === true &&
      typeof role.employer === "string" &&
      role.employer.trim() === employer
  );
  if (matches.length === 0) {
    return {
      role: null,
      error: issue(
        "selection.no_current_role",
        "No role marked current is at owner.currentEmployer",
        employer
      )
    };
  }
  if (matches.length > 1) {
    return {
      role: null,
      error: issue(
        "selection.many_current_roles",
        "More than one role marked current is at owner.currentEmployer",
        matches.map((role) => role.id).join(", ")
      )
    };
  }
  return { role: matches[0], error: null };
}

/**
 * The one rule for "the current role": the role marked current whose employer is the
 * snapshot owner's current employer. The snapshot builder refuses a snapshot where this rule
 * finds anything other than exactly one role, so every reader can rely on it.
 */
export function currentRoles(snapshot) {
  return snapshot.roles.filter((role) => role.current === true && role.employer === snapshot.owner.currentEmployer);
}

/** The current role, or null when the rule does not find exactly one. */
export function currentRole(snapshot) {
  const roles = currentRoles(snapshot);
  return roles.length === 1 ? roles[0] : null;
}

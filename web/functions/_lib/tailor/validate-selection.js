/**
 * Checks the selector's output against the resume snapshot before anything is rendered.
 *
 * The output is the selector JSON (a string straight from the model, or the parsed object). One
 * code fence around the whole string is removed with a warning, since models add one often and
 * refusing it would spend the one retry on nothing. It
 * must hold exactly the fields of the selector schema, each with its type. Every id must exist in
 * the snapshot and sit in the right slot: a headline id in headline_id, a summary id in
 * summary_id, bullets under the role they belong to, skills in skill_ids and projects in
 * project_ids. The current role carries 4 to 6 bullets, every older role 0 to 3, and projects
 * number 0 to 3.
 *
 * Visitor mode accepts only public, verified items, and refuses the selection otherwise. It then
 * strips what a visitor never sees: partial matches, gaps, hard filter flags and missing evidence
 * suggestions. They are stripped rather than refused because both modes share one selector
 * prompt, so a sound selection for a real posting carries them, and refusing would fail every
 * retry the same way. The cleaned copy comes back as `selection`.
 *
 * Owner mode accepts public and private items. An unverified item is a warning, and any warning
 * of that kind sets `blocksExport: true`, because nothing unverified leaves the review screen.
 */

import { finish, issue } from "./result.js";

export const MODES = ["visitor", "owner"];
export const TITLE_FAMILIES = ["engineer", "architect", "consultant", "admin"];
export const MATCHES = ["strong", "partial", "gap"];

export const LIMITS = {
  currentRoleBullets: [4, 6],
  olderRoleBullets: [0, 3],
  projects: [0, 3],
  requirements: [3, 5]
};

const TOP_FIELDS = {
  title_family: "string",
  top_requirements: "array",
  headline_id: "string",
  summary_id: "string",
  roles: "array",
  skill_ids: "array",
  project_ids: "array",
  hard_filter_flags: "array",
  missing_evidence_suggestions: "array"
};

const REQUIREMENT_FIELDS = {
  requirement: "string",
  match: "string",
  evidence_ids: "array",
  note: "string"
};

const ROLE_FIELDS = {
  role_id: "string",
  include: "boolean",
  bullet_ids: "array"
};

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

/** Exact fields with exact types. Returns false when the object cannot be read further. */
function checkFields(value, fields, where, errors) {
  if (typeOf(value) !== "object") {
    errors.push(
      issue(
        "selection.schema",
        `${where} must be an object`,
        JSON.stringify(value)
      )
    );
    return false;
  }
  let sound = true;
  for (const [name, type] of Object.entries(fields)) {
    if (!(name in value)) {
      errors.push(
        issue("selection.schema", `${where} is missing ${name}`, name)
      );
      sound = false;
    } else if (typeOf(value[name]) !== type) {
      errors.push(
        issue(
          "selection.schema",
          `${where}.${name} must be ${type}, not ${typeOf(value[name])}`,
          JSON.stringify(value[name])
        )
      );
      sound = false;
    }
  }
  for (const name of Object.keys(value)) {
    if (!(name in fields))
      errors.push(
        issue(
          "selection.schema",
          `${where} has a field the schema does not define`,
          name
        )
      );
  }
  return sound;
}

function checkStrings(list, where, errors) {
  list.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      errors.push(
        issue(
          "selection.schema",
          `${where}[${index}] must be a non empty string`,
          JSON.stringify(entry)
        )
      );
    }
  });
}

/**
 * One code fence around the whole output, with only whitespace outside it. The info string may be
 * "json" or empty. Text before or after the fence, or a second fence, is not accepted.
 */
const FENCE = /^```(?:json)?[ \t]*\r?\n?([\s\S]*?)\r?\n?```$/i;

function parse(output, errors, warnings) {
  if (typeof output !== "string") return output;
  let text = output;
  const fenced = output.trim().match(FENCE);
  if (fenced && !fenced[1].includes("```")) {
    text = fenced[1];
    warnings.push(
      issue(
        "selection.fenced",
        "The selector wrapped its JSON in a code fence, which was removed",
        output.trim().split(/\r?\n/)[0]
      )
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(
      issue(
        "selection.json",
        "The selector output is not valid JSON",
        output.slice(0, 200)
      )
    );
    return undefined;
  }
}

function indexSnapshot(snapshot, errors) {
  if (
    !snapshot ||
    !Array.isArray(snapshot.items) ||
    !Array.isArray(snapshot.roles)
  ) {
    errors.push(
      issue(
        "selection.snapshot",
        "The snapshot has no items or roles to check against",
        ""
      )
    );
    return null;
  }
  return {
    items: new Map(snapshot.items.map((item) => [item.id, item])),
    roles: new Map(snapshot.roles.map((role) => [role.id, role]))
  };
}

function inRange(count, [low, high]) {
  return count >= low && count <= high;
}

/** One selected id: it exists, it has the slot's type and, for a bullet, the slot's role. */
function checkId(id, expectedType, where, index, errors, roleId) {
  const item = index.items.get(id);
  if (!item) {
    errors.push(
      issue(
        "selection.unknown_id",
        `${where} names an id the snapshot does not hold`,
        id
      )
    );
    return null;
  }
  if (expectedType && item.type !== expectedType) {
    errors.push(
      issue(
        "selection.wrong_type",
        `${where} holds a ${item.type}, not a ${expectedType}`,
        id
      )
    );
    return null;
  }
  if (roleId !== undefined && item.roleId !== roleId) {
    errors.push(
      issue(
        "selection.wrong_role",
        `${where} holds a bullet of role ${item.roleId}, not ${roleId}`,
        id
      )
    );
    return null;
  }
  return item;
}

function checkRequirements(requirements, index, errors) {
  const [low, high] = LIMITS.requirements;
  if (!inRange(requirements.length, LIMITS.requirements)) {
    errors.push(
      issue(
        "selection.requirement_count",
        `top_requirements must hold ${low} to ${high} entries`,
        String(requirements.length)
      )
    );
  }
  requirements.forEach((entry, position) => {
    const where = `top_requirements[${position}]`;
    if (!checkFields(entry, REQUIREMENT_FIELDS, where, errors)) return;
    checkStrings(entry.evidence_ids, `${where}.evidence_ids`, errors);
    if (!MATCHES.includes(entry.match)) {
      errors.push(
        issue(
          "selection.match",
          `${where}.match must be one of ${MATCHES.join(", ")}`,
          entry.match
        )
      );
      return;
    }
    if (entry.match === "gap" && entry.evidence_ids.length > 0) {
      errors.push(
        issue(
          "selection.gap_evidence",
          `${where} is a gap but names evidence`,
          entry.evidence_ids.join(", ")
        )
      );
    }
    if (entry.match !== "gap" && entry.evidence_ids.length === 0) {
      errors.push(
        issue(
          "selection.missing_evidence",
          `${where} is ${entry.match} but names no evidence`,
          entry.requirement
        )
      );
    }
    entry.evidence_ids.forEach((id) => {
      if (typeof id === "string")
        checkId(id, null, `${where}.evidence_ids`, index, errors);
    });
  });
}

function checkRoles(roles, index, errors, chosen) {
  const seen = new Set();
  const counts = new Map();
  roles.forEach((entry, position) => {
    const where = `roles[${position}]`;
    if (!checkFields(entry, ROLE_FIELDS, where, errors)) return;
    checkStrings(entry.bullet_ids, `${where}.bullet_ids`, errors);
    const role = index.roles.get(entry.role_id);
    if (!role) {
      errors.push(
        issue(
          "selection.unknown_role",
          `${where} names a role the snapshot does not hold`,
          entry.role_id
        )
      );
      return;
    }
    if (seen.has(entry.role_id)) {
      errors.push(
        issue(
          "selection.duplicate_role",
          `${where} lists a role a second time`,
          entry.role_id
        )
      );
      return;
    }
    seen.add(entry.role_id);
    if (!entry.include && entry.bullet_ids.length > 0) {
      errors.push(
        issue(
          "selection.omitted_role_bullets",
          `${where} omits the role but lists bullets for it`,
          entry.role_id
        )
      );
    }
    const bullets = entry.include ? entry.bullet_ids : [];
    counts.set(entry.role_id, bullets.length);
    bullets.forEach((id) => {
      if (typeof id !== "string") return;
      const item = checkId(
        id,
        "bullet",
        `${where}.bullet_ids`,
        index,
        errors,
        entry.role_id
      );
      if (item) chosen.push(item);
    });
  });
  for (const role of index.roles.values()) {
    const count = counts.get(role.id) || 0;
    const limit = role.current
      ? LIMITS.currentRoleBullets
      : LIMITS.olderRoleBullets;
    if (!inRange(count, limit)) {
      const label = role.current ? "The current role" : `Role ${role.id}`;
      errors.push(
        issue(
          "selection.bullet_count",
          `${label} must carry ${limit[0]} to ${limit[1]} bullets`,
          `${role.id}: ${count}`
        )
      );
    }
  }
}

function checkDuplicates(ids, errors) {
  const seen = new Set();
  ids.forEach((id) => {
    if (seen.has(id))
      errors.push(
        issue("selection.duplicate_id", "An id is selected more than once", id)
      );
    seen.add(id);
  });
}

/** Visitor mode keeps strong matches only and drops the owner only fields. */
function stripForVisitor(selection, warnings) {
  const kept = selection.top_requirements.filter(
    (entry) => entry.match === "strong"
  );
  const dropped = selection.top_requirements.filter(
    (entry) => entry.match !== "strong"
  );
  dropped.forEach((entry) =>
    warnings.push(
      issue(
        "selection.visitor_stripped",
        `A ${entry.match} requirement is not shown to visitors`,
        entry.requirement
      )
    )
  );
  if (selection.hard_filter_flags.length) {
    warnings.push(
      issue(
        "selection.visitor_stripped",
        "Hard filter flags are not shown to visitors",
        selection.hard_filter_flags.join("; ")
      )
    );
  }
  if (selection.missing_evidence_suggestions.length) {
    warnings.push(
      issue(
        "selection.visitor_stripped",
        "Missing evidence suggestions are not shown to visitors",
        selection.missing_evidence_suggestions.join("; ")
      )
    );
  }
  return {
    ...selection,
    top_requirements: kept,
    hard_filter_flags: [],
    missing_evidence_suggestions: []
  };
}

export function validateSelection(output, snapshot, { mode } = {}) {
  const errors = [];
  const warnings = [];
  const failed = () =>
    finish(errors, warnings, { blocksExport: true, selection: null });

  if (!MODES.includes(mode)) {
    errors.push(
      issue(
        "selection.mode",
        `mode must be one of ${MODES.join(", ")}`,
        String(mode)
      )
    );
    return failed();
  }
  const selection = parse(output, errors, warnings);
  if (selection === undefined) return failed();
  if (!checkFields(selection, TOP_FIELDS, "selection", errors)) return failed();
  const index = indexSnapshot(snapshot, errors);
  if (!index) return failed();

  if (!TITLE_FAMILIES.includes(selection.title_family)) {
    errors.push(
      issue(
        "selection.title_family",
        `title_family must be one of ${TITLE_FAMILIES.join(", ")}`,
        selection.title_family
      )
    );
  }
  [
    "skill_ids",
    "project_ids",
    "hard_filter_flags",
    "missing_evidence_suggestions"
  ].forEach((field) => checkStrings(selection[field], field, errors));

  const chosen = [];
  const headline = checkId(
    selection.headline_id,
    "headline",
    "headline_id",
    index,
    errors
  );
  if (headline) chosen.push(headline);
  const summary = checkId(
    selection.summary_id,
    "summary",
    "summary_id",
    index,
    errors
  );
  if (summary) chosen.push(summary);
  checkRoles(selection.roles, index, errors, chosen);
  selection.skill_ids.forEach((id) => {
    const item =
      typeof id === "string" &&
      checkId(id, "skill", "skill_ids", index, errors);
    if (item) chosen.push(item);
  });
  if (!inRange(selection.project_ids.length, LIMITS.projects)) {
    errors.push(
      issue(
        "selection.project_count",
        `project_ids must hold ${LIMITS.projects[0]} to ${LIMITS.projects[1]} ids`,
        String(selection.project_ids.length)
      )
    );
  }
  selection.project_ids.forEach((id) => {
    const item =
      typeof id === "string" &&
      checkId(id, "project", "project_ids", index, errors);
    if (item) chosen.push(item);
  });
  checkRequirements(selection.top_requirements, index, errors);
  checkDuplicates(
    [
      selection.headline_id,
      selection.summary_id,
      ...selection.roles.flatMap((role) =>
        role && Array.isArray(role.bullet_ids) ? role.bullet_ids : []
      ),
      ...selection.skill_ids,
      ...selection.project_ids
    ],
    errors
  );

  const chosenIds = new Set(chosen.map((item) => item.id));
  selection.top_requirements.forEach((entry) => {
    if (!entry || !Array.isArray(entry.evidence_ids)) return;
    entry.evidence_ids.forEach((id) => {
      if (index.items.has(id) && !chosenIds.has(id)) {
        warnings.push(
          issue(
            "selection.evidence_not_selected",
            "Evidence names an item that is not on the resume",
            id
          )
        );
      }
    });
  });

  const evidence = selection.top_requirements.flatMap((entry) =>
    entry && Array.isArray(entry.evidence_ids)
      ? entry.evidence_ids.map((id) => index.items.get(id)).filter(Boolean)
      : []
  );
  const everything = [
    ...new Map([...chosen, ...evidence].map((item) => [item.id, item])).values()
  ];
  let unverified = false;
  everything.forEach((item) => {
    if (mode === "visitor") {
      if (item.visibility !== "public") {
        errors.push(
          issue(
            "selection.visitor_private",
            "Visitor mode selected an item that is not public",
            item.id
          )
        );
      }
      if (item.verified !== true) {
        errors.push(
          issue(
            "selection.visitor_unverified",
            "Visitor mode selected an unverified item",
            item.id
          )
        );
      }
    } else {
      if (!["public", "private"].includes(item.visibility)) {
        errors.push(
          issue(
            "selection.visibility",
            "An item has a visibility other than public or private",
            item.id
          )
        );
      }
      if (item.verified !== true) {
        unverified = true;
        warnings.push(
          issue(
            "selection.unverified",
            "An unverified item is selected, so final export is blocked",
            item.id
          )
        );
      }
    }
  });

  if (errors.length) return failed();
  const cleaned =
    mode === "visitor" ? stripForVisitor(selection, warnings) : selection;
  return finish(errors, warnings, {
    blocksExport: unverified,
    selection: cleaned
  });
}

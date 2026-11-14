/**
 * Checks a tailored resume. The text is the resume's plain text, the same text the ATS copy gives.
 *
 * Errors: an em dash or a semicolon in the text, a selected id the snapshot does not hold, and a
 * number in the selected summary that no selected bullet states. Numbers are found and compared
 * the way the grounding check finds them, so "two" in the summary is backed by "2" in a bullet.
 *
 * An unverified selected item is a warning and sets `blocksExport: true`, because final export
 * waits until the owner flips the flag. The review screen still shows the resume.
 */

import { finish, issue } from "./result.js";
import { around, findNumbers, normalise } from "./text.js";

function selectedIds(selection) {
  const roles = Array.isArray(selection.roles)
    ? selection.roles.filter((entry) => entry && entry.include)
    : [];
  return {
    bullets: roles.flatMap((entry) =>
      Array.isArray(entry.bullet_ids) ? entry.bullet_ids : []
    ),
    all: [
      selection.headline_id,
      selection.summary_id,
      ...roles.flatMap((entry) =>
        Array.isArray(entry.bullet_ids) ? entry.bullet_ids : []
      ),
      ...(Array.isArray(selection.skill_ids) ? selection.skill_ids : []),
      ...(Array.isArray(selection.project_ids) ? selection.project_ids : [])
    ]
  };
}

export function validateResume(text, { selection, snapshot } = {}) {
  const errors = [];
  const warnings = [];
  if (typeof text !== "string" || !text.trim()) {
    errors.push(issue("resume.empty", "The resume text is empty", ""));
    return finish(errors, warnings, { blocksExport: true });
  }
  if (!selection || !snapshot || !Array.isArray(snapshot.items)) {
    errors.push(
      issue(
        "resume.selection_missing",
        "A selection and a snapshot are needed to check the resume",
        ""
      )
    );
    return finish(errors, warnings, { blocksExport: true });
  }
  const resume = normalise(text);
  for (const match of resume.matchAll(/[\u2014\u2015]/gu)) {
    errors.push(
      issue(
        "resume.em_dash",
        "The resume uses an em dash",
        around(resume, match.index, 1)
      )
    );
  }
  for (const match of resume.matchAll(/[;\u037e\uff1b]/gu)) {
    errors.push(
      issue(
        "resume.semicolon",
        "The resume uses a semicolon",
        around(resume, match.index, 1)
      )
    );
  }

  const items = new Map(snapshot.items.map((item) => [item.id, item]));
  const ids = selectedIds(selection);
  let unverified = false;
  [...new Set(ids.all)].forEach((id) => {
    const item = items.get(id);
    if (!item) {
      errors.push(
        issue(
          "resume.unknown_id",
          "The selection names an id the snapshot does not hold",
          String(id)
        )
      );
    } else if (item.verified !== true) {
      unverified = true;
      warnings.push(
        issue(
          "resume.unverified",
          "An unverified item is selected, so final export is blocked",
          id
        )
      );
    }
  });

  const summary = items.get(selection.summary_id);
  if (summary) {
    const bulletText = normalise(
      ids.bullets.map((id) => (items.get(id) || {}).text || "").join("\n")
    );
    const backed = new Set(findNumbers(bulletText).map((entry) => entry.value));
    const summaryText = normalise(summary.text);
    findNumbers(summaryText).forEach((entry) => {
      if (!backed.has(entry.value)) {
        errors.push(
          issue(
            "resume.summary_number",
            `The summary states "${entry.text}" and no selected bullet does`,
            around(summaryText, entry.index, entry.text.length)
          )
        );
      }
    });
  }

  return finish(errors, warnings, {
    blocksExport: unverified || errors.length > 0
  });
}

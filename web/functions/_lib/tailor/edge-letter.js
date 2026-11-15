/**
 * The cover letter the site writes at the edge when the org cannot be asked (owner decision
 * P-D64): the org refused a call for its daily API cap, or the visitor ceiling in budget.js
 * stopped it. It is the template letter from template.js, built from a rule built selection
 * (select.js) over the visitor view of the resume snapshot, and checked by the same validators
 * a model letter meets (validateLetter with the blocklist, and checkGrounding). No model, no network and no org call.
 *
 * Visitor mode is applied first: viewForMode keeps public and verified items only, and every
 * later step reads that view and nothing else, so an unverified item cannot reach the letter.
 *
 * It returns the response the cover letter component reads (content, provider, model,
 * fallbackOccurred, latencyMs, generationMs, attempts, promptShown, requestId), or null when
 * there is no snapshot, the selection or the letter fails a check, or SITE_DENYLIST holds no
 * terms. The caller then falls back to the recorded sample letter.
 */

import CATEGORY_FILE from "../../../tailor-eval/categories.json" with { type: "json" };
import {
  checkGrounding,
  groundingAllowList,
  selectedEvidenceTexts
} from "./grounding.js";
import { buildRuleSelection, viewForMode } from "./select.js";
import {
  buildTemplateLetter,
  MAX_JOB_TEXT_CHARS,
  templateSelection
} from "./template.js";
import { validateLetter } from "./validate-letter.js";

/** The provider name the component treats as the template letter (LOCAL_PROVIDER there). */
export const LOCAL_PROVIDER = "Local";
export const ORG_PROVIDER = "Salesforce";
export const MODE = "visitor";
export const CATEGORIES = CATEGORY_FILE.categories;

/** Why the org was not asked, in the words the attempts list shows. */
export const REASONS = {
  refused:
    "Salesforce refused the call because the site's daily API allowance is spent",
  ceiling: "The site has used most of its Salesforce API allowance for today",
  visitors: "Visitors have used today's share of the Salesforce API allowance"
};

function text(value, most) {
  return typeof value === "string" ? value.slice(0, most) : "";
}

/**
 * @param {object} input fields (companyName, jobTitle, jobDescription as the function's build
 *   gave them), snapshot (the full resume snapshot, or null), env, reason (refused, ceiling or
 *   visitors), requestId, now
 */
export function edgeTemplateLetter({
  fields = {},
  snapshot,
  env = {},
  reason = "refused",
  requestId,
  now = () => Date.now()
}) {
  const started = now();
  if (!snapshot || !Array.isArray(snapshot.items) || !snapshot.owner)
    return null;
  const posting = {
    company: text(fields.companyName, 200),
    title: text(fields.jobTitle, 200),
    text: text(fields.jobDescription, MAX_JOB_TEXT_CHARS)
  };
  let view;
  try {
    view = viewForMode(snapshot, MODE);
  } catch (error) {
    return null;
  }
  const picked = templateSelection(
    buildRuleSelection({ posting, snapshot: view, categories: CATEGORIES }),
    view
  );
  // validateSelection is not run here. It checks a selection for the resume, and refuses the
  // empty headline and summary ids a view with no verified headline gives. The letter checks
  // below are the ones that guard what a visitor reads, and the view already holds only public,
  // verified items.
  const selection = picked;
  const evidenceTexts = selectedEvidenceTexts(selection, view);
  const content = buildTemplateLetter({
    posting: { company: posting.company, title: posting.title },
    view,
    selection,
    mode: MODE,
    evidenceTexts
  });
  const letterCheck = validateLetter(content, {
    selection,
    snapshot: view,
    blocklist: env.SITE_DENYLIST,
    employer: view.owner.currentEmployer,
    mode: MODE
  });
  const grounding = checkGrounding(content, evidenceTexts, {
    allow: groundingAllowList(view, {
      company: posting.company,
      title: posting.title
    })
  });
  if (!letterCheck.ok || !grounding.ok) return null;
  const ms = Math.max(0, now() - started);
  return {
    content,
    provider: LOCAL_PROVIDER,
    model: null,
    fallbackOccurred: true,
    latencyMs: ms,
    generationMs: ms,
    attempts: [
      {
        provider: ORG_PROVIDER,
        outcome: "failed",
        ms: 0,
        detail: `${REASONS[reason] || REASONS.refused}, so it was not asked`
      },
      {
        provider: LOCAL_PROVIDER,
        outcome: "served",
        ms,
        detail:
          "The template letter, written by fixed rules from public, verified portfolio records"
      }
    ],
    promptShown:
      "Not shown. The template letter is written by fixed rules, so no prompt was sent.",
    requestId: requestId || crypto.randomUUID()
  };
}

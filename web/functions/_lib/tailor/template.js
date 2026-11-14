/**
 * The template cover letter: the last step of the provider router, written by fixed rules with
 * no model. It started as a port of the Apex class LocalTemplateService and now meets the same
 * letter rules as a model letter (owner decision P-D33): exactly five paragraphs, 300 to 400
 * words, the current employer named, every number and every product or tool name grounded in
 * the selected evidence, and the shape the letter prompt asks for. Pure code with no org call, no
 * network and no I/O, so a Pages Function can import it.
 *
 * The shape: an opener, three evidence paragraphs and a close. Each evidence paragraph starts
 * from one of the three highest ranked requirements that have evidence, strong matches first.
 * With fewer than three, the other paragraphs quote other selected evidence, and the validator
 * warns about thin evidence.
 *
 * How the length is reached (owner decision P-D37): every paragraph quotes one evidence item
 * first. While the body is short, each paragraph takes a second item, first from its own
 * requirement and then from the rest of the selection, projects before bullets. Then each
 * quoted project adds its solution text. Every item appears once in a letter. Only when the
 * evidence runs out are sentences from NEUTRAL added, each at most once. Those make no claim
 * about the owner. The letter keeps the sentence that says no model wrote it (P-D38).
 *
 * Bullets are quoted as sentences. A project is quoted by its value text (owner decision P-D40):
 * "My Name project gives..." when the value starts with a verb, otherwise "On my Name project, "
 * and the value. Its solution follows as "How it works: ..." when more length is needed. Long
 * value and solution text is cut at a sentence. A project with only a name is not quoted. An
 * older project text in the "Name: description" shape still reads "On my Name project,
 * description". templateSelection tops the selection's projects up to the limit, so the letter
 * can show what the projects changed. Skills are names, so they are never quoted as sentences. They go
 * into one sentence that lists them, and only when it passes the grounding check. Every quote
 * comes from the selected items only, so every name and number in it is grounded by
 * construction. Any other sentence that could carry a name or a number, such as the start year,
 * is checked with checkGrounding first and left out when it fails.
 *
 * What the Apex reads from the org, and what this takes instead:
 *
 * - The owner's name, from ResumeController.getHeader. Here `ownerName`, or `snapshot.owner.name`.
 *   With neither, the sign off has no name. No name is invented.
 * - The year the owner started on Salesforce, from the Salesforce_Start_Year setting. Here the
 *   `startYear` input with no default, because only the owner sets it. Without it, or when the
 *   year is not in the evidence, the sentence is left out.
 * - The count of current certifications, from ResumeController.getTimeline. Here the count of
 *   certification items in the selection, stated only when the evidence carries that number.
 * - The highlights and projects, from PortfolioGroundingService. Here the selected evidence, in
 *   the selection's order.
 * - The owner's title. Here the title of the current role, stated only when the selection
 *   includes that role, so the title is in the evidence.
 *
 * The company and title come from the posting with email and phone shapes removed, as in the
 * Apex. The posting text itself never reaches the letter.
 */

import {
  checkGrounding,
  groundingAllowList,
  selectedEvidenceTexts
} from "./grounding.js";
import { countWords } from "./text.js";
import { LIMITS } from "./validate-selection.js";

export const MAX_JOB_TEXT_CHARS = 12000;
export const REMOVED = "[removed]";
export const BODY_PARAGRAPHS = 3;
export const ITEMS_PER_PARAGRAPH = 2;
export const WORDS = { least: 305, most: 400 };
/** Words kept from one evidence text, longest first. A shorter cut is used when a letter runs long. */
export const EVIDENCE_WORDS = [40, 28, 18];
export const MAX_SKILLS = 5;
export const TEMPLATE_NOTE =
  "I put this letter together from my portfolio records with a fixed template, and no model wrote it.";

/**
 * The only sentences added for length, each at most once, and only when the evidence runs out.
 * None of them claims anything about the owner's habits or skills.
 */
export const NEUTRAL = [
  "I would be glad to walk through any of these examples in more detail.",
  "I am happy to answer any questions about the work described here.",
  "Please let me know if a call or a written follow up would suit you better.",
  "The records behind each example are on my portfolio site if you would like to read further.",
  "I look forward to hearing from you."
];

const PHONE = /(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

/** How a quoted bullet is introduced, one set per paragraph: [first item, second item]. */
const LEADS = [
  ["The work closest to what you describe is this:", "Alongside it:"],
  ["Another part of the role I can speak to directly:", "Related to that:"],
  ["A third example from my records:", "And one more:"]
];

/**
 * An item the letter can quote as a sentence: a bullet, or a project that has value or solution
 * text, or an older project text in the "Name: description" shape. A project with only its name
 * has nothing to quote.
 */
function isQuotable(item) {
  if (!item) return false;
  if (item.type === "bullet") return true;
  if (item.type !== "project") return false;
  return Boolean(
    !isBlank(item.value) || !isBlank(item.solution) || projectParts(item.text)
  );
}

const isBlank = (value) => typeof value !== "string" || !value.trim();

function normalizeSpace(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).join(" ");
}

/** Email and phone shapes out, whitespace collapsed. Null when blank. The Apex rule. */
export function removeContactDetails(text) {
  if (isBlank(text)) return null;
  const words = normalizeSpace(text.slice(0, MAX_JOB_TEXT_CHARS))
    .split(" ")
    .map((word) => (word.includes("@") ? REMOVED : word));
  const cleaned = normalizeSpace(words.join(" ").replace(PHONE, REMOVED));
  return cleaned || null;
}

/** Visitor text: anything that is not text, or is blank, counts as missing. */
function cleanVisitorText(value) {
  return isBlank(value) ? null : removeContactDetails(value);
}

/** The first maxWords words, with a trailing comma dropped and an ellipsis when cut. */
export function firstWords(text, maxWords) {
  const words = normalizeSpace(text).split(" ");
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ").replace(/,$/, "")}...`;
}

/** Ends the text with a full stop unless it already ends a sentence. */
export function sentenceOf(text) {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

const EM_DASHES = String.fromCharCode(0x2014, 0x2015);
const EN_DASH = String.fromCharCode(0x2013);
const DASH_OR_SEMICOLON = new RegExp(`\\s*[${EM_DASHES};]\\s*`, "gu");
const EN_DASH_AS_DASH = new RegExp(
  `\\s*(?:(?<!\\d)${EN_DASH}|${EN_DASH}(?!\\d))\\s*`,
  "gu"
);

/** Record text made safe for the letter rules: no em dash, no semicolon, no dash used as one. */
function safeText(text) {
  return String(text)
    .replace(DASH_OR_SEMICOLON, ", ")
    .replace(EN_DASH_AS_DASH, ", ")
    .replace(/\s+-\s+/g, ", ");
}

/** A project's text split into its name and description, or null when it has no "Name: " part. */
export function projectParts(text) {
  const at = String(text).indexOf(": ");
  if (at <= 0) return null;
  return {
    name: text.slice(0, at).trim(),
    description: text.slice(at + 2).trim()
  };
}

/** "Name project", unless the name already ends in "project". */
function projectName(name) {
  return /\bproject$/i.test(name) ? name : `${name} project`;
}

/**
 * One quoted evidence item as a sentence, with the lead for its place in the paragraph. A
 * project reads "On my Name project, " and its value text, or its solution text when it has no
 * value. withSolution adds the solution after the value, when the letter needs more length.
 */
function quoteItem(item, lead, words, withSolution = false) {
  if (item.type === "project") {
    const value = isBlank(item.value) ? null : item.value;
    const solution = isBlank(item.solution) ? null : item.solution;
    const main = value || solution;
    if (main) {
      const sentence = sentenceOf(
        projectSentence(
          projectName(item.text),
          wholeSentences(safeText(main), words)
        )
      );
      return withSolution && value && solution
        ? `${sentence} How it works: ${sentenceOf(wholeSentences(safeText(solution), words))}`
        : sentence;
    }
    const parts = projectParts(item.text);
    if (parts)
      return sentenceOf(
        `On my ${projectName(parts.name)}, ${firstWords(safeText(parts.description), words)}`
      );
  }
  return `${lead} ${sentenceOf(firstWords(safeText(item.text), words))}`;
}

/**
 * As many whole sentences of the text as fit in the word limit, so a long solution is not cut
 * mid sentence. When even the first sentence is too long, its first words with an ellipsis.
 */
function wholeSentences(text, words) {
  const sentences = normalizeSpace(text).split(/(?<=[.!?])\s+/u);
  const kept = [];
  let count = 0;
  for (const sentence of sentences) {
    const size = sentence.split(" ").length;
    if (count + size > words) break;
    kept.push(sentence);
    count += size;
  }
  return kept.length ? kept.join(" ") : firstWords(sentences[0], words);
}

/** Words that follow a verb as its object, so "Gives a" and "Lets other" read as verbs. */
const OBJECT_WORDS = new Set(
  "a an the other others every each one it its their them this that these those our your any some more fewer".split(
    " "
  )
);

/**
 * The sentence that opens a project quote. Value text that starts with a plain verb and its
 * object, such as "Gives a reviewer one place", reads "My Name project gives a reviewer one
 * place". Any other text, such as "Salesforce users see" or "Partners get", reads "On my Name
 * project, " and the text with its capital kept, so a name at the start is never lowered.
 */
function projectSentence(name, text) {
  const [first = "", second = ""] = text.split(" ");
  const verb =
    /^\p{Lu}\p{Ll}*[^s]s$/u.test(first) &&
    (OBJECT_WORDS.has(second.toLowerCase()) || /^\p{Lu}/u.test(second));
  if (!verb) return `On my ${name}, ${text}`;
  return `My ${name} ${first.toLowerCase()}${text.slice(first.length)}`;
}

/**
 * The selection the template writes from: the given selection, with its project list topped up
 * to the most a selection may hold, from the view's projects that have value or solution text,
 * highest priority first. Projects show what the work changed, so the template letter, which
 * has no model to add context, leans on them. The view is the mode's view, so a visitor letter
 * only ever gets projects a visitor may see.
 */
export function templateSelection(selection, view) {
  if (!selection || typeof selection !== "object") return selection;
  const ids = [...(selection.project_ids || [])];
  const most = LIMITS.projects[1];
  const candidates = (view?.items || [])
    .filter(
      (item) =>
        item.type === "project" &&
        (!isBlank(item.value) || !isBlank(item.solution))
    )
    .sort((a, b) => a.priority - b.priority);
  for (const item of candidates) {
    if (ids.length >= most) break;
    if (!ids.includes(item.id)) ids.push(item.id);
  }
  return { ...selection, project_ids: ids };
}

/** Whether a quoted item can still grow by its solution text. */
function canExtend(item) {
  return (
    item.type === "project" && !isBlank(item.value) && !isBlank(item.solution)
  );
}

/** The current role: the one marked current at the owner's current employer. */
function currentRoleOf(view) {
  const employer = view?.owner?.currentEmployer;
  return (view?.roles || []).find(
    (role) => role.current && role.employer === employer
  );
}

/**
 * The requirements the evidence paragraphs start from: those with evidence among the allowed
 * texts, strong matches before partial ones, each group in the selection's order, at most three.
 * Visitor mode uses strong matches only, as the letter call does. Each entry lists its items.
 */
export function evidencedRequirements(selection, items, allowed, mode) {
  const usable = (selection?.top_requirements || [])
    .filter((entry) => entry && entry.match !== "gap")
    .filter((entry) => mode !== "visitor" || entry.match === "strong")
    .map((entry) => ({
      match: entry.match,
      items: (entry.evidence_ids || [])
        .map((id) => items.get(id))
        .filter((item) => item && allowed.has(item.text))
    }))
    .filter((entry) => entry.items.some(isQuotable));
  const strong = usable.filter((entry) => entry.match === "strong");
  const rest = usable.filter((entry) => entry.match !== "strong");
  return [...strong, ...rest].slice(0, BODY_PARAGRAPHS);
}

/** A greeting the validator sets aside: one line of at most six words. */
function greeting(company) {
  return company && company.split(" ").length <= 3
    ? `Dear ${company} hiring team,`
    : "Dear hiring team,";
}

/** "A", "A and B", "A, B and C". */
function listOf(names) {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** What the letter is built from, read defensively so a broken selection never throws. */
function readParts({ view, selection, mode, evidenceTexts }) {
  const parts = {
    texts: [],
    requirements: [],
    extras: [],
    skills: [],
    roleIncluded: false,
    certifications: 0
  };
  try {
    parts.texts = Array.isArray(evidenceTexts)
      ? evidenceTexts
      : selectedEvidenceTexts(selection, view);
    const allowed = new Set(parts.texts);
    const items = new Map((view?.items || []).map((item) => [item.id, item]));
    parts.requirements = evidencedRequirements(selection, items, allowed, mode);
    const included = (selection?.roles || []).filter(
      (entry) => entry && entry.include
    );
    const current = currentRoleOf(view);
    parts.current = current;
    parts.roleIncluded = Boolean(
      current && included.some((entry) => entry.role_id === current.id)
    );
    const ids = [
      ...parts.requirements.flatMap((entry) =>
        entry.items.map((item) => item.id)
      ),
      ...(selection?.project_ids || []),
      ...included.flatMap((entry) => entry.bullet_ids || []),
      ...(selection?.skill_ids || []),
      ...(selection?.top_requirements || []).flatMap(
        (entry) => entry?.evidence_ids || []
      )
    ];
    const selected = [...new Set(ids)]
      .map((id) => items.get(id))
      .filter((item) => item && allowed.has(item.text));
    parts.extras = selected.filter(isQuotable);
    parts.skills = selected
      .filter((item) => item.type === "skill")
      .slice(0, MAX_SKILLS)
      .map((item) => item.text);
    parts.certifications = selected.filter(
      (item) => item.type === "certification"
    ).length;
  } catch {
    // Recovered on purpose, as in the Apex: the letter is written with what it has.
    parts.requirements = [];
    parts.extras = [];
    parts.skills = [];
  }
  return parts;
}

/**
 * Which items each body paragraph quotes. Every paragraph gets one item, from its requirement
 * when it has one, then from the selected projects, then from the selected bullets. Then, while
 * more words are wanted, paragraphs in turn take a second item, from their own requirement
 * first. After that, each quoted project in turn adds its solution text. No item is used twice.
 * Returns the slots in order, each with its items and the projects that carry their solution.
 */
function planSlots(parts, wantMore) {
  const used = new Set();
  const take = (list) => {
    const item = list.find(
      (entry) => isQuotable(entry) && !used.has(entry.text)
    );
    if (item) used.add(item.text);
    return item;
  };
  const slots = Array.from({ length: BODY_PARAGRAPHS }, (_, index) => {
    const own = parts.requirements[index]?.items || [];
    const first = take(own) || take(parts.extras);
    return { own, items: first ? [first] : [], extended: new Set() };
  });
  for (const slot of slots) {
    if (!wantMore(slots)) break;
    if (slot.items.length >= ITEMS_PER_PARAGRAPH) continue;
    const next = take(slot.own) || take(parts.extras);
    if (next) slot.items.push(next);
  }
  for (const slot of slots)
    for (const item of slot.items) {
      if (!wantMore(slots)) return slots;
      if (canExtend(item)) slot.extended.add(item);
    }
  return slots;
}

/**
 * The template letter. Never throws.
 * @param {object} input posting { company, title }, view (the snapshot for the mode),
 *   selection, mode, and optionally evidenceTexts (the texts grounding reads, worked out from
 *   the selection when left out), ownerName and startYear.
 */
export function buildTemplateLetter({
  posting = {},
  view,
  selection,
  mode = "owner",
  evidenceTexts,
  ownerName,
  startYear = null
} = {}) {
  const company = cleanVisitorText(posting.company);
  const role = cleanVisitorText(posting.title);
  const employer = view?.owner?.currentEmployer;
  const parts = readParts({ view, selection, mode, evidenceTexts });
  const allow = groundingAllowList(view, {
    company: posting.company,
    title: posting.title
  });
  const grounded = (sentence) =>
    parts.texts.length > 0 &&
    checkGrounding(sentence, parts.texts, { allow }).ok;

  const opener = [
    `I am applying for ${role ? `the ${role} role` : "the open role"}${company ? ` at ${company}` : ""}.`
  ];
  if (employer) {
    const withTitle = parts.roleIncluded
      ? `I work as ${parts.current.title} at ${employer}.`
      : null;
    opener.push(
      withTitle && grounded(withTitle)
        ? withTitle
        : `I currently work at ${employer}.`
    );
  }
  const year = `I have worked on the Salesforce platform since ${startYear}.`;
  if (Number.isInteger(startYear) && grounded(year)) opener.push(year);
  const certs = `I hold ${parts.certifications} current certifications.`;
  if (parts.certifications > 1 && grounded(certs)) opener.push(certs);
  opener.push(
    "Below are the parts of my portfolio records closest to the role."
  );

  const skills = `The tools behind that work include ${listOf(parts.skills)}.`;
  const skillSentence = parts.skills.length && grounded(skills) ? skills : null;

  const name = ownerName ?? view?.owner?.name;
  const signOff = isBlank(name)
    ? "Sincerely,"
    : `Sincerely,\n${removeContactDetails(name)}`;

  const compose = (slots, words, neutralCount) => {
    const body = slots.map((slot, index) => {
      const sentences = slot.items.map((item, place) =>
        quoteItem(item, LEADS[index][place], words, slot.extended.has(item))
      );
      if (index === slots.length - 1 && skillSentence)
        sentences.push(skillSentence);
      // A paragraph with no evidence left takes a neutral sentence, so the letter keeps five.
      return sentences.length ? sentences.join(" ") : null;
    });
    const neutral = [...NEUTRAL];
    const filled = body.map((text) => text ?? neutral.shift());
    const close = [
      "I would welcome a conversation about the role and where I could help your team.",
      ...neutral.slice(
        0,
        Math.max(0, neutralCount - (NEUTRAL.length - neutral.length))
      ),
      TEMPLATE_NOTE,
      "Thank you for reading."
    ];
    return [opener.join(" "), ...filled, close.join(" ")];
  };
  const length = (paragraphs) => countWords(paragraphs.join(" "));

  let paragraphs = [];
  for (const words of EVIDENCE_WORDS) {
    const slots = planSlots(
      parts,
      (current) => length(compose(current, words, 0)) < WORDS.least
    );
    let neutralCount = 0;
    paragraphs = compose(slots, words, neutralCount);
    while (length(paragraphs) < WORDS.least && neutralCount < NEUTRAL.length) {
      neutralCount += 1;
      paragraphs = compose(slots, words, neutralCount);
    }
    if (length(paragraphs) <= WORDS.most) break;
  }
  return [greeting(company), ...paragraphs, signOff].join("\n\n");
}

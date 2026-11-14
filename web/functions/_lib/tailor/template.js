/**
 * The template cover letter: the last step of the provider router, written by fixed rules with
 * no model. It started as a port of the Apex class LocalTemplateService and now meets the same
 * letter rules as a model letter (owner decision P-D33): exactly five paragraphs, 300 to 400
 * words, the current employer named, every number and every product or tool name grounded in
 * the selected evidence, and the shape the letter prompt asks for. Pure code with no org call, no
 * network and no I/O, so a Pages Function can import it.
 *
 * The shape: an opener, three evidence paragraphs from the three highest ranked requirements
 * that have evidence, strong matches first, and a close. With fewer than three, the letter still
 * has five paragraphs, each missing evidence paragraph says how I work without claiming
 * anything, and the opener and close carry more. The letter validator then warns about thin
 * evidence.
 *
 * Evidence is quoted from the selected items only, cut to a fixed number of words, so every name
 * and number in it is grounded by construction. Any other sentence that could carry a name or a
 * number, such as the start year, is checked with checkGrounding first and left out when it
 * fails.
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
 * - The highlights and projects, from PortfolioGroundingService. Here the evidence the
 *   selection's requirements name, in the selection's order.
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

export const MAX_JOB_TEXT_CHARS = 12000;
export const REMOVED = "[removed]";
export const BODY_PARAGRAPHS = 3;
export const WORDS = { least: 320, most: 400 };
/** Words kept from one evidence text: the first cut, and the shorter one for a long letter. */
export const EVIDENCE_WORDS = [30, 18];
export const TEMPLATE_NOTE =
  "I put this letter together from my portfolio records with a fixed template, and no model wrote it.";

const PHONE = /(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

/** How each evidence paragraph starts and ends. Plain words with no names or numbers. */
const LEADS = [
  "The work closest to what you describe is this:",
  "Another part of the role I can speak to directly:",
  "A third example from my records:"
];
const SECOND = ["Alongside it:", "In the same vein:", "And related to that:"];
const TAILS = [
  "That is the kind of work I would bring to this role from the start.",
  "I would expect the same approach to carry over to your team.",
  "I keep the people who use the system close to each decision in work like this."
];
/** Body paragraphs for a requirement with no evidence. They describe habits and claim nothing. */
const NEUTRAL = [
  "I write down what I change so the next person can follow it, and I check my own work before anyone else has to. I would bring that habit to every part of this role.",
  "I ask questions early, I keep the people who rely on the work informed, and I treat a small fix with the same care as a large one.",
  "I prefer plain designs that the team can read and keep running after I hand them over, and I keep the reasons for each choice where the team can find them."
];
/** Sentences that bring a short letter to length, added to the opener and the close in turn. */
const FILLER = [
  "I would like to talk through how that work could carry over to your team.",
  "The same habits would shape how I start in this role.",
  "I write down what I change so the next person can follow it.",
  "I keep the people who use the system close to every decision.",
  "I would bring the same care to the work you describe.",
  "I like to understand how a team works before I suggest changes to it.",
  "I would be glad to walk through any of these examples in more detail.",
  "I take the time to test my own work before I hand it on.",
  "I would rather raise a question early than guess at what a team needs.",
  "I keep my notes where the rest of the team can read them.",
  "I break large pieces of work into steps that can be checked one at a time.",
  "I listen to the people closest to a problem before I settle on a fix.",
  "I treat handing work over cleanly as part of finishing it.",
  "I am happy to start with the smaller tasks and earn the larger ones.",
  "I care about the work being easy to keep running after it ships.",
  "I would look forward to learning how your team plans and reviews its work."
];

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

/** Evidence text made safe for the letter rules: no em dash, no semicolon, no dash used as one. */
const EM_DASHES = String.fromCharCode(0x2014, 0x2015);
const EN_DASH = String.fromCharCode(0x2013);
const DASH_OR_SEMICOLON = new RegExp(`\\s*[${EM_DASHES};]\\s*`, "gu");
const EN_DASH_AS_DASH = new RegExp(
  `\\s*(?:(?<!\\d)${EN_DASH}|${EN_DASH}(?!\\d))\\s*`,
  "gu"
);

function quote(text, words) {
  const safe = String(text)
    .replace(DASH_OR_SEMICOLON, ", ")
    .replace(EN_DASH_AS_DASH, ", ")
    .replace(/\s+-\s+/g, ", ");
  return sentenceOf(firstWords(safe, words));
}

/** The current role: the one marked current at the owner's current employer. */
function currentRoleOf(view) {
  const employer = view?.owner?.currentEmployer;
  return (view?.roles || []).find(
    (role) => role.current && role.employer === employer
  );
}

/**
 * The requirements the evidence paragraphs come from: those with evidence among the allowed
 * texts, strong matches before partial ones, each group in the selection's order, at most three.
 * Visitor mode uses strong matches only, as the letter call does.
 */
export function evidencedRequirements(selection, items, allowed, mode) {
  const usable = (selection?.top_requirements || [])
    .filter((entry) => entry && entry.match !== "gap")
    .filter((entry) => mode !== "visitor" || entry.match === "strong")
    .map((entry) => ({
      match: entry.match,
      texts: (entry.evidence_ids || [])
        .map((id) => items.get(id))
        .filter(
          (item) =>
            item &&
            item.type !== "headline" &&
            item.type !== "summary" &&
            allowed.has(item.text)
        )
        .map((item) => item.text)
    }))
    .filter((entry) => entry.texts.length);
  const strong = usable.filter((entry) => entry.match === "strong");
  const rest = usable.filter((entry) => entry.match !== "strong");
  return [...strong, ...rest].slice(0, BODY_PARAGRAPHS);
}

function evidenceParagraph(entry, index, words, perParagraph) {
  const [first, second] = entry.texts;
  const parts = [`${LEADS[index]} ${quote(first, words)}`];
  if (second && perParagraph > 1)
    parts.push(`${SECOND[index]} ${quote(second, words)}`);
  parts.push(TAILS[index]);
  return parts.join(" ");
}

/** A greeting the validator sets aside: one line of at most six words. */
function greeting(company) {
  return company && company.split(" ").length <= 3
    ? `Dear ${company} hiring team,`
    : "Dear hiring team,";
}

/** What the letter is built from, read defensively so a broken selection never throws. */
function readParts({ view, selection, mode, evidenceTexts }) {
  const parts = {
    texts: [],
    requirements: [],
    roleIncluded: false,
    certifications: 0
  };
  try {
    parts.texts = Array.isArray(evidenceTexts)
      ? evidenceTexts
      : selectedEvidenceTexts(selection, view);
    const items = new Map((view?.items || []).map((item) => [item.id, item]));
    parts.requirements = evidencedRequirements(
      selection,
      items,
      new Set(parts.texts),
      mode
    );
    const current = currentRoleOf(view);
    parts.current = current;
    parts.roleIncluded = Boolean(
      current &&
      (selection?.roles || []).some(
        (entry) => entry && entry.include && entry.role_id === current.id
      )
    );
    const ids = new Set([
      ...(selection?.skill_ids || []),
      ...(selection?.project_ids || []),
      ...(selection?.top_requirements || []).flatMap(
        (entry) => entry?.evidence_ids || []
      )
    ]);
    parts.certifications = [...ids].filter(
      (id) => items.get(id)?.type === "certification"
    ).length;
  } catch {
    // Recovered on purpose, as in the Apex: the letter is written with what it has.
    parts.requirements = [];
  }
  return parts;
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
  if (!parts.requirements.length)
    opener.push(
      "This letter draws on my portfolio records, and none of them matches this posting closely."
    );
  const close = [
    "I would welcome a conversation about the role and where I could help your team.",
    TEMPLATE_NOTE,
    "Thank you for reading."
  ];

  const name = ownerName ?? view?.owner?.name;
  const signOff = isBlank(name)
    ? "Sincerely,"
    : `Sincerely,\n${removeContactDetails(name)}`;

  const compose = (words, perParagraph, fillerCount) => {
    const start = [...opener];
    const end = [...close];
    for (let i = 0; i < fillerCount; i += 1) {
      const sentence = FILLER[i % FILLER.length];
      if (i % 2 === 0) start.push(sentence);
      else end.splice(end.length - 1, 0, sentence);
    }
    const body = Array.from({ length: BODY_PARAGRAPHS }, (_, index) =>
      parts.requirements[index]
        ? evidenceParagraph(
            parts.requirements[index],
            index,
            words,
            perParagraph
          )
        : NEUTRAL[index]
    );
    return [start.join(" "), ...body, end.join(" ")];
  };

  // The longest evidence cut that fits, with fillers until the body reaches its least length.
  let paragraphs = [];
  for (const [words, perParagraph] of [
    [EVIDENCE_WORDS[0], 2],
    [EVIDENCE_WORDS[1], 2],
    [EVIDENCE_WORDS[1], 1]
  ]) {
    let fillers = 0;
    paragraphs = compose(words, perParagraph, fillers);
    while (
      countWords(paragraphs.join(" ")) < WORDS.least &&
      fillers < FILLER.length
    ) {
      fillers += 1;
      paragraphs = compose(words, perParagraph, fillers);
    }
    if (countWords(paragraphs.join(" ")) <= WORDS.most) break;
  }
  return [greeting(company), ...paragraphs, signOff].join("\n\n");
}

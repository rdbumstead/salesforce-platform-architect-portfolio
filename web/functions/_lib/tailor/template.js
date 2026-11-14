/**
 * The template cover letter, ported from the Apex class LocalTemplateService. It is the last
 * step of the provider router: a letter put together with no model, from the resume snapshot,
 * the selection and the posting. Pure code with no org call, no network and no I/O, so a Pages
 * Function can import it.
 *
 * What the Apex reads from the org, and what this port takes instead:
 *
 * - The owner's name, from ResumeController.getHeader. Here `snapshot.owner.name`, or the
 *   `ownerName` input. With neither, the sign off has no name. The Apex falls back to a name
 *   written in its code, which this port does not copy.
 * - The owner's title, from the same header. Here the text of the `headline-site-title` item,
 *   which the snapshot builder makes from that header, or the `ownerTitle` input. With neither,
 *   the sentence is left out.
 * - The year the owner started on Salesforce, from the Salesforce_Start_Year setting, whose code
 *   default is 2017. The snapshot does not carry it and only the owner sets it, so here it is
 *   the `startYear` input with no default. Without it, the sentence is left out.
 * - The count of current certifications, from ResumeController.getTimeline. Here the number of
 *   certification items in the snapshot view, or the `certificationCount` input.
 * - The highlights and projects, from PortfolioGroundingService, which ranks them by keywords and
 *   persona. Here the bullets and projects the selection chose, in its order. The selection
 *   already ranks evidence against the posting, so this port does not rank again.
 *
 * The company, the title and the description come from the posting and have email and phone
 * shapes removed, as in the Apex. No employer name goes into the letter.
 */

export const MAX_FACTS = 3;
export const MAX_FACT_WORDS = 40;
export const MAX_JOB_TEXT_CHARS = 12000;
export const REMOVED = "[removed]";
export const TEMPLATE_NOTE =
  "This is a template letter, put together from my portfolio records without an AI model.";

const PHONE = /(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

function normalizeSpace(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).join(" ");
}

const isBlank = (value) => typeof value !== "string" || !value.trim();

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
  if (isBlank(value)) return null;
  return removeContactDetails(normalizeSpace(value));
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

function addFact(facts, label, text) {
  if (facts.length >= MAX_FACTS || isBlank(text)) return;
  const sentence = sentenceOf(firstWords(text, MAX_FACT_WORDS));
  facts.push(isBlank(label) ? sentence : `As ${label}: ${sentence}`);
}

/**
 * Up to MAX_FACTS sentences: the selected bullets first, labelled with their role's title, then
 * the selected projects, labelled with the project name before the first colon of their text.
 * Only items in the view count. Employers are left out.
 */
export function templateFacts(view, selection) {
  const facts = [];
  if (!view || !selection) return facts;
  const items = new Map((view.items || []).map((item) => [item.id, item]));
  const roles = new Map((view.roles || []).map((role) => [role.id, role]));
  for (const role of selection.roles || []) {
    if (!role || role.include === false) continue;
    for (const id of role.bullet_ids || []) {
      const item = items.get(id);
      if (item?.type !== "bullet") continue;
      addFact(facts, roles.get(item.roleId)?.title, item.text);
    }
  }
  for (const id of selection.project_ids || []) {
    const item = items.get(id);
    if (item?.type !== "project") continue;
    const at = item.text.indexOf(": ");
    if (at > 0) addFact(facts, item.text.slice(0, at), item.text.slice(at + 2));
    else addFact(facts, null, item.text);
  }
  return facts;
}

function greeting(company) {
  return company ? `Dear ${company} hiring team,` : "Dear hiring team,";
}

function opening({ company, role }) {
  const which = role ? `the ${role} role` : "the open role";
  const at = company ? ` at ${company}` : "";
  return `I would like to be considered for ${which}${at}. Below is a short account of my background and the work in my portfolio that fits it best.`;
}

function background({ ownerTitle, startYear, certificationCount }) {
  const sentences = [];
  if (ownerTitle) sentences.push(`My current title is ${ownerTitle}.`);
  if (Number.isInteger(startYear))
    sentences.push(
      `I have worked on the Salesforce platform since ${startYear}.`
    );
  if (Number.isInteger(certificationCount) && certificationCount > 0)
    sentences.push(
      certificationCount === 1
        ? "I hold 1 current certification."
        : `I hold ${certificationCount} current certifications.`
    );
  return sentences.length ? sentences.join(" ") : null;
}

/**
 * The letter from its parts: greeting, the role, the owner's background, the facts, a close,
 * the name and the template note. The Apex compose, line for line.
 */
export function composeTemplateLetter(parts) {
  const letter = { facts: [], ...parts };
  const paragraphs = [greeting(letter.company), opening(letter)];
  const about = background(letter);
  if (about) paragraphs.push(about);
  if (letter.facts.length)
    paragraphs.push(
      `${
        letter.hasDescription
          ? "From my portfolio records, these are the parts closest to your description:"
          : "From my portfolio records, these are the parts closest to the role:"
      }\n- ${letter.facts.join("\n- ")}`
    );
  paragraphs.push(
    "I would welcome a conversation about the role and where I could help your team. Thank you for reading."
  );
  paragraphs.push(
    letter.ownerName ? `Sincerely,\n${letter.ownerName}` : "Sincerely,"
  );
  paragraphs.push(TEMPLATE_NOTE);
  return paragraphs.join("\n\n");
}

/**
 * The template letter. Never throws.
 * @param {object} input posting { company, title, text }, view (the snapshot for the mode),
 *   selection, and the optional overrides ownerName, ownerTitle, startYear, certificationCount.
 */
export function buildTemplateLetter({
  posting = {},
  view,
  selection,
  ownerName,
  ownerTitle,
  startYear = null,
  certificationCount
} = {}) {
  const items = view?.items || [];
  let facts = [];
  try {
    facts = templateFacts(view, selection);
  } catch {
    // Recovered on purpose, as in the Apex: the letter is written with what it has.
    facts = [];
  }
  const siteTitle = items.find(
    (item) => item.id === "headline-site-title"
  )?.text;
  const name = ownerName ?? view?.owner?.name;
  const title = ownerTitle ?? siteTitle;
  return composeTemplateLetter({
    company: cleanVisitorText(posting.company),
    role: cleanVisitorText(posting.title),
    hasDescription: cleanVisitorText(posting.text) !== null,
    ownerName: isBlank(name) ? null : removeContactDetails(name),
    ownerTitle: isBlank(title) ? null : removeContactDetails(title),
    startYear: Number.isInteger(startYear) ? startYear : null,
    certificationCount:
      certificationCount ??
      items.filter((item) => item.type === "certification").length,
    facts
  });
}

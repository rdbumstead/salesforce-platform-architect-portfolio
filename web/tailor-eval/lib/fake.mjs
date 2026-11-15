/**
 * The fake provider's answers. A selection built from the snapshot by fixed rules, and a five
 * paragraph letter built only from the selected evidence text. Deterministic, so the harness
 * can run end to end with no model and give the same numbers every time.
 */
import { currentRole } from './roles.mjs';
import { wordCount } from './text.mjs';

// The selection is the site's rule built selection, so the harness and the edge letter agree.
export { buildRuleSelection as buildFakeSelection } from '../../functions/_lib/tailor/select.js';

/** Neutral sentences with no numbers, tools or claims, used to bring the letter to length. */
const FILLER = [
  'I would like to talk through how that work could carry over to your team.',
  'The same habits would shape how I start in this role.',
  'I keep the people who use the system close to every decision.',
  'I write down what I change so the next person can follow it.',
  'I would bring the same care to the work you describe.',
  'Thank you for reading, and for considering me.'
];

/** context: { posting, snapshot, selection, evidenceTexts }, the texts the letter may draw on. */
export function buildFakeLetter({ posting, snapshot, selection, evidenceTexts }) {
  const current = currentRole(snapshot);
  const allowed = new Set(evidenceTexts);
  const byId = new Map(snapshot.items.filter((item) => allowed.has(item.text)).map((item) => [item.id, item.text]));
  const withEvidence = (selection.top_requirements || []).filter((entry) => entry.match !== 'gap' && entry.evidence_ids.some((id) => byId.has(id)));
  const body = withEvidence.slice(0, 3).map((entry) => {
    const text = entry.evidence_ids.filter((id) => byId.has(id)).map((id) => byId.get(id).replace(/\.$/, ''));
    return `On ${entry.requirement.toLowerCase()}, the clearest example is this: ${text.join('. ')}. ${FILLER[0]}`;
  });
  while (body.length < 3) body.push(`${FILLER[1]} ${FILLER[2]} ${FILLER[3]}`);
  const opener = `I am applying for the ${posting.title} role at ${posting.company}. I work as ${current ? current.title : 'a consultant'} at ${snapshot.owner.currentEmployer}.`;
  const paragraphs = [opener, ...body, FILLER[4]];
  let index = 1;
  while (wordCount(paragraphs.join(' ')) < 320) {
    paragraphs[4] = `${paragraphs[4]} ${FILLER[index % (FILLER.length - 1)]}`;
    index += 1;
  }
  paragraphs[4] = `${paragraphs[4]} ${FILLER[FILLER.length - 1]}`;
  const gaps = (selection.top_requirements || []).filter((entry) => entry.match === 'gap');
  return [
    'Gap notes',
    gaps.length ? gaps.map((entry) => `- ${entry.requirement}: not claimed in the letter.`).join('\n') : '- None.',
    '',
    'Cover letter',
    paragraphs.join('\n\n'),
    '',
    '[VERIFY] items',
    '- None.'
  ].join('\n');
}

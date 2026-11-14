/**
 * The fake provider's answers. A selection built from the snapshot by fixed rules, and a five
 * paragraph letter built only from the selected evidence text. Deterministic, so the harness
 * can run end to end with no model and give the same numbers every time.
 */
import { HARD_FILTER_WORDS, hasPhrase, rankCategories, wordCount } from './text.mjs';

const FAMILIES = ['engineer', 'architect', 'consultant', 'admin'];

/** Neutral sentences with no numbers, tools or claims, used to bring the letter to length. */
const FILLER = [
  'I would like to talk through how that work could carry over to your team.',
  'The same habits would shape how I start in this role.',
  'I keep the people who use the system close to every decision.',
  'I write down what I change so the next person can follow it.',
  'I would bring the same care to the work you describe.',
  'Thank you for reading, and for considering me.'
];

function titleFamily(title) {
  const lower = String(title).toLowerCase();
  if (lower.includes('architect')) return 'architect';
  if (lower.includes('consultant')) return 'consultant';
  if (lower.includes('admin')) return 'admin';
  return lower.includes('engineer') || lower.includes('developer') ? 'engineer' : FAMILIES[0];
}

function byPriority(a, b) {
  return a.priority - b.priority;
}

/** context: { posting, snapshot (the mode's view), categories } */
export function buildFakeSelection({ posting, snapshot, categories }) {
  const items = snapshot.items;
  const ranked = rankCategories(`${posting.title}\n${posting.text}`, categories).slice(0, 3);
  const family = titleFamily(posting.title);
  const headline = items.find((item) => item.id === `headline-${family}`) || items.find((item) => item.type === 'headline');
  const summary = items.find((item) => item.type === 'summary');
  const current = snapshot.roles.find((role) => role.current && role.employer === snapshot.owner.currentEmployer) || snapshot.roles[0];
  const topIds = new Set(ranked.map((entry) => entry.id));
  const scored = (list) =>
    [...list].sort((a, b) => {
      const hitA = a.tags.some((tag) => topIds.has(tag)) ? 0 : 1;
      const hitB = b.tags.some((tag) => topIds.has(tag)) ? 0 : 1;
      return hitA - hitB || byPriority(a, b);
    });
  const currentBullets = scored(items.filter((item) => item.type === 'bullet' && item.roleId === current.id)).slice(0, 4);
  const requirements = ranked.map((entry) => {
    const evidence = items.filter((item) => item.type !== 'headline' && item.type !== 'summary' && item.tags.includes(entry.id)).sort(byPriority).slice(0, 2);
    const label = categories.find((category) => category.id === entry.id)?.label || entry.id;
    return { requirement: label, match: evidence.length ? 'strong' : 'gap', evidence_ids: evidence.map((item) => item.id), note: '' };
  });
  const skills = scored(items.filter((item) => item.type === 'skill' && item.tags.some((tag) => topIds.has(tag)))).slice(0, 5);
  const projects = scored(items.filter((item) => item.type === 'project' && item.tags.some((tag) => topIds.has(tag)))).slice(0, 2);
  const flags = Object.entries(HARD_FILTER_WORDS)
    .filter(([kind, list]) => kind !== 'location' && list.some((word) => hasPhrase(posting.text, word)))
    .map(([kind]) => `Posting asks for ${kind}`);
  if (/on site|in the office/i.test(posting.text)) flags.push('Posting asks for on site location');
  return {
    title_family: family,
    top_requirements: requirements,
    headline_id: headline?.id || '',
    summary_id: summary?.id || '',
    roles: snapshot.roles.map((role) => ({ role_id: role.id, include: role.id === current.id, bullet_ids: role.id === current.id ? currentBullets.map((item) => item.id) : [] })),
    skill_ids: skills.map((item) => item.id),
    project_ids: projects.map((item) => item.id),
    hard_filter_flags: flags,
    missing_evidence_suggestions: requirements.filter((entry) => entry.match === 'gap').map((entry) => `No evidence for ${entry.requirement}`)
  };
}

/** context: { posting, snapshot, selection, evidence: [{ id, text }] } */
export function buildFakeLetter({ posting, snapshot, selection, evidence }) {
  const current = snapshot.roles.find((role) => role.current && role.employer === snapshot.owner.currentEmployer);
  const byId = new Map(evidence.map((entry) => [entry.id, entry.text]));
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

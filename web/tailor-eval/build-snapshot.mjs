/**
 * Builds the resume snapshot from the resume reads and an overlay.
 *
 *   node tailor-eval/build-snapshot.mjs --reads <reads.json> --overlay <overlay.json> --out <snapshot.json>
 *
 * The reads are the header read and the three getResume reads, in the shape of
 * fixtures/reads.json. Their items start verified. The overlay holds what the reads do not:
 * the readable role id for each role, which current role is "the current role" when the reads
 * mark more than one, tags and priority for the read items, and the added items, which start
 * unverified. With no options it rebuilds the committed snapshot from the fixture reads.
 *
 * A snapshot built from any other reads or overlay is real data, so it may only be written
 * where git ignores it, such as tailor-eval/private/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertIgnoredPath } from './lib/private.mjs';
import { currentRoles } from './lib/roles.mjs';

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_READS = path.resolve(EVAL_DIR, '..', 'fixtures', 'reads.json');
export const FIXTURE_OVERLAY = path.join(EVAL_DIR, 'snapshot', 'overlay.fixture.json');
export const COMMITTED_SNAPSHOT = path.join(EVAL_DIR, 'snapshot', 'resume-snapshot.json');
export const PERSONAS = ['Architect', 'Developer', 'Admin'];
export const TYPES = ['headline', 'summary', 'bullet', 'skill', 'project', 'certification'];
const DEFAULT_PRIORITY = 2;

export class SnapshotError extends Error {
  constructor(problems) {
    super(`The snapshot was not built:\n- ${problems.join('\n- ')}`);
    this.name = 'SnapshotError';
    this.problems = problems;
  }
}

export function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const roleKey = (employer, title) => JSON.stringify([employer, title]);

/** The roles, highlights, skills and certifications in the reads, each once, in read order. */
export function collectReads(reads) {
  const header = reads['ResumeController.getHeader'];
  const problems = [];
  if (!header) problems.push('The reads have no ResumeController.getHeader.');
  const resumes = PERSONAS.map((persona) => {
    const resume = reads[`ResumeController.getResume|{"persona":"${persona}"}`];
    if (!resume) problems.push(`The reads have no getResume for ${persona}.`);
    return resume;
  }).filter(Boolean);
  if (problems.length) throw new SnapshotError(problems);
  const roles = new Map();
  const skills = [];
  const certifications = new Map();
  for (const resume of resumes) {
    for (const role of resume.roles || []) {
      const key = roleKey(role.employer, role.title);
      if (!roles.has(key)) roles.set(key, { employer: role.employer, title: role.title, start: role.startDate || null, end: role.endDate || null, current: Boolean(role.isCurrent), highlights: [] });
      const entry = roles.get(key);
      for (const text of role.highlights || []) if (!entry.highlights.includes(text)) entry.highlights.push(text);
    }
    for (const group of resume.skillGroups || []) for (const skill of group.skills || []) if (!skills.includes(skill)) skills.push(skill);
    for (const certification of resume.certifications || []) if (!certifications.has(certification.name)) certifications.set(certification.name, certification);
  }
  return { header, roles: [...roles.values()], skills, certifications: [...certifications.values()] };
}

/**
 * Builds and checks the snapshot. Throws SnapshotError listing every problem found.
 * categories, when given, is the list of known tag ids.
 */
export function buildSnapshot(reads, overlay, { generatedAt = new Date().toISOString(), categories } = {}) {
  const problems = [];
  const { header, roles: readRoles, skills, certifications } = collectReads(reads);

  // Roles: every read role is mapped by employer and title, never by position.
  const overlayRoles = overlay.roles || [];
  const roleIdFor = new Map();
  for (const entry of overlayRoles) {
    const matches = readRoles.filter((role) => role.employer === entry.match?.employer && role.title === entry.match?.title);
    if (!matches.length) problems.push(`Overlay role ${entry.id} names ${entry.match?.employer} / ${entry.match?.title}, which the reads do not hold.`);
    for (const role of matches) {
      const key = roleKey(role.employer, role.title);
      if (roleIdFor.has(key)) problems.push(`Two overlay roles match ${role.employer} / ${role.title}.`);
      roleIdFor.set(key, entry.id);
    }
  }
  for (const role of readRoles) if (!roleIdFor.has(roleKey(role.employer, role.title))) problems.push(`The reads hold ${role.employer} / ${role.title}, which the overlay does not map to a role id.`);
  const roles = readRoles
    .filter((role) => roleIdFor.has(roleKey(role.employer, role.title)))
    .map((role) => ({ id: roleIdFor.get(roleKey(role.employer, role.title)), employer: role.employer, title: role.title, start: role.start, end: role.end, current: role.current }));
  const roleIds = new Set(roles.map((role) => role.id));

  // The current role: the only current one, or the one the overlay names.
  const current = roles.filter((role) => role.current);
  let currentRole = null;
  if (overlay.currentRoleId) {
    currentRole = roles.find((role) => role.id === overlay.currentRoleId) || null;
    if (!currentRole) problems.push(`The overlay's currentRoleId ${overlay.currentRoleId} is not a role in the reads.`);
    else if (!currentRole.current) problems.push(`The overlay's currentRoleId ${overlay.currentRoleId} is not marked current in the reads.`);
  } else if (current.length === 1) currentRole = current[0];
  else if (current.length > 1) problems.push(`The reads mark ${current.length} roles current (${current.map((role) => role.id).join(', ')}), so the overlay must name one as currentRoleId.`);
  else problems.push('The reads mark no role current.');

  // Items from the reads, verified, with tags and priority from the overlay.
  const readItems = [];
  const read = (item) => readItems.push(item);
  read({ id: 'headline-site-title', type: 'headline', text: header.title });
  read({ id: 'summary-site', type: 'summary', text: header.careerObjective });
  for (const role of readRoles) {
    const roleId = roleIdFor.get(roleKey(role.employer, role.title));
    if (!roleId) continue;
    role.highlights.forEach((text, index) => read({ id: `${roleId}-highlight-${index + 1}`, type: 'bullet', roleId, text }));
  }
  for (const skill of skills) read({ id: `skill-${slug(skill)}`, type: 'skill', text: skill });
  for (const certification of certifications) read({ id: `cert-${slug(String(certification.name).replace(/^Salesforce Certified /, ''))}`, type: 'certification', text: certification.name });
  const settings = overlay.readItems || {};
  const readIds = new Set(readItems.map((item) => item.id));
  for (const id of Object.keys(settings)) if (!readIds.has(id)) problems.push(`Overlay readItems names ${id}, which the reads do not produce.`);
  const fromReads = readItems
    .filter((item) => typeof item.text === 'string' && item.text.trim())
    .map((item) => ({ ...item, tags: settings[item.id]?.tags || [], priority: settings[item.id]?.priority ?? DEFAULT_PRIORITY, verified: true, visibility: 'public' }));

  // Items the overlay adds, never verified.
  const added = (overlay.items || []).map((item) => {
    if (item.verified !== false) problems.push(`Overlay item ${item.id} must say verified: false.`);
    if (item.visibility !== undefined && item.visibility !== 'public') problems.push(`Overlay item ${item.id} says visibility ${item.visibility}. Only public items may be in a snapshot.`);
    if (item.type === 'bullet' && !roleIds.has(item.roleId)) problems.push(`Overlay item ${item.id} attaches to role ${item.roleId}, which the reads do not hold.`);
    const { id, type, roleId, text, tags = [], priority = DEFAULT_PRIORITY } = item;
    return { id, type, ...(type === 'bullet' ? { roleId } : {}), text, tags, priority, verified: false, visibility: 'public' };
  });

  // Reads first, then the overlay, grouped by type.
  const items = TYPES.flatMap((type) => [...fromReads.filter((item) => item.type === type), ...added.filter((item) => item.type === type)]);
  const snapshot = {
    version: 1,
    generatedAt,
    owner: { name: header.name, currentEmployer: currentRole ? currentRole.employer : null },
    roles,
    items
  };
  problems.push(...snapshotProblems(snapshot, { categories, extraTypes: added.filter((item) => !TYPES.includes(item.type)) }));
  if (problems.length) throw new SnapshotError([...new Set(problems)]);
  return snapshot;
}

/** Everything wrong with a snapshot against the contract. An empty list means it is valid. */
export function snapshotProblems(snapshot, { categories, extraTypes = [] } = {}) {
  const problems = [];
  for (const item of extraTypes) problems.push(`Item ${item.id} has type ${item.type}, which is not one of ${TYPES.join(', ')}.`);
  if (snapshot.version !== 1) problems.push('The snapshot version must be 1.');
  if (!snapshot.owner?.name || !snapshot.owner?.currentEmployer) problems.push('The snapshot owner needs a name and a current employer.');
  const seen = new Set();
  for (const item of snapshot.items || []) {
    if (seen.has(item.id)) problems.push(`Two items share the id ${item.id}.`);
    seen.add(item.id);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id || '')) problems.push(`Item id ${item.id} is not lower case words joined by hyphens.`);
    if (!TYPES.includes(item.type)) problems.push(`Item ${item.id} has type ${item.type}, which is not one of ${TYPES.join(', ')}.`);
    if (item.visibility !== 'public') problems.push(`Item ${item.id} says visibility ${item.visibility}. Only public items may be in a snapshot.`);
    if (item.type === 'bullet' && !(snapshot.roles || []).some((role) => role.id === item.roleId)) problems.push(`Bullet ${item.id} names role ${item.roleId}, which the snapshot does not hold.`);
    if (item.type !== 'bullet' && item.roleId !== undefined) problems.push(`Item ${item.id} is not a bullet and must not name a role.`);
    if (typeof item.text !== 'string' || !item.text.trim()) problems.push(`Item ${item.id} has no text.`);
    if (![1, 2, 3].includes(item.priority)) problems.push(`Item ${item.id} has priority ${item.priority}, which is not 1, 2 or 3.`);
    if (typeof item.verified !== 'boolean') problems.push(`Item ${item.id} has no verified flag.`);
    if (!Array.isArray(item.tags)) problems.push(`Item ${item.id} has no tag list.`);
    else if (categories) for (const tag of item.tags) if (!categories.includes(tag)) problems.push(`Item ${item.id} has the tag ${tag}, which categories.json does not list.`);
  }
  const roleIds = new Set();
  for (const role of snapshot.roles || []) {
    if (roleIds.has(role.id)) problems.push(`Two roles share the id ${role.id}.`);
    roleIds.add(role.id);
    if (seen.has(role.id)) problems.push(`The role id ${role.id} is also an item id.`);
  }
  if (snapshot.owner?.currentEmployer) {
    const found = currentRoles(snapshot);
    if (found.length !== 1) problems.push(`Exactly one current role must have the owner's employer ${snapshot.owner.currentEmployer}, and ${found.length} do.`);
  }
  return problems;
}

/** Throws SnapshotError when the snapshot breaks the contract. */
export function assertSnapshot(snapshot, options) {
  const problems = snapshotProblems(snapshot, options);
  if (problems.length) throw new SnapshotError(problems);
  return snapshot;
}

export function serialize(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

/** Builds from files and writes the result. Real data goes only where git ignores it. */
export function buildFromFiles({ reads = FIXTURE_READS, overlay = FIXTURE_OVERLAY, out = COMMITTED_SNAPSHOT, generatedAt, git } = {}) {
  const isFixture = same(reads, FIXTURE_READS) && same(overlay, FIXTURE_OVERLAY);
  if (!isFixture) assertIgnoredPath(out, { git, what: 'a snapshot built from real data' });
  const categories = JSON.parse(fs.readFileSync(path.join(EVAL_DIR, 'categories.json'), 'utf8')).categories.map((category) => category.id);
  const overlayData = JSON.parse(fs.readFileSync(overlay, 'utf8'));
  const snapshot = buildSnapshot(JSON.parse(fs.readFileSync(reads, 'utf8')), overlayData, { generatedAt: generatedAt || overlayData.generatedAt, categories });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, serialize(snapshot));
  return snapshot;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=');
    const value = inline ?? argv[(i += 1)];
    if (value === undefined) throw new Error(`${flag} needs a value.`);
    if (flag === '--reads') args.reads = path.resolve(value);
    else if (flag === '--overlay') args.overlay = path.resolve(value);
    else if (flag === '--out') args.out = path.resolve(value);
    else if (flag === '--generated-at') args.generatedAt = value;
    else throw new Error(`Unknown option ${flag}.`);
  }
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const snapshot = buildFromFiles(args);
    console.log(`Snapshot written to ${args.out || COMMITTED_SNAPSHOT}: ${snapshot.roles.length} roles, ${snapshot.items.length} items, ${snapshot.items.filter((item) => !item.verified).length} unverified.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

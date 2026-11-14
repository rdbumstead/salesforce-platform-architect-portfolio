import test from 'node:test';
import assert from 'node:assert/strict';
import * as tailor from '../functions/_lib/tailor/index.js';
import { validateSelection, validateLetter, validateResume, checkGrounding, parseBlocklist, selectedEvidenceTexts, groundingAllowList, findNumbers, BANNED_PHRASES } from '../functions/_lib/tailor/index.js';

/*
 * A synthetic snapshot that follows the snapshot contract. The candidate, every employer and the
 * posting company are invented. Blocklist terms are invented words, never a real name.
 */
const SNAPSHOT = {
  version: 1,
  generatedAt: '2026-11-14T00:00:00.000Z',
  owner: { name: 'Jordan Example', currentEmployer: 'Quillmark Digital' },
  roles: [
    { id: 'role-quillmark', employer: 'Quillmark Digital', title: 'Senior Solution Consultant', start: '2026-04', end: null, current: true },
    { id: 'role-tallowmere', employer: 'Tallowmere Systems', title: 'Application Administrator', start: '2021-01', end: '2025-12', current: false },
    { id: 'role-fenwick', employer: 'Fenwick Survey Office', title: 'GIS Analyst', start: '2016-01', end: '2020-12', current: false }
  ],
  items: [
    { id: 'headline-engineer', type: 'headline', text: 'Senior Salesforce Engineer | Platform Architecture and AI-Assisted Development', tags: ['ai-assisted-dev'], priority: 1, verified: true, visibility: 'public' },
    { id: 'headline-architect', type: 'headline', text: 'Salesforce Platform Architect', tags: ['governance'], priority: 1, verified: true, visibility: 'public' },
    { id: 'summary-engineer', type: 'summary', text: 'Salesforce engineer who builds CI/CD pipelines and AI-assisted tooling, and who ran Service Cloud for 350+ support staff.', tags: ['ci-cd'], priority: 1, verified: true, visibility: 'public' },
    { id: 'summary-unbacked', type: 'summary', text: 'Salesforce engineer who supported 500+ staff across 12 teams.', tags: [], priority: 2, verified: true, visibility: 'public' },
    { id: 'q-toolkit', type: 'bullet', roleId: 'role-quillmark', text: 'Built a Claude Code plugin toolkit for Salesforce delivery, with guardrails, deployment tooling and session handoffs', tags: ['ai-assisted-dev'], priority: 1, verified: true, visibility: 'public' },
    { id: 'q-release', type: 'bullet', roleId: 'role-quillmark', text: 'Runs deployment and release management across three concurrent Education Cloud programs', tags: ['ci-cd'], priority: 1, verified: true, visibility: 'public' },
    { id: 'q-greenfield', type: 'bullet', roleId: 'role-quillmark', text: 'Led a new Education Cloud implementation from discovery into build', tags: ['higher-ed'], priority: 1, verified: true, visibility: 'public' },
    { id: 'q-recover', type: 'bullet', roleId: 'role-quillmark', text: 'Brought in to steady delivery timelines on client programs', tags: ['leadership'], priority: 2, verified: true, visibility: 'public' },
    { id: 'q-migration', type: 'bullet', roleId: 'role-quillmark', text: 'Designs agentic approaches to Salesforce data migration', tags: ['data-migration'], priority: 2, verified: true, visibility: 'public' },
    { id: 'q-omnistudio', type: 'bullet', roleId: 'role-quillmark', text: 'Designs OmniStudio application flows, Experience Cloud portals, SIS integrations, and security and sharing models', tags: ['integration', 'frontend'], priority: 1, verified: true, visibility: 'public' },
    { id: 'q-standards', type: 'bullet', roleId: 'role-quillmark', text: 'Shapes delivery standards for AI-assisted work across the practice', tags: ['governance'], priority: 2, verified: false, visibility: 'public' },
    { id: 't-service', type: 'bullet', roleId: 'role-tallowmere', text: 'Ran Service Cloud for 350+ support staff', tags: ['governance'], priority: 2, verified: true, visibility: 'public' },
    { id: 't-experience', type: 'bullet', roleId: 'role-tallowmere', text: 'Supported Experience Cloud for 12,000+ community members', tags: ['frontend'], priority: 2, verified: true, visibility: 'public' },
    { id: 't-automate', type: 'bullet', roleId: 'role-tallowmere', text: 'Connected Power Automate to Salesforce to automate user setup, cutting task time ~80%', tags: ['integration'], priority: 2, verified: true, visibility: 'public' },
    { id: 't-training', type: 'bullet', roleId: 'role-tallowmere', text: 'Coached 2 new CRM developers through a training plan', tags: ['leadership'], priority: 3, verified: true, visibility: 'public' },
    { id: 'f-maps', type: 'bullet', roleId: 'role-fenwick', text: 'Built map layers for field crews', tags: [], priority: 3, verified: true, visibility: 'public' },
    { id: 'skill-claude', type: 'skill', text: 'Claude Code', tags: ['ai-assisted-dev'], priority: 1, verified: true, visibility: 'public' },
    { id: 'skill-git', type: 'skill', text: 'Git', tags: ['ci-cd'], priority: 1, verified: true, visibility: 'public' },
    { id: 'skill-actions', type: 'skill', text: 'GitHub Actions', tags: ['ci-cd'], priority: 1, verified: true, visibility: 'public' },
    { id: 'skill-soql', type: 'skill', text: 'SOQL', tags: [], priority: 2, verified: true, visibility: 'public' },
    { id: 'proj-portfolio', type: 'project', text: 'Platform portfolio: Salesforce APIs behind a public front end on Cloudflare Pages, with pull requests validated in scratch orgs', tags: ['integration'], priority: 1, verified: true, visibility: 'public' },
    { id: 'proj-resume', type: 'project', text: 'Resume as Code: a CI/CD pipeline in GitHub Actions that builds the resume on every change', tags: ['ci-cd'], priority: 1, verified: true, visibility: 'public' },
    { id: 'proj-action', type: 'project', text: 'Setup CLI Action: an open source GitHub Action', tags: ['ci-cd'], priority: 2, verified: true, visibility: 'public' },
    { id: 'proj-api', type: 'project', text: 'Work history API: Apex REST endpoints with published OpenAPI specs', tags: ['integration'], priority: 2, verified: true, visibility: 'public' },
    { id: 'cert-admin', type: 'certification', text: 'Salesforce Certified Administrator', tags: [], priority: 2, verified: true, visibility: 'public' }
  ]
};

const POSTING = { company: 'Lumenfold Search', title: 'Senior Salesforce Engineer' };
const BLOCKLIST = 'zzclientone, zzclienttwo\nzz client three';

function selection(overrides = {}) {
  return {
    title_family: 'engineer',
    top_requirements: [
      { requirement: 'AI-assisted coding tools', match: 'strong', evidence_ids: ['q-toolkit', 'skill-claude'], note: '' },
      { requirement: 'CI/CD', match: 'strong', evidence_ids: ['proj-resume', 'q-release'], note: '' },
      { requirement: 'REST and event-driven integration', match: 'partial', evidence_ids: ['proj-portfolio', 't-automate'], note: 'APIs and automation, no event bus' },
      { requirement: "Bachelor's degree", match: 'gap', evidence_ids: [], note: 'No degree in the data' }
    ],
    headline_id: 'headline-engineer',
    summary_id: 'summary-engineer',
    roles: [
      { role_id: 'role-quillmark', include: true, bullet_ids: ['q-toolkit', 'q-release', 'q-migration', 'q-omnistudio'] },
      { role_id: 'role-tallowmere', include: true, bullet_ids: ['t-service', 't-automate'] },
      { role_id: 'role-fenwick', include: false, bullet_ids: [] }
    ],
    skill_ids: ['skill-claude', 'skill-git', 'skill-actions'],
    project_ids: ['proj-portfolio', 'proj-resume'],
    hard_filter_flags: ["Bachelor's degree required"],
    missing_evidence_suggestions: ['An event-driven integration example'],
    ...overrides
  };
}

function withRole(roleId, change) {
  const base = selection();
  return { ...base, roles: base.roles.map((role) => (role.role_id === roleId ? { ...role, ...change } : role)) };
}

const BODY = [
  'AI-assisted development is where I do my best work, and it is the first thing the Senior Salesforce Engineer role at Lumenfold Search asks for. As a Senior Solution Consultant at Quillmark Digital, I built a Claude Code plugin toolkit for Salesforce delivery, with guardrails, deployment tooling and session handoffs, so work done with an assistant meets the same standard as work done by hand. I would like to bring that habit of building tools with rules around them to your platform team.',
  'The toolkit is the clearest example. It wraps Claude Code in checks that run before any change reaches an org, keeps a written handoff between sessions, and stops a deploy that skips its gate. The point was never speed for its own sake. It was making sure that a change written with an assistant could be reviewed, traced and rolled back like any other change, which is the same human review your posting asks for around agentic features.',
  'Release work is the second thread. I run deployment and release management across three concurrent Education Cloud programs, and outside client work I keep a Resume as Code project that rebuilds my resume through a CI/CD pipeline in GitHub Actions on every change. That habit of treating every release as code, reviewed in Git and validated before it ships, is how I would approach your pipelines from the first week.',
  'My integration evidence is lighter than the rest, so I will be specific about what I have built. My portfolio puts Salesforce APIs behind a public front end on Cloudflare Pages, with every pull request validated in scratch orgs before it merges. Earlier, at Tallowmere Systems, I connected Power Automate to Salesforce to automate user setup and cut task time by ~80%. I would want to grow the event side of that work with your team, and I would say so plainly in an interview.',
  'What I would bring to Lumenfold Search is a way of working where the assistant writes, the code checks and a person approves before anything ships. Thank you for reading, and I hope we can talk soon about the platform you are building and where a release minded engineer fits in it.'
];
const LETTER = ['Dear Hiring Team,', ...BODY, 'Sincerely,\nJordan Example'].join('\n\n');

function letterWith(index, sentence) {
  const body = BODY.slice();
  body[index] = `${body[index]} ${sentence}`;
  return ['Dear Hiring Team,', ...body, 'Sincerely,\nJordan Example'].join('\n\n');
}

function letterOptions(overrides = {}) {
  return { selection: selection(), snapshot: SNAPSHOT, blocklist: parseBlocklist(BLOCKLIST), employer: 'Quillmark Digital', ...overrides };
}

function codes(result) {
  return result.errors.map((entry) => entry.code);
}

function offending(result, code) {
  return result.errors.filter((entry) => entry.code === code).map((entry) => entry.offending);
}

function warned(result, code) {
  return result.warnings.filter((entry) => entry.code === code).map((entry) => entry.offending);
}

const RESUME = [
  'Jordan Example',
  'Senior Salesforce Engineer | Platform Architecture and AI-Assisted Development',
  'Salesforce engineer who builds CI/CD pipelines and AI-assisted tooling, and who ran Service Cloud for 350+ support staff.',
  'Quillmark Digital, Senior Solution Consultant, Apr 2026 to present',
  'Built a Claude Code plugin toolkit for Salesforce delivery, with guardrails, deployment tooling and session handoffs'
].join('\n');

const evidence = () => selectedEvidenceTexts(selection(), SNAPSHOT);
const allow = () => groundingAllowList(SNAPSHOT, POSTING);

// ---------- the module ----------

test('index exports every validator as a function', () => {
  for (const name of ['validateSelection', 'validateLetter', 'validateResume', 'checkGrounding', 'parseBlocklist']) {
    assert.equal(typeof tailor[name], 'function', name);
  }
});

test('every result has the contract shape', () => {
  const results = [
    validateSelection(selection(), SNAPSHOT, { mode: 'owner' }),
    validateLetter(LETTER, letterOptions()),
    validateResume(RESUME, { selection: selection(), snapshot: SNAPSHOT }),
    checkGrounding(LETTER, evidence(), { allow: allow() }),
    parseBlocklist(BLOCKLIST)
  ];
  for (const result of results) {
    assert.equal(typeof result.ok, 'boolean');
    for (const entry of [...result.errors, ...result.warnings]) {
      assert.deepEqual(Object.keys(entry).sort(), ['code', 'message', 'offending']);
      assert.equal(typeof entry.offending, 'string');
    }
  }
});

// ---------- selection ----------

test('selection: a sound owner selection passes and does not block export', () => {
  const result = validateSelection(selection(), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.blocksExport, false);
  assert.deepEqual(result.selection, selection());
});

test('selection: the JSON text straight from the model is parsed', () => {
  assert.equal(validateSelection(JSON.stringify(selection()), SNAPSHOT, { mode: 'owner' }).ok, true);
});

test('selection: text that is not JSON fails with the text', () => {
  const result = validateSelection('Here is the selection: {"title_family"', SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(codes(result), ['selection.json']);
  assert.match(offending(result, 'selection.json')[0], /Here is the selection/);
  assert.equal(result.blocksExport, true);
});

test('selection: a mode other than visitor or owner fails closed', () => {
  assert.deepEqual(offending(validateSelection(selection(), SNAPSHOT, {}), 'selection.mode'), ['undefined']);
  assert.deepEqual(offending(validateSelection(selection(), SNAPSHOT, { mode: 'admin' }), 'selection.mode'), ['admin']);
});

test('selection: a missing field, a field of the wrong type and an unknown field each fail', () => {
  const missing = selection();
  delete missing.skill_ids;
  assert.deepEqual(offending(validateSelection(missing, SNAPSHOT, { mode: 'owner' }), 'selection.schema'), ['skill_ids']);
  assert.deepEqual(offending(validateSelection(selection({ headline_id: 7 }), SNAPSHOT, { mode: 'owner' }), 'selection.schema'), ['7']);
  assert.deepEqual(offending(validateSelection(selection({ commentary: 'hi' }), SNAPSHOT, { mode: 'owner' }), 'selection.schema'), ['commentary']);
});

test('selection: nested requirement and role entries are typed', () => {
  const requirement = selection({ top_requirements: [...selection().top_requirements.slice(0, 3), { requirement: 'x', match: 'gap', evidence_ids: 'none', note: '' }] });
  assert.deepEqual(offending(validateSelection(requirement, SNAPSHOT, { mode: 'owner' }), 'selection.schema'), ['"none"']);
  const role = withRole('role-fenwick', { include: 'no' });
  assert.deepEqual(offending(validateSelection(role, SNAPSHOT, { mode: 'owner' }), 'selection.schema'), ['"no"']);
  const list = selection({ skill_ids: ['skill-git', 3] });
  assert.deepEqual(offending(validateSelection(list, SNAPSHOT, { mode: 'owner' }), 'selection.schema'), ['3']);
});

test('selection: title_family must be engineer, architect, consultant or admin', () => {
  assert.equal(validateSelection(selection({ title_family: 'architect' }), SNAPSHOT, { mode: 'owner' }).ok, true);
  assert.deepEqual(offending(validateSelection(selection({ title_family: 'wizard' }), SNAPSHOT, { mode: 'owner' }), 'selection.title_family'), ['wizard']);
});

test('selection: an id the snapshot does not hold fails with the id', () => {
  const result = validateSelection(selection({ skill_ids: ['skill-git', 'skill-made-up'] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(result, 'selection.unknown_id'), ['skill-made-up']);
});

test('selection: an id in the wrong slot fails with the id', () => {
  const headline = validateSelection(selection({ headline_id: 'summary-engineer' }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(headline, 'selection.wrong_type'), ['summary-engineer']);
  const skill = validateSelection(selection({ skill_ids: ['proj-action'] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(skill, 'selection.wrong_type'), ['proj-action']);
  const project = validateSelection(selection({ project_ids: ['skill-git'] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(project, 'selection.wrong_type'), ['skill-git']);
});

test('selection: a bullet under a role it does not belong to fails with the id', () => {
  const result = validateSelection(withRole('role-tallowmere', { bullet_ids: ['t-service', 'q-greenfield'] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(result, 'selection.wrong_role'), ['q-greenfield']);
});

test('selection: a role the snapshot does not hold fails', () => {
  const base = selection();
  const result = validateSelection({ ...base, roles: [...base.roles, { role_id: 'role-ghost', include: false, bullet_ids: [] }] }, SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(result, 'selection.unknown_role'), ['role-ghost']);
});

test('selection: the current role carries 4 to 6 bullets', () => {
  assert.equal(validateSelection(withRole('role-quillmark', { bullet_ids: ['q-toolkit', 'q-release', 'q-migration', 'q-omnistudio', 'q-greenfield', 'q-recover'] }), SNAPSHOT, { mode: 'owner' }).ok, true);
  const three = validateSelection(withRole('role-quillmark', { bullet_ids: ['q-toolkit', 'q-release', 'q-migration'] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(three, 'selection.bullet_count'), ['role-quillmark: 3']);
  const seven = validateSelection(withRole('role-quillmark', { bullet_ids: ['q-toolkit', 'q-release', 'q-migration', 'q-omnistudio', 'q-greenfield', 'q-recover', 'q-standards'] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(seven, 'selection.bullet_count'), ['role-quillmark: 7']);
  const omitted = validateSelection(withRole('role-quillmark', { include: false, bullet_ids: [] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(omitted, 'selection.current_role_omitted'), ['role-quillmark']);
});

test('selection: an older role carries 0 to 3 bullets', () => {
  assert.equal(validateSelection(withRole('role-tallowmere', { bullet_ids: ['t-service', 't-experience', 't-automate'] }), SNAPSHOT, { mode: 'owner' }).ok, true);
  const four = validateSelection(withRole('role-tallowmere', { bullet_ids: ['t-service', 't-experience', 't-automate', 't-training'] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(four, 'selection.bullet_count'), ['role-tallowmere: 4']);
});

test('selection: an omitted role with bullets fails', () => {
  const result = validateSelection(withRole('role-fenwick', { include: false, bullet_ids: ['f-maps'] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(result, 'selection.omitted_role_bullets'), ['role-fenwick']);
});

test('selection: projects number 0 to 3', () => {
  const none = selection({ project_ids: [] });
  none.top_requirements = none.top_requirements.map((entry) => ({ ...entry, evidence_ids: entry.evidence_ids.filter((id) => !id.startsWith('proj-')) }));
  assert.equal(validateSelection(none, SNAPSHOT, { mode: 'owner' }).errors.length, 0);
  const four = validateSelection(selection({ project_ids: ['proj-portfolio', 'proj-resume', 'proj-action', 'proj-api'] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(four, 'selection.project_count'), ['4']);
});

test('selection: match is strong, partial or gap', () => {
  const base = selection();
  const bad = { ...base, top_requirements: [{ ...base.top_requirements[0], match: 'excellent' }, ...base.top_requirements.slice(1)] };
  assert.deepEqual(offending(validateSelection(bad, SNAPSHOT, { mode: 'owner' }), 'selection.match'), ['excellent']);
});

test('selection: a gap names no evidence, and a strong or partial match names some', () => {
  const base = selection();
  const gap = { ...base, top_requirements: [...base.top_requirements.slice(0, 3), { requirement: "Bachelor's degree", match: 'gap', evidence_ids: ['q-greenfield'], note: '' }] };
  assert.deepEqual(offending(validateSelection(gap, SNAPSHOT, { mode: 'owner' }), 'selection.gap_evidence'), ['q-greenfield']);
  const strong = { ...base, top_requirements: [{ requirement: 'AI-assisted coding tools', match: 'strong', evidence_ids: [], note: '' }, ...base.top_requirements.slice(1)] };
  assert.deepEqual(offending(validateSelection(strong, SNAPSHOT, { mode: 'owner' }), 'selection.missing_evidence'), ['AI-assisted coding tools']);
  const partial = { ...base, top_requirements: [...base.top_requirements.slice(0, 2), { requirement: 'Integration', match: 'partial', evidence_ids: [], note: '' }, base.top_requirements[3]] };
  assert.deepEqual(offending(validateSelection(partial, SNAPSHOT, { mode: 'owner' }), 'selection.missing_evidence'), ['Integration']);
});

test('selection: evidence ids must exist in the snapshot', () => {
  const base = selection();
  const bad = { ...base, top_requirements: [{ ...base.top_requirements[0], evidence_ids: ['q-invented'] }, ...base.top_requirements.slice(1)] };
  assert.deepEqual(offending(validateSelection(bad, SNAPSHOT, { mode: 'owner' }), 'selection.unknown_id'), ['q-invented']);
});

test('selection: evidence that is not on the resume is a warning', () => {
  const base = selection();
  const loose = { ...base, top_requirements: [{ ...base.top_requirements[0], evidence_ids: ['q-toolkit', 'q-greenfield'] }, ...base.top_requirements.slice(1)] };
  const result = validateSelection(loose, SNAPSHOT, { mode: 'owner' });
  assert.equal(result.ok, true);
  assert.deepEqual(warned(result, 'selection.evidence_not_selected'), ['q-greenfield']);
});

test('selection: top_requirements holds 3 to 5 entries', () => {
  const base = selection();
  assert.deepEqual(offending(validateSelection({ ...base, top_requirements: base.top_requirements.slice(0, 2) }, SNAPSHOT, { mode: 'owner' }), 'selection.requirement_count'), ['2']);
  const six = [...base.top_requirements, { requirement: 'Git', match: 'strong', evidence_ids: ['skill-git'], note: '' }, { requirement: 'SOQL', match: 'gap', evidence_ids: [], note: '' }];
  assert.deepEqual(offending(validateSelection({ ...base, top_requirements: six }, SNAPSHOT, { mode: 'owner' }), 'selection.requirement_count'), ['6']);
});

test('selection: an id selected twice fails', () => {
  const result = validateSelection(selection({ skill_ids: ['skill-git', 'skill-git', 'skill-claude', 'skill-actions'] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(result, 'selection.duplicate_id'), ['skill-git']);
});

test('selection: owner mode reports an unverified item as a warning that blocks export', () => {
  const result = validateSelection(withRole('role-quillmark', { bullet_ids: ['q-toolkit', 'q-release', 'q-migration', 'q-standards'] }), SNAPSHOT, { mode: 'owner' });
  assert.equal(result.ok, true);
  assert.equal(result.blocksExport, true);
  assert.deepEqual(warned(result, 'selection.unverified'), ['q-standards']);
});

test('selection: owner mode accepts a private item, visitor mode refuses it', () => {
  const privateItem = { id: 'q-synthetic-private', type: 'bullet', roleId: 'role-quillmark', text: 'Synthetic private bullet for this test only', tags: [], priority: 1, verified: true, visibility: 'private' };
  const snapshot = { ...SNAPSHOT, items: [...SNAPSHOT.items, privateItem] };
  const chosen = withRole('role-quillmark', { bullet_ids: ['q-toolkit', 'q-release', 'q-migration', 'q-synthetic-private'] });
  assert.equal(validateSelection(chosen, snapshot, { mode: 'owner' }).ok, true);
  assert.deepEqual(offending(validateSelection(chosen, snapshot, { mode: 'visitor' }), 'selection.visitor_private'), ['q-synthetic-private']);
});

test('selection: visitor mode refuses an unverified item', () => {
  const result = validateSelection(withRole('role-quillmark', { bullet_ids: ['q-toolkit', 'q-release', 'q-migration', 'q-standards'] }), SNAPSHOT, { mode: 'visitor' });
  assert.equal(result.ok, false);
  assert.deepEqual(offending(result, 'selection.visitor_unverified'), ['q-standards']);
  assert.equal(result.selection, null);
});

test('selection: visitor mode strips partial matches, gaps, hard filter flags and missing evidence suggestions', () => {
  const result = validateSelection(selection(), SNAPSHOT, { mode: 'visitor' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.selection.top_requirements.map((entry) => entry.match), ['strong', 'strong']);
  assert.deepEqual(result.selection.hard_filter_flags, []);
  assert.deepEqual(result.selection.missing_evidence_suggestions, []);
  assert.deepEqual(warned(result, 'selection.visitor_stripped'), ['REST and event-driven integration', "Bachelor's degree", "Bachelor's degree required", 'An event-driven integration example']);
});

test('selection: a snapshot with no items fails closed', () => {
  assert.deepEqual(codes(validateSelection(selection(), {}, { mode: 'owner' })), ['selection.snapshot']);
});

// ---------- cover letter ----------

test('letter: the sound letter passes with five paragraphs inside the word range', () => {
  const result = validateLetter(LETTER, letterOptions());
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(result.paragraphCount, 5);
  assert.ok(result.wordCount >= 300 && result.wordCount <= 400, `${result.wordCount} words`);
});

test('letter: an em dash fails with the text around it', () => {
  const result = validateLetter(letterWith(1, 'It worked \u2014 every time.'), letterOptions());
  assert.match(offending(result, 'letter.em_dash')[0], /It worked \u2014 every time/);
});

test('letter: an en dash used as a dash fails, an en dash in a range of numbers passes', () => {
  const dash = validateLetter(letterWith(1, 'It worked \u2013 every time.'), letterOptions());
  assert.match(offending(dash, 'letter.en_dash')[0], /It worked \u2013 every time/);
  const range = validateLetter(letterWith(1, 'That ran 2021\u20132025.'), letterOptions());
  assert.deepEqual(offending(range, 'letter.en_dash'), []);
});

test('letter: a semicolon fails with the text around it', () => {
  const result = validateLetter(letterWith(2, 'It shipped; it held.'), letterOptions());
  assert.match(offending(result, 'letter.semicolon')[0], /It shipped; it held/);
});

test('letter: every banned phrase fails with the phrase, whatever its case', () => {
  for (const phrase of BANNED_PHRASES) {
    const result = validateLetter(letterWith(3, `${phrase.toUpperCase()} this team.`), letterOptions());
    const found = offending(result, 'letter.banned_phrase');
    assert.equal(found.length, 1, phrase);
    assert.ok(found[0].toLowerCase().includes(phrase.toLowerCase()), phrase);
  }
});

test('letter: a curly apostrophe does not hide "I\u2019m confident that"', () => {
  const result = validateLetter(letterWith(3, 'I\u2019m confident that it helps.'), letterOptions());
  assert.match(offending(result, 'letter.banned_phrase')[0], /I\u2019m confident that/);
});

test('letter: "leverage" as a verb fails, as a noun passes', () => {
  for (const sentence of ['I leverage tools daily.', 'We will leverage the pipeline.', 'Leverage helps.', 'I leveraged it.', 'It leverages Git.', 'By leveraging Git it ships.']) {
    const result = validateLetter(letterWith(3, sentence), letterOptions());
    assert.equal(offending(result, 'letter.banned_phrase').length, 1, sentence);
    assert.match(offending(result, 'letter.banned_phrase')[0], /leverag/i, sentence);
  }
  for (const sentence of ['That gave us real leverage in planning.', 'It adds more leverage over time.', 'The leverage came later.']) {
    assert.deepEqual(offending(validateLetter(letterWith(3, sentence), letterOptions()), 'letter.banned_phrase'), [], sentence);
  }
});

test('letter: distressed, troubled and failing each fail', () => {
  for (const word of ['distressed', 'Troubled', 'FAILING']) {
    const result = validateLetter(letterWith(3, `I joined a ${word} program.`), letterOptions());
    assert.match(offending(result, 'letter.banned_word')[0], new RegExp(word));
  }
});

test('letter: fewer than 300 words fails with the count', () => {
  const short = ['Dear Hiring Team,', ...BODY.map((paragraph) => paragraph.split(' ').slice(0, 40).join(' ')), 'Sincerely,\nJordan Example'].join('\n\n');
  const result = validateLetter(short, letterOptions());
  assert.deepEqual(offending(result, 'letter.word_count'), ['200 words']);
});

test('letter: more than 400 words fails with the count', () => {
  const long = letterWith(2, 'Every change ran through review and every review left a written record for the next person to read. '.repeat(5));
  const result = validateLetter(long, letterOptions());
  assert.match(offending(result, 'letter.word_count')[0], /^4\d\d words$/);
  assert.ok(Number.parseInt(offending(result, 'letter.word_count')[0], 10) > 400);
});

test('letter: four or six paragraphs fail with the count', () => {
  const four = ['Dear Hiring Team,', BODY[0], BODY[1], `${BODY[2]} ${BODY[3]}`, BODY[4], 'Sincerely,\nJordan Example'].join('\n\n');
  assert.deepEqual(offending(validateLetter(four, letterOptions()), 'letter.paragraph_count'), ['4 paragraphs']);
  const split = BODY[3].split('. ');
  const six = ['Dear Hiring Team,', BODY[0], BODY[1], BODY[2], `${split.slice(0, 2).join('. ')}.`, split.slice(2).join('. '), BODY[4], 'Sincerely,\nJordan Example'].join('\n\n');
  assert.deepEqual(offending(validateLetter(six, letterOptions()), 'letter.paragraph_count'), ['6 paragraphs']);
});

test('letter: the greeting and sign off are not counted, with or without them the body is five paragraphs', () => {
  assert.equal(validateLetter(BODY.join('\n\n'), letterOptions()).paragraphCount, 5);
  assert.equal(validateLetter(LETTER, letterOptions()).paragraphCount, 5);
});

test('letter: a blocklisted term fails as a whole word in any case, and reports the letter text', () => {
  const result = validateLetter(letterWith(3, 'I worked with ZZClientOne and zz  client three.'), letterOptions());
  assert.deepEqual(offending(result, 'letter.blocklisted'), ['ZZClientOne', 'zz  client three']);
  const inside = validateLetter(letterWith(3, 'The zzclientonex tool shipped.'), letterOptions());
  assert.deepEqual(offending(inside, 'letter.blocklisted'), []);
});

test('letter: the blocklist may be the raw secret, a term list or a parsed result', () => {
  for (const blocklist of [BLOCKLIST, ['zzclientone'], parseBlocklist(BLOCKLIST)]) {
    assert.deepEqual(offending(validateLetter(letterWith(3, 'See zzclientone.'), letterOptions({ blocklist })), 'letter.blocklisted'), ['zzclientone']);
  }
});

test('letter: an empty blocklist is an error, never a silent pass', () => {
  for (const blocklist of [undefined, '', [], parseBlocklist(' , \n ')]) {
    assert.ok(codes(validateLetter(LETTER, letterOptions({ blocklist }))).includes('blocklist.empty'));
  }
});

test('letter: the current employer must appear', () => {
  const missing = validateLetter(LETTER.replaceAll('Quillmark Digital', 'my company'), letterOptions());
  assert.deepEqual(offending(missing, 'letter.employer_missing'), ['Quillmark Digital']);
  const fromSnapshot = validateLetter(LETTER, letterOptions({ employer: undefined }));
  assert.deepEqual(offending(fromSnapshot, 'letter.employer_missing'), []);
  const unknown = validateLetter(LETTER, letterOptions({ employer: undefined, snapshot: { items: [] } }));
  assert.ok(codes(unknown).includes('letter.employer_unknown'));
});

test('letter: every [VERIFY] marker is listed', () => {
  const result = validateLetter(letterWith(3, 'It cut onboarding time [VERIFY: by how much] and [VERIFY reviewers.'), letterOptions());
  assert.equal(result.ok, true);
  assert.deepEqual(result.verifyItems, ['[VERIFY: by how much]', '[VERIFY reviewers.']);
  assert.deepEqual(warned(result, 'letter.verify'), result.verifyItems);
  assert.deepEqual(validateLetter(LETTER, letterOptions()).verifyItems, []);
});

test('letter: fewer than three requirements with evidence is a warning, not an error', () => {
  const base = selection();
  const thin = { ...base, top_requirements: [base.top_requirements[0], { requirement: 'Event bus', match: 'gap', evidence_ids: [], note: '' }, base.top_requirements[3]] };
  const result = validateLetter(LETTER, letterOptions({ selection: thin }));
  assert.equal(result.ok, true);
  assert.deepEqual(warned(result, 'letter.thin_evidence'), ['1 with evidence']);
  assert.deepEqual(warned(validateLetter(LETTER, letterOptions()), 'letter.thin_evidence'), []);
});

test('letter: a missing selection fails', () => {
  assert.ok(codes(validateLetter(LETTER, letterOptions({ selection: undefined }))).includes('letter.selection_missing'));
});

test('letter: a spaced hyphen standing in for a dash is a warning', () => {
  const result = validateLetter(letterWith(1, 'It worked - every time.'), letterOptions());
  assert.match(warned(result, 'letter.spaced_hyphen')[0], /It worked - every time/);
  assert.deepEqual(warned(validateLetter(LETTER, letterOptions()), 'letter.spaced_hyphen'), []);
});

test('letter: an empty letter fails', () => {
  assert.deepEqual(codes(validateLetter('  ', letterOptions())), ['letter.empty']);
});

// ---------- resume ----------

test('resume: a sound resume passes and does not block export', () => {
  const result = validateResume(RESUME, { selection: selection(), snapshot: SNAPSHOT });
  assert.deepEqual(result.errors, []);
  assert.equal(result.blocksExport, false);
});

test('resume: an em dash or a semicolon fails with the text around it', () => {
  const dash = validateResume(`${RESUME}\nLead \u2014 release`, { selection: selection(), snapshot: SNAPSHOT });
  assert.match(offending(dash, 'resume.em_dash')[0], /Lead \u2014 release/);
  const semicolon = validateResume(`${RESUME}\nGit; SOQL`, { selection: selection(), snapshot: SNAPSHOT });
  assert.match(offending(semicolon, 'resume.semicolon')[0], /Git; SOQL/);
});

test('resume: a summary number no selected bullet states fails with the number', () => {
  const result = validateResume(RESUME, { selection: selection({ summary_id: 'summary-unbacked' }), snapshot: SNAPSHOT });
  assert.deepEqual(codes(result), ['resume.summary_number', 'resume.summary_number']);
  assert.match(result.errors[0].message, /"500\+"/);
  assert.match(result.errors[1].message, /"12"/);
  assert.equal(result.blocksExport, true);
});

test('resume: a summary number backed only by an omitted bullet fails', () => {
  const result = validateResume(RESUME, { selection: withRole('role-tallowmere', { bullet_ids: ['t-automate'] }), snapshot: SNAPSHOT });
  assert.match(result.errors[0].message, /"350\+"/);
});

test('resume: a summary number written as a word is backed by the digits in a bullet', () => {
  const snapshot = { ...SNAPSHOT, items: SNAPSHOT.items.map((item) => (item.id === 'summary-engineer' ? { ...item, text: 'Engineer who coached two new developers.' } : item)) };
  const result = validateResume(RESUME, { selection: withRole('role-tallowmere', { bullet_ids: ['t-training'] }), snapshot });
  assert.deepEqual(result.errors, []);
});

test('resume: an unverified selected item blocks export', () => {
  const result = validateResume(RESUME, { selection: withRole('role-quillmark', { bullet_ids: ['q-toolkit', 'q-release', 'q-migration', 'q-standards'] }), snapshot: SNAPSHOT });
  assert.equal(result.ok, true);
  assert.equal(result.blocksExport, true);
  assert.deepEqual(warned(result, 'resume.unverified'), ['q-standards']);
});

test('resume: an id the snapshot does not hold fails', () => {
  const result = validateResume(RESUME, { selection: selection({ skill_ids: ['skill-ghost'] }), snapshot: SNAPSHOT });
  assert.deepEqual(offending(result, 'resume.unknown_id'), ['skill-ghost']);
});

// ---------- grounding ----------

test('grounding: the sound letter is grounded in its evidence', () => {
  const result = checkGrounding(LETTER, evidence(), { allow: allow() });
  assert.deepEqual(result.errors, []);
  assert.ok(result.checked.numbers >= 2 && result.checked.names >= 10, JSON.stringify(result.checked));
});

test('grounding: a planted number fails with the number', () => {
  for (const [sentence, planted] of [['It served 500+ staff.', '500+'], ['It cut time by ~95%.', '~95%'], ['It reached 40,000+ members.', '40,000+'], ['It took four weeks.', 'four'], ['It ran 7 releases.', '7']]) {
    const result = checkGrounding(letterWith(3, sentence), evidence(), { allow: allow() });
    assert.deepEqual(result.errors.map((entry) => entry.code), ['grounding.number'], sentence);
    assert.match(result.errors[0].message, new RegExp(`"${planted.replace(/[+.~]/g, '\\$&')}"`), sentence);
  }
});

test('grounding: numbers match by value, so "two" is backed by "2" and "12k" by "12,000+"', () => {
  const result = checkGrounding(letterWith(3, 'I coached two developers and served 12k members.'), [...evidence(), SNAPSHOT.items.find((item) => item.id === 't-training').text, SNAPSHOT.items.find((item) => item.id === 't-experience').text], { allow: allow() });
  assert.deepEqual(result.errors.filter((entry) => entry.code === 'grounding.number'), []);
});

test('grounding: "one of" and "no one" are words, not counts', () => {
  const result = checkGrounding(letterWith(3, 'It was one of the hard parts and no one minded.'), evidence(), { allow: allow() });
  assert.deepEqual(result.errors, []);
});

test('grounding: a planted tool name fails, mid sentence and at a sentence start', () => {
  for (const [sentence, planted] of [['I also ran Kubernetes clusters.', 'Kubernetes'], ['Kubernetes ran the jobs.', 'Kubernetes'], ['I shipped it with Cursor and Codex.', 'Cursor'], ['I built Marketing Cloud journeys.', 'Marketing'], ['It ran on AWS Lambda.', 'AWS Lambda'], ['I used MuleSoft for it.', 'MuleSoft']]) {
    const result = checkGrounding(letterWith(1, sentence), evidence(), { allow: allow() });
    const names = result.errors.filter((entry) => entry.code === 'grounding.name');
    assert.ok(names.length >= 1, sentence);
    assert.match(names[0].message, new RegExp(planted), sentence);
  }
});

test('grounding: known words joined into a name they never form is a warning', () => {
  const result = checkGrounding(letterWith(1, 'I built Salesforce Experience Cloud portals.'), evidence(), { allow: allow() });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings.map((entry) => entry.offending), ['Salesforce Experience Cloud']);
});

test('grounding: the candidate, the employer and the posting company and title are always grounded', () => {
  const sentence = 'Jordan Example wants the Senior Salesforce Engineer role at Lumenfold Search.';
  assert.deepEqual(checkGrounding(letterWith(4, sentence), evidence(), { allow: allow() }).errors, []);
  const without = checkGrounding(letterWith(4, sentence), evidence());
  assert.ok(without.errors.some((entry) => entry.offending === 'Lumenfold Search'));
});

test('grounding: text inside a [VERIFY] marker is left to the owner', () => {
  const result = checkGrounding(letterWith(3, 'It cut onboarding [VERIFY: 50% with Jira].'), evidence(), { allow: allow() });
  assert.deepEqual(result.errors, []);
});

test('grounding: no evidence fails closed', () => {
  assert.deepEqual(checkGrounding(LETTER, []).errors.map((entry) => entry.code), ['grounding.no_evidence']);
});

test('grounding: findNumbers reads the forms the brief names', () => {
  assert.deepEqual(findNumbers('400+ staff, 10,000+ users, ~90% faster, two teams, 10k rows, S3 and B2B').map((entry) => [entry.text, entry.value]), [
    ['400+', 400],
    ['10,000+', 10000],
    ['~90%', 90],
    ['two', 2],
    ['10k', 10000]
  ]);
});

test('grounding: the evidence is the text of every selected item and every included role', () => {
  const texts = evidence();
  assert.ok(texts.includes(SNAPSHOT.items.find((item) => item.id === 'q-toolkit').text));
  assert.ok(texts.some((text) => text.startsWith('Tallowmere Systems Application Administrator 2021-01')));
  assert.ok(!texts.some((text) => text.includes('Fenwick')));
  assert.ok(!texts.includes(SNAPSHOT.items.find((item) => item.id === 'q-greenfield').text));
});

// ---------- blocklist ----------

test('blocklist: comma or newline separated, trimmed, empty dropped', () => {
  const result = parseBlocklist(' zzclientone ,zzclienttwo\n\n zz client three ,, \r\nzzclientfour');
  assert.equal(result.ok, true);
  assert.deepEqual(result.terms.map((term) => term.trim()), ['zzclientone', 'zzclienttwo', 'zz client three', 'zzclientfour']);
});

test('blocklist: an empty or missing list is an error result', () => {
  for (const raw of [undefined, null, '', ' , \n ']) {
    const result = parseBlocklist(raw);
    assert.equal(result.ok, false);
    assert.deepEqual(codes(result), ['blocklist.empty']);
    assert.deepEqual(result.terms, []);
  }
});

test('blocklist: terms under three characters are dropped as the leak scan drops them, and counted, never named', () => {
  const result = parseBlocklist('zz,zzclientone,q');
  assert.deepEqual(result.terms, ['zzclientone']);
  assert.deepEqual(warned(result, 'blocklist.short_term'), ['2 dropped']);
});

// ---------- invisible characters and look alike letters ----------

const SHY = String.fromCharCode(0xad);
const ZWSP = String.fromCharCode(0x200b);
const RLO = String.fromCharCode(0x202e);
const CYRILLIC_O = String.fromCharCode(0x043e);

test('letter: a soft hyphen inside a blocklisted term does not hide it', () => {
  const result = validateLetter(letterWith(3, `I worked with zzclient${SHY}one last year.`), letterOptions());
  assert.equal(result.ok, false);
  assert.deepEqual(offending(result, 'letter.blocklisted'), [`zzclient${SHY}one`]);
});

test('letter: zero width characters do not hide a banned phrase, a client word or a semicolon', () => {
  const phrase = validateLetter(letterWith(3, `I am pass${ZWSP}ionate about it.`), letterOptions());
  assert.equal(offending(phrase, 'letter.banned_phrase').length, 1);
  const word = validateLetter(letterWith(3, `It was a trou${String.fromCharCode(0x2060)}bled program.`), letterOptions());
  assert.equal(offending(word, 'letter.banned_word').length, 1);
  const fullwidth = validateLetter(letterWith(3, `It shipped${String.fromCharCode(0xff1b)} it held.`), letterOptions());
  assert.equal(offending(fullwidth, 'letter.semicolon').length, 1);
});

test('letter: an employer name split by an invisible character still counts as present', () => {
  const result = validateLetter(LETTER.replace('Quillmark Digital', `Quill${ZWSP}mark Digital`), letterOptions());
  assert.deepEqual(offending(result, 'letter.employer_missing'), []);
});

test('letter: any invisible character is its own error naming the code point', () => {
  const result = validateLetter(letterWith(3, `It ran${SHY} well${ZWSP} and ${RLO}here.`), letterOptions());
  assert.deepEqual(result.errors.filter((entry) => entry.code === 'letter.invisible').map((entry) => entry.message.match(/U\+[0-9A-F]{4}/)[0]), ['U+00AD', 'U+200B', 'U+202E']);
  assert.deepEqual(codes(validateLetter(LETTER, letterOptions())), []);
});

test('letter: a Cyrillic look alike letter does not hide a blocklisted term, and a mixed script word fails', () => {
  const result = validateLetter(letterWith(3, `I worked with zzclient${CYRILLIC_O}ne last year.`), letterOptions());
  assert.deepEqual(offending(result, 'letter.blocklisted'), [`zzclient${CYRILLIC_O}ne`]);
  assert.deepEqual(offending(result, 'letter.mixed_script'), [`zzclient${CYRILLIC_O}ne`]);
  const greek = validateLetter(letterWith(3, `See zzclientt${String.fromCharCode(0x03bf)}ne.`), letterOptions());
  assert.equal(offending(greek, 'letter.mixed_script').length, 1);
});

test('resume: an invisible character is an error and does not hide a semicolon', () => {
  const result = validateResume(`${RESUME}\nGit${ZWSP}${String.fromCharCode(0xff1b)} SOQL`, { selection: selection(), snapshot: SNAPSHOT });
  assert.ok(codes(result).includes('resume.invisible'));
  assert.equal(offending(result, 'resume.semicolon').length, 1);
});

test('blocklist: terms are normalised, so an invisible character in the secret does not split a term', () => {
  assert.deepEqual(parseBlocklist(`zz${ZWSP}clientone`).terms, ['zzclientone']);
  assert.deepEqual(parseBlocklist(`\uff5a\uff5aclientone`).terms, ['zzclientone']);
});

// ---------- a fenced selection ----------

test('selection: one fenced block holding the whole output is accepted with a warning', () => {
  for (const fenced of ['```json\n' + JSON.stringify(selection(), null, 2) + '\n```', '\n  ```\n' + JSON.stringify(selection()) + '\n```  \n', '```JSON\n' + JSON.stringify(selection()) + '```']) {
    const result = validateSelection(fenced, SNAPSHOT, { mode: 'owner' });
    assert.deepEqual(result.errors, []);
    assert.equal(warned(result, 'selection.fenced').length, 1);
  }
  assert.deepEqual(warned(validateSelection(JSON.stringify(selection()), SNAPSHOT, { mode: 'owner' }), 'selection.fenced'), []);
});

test('selection: text around a fenced block, or two blocks, still fails as invalid JSON', () => {
  const body = JSON.stringify(selection());
  for (const text of ['Here you go:\n```json\n' + body + '\n```', '```json\n' + body + '\n```\nHope that helps.', '```json\n' + body + '\n```\n```json\n{}\n```']) {
    assert.deepEqual(codes(validateSelection(text, SNAPSHOT, { mode: 'owner' })), ['selection.json'], text.slice(0, 20));
  }
});

// ---------- letter mode ----------

test('letter: visitor mode refuses a [VERIFY] marker, owner mode lists it', () => {
  const text = letterWith(3, 'It cut onboarding time [VERIFY: by how much].');
  const visitor = validateLetter(text, letterOptions({ mode: 'visitor' }));
  assert.equal(visitor.ok, false);
  assert.deepEqual(offending(visitor, 'letter.visitor_verify'), ['[VERIFY: by how much]']);
  const owner = validateLetter(text, letterOptions({ mode: 'owner' }));
  assert.equal(owner.ok, true);
  assert.deepEqual(warned(owner, 'letter.verify'), ['[VERIFY: by how much]']);
  assert.equal(validateLetter(text, letterOptions()).ok, true, 'owner is the default');
  assert.equal(validateLetter(LETTER, letterOptions({ mode: 'visitor' })).ok, true);
});

test('letter: a mode other than visitor or owner fails closed', () => {
  assert.deepEqual(offending(validateLetter(LETTER, letterOptions({ mode: 'admin' })), 'letter.mode'), ['admin']);
});

// ---------- the current role ----------

const FREELANCE_ROLE = { id: 'role-freelance', employer: 'Ostwick Freelance', title: 'Independent Consultant', start: '2024-01', end: null, current: true };
const FREELANCE_BULLETS = ['fr-one', 'fr-two', 'fr-three', 'fr-four'].map((id, position) => ({ id, type: 'bullet', roleId: 'role-freelance', text: `Freelance bullet ${position + 1}`, tags: [], priority: 2, verified: true, visibility: 'public' }));
const TWO_CURRENT = { ...SNAPSHOT, roles: [...SNAPSHOT.roles, FREELANCE_ROLE], items: [...SNAPSHOT.items, ...FREELANCE_BULLETS] };

function withFreelance(bulletIds) {
  const base = selection();
  return { ...base, roles: [...base.roles, { role_id: 'role-freelance', include: bulletIds.length > 0, bullet_ids: bulletIds }] };
}

test('current role: with two current roles, only the one at owner.currentEmployer carries 4 to 6 bullets', () => {
  for (const count of [0, 1, 3]) {
    const result = validateSelection(withFreelance(FREELANCE_BULLETS.slice(0, count).map((item) => item.id)), TWO_CURRENT, { mode: 'owner' });
    assert.deepEqual(result.errors, [], `${count} freelance bullets`);
  }
  const four = validateSelection(withFreelance(FREELANCE_BULLETS.map((item) => item.id)), TWO_CURRENT, { mode: 'owner' });
  assert.deepEqual(offending(four, 'selection.bullet_count'), ['role-freelance: 4']);
  const primaryThree = validateSelection({ ...withFreelance([]), roles: withFreelance([]).roles.map((role) => (role.role_id === 'role-quillmark' ? { ...role, bullet_ids: role.bullet_ids.slice(0, 3) } : role)) }, TWO_CURRENT, { mode: 'owner' });
  assert.deepEqual(offending(primaryThree, 'selection.bullet_count'), ['role-quillmark: 3']);
});

test('current role: a snapshot with no owner.currentEmployer fails closed', () => {
  const snapshot = { ...SNAPSHOT, owner: { name: 'Jordan Example' } };
  assert.deepEqual(codes(validateSelection(selection(), snapshot, { mode: 'owner' })), ['selection.no_current_employer']);
});

test('current role: a snapshot with no current role at owner.currentEmployer fails closed', () => {
  const snapshot = { ...SNAPSHOT, roles: SNAPSHOT.roles.map((role) => ({ ...role, current: false })) };
  const result = validateSelection(selection(), snapshot, { mode: 'owner' });
  assert.deepEqual(codes(result), ['selection.no_current_role']);
  assert.equal(result.errors[0].offending, 'Quillmark Digital');
  const elsewhere = { ...SNAPSHOT, owner: { ...SNAPSHOT.owner, currentEmployer: 'Ostwick Freelance' } };
  assert.deepEqual(codes(validateSelection(selection(), elsewhere, { mode: 'owner' })), ['selection.no_current_role']);
});

test('current role: a snapshot with two current roles at owner.currentEmployer fails closed', () => {
  const snapshot = { ...TWO_CURRENT, roles: TWO_CURRENT.roles.map((role) => (role.id === 'role-freelance' ? { ...role, employer: 'Quillmark Digital' } : role)) };
  const result = validateSelection(selection(), snapshot, { mode: 'owner' });
  assert.deepEqual(codes(result), ['selection.many_current_roles']);
  assert.equal(result.errors[0].offending, 'role-quillmark, role-freelance');
});

test('current role: a selection that omits the current role, or leaves it out of roles, fails with its own code', () => {
  const omitted = validateSelection(withRole('role-quillmark', { include: false, bullet_ids: [] }), SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(omitted, 'selection.current_role_omitted'), ['role-quillmark']);
  const base = selection();
  const absent = validateSelection({ ...base, roles: base.roles.filter((role) => role.role_id !== 'role-quillmark') }, SNAPSHOT, { mode: 'owner' });
  assert.deepEqual(offending(absent, 'selection.current_role_omitted'), ['role-quillmark']);
  assert.deepEqual(offending(validateSelection(selection(), SNAPSHOT, { mode: 'owner' }), 'selection.current_role_omitted'), []);
});

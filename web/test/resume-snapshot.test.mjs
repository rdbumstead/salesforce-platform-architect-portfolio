import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SNAPSHOT_CALL,
  SNAPSHOT_FILE,
  checkSnapshot,
  exportSnapshot,
  fixtureRefusal,
  normalizeSnapshot,
  readFixtureSnapshot,
  snapshotCounts,
  writeSnapshot
} from '../build/export.mjs';
import { BUILD_ONLY_CALLS, modeOf } from '../build/calls.mjs';
import { apexAllowlist, compare } from '../build/check-export-coverage.mjs';
import { build, DIST_DIR } from '../build/build.mjs';
import { WEB_DIR } from '../build/site-plugin.mjs';
import { validateSelection } from '../functions/_lib/tailor/index.js';

const fixture = () => readFixtureSnapshot();
const copy = (value) => JSON.parse(JSON.stringify(value));

test('the fixture snapshot holds the contract, with unverified items and public items only', () => {
  const snapshot = fixture();
  assert.deepEqual(checkSnapshot(snapshot), []);
  const counts = snapshotCounts(snapshot);
  assert.ok(counts.unverified > 0, 'some items are unverified');
  for (const type of ['headline', 'summary', 'bullet', 'skill', 'project', 'certification']) {
    assert.ok(counts.byType[type] > 0, `the fixture has a ${type}`);
  }
  assert.ok(snapshot.items.every((item) => item.visibility === 'public'));
  assert.ok(snapshot.items.some((item) => item.tags.length > 1), 'tags are a list');
});

test('the check refuses each break of the contract', () => {
  const cases = [
    [(s) => (s.items[0].visibility = 'private'), 'visibility must be public'],
    [(s) => (s.items[1].id = s.items[0].id), 'repeats the id'],
    [(s) => (s.items[0].id = ''), 'has no id'],
    [(s) => (s.items[0].priority = 4), 'priority must be 1, 2 or 3'],
    [(s) => (s.items[0].priority = '2'), 'priority must be 1, 2 or 3'],
    [(s) => (s.items[0].verified = 'false'), 'verified must be true or false'],
    [(s) => (s.items[0].tags = 'ci-cd'), 'tags must be a list'],
    [(s) => (s.items[0].type = 'award'), 'type must be one of'],
    [(s) => (s.items.find((i) => i.type === 'skill').roleId = 'x'), 'not a bullet but names a role'],
    [(s) => (s.items.find((i) => i.type === 'bullet').roleId = 'nope'), 'role the snapshot does not hold'],
    [(s) => (s.items[0].titleFamily = 'engineer'), 'keys the contract does not define'],
    [(s) => (s.owner.currentEmployer = 'Somewhere Else'), "No current role has the owner's current employer"],
    [(s) => (s.version = 2), 'version must be 1'],
    [(s) => delete s.items, 'items must be a list']
  ];
  for (const [breakIt, expected] of cases) {
    const snapshot = copy(fixture());
    breakIt(snapshot);
    const problems = checkSnapshot(snapshot);
    assert.ok(problems.some((problem) => problem.includes(expected)), `${expected}: ${problems.join(' | ')}`);
  }
});

test('the export answer is put in contract order, with a missing end and role as null', () => {
  const raw = {
    version: 1,
    generatedAt: '2026-11-14T00:00:00.000Z',
    owner: { currentEmployer: 'Sample Employer', name: 'Sample Owner' },
    roles: [{ title: 'Role', id: 'r1', employer: 'Sample Employer', start: '2020-01-01', current: true }],
    items: [
      { id: 'b1', type: 'bullet', text: 'A bullet', tags: [], priority: 2, verified: false, visibility: 'public' },
      { id: 's1', type: 'skill', text: 'A skill', tags: ['backend'], priority: 1, verified: true, visibility: 'public' }
    ]
  };
  const snapshot = normalizeSnapshot(raw);
  assert.deepEqual(Object.keys(snapshot.roles[0]), ['id', 'employer', 'title', 'start', 'end', 'current']);
  assert.equal(snapshot.roles[0].end, null);
  assert.equal(snapshot.items[0].roleId, null);
  assert.ok(!('roleId' in snapshot.items[1]), 'only bullets carry roleId');
  assert.ok(checkSnapshot(snapshot).some((problem) => problem.includes('role the snapshot does not hold')));
});

function fakeConnection(status, body) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return { status, text: async () => JSON.stringify(body) };
  };
  return {
    connection: { instanceUrl: 'https://sample.invalid', token: 'not-a-token', targetOrg: 'sample', viaCli: false },
    calls,
    restore: () => (globalThis.fetch = original)
  };
}

test('the snapshot export fails the build when the call fails', async () => {
  const fake = fakeConnection(500, { error: 'CALL_FAILED', message: 'The call failed: SnapshotException' });
  try {
    await assert.rejects(exportSnapshot(fake.connection), /Export of ResumeSnapshotService\.getSnapshot .*CALL_FAILED/);
    assert.ok(fake.calls[0].includes(`call=${SNAPSHOT_CALL}`));
  } finally {
    fake.restore();
  }
});

test('the snapshot export fails the build when the answer breaks the contract', async () => {
  const broken = copy(fixture());
  broken.items[0].visibility = 'private';
  const fake = fakeConnection(200, { call: SNAPSHOT_CALL, result: broken });
  try {
    await assert.rejects(exportSnapshot(fake.connection), /does not match the contract[\s\S]*visibility must be public/);
  } finally {
    fake.restore();
  }
});

test('the snapshot export returns a checked snapshot when the answer holds', async () => {
  const fake = fakeConnection(200, { call: SNAPSHOT_CALL, result: fixture() });
  try {
    const snapshot = await exportSnapshot(fake.connection);
    assert.equal(snapshot.items.length, fixture().items.length);
  } finally {
    fake.restore();
  }
});

test('the snapshot is never written where the site is served', () => {
  const snapshot = fixture();
  assert.throws(() => writeSnapshot(snapshot, path.join(DIST_DIR, 'resume-snapshot.json')), /never written where the site is served/);
  assert.throws(() => writeSnapshot(snapshot, path.join(WEB_DIR, 'public', 'x.json')), /never written where the site is served/);
  assert.ok(SNAPSHOT_FILE.startsWith(path.join(WEB_DIR, 'functions', '_generated')));
});

test('the snapshot call is served to the build only and no page may import it', () => {
  assert.ok(apexAllowlist().has(SNAPSHOT_CALL), 'SiteExportCalls serves it');
  assert.ok(BUILD_ONLY_CALLS.has(SNAPSHOT_CALL));
  assert.equal(modeOf(SNAPSHOT_CALL), 'build');
  const base = { queries: [], planned: new Set() };
  assert.deepEqual(compare({ ...base, imported: new Set(), allowlist: new Set([SNAPSHOT_CALL]) }), []);
  assert.ok(
    compare({ ...base, imported: new Set([SNAPSHOT_CALL]), allowlist: new Set([SNAPSHOT_CALL]) }).some((problem) =>
      problem.includes('must never be imported by a public page')
    )
  );
  assert.ok(
    compare({ ...base, imported: new Set(), allowlist: new Set() }).some((problem) =>
      problem.includes('the export allowlist does not serve it')
    )
  );
});

test('a hand made selection over the fixture snapshot passes the selection validator', () => {
  const snapshot = fixture();
  const current = snapshot.roles.find((role) => role.current && role.employer === snapshot.owner.currentEmployer);
  const bullets = snapshot.items.filter((item) => item.type === 'bullet' && item.roleId === current.id).map((item) => item.id);
  const skills = snapshot.items.filter((item) => item.type === 'skill').map((item) => item.id);
  const projects = snapshot.items.filter((item) => item.type === 'project').map((item) => item.id);
  const selection = {
    title_family: 'engineer',
    top_requirements: [
      { requirement: 'Integration work', match: 'strong', evidence_ids: [bullets[0]], note: '' },
      { requirement: 'Backend code', match: 'partial', evidence_ids: [skills[0]], note: '' },
      { requirement: 'Mobile apps', match: 'gap', evidence_ids: [], note: '' }
    ],
    headline_id: 'seed-engineer-headline',
    summary_id: 'seed-engineer-summary',
    roles: snapshot.roles.map((role) => ({
      role_id: role.id,
      include: role.id === current.id,
      bullet_ids: role.id === current.id ? bullets.slice(0, 4) : []
    })),
    skill_ids: skills.slice(0, 3),
    project_ids: projects.slice(0, 2),
    hard_filter_flags: [],
    missing_evidence_suggestions: []
  };
  const owner = validateSelection(JSON.stringify(selection), snapshot, { mode: 'owner' });
  assert.deepEqual(owner.errors, []);
  assert.equal(owner.ok, true);
  assert.equal(owner.blocksExport, true, 'the unverified headline blocks the final export');
  const visitor = validateSelection(JSON.stringify(selection), snapshot, { mode: 'visitor' });
  assert.ok(visitor.errors.some((error) => error.code === 'selection.visitor_unverified'));
});

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

test('a fixture build never puts an unverified item that no page shows into dist', async () => {
  const hadSnapshot = fs.existsSync(SNAPSHOT_FILE);
  const before = hadSnapshot ? fs.readFileSync(SNAPSHOT_FILE) : null;
  try {
    await build(new Set(['--fixtures']));
    writeSnapshot(readFixtureSnapshot());
    // Headlines and summaries are on no page, so their text must appear only in the snapshot.
    const hidden = fixture().items.filter((item) => !item.verified && ['headline', 'summary'].includes(item.type));
    assert.ok(hidden.length > 0, 'the fixture has an unverified variant to look for');
    const written = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
    hidden.forEach((item) => assert.ok(written.includes(item.text), 'the search would find the text'));
    const files = filesUnder(DIST_DIR);
    assert.ok(files.length > 10, 'the build wrote the site');
    const leaks = [];
    files.forEach((file) => {
      const text = fs.readFileSync(file).toString('utf8');
      hidden.forEach((item) => {
        if (text.includes(item.text) || text.includes(item.id)) leaks.push(`${path.relative(DIST_DIR, file)}: ${item.id}`);
      });
    });
    assert.deepEqual(leaks, []);
  } finally {
    if (hadSnapshot) fs.writeFileSync(SNAPSHOT_FILE, before);
    else fs.rmSync(SNAPSHOT_FILE, { force: true });
  }
});

test('the fixture is written only from a scratch org, and never from production', () => {
  const scratch = { orgId: '00DE200000dSvkuMAC', isScratch: true, targetOrg: 'sample-scratch' };
  assert.equal(fixtureRefusal(scratch), null);
  const production = fixtureRefusal({ orgId: '00Dfj00000FSoCXEAZ', isScratch: true, targetOrg: 'sample' });
  assert.match(production, /^Refusing --write-fixture: sample is the production org/);
  assert.match(fixtureRefusal({ orgId: '00Dfj00000FSoCX', isScratch: false }), /production org/);
  assert.match(fixtureRefusal({ orgId: '00DA0000000abcd', isScratch: false, targetOrg: 'dev' }), /dev is not a scratch org/);
  assert.match(fixtureRefusal({ orgId: '00DA0000000abcd', targetOrg: 'dev' }), /not a scratch org/);
  assert.match(fixtureRefusal({ isScratch: true }), /Id of the org is unknown/);
  assert.match(fixtureRefusal(null), /unknown/);
});

test('the export command refuses --write-fixture before it reads or writes anything', async () => {
  const { spawnSync } = await import('node:child_process');
  const fixture = path.join(WEB_DIR, 'fixtures', 'resume-snapshot.json');
  const before = fs.readFileSync(fixture);
  // No org is named, so connect() refuses first. The run must end with exit 1 and leave the fixture alone.
  const run = spawnSync(process.execPath, [path.join(WEB_DIR, 'build', 'export.mjs'), '--snapshot', '--write-fixture'], {
    env: { ...process.env, SF_TARGET_ORG: '' },
    encoding: 'utf8'
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /SF_TARGET_ORG/);
  assert.deepEqual(fs.readFileSync(fixture), before);
});

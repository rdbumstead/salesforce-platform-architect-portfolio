import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recordCall, resetBudget } from '../functions/_lib/budget.js';
import { resetTokenCache } from '../functions/_lib/salesforce.js';
import { MESSAGES } from '../functions/_lib/http.js';
import { createHandler, loadSnapshot } from '../functions/api/cover-letter.js';
import { edgeTemplateLetter, LOCAL_PROVIDER, REASONS } from '../functions/_lib/tailor/edge-letter.js';
import { buildRuleSelection, viewForMode } from '../functions/_lib/tailor/select.js';
import { buildFakeSelection } from '../tailor-eval/lib/fake.mjs';
import { viewForMode as harnessView } from '../tailor-eval/lib/pipeline.mjs';

const PROD = 'https://ryanbumstead.com';
const ENV = {
  SF_INSTANCE_URL: 'https://example.my.salesforce.com',
  SF_CLIENT_ID: 'client-id-value',
  SF_CLIENT_SECRET: 'client-secret-value',
  IP_HASH_SALT: 'salt',
  SITE_DENYLIST: 'zzinventedclient'
};
const REFUSED = [{ message: 'TotalRequests Limit exceeded.', errorCode: 'REQUEST_LIMIT_EXCEEDED' }];
const readJson = (relative) => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
const FIXTURE = readJson('../fixtures/resume-snapshot.json');
const SAMPLE = readJson('../fixtures/recorded/cover-letter.json');
const POSTING = readJson('../tailor-eval/postings/posting-1-engineer.json');
const FIELDS = { companyName: POSTING.company, jobTitle: POSTING.title, jobDescription: POSTING.text };

// Planted items a visitor may never read. Each is tagged with every category and has the top
// priority, so the selection would take it first if the view let it through.
const ALL_TAGS = [...new Set(FIXTURE.items.flatMap((item) => item.tags))];
const currentRoleId = FIXTURE.roles.find((role) => role.current && role.employer === FIXTURE.owner.currentEmployer).id;
const PLANTED = [
  { id: 'planted-unverified-bullet', type: 'bullet', roleId: currentRoleId, text: 'Zebrafinch unverified bullet text that must never reach a visitor.', tags: ALL_TAGS, priority: 0, verified: false, visibility: 'public' },
  { id: 'planted-unverified-project', type: 'project', text: 'Quokkaline unverified project', value: 'Quokkaline value text that must never reach a visitor.', solution: 'Quokkaline solution text.', tags: ALL_TAGS, priority: 0, verified: false, visibility: 'public' },
  { id: 'planted-private-skill', type: 'skill', text: 'Marmotcraft', tags: ALL_TAGS, priority: 0, verified: true, visibility: 'private' }
];
const SNAPSHOT = { ...FIXTURE, items: [...FIXTURE.items, ...PLANTED] };
const NEVER = ['Zebrafinch', 'Quokkaline', 'Marmotcraft', ...FIXTURE.items.filter((item) => item.verified !== true).map((item) => item.text)];

function fakeOrg(answer) {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    const address = String(url);
    if (address.endsWith('/services/oauth2/token')) return Response.json({ access_token: 'tok', instance_url: ENV.SF_INSTANCE_URL });
    seen.push(address);
    return answer(address);
  };
  return { seen, restore: () => (globalThis.fetch = original) };
}

function post(body) {
  return new Request(`${PROD}/api/cover-letter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify(body)
  });
}

function fresh() {
  resetBudget();
  resetTokenCache();
}

async function refusedLetter({ load = async () => SNAPSHOT, env = ENV } = {}) {
  fresh();
  const org = fakeOrg(() => Response.json(REFUSED, { status: 403 }));
  try {
    const response = await createHandler({ load })({ request: post(FIELDS), env });
    return { response, body: await response.json(), seen: org.seen };
  } finally {
    org.restore();
  }
}

test('the harness and the edge use one selection and one view filter', () => {
  assert.equal(buildFakeSelection, buildRuleSelection);
  assert.equal(harnessView, viewForMode);
  const view = viewForMode(SNAPSHOT, 'visitor');
  assert.ok(view.items.every((item) => item.visibility === 'public' && item.verified === true));
  const once = buildRuleSelection({ posting: { title: POSTING.title, text: POSTING.text }, snapshot: view, categories: [{ id: ALL_TAGS[0], label: 'x', keywords: ['salesforce'] }] });
  const twice = buildRuleSelection({ posting: { title: POSTING.title, text: POSTING.text }, snapshot: view, categories: [{ id: ALL_TAGS[0], label: 'x', keywords: ['salesforce'] }] });
  assert.deepEqual(once, twice, 'the same posting and snapshot give the same selection');
});

test('the planted items would be picked first if the view let them through', () => {
  const categories = readJson('../tailor-eval/categories.json').categories;
  const owner = buildRuleSelection({ posting: { title: POSTING.title, text: POSTING.text }, snapshot: viewForMode(SNAPSHOT, 'owner'), categories });
  assert.ok(owner.project_ids.includes('planted-unverified-project'), 'the test plants an item the rules would choose');
});

test('a limit refusal answers with the template letter built from verified items only', async () => {
  const { response, body, seen } = await refusedLetter();
  assert.equal(response.status, 200);
  assert.equal(seen.length, 1, 'the org was asked once and refused');
  const letter = body.result;
  assert.equal(letter.provider, LOCAL_PROVIDER);
  assert.ok(letter.content.includes(POSTING.company));
  assert.equal(letter.content.split(/\n\s*\n/).length >= 5, true);
  for (const text of NEVER) assert.ok(!letter.content.includes(text), `"${text}" must never reach a visitor`);
  assert.equal(letter.attempts[0].provider, 'Salesforce');
  assert.equal(letter.attempts[0].outcome, 'failed');
  assert.match(letter.attempts[0].detail, new RegExp(`^${REASONS.refused}`));
  assert.equal(letter.attempts[1].provider, LOCAL_PROVIDER);
  assert.equal(letter.attempts[1].outcome, 'served');
  assert.match(letter.attempts[1].detail, /template letter/);
  assert.equal(response.headers.get('X-Request-Id'), letter.requestId);
});

test('the letter has the response shape the cover letter component reads', async () => {
  const { body } = await refusedLetter();
  const letter = body.result;
  assert.deepEqual(Object.keys(letter).sort(), Object.keys(SAMPLE).sort(), 'the same fields as the recorded sample');
  // coverLetterGenerator reads content, provider, model, fallbackOccurred, latencyMs, generationMs,
  // promptShown and each attempt's provider, outcome, ms and detail. "Local" is its LOCAL_PROVIDER.
  assert.equal(typeof letter.content, 'string');
  assert.equal(letter.model, null);
  assert.equal(letter.fallbackOccurred, true);
  assert.equal(typeof letter.latencyMs, 'number');
  assert.equal(typeof letter.generationMs, 'number');
  assert.equal(typeof letter.promptShown, 'string');
  for (const attempt of letter.attempts) assert.deepEqual(Object.keys(attempt).sort(), ['detail', 'ms', 'outcome', 'provider']);
});

test('a pause or the ceiling also answers with the template letter, and names its own reason', async () => {
  fresh();
  recordCall(ENV, { limited: true });
  const org = fakeOrg(() => assert.fail('the paused function must not call the org'));
  try {
    const response = await createHandler({ load: async () => SNAPSHOT })({ request: post(FIELDS), env: ENV });
    const { result } = await response.json();
    assert.equal(result.provider, LOCAL_PROVIDER);
    assert.equal(org.seen.length, 0);
  } finally {
    org.restore();
  }
  const ceiling = edgeTemplateLetter({ fields: FIELDS, snapshot: SNAPSHOT, env: ENV, reason: 'ceiling' });
  assert.match(ceiling.attempts[0].detail, new RegExp(`^${REASONS.ceiling}`));
});

test('the same posting gives the same letter', () => {
  const one = edgeTemplateLetter({ fields: FIELDS, snapshot: SNAPSHOT, env: ENV });
  const two = edgeTemplateLetter({ fields: FIELDS, snapshot: SNAPSHOT, env: ENV });
  assert.equal(one.content, two.content);
});

test('a missing snapshot falls back to the recorded sample', async () => {
  const { response, body } = await refusedLetter({ load: async () => null });
  assert.equal(response.status, 503);
  assert.deepEqual(body, { error: 'UNAVAILABLE', message: MESSAGES.BUSY, fallback: 'recorded' });
});

test('a letter that fails a check falls back to the recorded sample', async () => {
  // With no SITE_DENYLIST the blocklist check fails, so the letter is never served.
  const { body } = await refusedLetter({ env: { ...ENV, SITE_DENYLIST: '' } });
  assert.equal(body.fallback, 'recorded');
  // A snapshot with no verified evidence writes a letter too short to pass.
  const thin = { ...FIXTURE, items: FIXTURE.items.filter((item) => item.verified !== true) };
  assert.equal(edgeTemplateLetter({ fields: FIELDS, snapshot: thin, env: ENV }), null);
  assert.equal(edgeTemplateLetter({ fields: FIELDS, snapshot: { items: 'no' }, env: ENV }), null);
});

test('a posting naming a blocklisted term in the company never gets a letter', () => {
  const blocked = edgeTemplateLetter({ fields: { ...FIELDS, companyName: 'Zzinventedclient Corp' }, snapshot: SNAPSHOT, env: ENV });
  assert.equal(blocked, null);
});

test('the real snapshot loader answers null or a snapshot, never throws', async () => {
  const snapshot = await loadSnapshot();
  assert.ok(snapshot === null || Array.isArray(snapshot.items));
});

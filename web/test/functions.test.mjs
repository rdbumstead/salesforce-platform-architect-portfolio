import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SWITCHES, featureStates, isLive } from '../functions/_lib/features.js';
import { callAction, getToken, ipHash, resetTokenCache } from '../functions/_lib/salesforce.js';
import { verifyTurnstile } from '../functions/_lib/turnstile.js';
import { onRequest as contact } from '../functions/api/contact.js';
import { onRequest as testimonial } from '../functions/api/testimonial.js';
import { onRequest as coverLetter } from '../functions/api/cover-letter.js';
import { onRequest as labInvoke } from '../functions/api/lab/invoke.js';
import { onRequest as labToken } from '../functions/api/lab/token.js';
import { onRequest as glassBox } from '../functions/api/live/glass-box.js';
import { onRequest as pipelineStatus } from '../functions/api/live/pipeline-status.js';
import { onRequest as features } from '../functions/api/features.js';
import { labPathsText, PATHS_FILE } from '../build/lab-paths.mjs';
import { captureLab, captureSnapshot, copyRecorded, hasSecrets } from '../build/recorded.mjs';
import { labKey } from '../src/shims/api-client.js';

const PROD = 'https://ryanbumstead.pages.dev';
const PREVIEW = 'https://abc123.ryanbumstead.pages.dev';
const ENV = {
  SF_INSTANCE_URL: 'https://example.my.salesforce.com',
  SF_CLIENT_ID: 'client-id-value',
  SF_CLIENT_SECRET: 'client-secret-value',
  IP_HASH_SALT: 'salt',
  TURNSTILE_SECRET: 'turnstile-secret'
};

/** A fake Salesforce and a fake Turnstile. Records every request it receives. */
function fakeNetwork({ actions = {}, tokenStatus = 200, turnstile = true, networkError = false } = {}) {
  const seen = [];
  const original = globalThis.fetch;
  let issued = 0;
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    seen.push({ url: address, init });
    if (networkError) throw new Error('network down');
    if (address.endsWith('/services/oauth2/token')) {
      issued += 1;
      return Response.json(tokenStatus === 200 ? { access_token: `token-${issued}`, instance_url: ENV.SF_INSTANCE_URL } : {}, { status: tokenStatus });
    }
    if (address.includes('/turnstile/')) return Response.json({ success: turnstile });
    const action = address.split('/site/actions/')[1];
    const handler = actions[action];
    if (!handler) return Response.json({ error: 'BAD_REQUEST', message: 'unknown' }, { status: 400 });
    return handler(init, issued);
  };
  return {
    seen,
    tokens: () => issued,
    restore: () => {
      globalThis.fetch = original;
    }
  };
}

function post(url, body, headers = {}) {
  return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...headers }, body: JSON.stringify(body) });
}

const CONTACT = { firstName: 'A', lastName: 'B', email: 'a@example.org', message: 'hi', website: null, elapsedMs: 9000, turnstileToken: 'tok' };

test('production defaults to live, a preview is always recorded, a bad value reads recorded', () => {
  const prod = new Request(`${PROD}/api/features`);
  assert.deepEqual(Object.values(featureStates(prod, {})), ['live', 'live', 'live', 'live', 'live']);
  const preview = new Request(`${PREVIEW}/api/features`);
  assert.ok(Object.values(featureStates(preview, { FEATURE_CONTACT: 'live' })).every((state) => state === 'recorded'));
  assert.equal(featureStates(prod, { FEATURE_CONTACT: 'recorded', FEATURE_API_LAB: 'LIVE', FEATURE_LIVE_READS: 'maybe' }).contact, 'recorded');
  assert.equal(featureStates(prod, { FEATURE_API_LAB: 'LIVE' }).apiLab, 'live');
  assert.equal(featureStates(prod, { FEATURE_LIVE_READS: 'maybe' }).liveReads, 'recorded');
  assert.equal(isLive(new Request('https://evil.example/'), {}, 'contact'), false);
  assert.equal(isLive(new Request('http://127.0.0.1:8788/'), { PRODUCTION_HOSTS: '127.0.0.1' }, 'contact'), true);
});

test('wrangler.toml sets every switch, because a deploy drops the dashboard text variables', () => {
  const toml = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const vars = toml.split(/^\[vars\]\s*$/m)[1];
  assert.ok(vars, 'wrangler.toml has a [vars] table');
  const table = vars.split(/^\[/m)[0];
  Object.values(SWITCHES).forEach((name) => {
    assert.match(table, new RegExp(`^${name}\\s*=\\s*"(live|recorded)"\\s*$`, 'm'), `${name} is set to live or recorded`);
  });
  assert.doesNotMatch(table, /^(SF_|IP_HASH|TURNSTILE_SECRET)/m, 'secrets never go in [vars]');
});

test('the features function returns the five switches and says whether this is production', async () => {
  const body = await (await features({ request: new Request(`${PROD}/api/features`), env: { FEATURE_CONTACT: 'recorded' } })).json();
  assert.deepEqual(body, { contact: 'recorded', testimonial: 'live', coverLetter: 'live', apiLab: 'live', liveReads: 'live', production: true });
});

test('the token is fetched once, sent as a bearer token, and fetched again after a 401', async () => {
  resetTokenCache();
  let calls = 0;
  const net = fakeNetwork({
    actions: {
      'glass-box': () => {
        calls += 1;
        return calls === 1 ? new Response('{}', { status: 401 }) : Response.json({ result: { ok: true } });
      }
    }
  });
  try {
    const outcome = await callAction(ENV, { action: 'glass-box', method: 'GET' });
    assert.equal(outcome.ok, true);
    assert.equal(net.tokens(), 2, 'a second token after the 401');
    const last = net.seen[net.seen.length - 1];
    assert.equal(last.init.headers.Authorization, 'Bearer token-2');
    assert.match(last.init.headers['X-Request-Id'], /^[0-9a-f-]{36}$/);
    await callAction(ENV, { action: 'glass-box', method: 'GET' });
    assert.equal(net.tokens(), 2, 'the cached token is reused');
  } finally {
    net.restore();
  }
});

test('a POST sends the request id and a 64 character hash, never the raw IP', async () => {
  resetTokenCache();
  const net = fakeNetwork({ actions: { contact: () => Response.json({ result: 'ok' }) } });
  try {
    const response = await contact({ request: post(`${PROD}/api/contact`, CONTACT, { 'X-Request-Id': 'req-1' }), env: ENV });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { result: 'ok' });
    const sent = net.seen.find((entry) => entry.url.endsWith('/site/actions/contact'));
    assert.match(sent.init.headers['X-Client-Ip-Hash'], /^[0-9a-f]{64}$/);
    assert.equal(sent.init.headers['X-Request-Id'], 'req-1');
    assert.ok(!JSON.stringify(sent).includes('203.0.113.9'), 'the raw IP is not forwarded');
    assert.ok(!sent.init.body.includes('turnstileToken'), 'the Turnstile token is not forwarded');
    const other = await ipHash(post(`${PROD}/x`, {}, { 'CF-Connecting-IP': '203.0.113.10' }), ENV);
    assert.notEqual(other, sent.init.headers['X-Client-Ip-Hash']);
  } finally {
    net.restore();
  }
});

test('a failed Turnstile check stops the form before Salesforce is called', async () => {
  resetTokenCache();
  const net = fakeNetwork({ turnstile: false, actions: { contact: () => Response.json({ result: 'ok' }) } });
  try {
    const response = await contact({ request: post(`${PROD}/api/contact`, CONTACT), env: ENV });
    assert.equal(response.status, 400);
    assert.equal(net.seen.filter((entry) => entry.url.includes('/site/actions/')).length, 0);
    const missing = await contact({ request: post(`${PROD}/api/contact`, { ...CONTACT, turnstileToken: undefined }), env: ENV });
    assert.equal(missing.status, 400);
    const unset = await contact({ request: post(`${PROD}/api/contact`, CONTACT), env: { ...ENV, TURNSTILE_SECRET: undefined } });
    assert.equal(unset.status, 503, 'with no secret the form is refused, never let through');
  } finally {
    net.restore();
  }
});

test('Turnstile verification posts the secret and token and reads success', async () => {
  const net = fakeNetwork();
  try {
    assert.equal(await verifyTurnstile(ENV, 'tok', '203.0.113.9'), 'ok');
    const sent = net.seen[0];
    assert.match(sent.url, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify$/);
    assert.match(sent.init.body, /secret=turnstile-secret/);
    assert.match(sent.init.body, /response=tok/);
  } finally {
    net.restore();
  }
});

test('a switched off feature answers 503 and calls nothing', async () => {
  const net = fakeNetwork();
  try {
    const off = await contact({ request: post(`${PROD}/api/contact`, CONTACT), env: { ...ENV, FEATURE_CONTACT: 'recorded' } });
    assert.equal(off.status, 503);
    const preview = await contact({ request: post(`${PREVIEW}/api/contact`, CONTACT), env: { ...ENV, FEATURE_CONTACT: 'live' } });
    assert.equal(preview.status, 503, 'a preview deploy never goes live');
    assert.equal(net.seen.length, 0);
  } finally {
    net.restore();
  }
});

test('Salesforce errors become the site answers and never carry a secret', async () => {
  const cases = [
    [() => Response.json({ error: 'RATE_LIMITED', message: 'Slow down.' }, { status: 429 }), 429, 'RATE_LIMITED'],
    [() => Response.json({ error: 'BAD_REQUEST', message: 'Email is not valid.' }, { status: 400 }), 400, 'BAD_REQUEST'],
    [() => Response.json({ error: 'FORBIDDEN', message: 'internal permission text' }, { status: 403 }), 503, 'UNAVAILABLE'],
    [() => Response.json({ error: 'UNAVAILABLE', message: 'x' }, { status: 503 }), 503, 'UNAVAILABLE'],
    [() => new Response('<html>', { status: 502 }), 503, 'UNAVAILABLE']
  ];
  for (const [handler, status, code] of cases) {
    resetTokenCache();
    const net = fakeNetwork({ actions: { contact: handler } });
    try {
      const response = await contact({ request: post(`${PROD}/api/contact`, CONTACT), env: ENV });
      const body = await response.json();
      assert.equal(response.status, status);
      assert.equal(body.error, code);
      assert.ok(!JSON.stringify(body).includes('secret'));
      if (status === 400) assert.equal(body.message, 'Email is not valid.', 'the message is Salesforce text');
      if (status === 503) assert.ok(!body.message.includes('permission'));
    } finally {
      net.restore();
    }
  }
  resetTokenCache();
  const down = fakeNetwork({ networkError: true });
  try {
    assert.equal((await callAction(ENV, { action: 'glass-box', method: 'GET' })).status, 503);
  } finally {
    down.restore();
  }
  resetTokenCache();
  const refused = fakeNetwork({ tokenStatus: 401 });
  try {
    const outcome = await callAction(ENV, { action: 'glass-box', method: 'GET' });
    assert.equal(outcome.status, 503);
    assert.ok(!JSON.stringify(outcome).includes(ENV.SF_CLIENT_SECRET));
  } finally {
    refused.restore();
  }
});

test('with no Salesforce settings every function answers 503 and says it is not set up', async () => {
  const outcome = await callAction({}, { action: 'glass-box', method: 'GET' });
  assert.equal(outcome.status, 503);
  const noSalt = await coverLetter({ request: post(`${PROD}/api/cover-letter`, {}), env: { ...ENV, IP_HASH_SALT: '' } });
  assert.equal(noSalt.status, 503);
});

test('the testimonial function keeps only the fields of the chosen mode', async () => {
  resetTokenCache();
  let received;
  const net = fakeNetwork({
    actions: {
      testimonial: (init) => {
        received = JSON.parse(init.body);
        return Response.json({ result: 'ok' });
      }
    }
  });
  try {
    const base = { authorName: 'N', relationship: 'Colleague', vibeMode: 'Warm', website: null, elapsedMs: 9000, turnstileToken: 't', strangeField: 1 };
    await testimonial({ request: post(`${PROD}/api/testimonial`, { ...base, mode: 'own', ownWords: 'words', note: 'dropped' }), env: ENV });
    assert.deepEqual(received, { mode: 'own', authorName: 'N', relationship: 'Colleague', vibeMode: 'Warm', website: null, elapsedMs: 9000, ownWords: 'words' });
    await testimonial({ request: post(`${PROD}/api/testimonial`, { ...base, mode: 'fragments', strengthId: 's', outcomeId: 'o', note: 'n', ownWords: 'dropped' }), env: ENV });
    assert.equal(received.ownWords, undefined);
    assert.equal(received.strengthId, 's');
    const bad = await testimonial({ request: post(`${PROD}/api/testimonial`, { ...base, mode: 'other' }), env: ENV });
    assert.equal(bad.status, 400);
  } finally {
    net.restore();
  }
});

test('the cover letter function returns the result with provider and attempts', async () => {
  resetTokenCache();
  const letter = { content: 'Dear', provider: 'Agentforce', attempts: [{ provider: 'Agentforce', outcome: 'Served', ms: 5 }] };
  const net = fakeNetwork({ actions: { 'cover-letter': () => Response.json({ result: letter }) } });
  try {
    const response = await coverLetter({ request: post(`${PROD}/api/cover-letter`, { companyName: 'C', jobTitle: 'T', jobDescription: 'D' }), env: ENV });
    assert.deepEqual(await response.json(), { result: letter });
    const bad = await coverLetter({ request: post(`${PROD}/api/cover-letter`, { companyName: 5 }), env: ENV });
    assert.equal(bad.status, 400);
  } finally {
    net.restore();
  }
});

test('lab invoke forwards only catalog paths and plain parameters', async () => {
  resetTokenCache();
  let received;
  const net = fakeNetwork({
    actions: {
      'lab-invoke': (init) => {
        received = JSON.parse(init.body);
        return Response.json({ result: { statusCode: 200 } });
      }
    }
  });
  try {
    const ok = await labInvoke({ request: post(`${PROD}/api/lab/invoke`, { path: '/sapi/skills', params: { limit: 5 }, apiVersion: 'v2' }), env: ENV });
    assert.equal(ok.status, 200);
    assert.deepEqual(received, { path: '/sapi/skills', params: { limit: '5' }, apiVersion: 'v2' });
    for (const body of [
      { path: '/sapi/anything-else' },
      { path: '/papi/ai/generate' },
      { path: '/sapi/skills?x=1' },
      { path: '/sapi/skills', apiVersion: 'v3' },
      { path: '/sapi/skills', params: { 'bad name': 1 } },
      { path: '/sapi/skills', params: { a: { nested: 1 } } },
      { path: '/sapi/skills', params: [1] }
    ]) {
      const before = net.seen.length;
      const refused = await labInvoke({ request: post(`${PROD}/api/lab/invoke`, body), env: ENV });
      assert.equal(refused.status, 400, JSON.stringify(body));
      assert.equal(net.seen.length, before, 'nothing reached Salesforce');
    }
  } finally {
    net.restore();
  }
});

test('lab token forwards email and purpose', async () => {
  resetTokenCache();
  const net = fakeNetwork({ actions: { 'lab-token': (init) => Response.json({ result: JSON.parse(init.body) }) } });
  try {
    const response = await labToken({ request: post(`${PROD}/api/lab/token`, { email: 'e@example.org', purpose: 'p', extra: 1 }), env: ENV });
    assert.deepEqual((await response.json()).result, { email: 'e@example.org', purpose: 'p' });
  } finally {
    net.restore();
  }
});

test('the live GETs are cached at the edge for 60 and 300 seconds', async () => {
  resetTokenCache();
  const stored = new Map();
  const realCaches = globalThis.caches;
  globalThis.caches = {
    default: {
      match: async (key) => (stored.has(key.url) ? stored.get(key.url).clone() : undefined),
      put: async (key, response) => {
        stored.set(key.url, response);
      }
    }
  };
  let hits = 0;
  const net = fakeNetwork({
    actions: {
      'glass-box': () => {
        hits += 1;
        return Response.json({ result: { n: hits } });
      },
      'pipeline-status': () => Response.json({ result: { items: [] } })
    }
  });
  try {
    const first = await glassBox({ request: new Request(`${PROD}/api/live/glass-box`), env: ENV, waitUntil: () => undefined });
    assert.equal(first.headers.get('Cache-Control'), 'public, max-age=60');
    const second = await glassBox({ request: new Request(`${PROD}/api/live/glass-box`), env: ENV });
    assert.deepEqual(await second.json(), { result: { n: 1 } });
    assert.equal(hits, 1, 'the second answer came from the cache');
    const status = await pipelineStatus({ request: new Request(`${PROD}/api/live/pipeline-status`), env: ENV, waitUntil: () => undefined });
    assert.equal(status.headers.get('Cache-Control'), 'public, max-age=300');
    const post405 = await glassBox({ request: post(`${PROD}/api/live/glass-box`, {}), env: ENV });
    assert.equal(post405.status, 405);
  } finally {
    net.restore();
    globalThis.caches = realCaches;
  }
});

test('the committed lab path list matches the catalog', () => {
  const plain = (text) => text.split('\r').join('');
  assert.equal(plain(fs.readFileSync(PATHS_FILE, 'utf8')), plain(labPathsText()));
});

test('getToken keeps one request in flight', async () => {
  resetTokenCache();
  const net = fakeNetwork();
  try {
    await Promise.all([getToken(ENV), getToken(ENV), getToken(ENV)]);
    assert.equal(net.tokens(), 1);
  } finally {
    net.restore();
  }
});

test('the recording step needs every edge secret and writes the index and the sample letter', async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'recorded-'));
  assert.equal(hasSecrets({}), false);
  assert.equal(await captureLab(dist, {}), null);
  assert.ok(!fs.existsSync(path.join(dist, 'recorded/lab/index.json')));
  resetTokenCache();
  const net = fakeNetwork({
    actions: { 'lab-invoke': (init) => (JSON.parse(init.body).path === '/sapi/health' ? Response.json({ result: { statusCode: 200, body: '{}' } }) : Response.json({ error: 'BAD_REQUEST', message: 'no' }, { status: 400 })) }
  });
  try {
    const result = await captureLab(dist, ENV);
    assert.equal(result.recorded, 1);
    assert.ok(result.skipped.length > 0);
    const sent = net.seen.find((entry) => entry.url.endsWith('lab-invoke'));
    assert.equal(sent.init.headers['X-Site-Recording'], '1');
    const index = JSON.parse(fs.readFileSync(path.join(dist, 'recorded/lab/index.json'), 'utf8'));
    assert.ok(index.calls[labKey({ path: '/sapi/health', params: {}, apiVersion: 'v2' })]);
  } finally {
    net.restore();
  }
  assert.ok(copyRecorded(dist).includes('cover-letter.json'));
  const letter = JSON.parse(fs.readFileSync(path.join(dist, 'recorded/cover-letter.json'), 'utf8'));
  assert.match(letter.content, /^SAMPLE LETTER/);
  assert.ok(Array.isArray(letter.attempts));
});

test('the footer readings are captured with a GET with the recording header and saved with the capture time', async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'recorded-glass-'));
  assert.equal(await captureSnapshot(dist, {}), null);
  assert.ok(!fs.existsSync(path.join(dist, 'recorded/glass-box.json')));
  resetTokenCache();
  const net = fakeNetwork({ actions: { 'glass-box': () => Response.json({ result: { aiRequestsToday: 4, orgQuotas: [] } }) } });
  try {
    const now = new Date('2026-11-02T10:00:00.000Z');
    assert.deepEqual(await captureSnapshot(dist, ENV, now), { recorded: true });
    const sent = net.seen.find((entry) => entry.url.endsWith('glass-box'));
    assert.equal(sent.init.method, 'GET');
    assert.equal(sent.init.headers['X-Site-Recording'], '1');
    const saved = JSON.parse(fs.readFileSync(path.join(dist, 'recorded/glass-box.json'), 'utf8'));
    assert.equal(saved.recordedAt, now.toISOString());
    assert.equal(saved.snapshot.aiRequestsToday, 4);
  } finally {
    net.restore();
  }
  const failing = fakeNetwork({ actions: { 'glass-box': () => Response.json({ error: 'FORBIDDEN', message: 'no' }, { status: 403 }) } });
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'recorded-glass-'));
  try {
    resetTokenCache();
    const outcome = await captureSnapshot(other, ENV);
    assert.equal(outcome.recorded, false);
    assert.ok(!fs.existsSync(path.join(other, 'recorded/glass-box.json')));
  } finally {
    failing.restore();
  }
});

test('the sample footer readings are copied only into a fixture build', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'recorded-fixture-'));
  copyRecorded(fixture);
  assert.ok(fs.existsSync(path.join(fixture, 'recorded/glass-box.json')));
  const real = fs.mkdtempSync(path.join(os.tmpdir(), 'recorded-real-'));
  copyRecorded(real, undefined, { fixture: false });
  // A real data build holds an empty snapshot instead, so a build that never captures serves no 404.
  const held = JSON.parse(fs.readFileSync(path.join(real, 'recorded/glass-box.json'), 'utf8'));
  assert.deepEqual(held, { recordedAt: null, snapshot: null });
  assert.notEqual(held.sample, true);
  assert.ok(fs.existsSync(path.join(real, 'recorded/cover-letter.json')));
});

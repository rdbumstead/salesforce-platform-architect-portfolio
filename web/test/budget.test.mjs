import test from 'node:test';
import assert from 'node:assert/strict';
import {
  budgetState,
  checkBudget,
  isLimitRefusal,
  parseLimitInfo,
  recordCall,
  resetBudget,
  settings,
  KV_READ_MS,
  KV_WRITE_MS
} from '../functions/_lib/budget.js';
import { callAction, resetTokenCache } from '../functions/_lib/salesforce.js';
import { MESSAGES } from '../functions/_lib/http.js';
import { BUSY_RETRY_SECONDS } from '../functions/_lib/actions.js';
import { onRequest as contact } from '../functions/api/contact.js';
import { onRequest as testimonial } from '../functions/api/testimonial.js';
import { onRequest as coverLetter } from '../functions/api/cover-letter.js';
import { onRequest as labInvoke } from '../functions/api/lab/invoke.js';
import { onRequest as labToken } from '../functions/api/lab/token.js';
import { onRequest as glassBox } from '../functions/api/live/glass-box.js';
import { createRequestHandler } from '../src/shims/api-client.js';
import { LAB_PATHS } from '../functions/_generated/lab-paths.js';

const PROD = 'https://ryanbumstead.com';
const ENV = {
  SF_INSTANCE_URL: 'https://example.my.salesforce.com',
  SF_CLIENT_ID: 'client-id-value',
  SF_CLIENT_SECRET: 'client-secret-value',
  IP_HASH_SALT: 'salt',
  TURNSTILE_SECRET: 'turnstile-secret'
};
// The REST error shape for a spent daily cap.
const REFUSED = [{ message: 'TotalRequests Limit exceeded.', errorCode: 'REQUEST_LIMIT_EXCEEDED' }];

/** A fake Salesforce and Turnstile. `answer(action)` returns the action's Response. */
function fakeOrg(answer) {
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    if (address.endsWith('/services/oauth2/token'))
      return Response.json({ access_token: 'tok', instance_url: ENV.SF_INSTANCE_URL });
    if (address.includes('/turnstile/')) return Response.json({ success: true });
    const action = address.split('/site/actions/')[1];
    seen.push(action);
    return answer(action, init);
  };
  return {
    seen,
    restore: () => {
      globalThis.fetch = original;
    }
  };
}

function withUsage(body, used, max = 15000, status = 200) {
  return Response.json(body, { status, headers: { 'Sforce-Limit-Info': `api-usage=${used}/${max}` } });
}

function post(path, body) {
  return new Request(`${PROD}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify(body)
  });
}

const CONTACT = { firstName: 'A', lastName: 'B', email: 'a@example.org', message: 'hi', elapsedMs: 9000, turnstileToken: 't' };
const TESTIMONIAL = { mode: 'own', authorName: 'A', ownWords: 'Good work.', turnstileToken: 't' };
const LETTER = { companyName: 'Example', jobTitle: 'Architect', jobDescription: 'Build things.' };

function fresh() {
  resetBudget();
  resetTokenCache();
}

/** A KV namespace in memory, with the calls it saw. */
function fakeKv() {
  const data = new Map();
  const calls = { get: 0, put: 0 };
  return {
    calls,
    data,
    async get(key, options) {
      calls.get += 1;
      const value = data.get(key);
      if (value === undefined) return null;
      return options && options.type === 'json' ? JSON.parse(value) : value;
    },
    async put(key, value) {
      calls.put += 1;
      data.set(key, value);
    }
  };
}

test('parseLimitInfo and isLimitRefusal read the documented shapes and nothing else', () => {
  assert.deepEqual(parseLimitInfo('api-usage=3/15000'), { used: 3, max: 15000 });
  assert.equal(parseLimitInfo(null), null);
  assert.equal(isLimitRefusal(403, REFUSED), true);
  assert.equal(isLimitRefusal(403, { errorCode: 'REQUEST_LIMIT_EXCEEDED' }), true);
  assert.equal(isLimitRefusal(403, { message: 'TotalRequests Limit exceeded.' }), true);
  assert.equal(isLimitRefusal(403, { error: 'FORBIDDEN', message: 'The site actions need a permission.' }), false);
  assert.equal(isLimitRefusal(500, REFUSED), false);
  assert.equal(isLimitRefusal(403, null), false);
});

test('settings fall back to the defaults on missing or bad values', () => {
  assert.deepEqual(settings({}), { stopShare: 0.95, visitorShare: 0.35, dailyMax: 15000, pauseMs: 900000 });
  const custom = settings({ API_VISITOR_STOP_SHARE: '0.9', API_VISITOR_DAILY_SHARE: '2', API_DAILY_MAX: '100', API_BUDGET_PAUSE_MINUTES: '5' });
  assert.deepEqual(custom, { stopShare: 0.9, visitorShare: 0.35, dailyMax: 100, pauseMs: 300000 });
});

test('callAction marks a cap refusal as limited with the busy message, and keeps a permission 403 as before', async () => {
  fresh();
  const org = fakeOrg((action) => (action === 'glass-box' ? Response.json(REFUSED, { status: 403 }) : Response.json({ error: 'FORBIDDEN', message: 'x' }, { status: 403 })));
  try {
    const limited = await callAction(ENV, { action: 'glass-box', method: 'GET' });
    assert.equal(limited.limited, true);
    assert.equal(limited.status, 503);
    assert.equal(limited.message, MESSAGES.BUSY);
    const forbidden = await callAction(ENV, { action: 'pipeline-status', method: 'GET' });
    assert.equal(forbidden.limited, undefined);
    assert.equal(forbidden.message, MESSAGES.UNAVAILABLE);
  } finally {
    org.restore();
  }
});

test('callAction carries the Sforce-Limit-Info reading when the org sends it', async () => {
  fresh();
  const org = fakeOrg(() => withUsage({ result: 'ok' }, 120));
  try {
    const outcome = await callAction(ENV, { action: 'glass-box', method: 'GET' });
    assert.deepEqual(outcome.limitInfo, { used: 120, max: 15000 });
  } finally {
    org.restore();
  }
});

test('a refusal on the contact form gives the try again later message, then pauses without calling the org', async () => {
  fresh();
  const org = fakeOrg(() => Response.json(REFUSED, { status: 403 }));
  try {
    const first = await contact({ request: post('/api/contact', CONTACT), env: ENV });
    const body = await first.json();
    assert.equal(first.status, 503);
    assert.equal(body.error, 'UNAVAILABLE');
    assert.equal(body.message, MESSAGES.BUSY);
    assert.equal(body.fallback, undefined, 'a form has no recorded copy');
    assert.equal(first.headers.get('Retry-After'), String(BUSY_RETRY_SECONDS));
    const second = await testimonial({ request: post('/api/testimonial', TESTIMONIAL), env: ENV });
    assert.equal(second.status, 503);
    assert.equal((await second.json()).message, MESSAGES.BUSY);
    assert.deepEqual(org.seen, ['contact'], 'the paused second call never reached the org');
  } finally {
    org.restore();
  }
});

test('the pause runs out and one call tries the org again', async () => {
  fresh();
  const now = Date.parse('2026-11-14T10:00:00Z');
  recordCall(ENV, { limited: true }, { now });
  assert.equal((await checkBudget(ENV, { now: now + 60000 })).reason, 'refused');
  assert.equal((await checkBudget(ENV, { now: now + 15 * 60000 + 1 })).allowed, true);
});

test('the cover letter, lab invoke and live reads point the browser at the recorded copy', async () => {
  fresh();
  const org = fakeOrg(() => Response.json(REFUSED, { status: 403 }));
  try {
    const letter = await coverLetter({ request: post('/api/cover-letter', { ...LETTER, turnstileToken: 't' }), env: ENV });
    assert.equal(letter.status, 503);
    assert.deepEqual(await letter.json(), { error: 'UNAVAILABLE', message: MESSAGES.BUSY, fallback: 'recorded' });
    const lab = await labInvoke({ request: post('/api/lab/invoke', { path: LAB_PATHS[0] }), env: ENV });
    assert.equal((await lab.json()).fallback, 'recorded');
    const token = await labToken({ request: post('/api/lab/token', { email: 'a@example.org', turnstileToken: 't' }), env: ENV });
    assert.equal((await token.json()).fallback, undefined, 'an evaluator token has no recorded copy');
    const read = await glassBox({ request: new Request(`${PROD}/api/live/glass-box`), env: ENV });
    assert.equal(read.status, 503);
    assert.equal((await read.json()).fallback, 'recorded');
    assert.equal(read.headers.get('Cache-Control'), 'no-store', 'a soft stop is never cached');
  } finally {
    org.restore();
  }
});

test('past the stop share of the org count new visitor calls stop softly for the day', async () => {
  fresh();
  let used = 14000;
  const org = fakeOrg(() => withUsage({ result: 'ok' }, used));
  try {
    const ok = await contact({ request: post('/api/contact', CONTACT), env: ENV });
    assert.equal(ok.status, 200);
    used = 14250; // 95 percent of 15000
    assert.equal((await contact({ request: post('/api/contact', CONTACT), env: ENV })).status, 200);
    const stopped = await contact({ request: post('/api/contact', CONTACT), env: ENV });
    assert.equal(stopped.status, 503);
    assert.equal((await stopped.json()).message, MESSAGES.BUSY);
    assert.equal(org.seen.length, 2);
    assert.equal((await checkBudget(ENV)).reason, 'ceiling');
  } finally {
    org.restore();
  }
});

test('a reading from yesterday does not stop today, and the visitor count starts again', async () => {
  fresh();
  const yesterday = Date.parse('2026-11-14T23:59:00Z');
  recordCall(ENV, { ok: true, limitInfo: { used: 14999, max: 15000 } }, { now: yesterday });
  assert.equal((await checkBudget(ENV, { now: yesterday })).reason, 'ceiling');
  const today = Date.parse('2026-11-15T00:01:00Z');
  assert.equal((await checkBudget(ENV, { now: today })).allowed, true);
  assert.equal(budgetState().visitorCalls, 0);
});

test('our own visitor count stops new calls past the visitor share, even with no header', async () => {
  fresh();
  const env = { ...ENV, API_DAILY_MAX: '20', API_VISITOR_DAILY_SHARE: '0.25' };
  const now = Date.parse('2026-11-14T12:00:00Z');
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await checkBudget(env, { now })).allowed, true);
    recordCall(env, { ok: true }, { now });
  }
  assert.deepEqual(await checkBudget(env, { now }), { allowed: false, reason: 'visitors' });
});

test('a call that never reached Salesforce spends nothing from the count', async () => {
  fresh();
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('network down');
  };
  try {
    const response = await contact({ request: post('/api/contact', CONTACT), env: ENV });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).message, 'The check that you are a person could not be run. Try again later.');
  } finally {
    globalThis.fetch = original;
  }
  const org = fakeOrg(() => {
    throw new Error('network down');
  });
  try {
    await glassBox({ request: new Request(`${PROD}/api/live/glass-box`), env: ENV });
    assert.equal(budgetState().visitorCalls, 0);
  } finally {
    org.restore();
  }
});

test('with a KV binding the record is shared, read at most every 30 seconds and written at most every minute', async () => {
  fresh();
  const kv = fakeKv();
  const env = { ...ENV, API_BUDGET: kv };
  const now = Date.parse('2026-11-14T12:00:00Z');
  const pending = [];
  const waitUntil = (promise) => pending.push(promise);

  await checkBudget(env, { now });
  assert.equal(kv.calls.get, 1);
  await checkBudget(env, { now: now + KV_READ_MS - 1 });
  assert.equal(kv.calls.get, 1, 'a second read inside 30 seconds uses the cached copy');

  recordCall(env, { ok: true, limitInfo: { used: 100, max: 15000 } }, { now, waitUntil });
  recordCall(env, { ok: true }, { now: now + 1000, waitUntil });
  await Promise.all(pending);
  assert.equal(kv.calls.put, 1, 'one write inside the minute');
  recordCall(env, { ok: true }, { now: now + KV_WRITE_MS, waitUntil });
  await Promise.all(pending);
  assert.equal(kv.calls.put, 2);
  const record = JSON.parse(kv.data.get('budget:2026-11-14'));
  assert.equal(record.visitorCalls, 3);
  assert.equal(record.reading.used, 100);

  // A refusal is written at once, and another isolate (a reset state) picks up the pause.
  recordCall(env, { limited: true }, { now: now + KV_WRITE_MS + 1, waitUntil });
  await Promise.all(pending);
  assert.equal(kv.calls.put, 3);
  resetBudget();
  assert.deepEqual(await checkBudget(env, { now: now + KV_WRITE_MS + 2 }), { allowed: false, reason: 'refused' });
});

test('another isolate past the ceiling stops this one through KV', async () => {
  fresh();
  const kv = fakeKv();
  const now = Date.parse('2026-11-14T12:00:00Z');
  kv.data.set('budget:2026-11-14', JSON.stringify({ day: '2026-11-14', visitorCalls: 10, pausedUntil: 0, reading: { used: 14500, max: 15000, at: now - 1000 } }));
  assert.deepEqual(await checkBudget({ ...ENV, API_BUDGET: kv }, { now }), { allowed: false, reason: 'ceiling' });
});

test('a broken KV never refuses a visitor', async () => {
  fresh();
  const broken = {
    get: async () => {
      throw new Error('kv down');
    },
    put: async () => {
      throw new Error('kv down');
    }
  };
  const env = { ...ENV, API_BUDGET: broken };
  assert.equal((await checkBudget(env)).allowed, true);
  const pending = [];
  recordCall(env, { limited: true }, { waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
  assert.equal((await checkBudget(env)).reason, 'refused', 'the isolate still keeps its own pause');
});

test('a broken KV read and write each write one failure line and nothing more', async () => {
  fresh();
  const broken = {
    get: async () => {
      throw new Error('kv down for a@example.org');
    },
    put: async () => {
      throw new Error('kv down for a@example.org');
    }
  };
  const env = { ...ENV, API_BUDGET: broken };
  const lines = [];
  const original = console.error;
  console.error = (text) => lines.push(text);
  try {
    await checkBudget(env);
    const pending = [];
    recordCall(env, { limited: true }, { waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
  } finally {
    console.error = original;
  }
  assert.deepEqual(lines.map((text) => JSON.parse(text)), [
    { route: 'budget', error: 'KV_READ_FAILED', status: 0 },
    { route: 'budget', error: 'KV_WRITE_FAILED', status: 0 }
  ]);
  assert.ok(lines.every((text) => !text.includes('example.org')), 'the error text never reaches the line');
});

/** The browser side: a function that says fallback recorded makes the client show the recorded copy. */
function fakeSite(routes, files = {}) {
  const fetch = async (url) => {
    if (url === '/api/features') return Response.json({ contact: 'live', testimonial: 'live', coverLetter: 'live', apiLab: 'live', liveReads: 'live' });
    if (routes[url]) return routes[url]();
    if (files[url]) return Response.json(files[url]);
    return new Response('', { status: 404 });
  };
  return fetch;
}

const BUSY_BODY = { error: 'UNAVAILABLE', message: MESSAGES.BUSY, fallback: 'recorded' };
const busyAnswer = () => Response.json(BUSY_BODY, { status: 503 });

test('the browser shows the sample letter, with the reason in its attempts, when the letter is stopped', async () => {
  const sample = { content: 'SAMPLE LETTER.', provider: 'Recorded sample', attempts: [{ provider: 'Recorded sample', outcome: 'Served', ms: 0, detail: 'A saved example.' }] };
  const handler = createRequestHandler({
    fetch: fakeSite({ '/api/cover-letter': busyAnswer }, { '/recorded/cover-letter.json': sample }),
    turnstileToken: async () => 't'
  });
  const result = await handler('ApiLabController.generateCoverLetter', LETTER);
  assert.equal(result.content, 'SAMPLE LETTER.');
  assert.equal(result.attempts.length, 1);
  assert.match(result.attempts[0].detail, /resting for now.*saved sample letter instead\.$/);
});

test('the browser answers a stopped lab call from the recordings, and keeps the message when nothing was recorded', async () => {
  const params = { path: '/v2/projects', params: {}, apiVersion: 'v2' };
  const key = 'v2 /v2/projects []';
  const handler = createRequestHandler({
    fetch: fakeSite({ '/api/lab/invoke': busyAnswer }, { '/recorded/lab/index.json': { calls: { [key]: { status: 200 } } } })
  });
  assert.deepEqual(await handler('ApiLabController.invokeVersioned', params), { status: 200 });
  const bare = createRequestHandler({ fetch: fakeSite({ '/api/cover-letter': busyAnswer }), turnstileToken: async () => 't' });
  await assert.rejects(bare('ApiLabController.generateCoverLetter', LETTER), (error) => error.status === 503 && error.body.message === MESSAGES.BUSY);
});

test('a stopped form shows the try again later message through the body.message shape', async () => {
  const handler = createRequestHandler({
    fetch: fakeSite({ '/api/contact': () => Response.json({ error: 'UNAVAILABLE', message: MESSAGES.BUSY }, { status: 503 }) }),
    turnstileToken: async () => 't'
  });
  await assert.rejects(handler('ContactFormController.submitContact', CONTACT), (error) => error.status === 503 && error.body.message === MESSAGES.BUSY);
});

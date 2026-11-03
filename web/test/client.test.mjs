import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequestHandler, labKey, ALL_RECORDED, MESSAGES } from '../src/shims/api-client.js';
import { apexMethod, setRequestHandler } from '../src/shims/apex.js';
import { setSiteData } from '../src/shims/site-data.js';
import { swapRecordedForms, FALLBACK_LINKS } from '../src/shims/recorded-forms.js';
import { headersFor, isPreviewBuild, NOINDEX_RULE } from '../build/build.mjs';
import { WEB_DIR } from '../build/site-plugin.mjs';

const LIVE = { contact: 'live', testimonial: 'live', coverLetter: 'live', apiLab: 'live', liveReads: 'live' };

/** A fake site: /api/features and the /api functions, plus the recorded files. */
function fakeSite({ features = LIVE, routes = {}, files = {} } = {}) {
  const seen = [];
  const fetch = async (url, init = {}) => {
    seen.push({ url, init });
    if (url === '/api/features') return features === null ? new Response('', { status: 404 }) : Response.json(features);
    if (routes[url]) return routes[url](init);
    if (files[url]) return Response.json(files[url]);
    return new Response('', { status: 404 });
  };
  return { fetch, seen };
}

test('a live contact call posts the form with a fresh Turnstile token and returns the result', async () => {
  const site = fakeSite({ routes: { '/api/contact': () => Response.json({ result: 'ok' }) } });
  const handler = createRequestHandler({ fetch: site.fetch, turnstileToken: async () => 'tok-1' });
  assert.equal(await handler('ContactFormController.submitContact', { firstName: 'A' }), 'ok');
  const sent = site.seen.find((entry) => entry.url === '/api/contact');
  assert.deepEqual(JSON.parse(sent.init.body), { firstName: 'A', turnstileToken: 'tok-1' });
});

test('the two testimonial calls set their mode', async () => {
  const site = fakeSite({ routes: { '/api/testimonial': (init) => Response.json({ result: JSON.parse(init.body).mode }) } });
  const handler = createRequestHandler({ fetch: site.fetch, turnstileToken: async () => 't' });
  assert.equal(await handler('TestimonialController.submitTestimonial', {}), 'fragments');
  assert.equal(await handler('TestimonialController.submitOwnTestimonial', {}), 'own');
});

test('a function error becomes the body.message shape the components read', async () => {
  const site = fakeSite({
    routes: {
      '/api/contact': () => Response.json({ error: 'RATE_LIMITED', message: 'Try again tomorrow.' }, { status: 429 }),
      '/api/cover-letter': () => new Response('<html>', { status: 502 })
    }
  });
  const handler = createRequestHandler({ fetch: site.fetch, turnstileToken: async () => 't' });
  await assert.rejects(handler('ContactFormController.submitContact', {}), (error) => error.status === 429 && error.body.message === 'Try again tomorrow.');
  await assert.rejects(handler('ApiLabController.generateCoverLetter', {}), (error) => error.body.message === MESSAGES.network);
});

test('no Turnstile token means no request to the form function', async () => {
  const site = fakeSite();
  const handler = createRequestHandler({ fetch: site.fetch, turnstileToken: async () => null });
  await assert.rejects(handler('ContactFormController.submitContact', {}), (error) => /could not be run/.test(error.body.message));
  assert.ok(!site.seen.some((entry) => entry.url === '/api/contact'));
});

test('recorded mode never calls a function: sample letter, recorded lab responses, honest gaps', async () => {
  const params = { path: '/sapi/health', params: {}, apiVersion: 'v2' };
  const site = fakeSite({
    features: ALL_RECORDED,
    files: {
      '/recorded/cover-letter.json': { content: 'SAMPLE LETTER', provider: 'Recorded sample' },
      '/recorded/lab/index.json': { calls: { [labKey(params)]: { statusCode: 200 } } }
    }
  });
  const handler = createRequestHandler({ fetch: site.fetch });
  assert.equal((await handler('ApiLabController.generateCoverLetter', {})).provider, 'Recorded sample');
  assert.deepEqual(await handler('ApiLabController.invokeVersioned', params), { statusCode: 200 });
  await assert.rejects(handler('ApiLabController.invokeVersioned', { ...params, path: '/sapi/skills' }), (error) => error.body.message === MESSAGES.noRecordedCall);
  await assert.rejects(handler('ApiLabController.requestEvaluatorToken', {}), (error) => error.body.message === MESSAGES.noToken);
  await assert.rejects(handler('FooterController.getSystemSnapshot', {}));
  assert.ok(site.seen.every((entry) => !entry.url.startsWith('/api/') || entry.url === '/api/features'));
  const empty = createRequestHandler({ fetch: fakeSite({ features: ALL_RECORDED }).fetch });
  await assert.rejects(empty('ApiLabController.invokeVersioned', params), (error) => error.body.message === MESSAGES.noRecordedLab);
});

test('a host with no functions reads every switch as recorded', async () => {
  const handler = createRequestHandler({ fetch: fakeSite({ features: null }).fetch });
  assert.deepEqual(await handler.features(), ALL_RECORDED);
  const broken = createRequestHandler({ fetch: async () => Promise.reject(new Error('offline')) });
  assert.deepEqual(await broken.features(), ALL_RECORDED);
});

test('a lab key sorts parameters and defaults the version to v2', () => {
  assert.equal(labKey({ path: '/p', params: { b: 2, a: 1 } }), 'v2 /p [["a","1"],["b","2"]]');
});

function waitFor(emitted, count) {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (emitted.length >= count) {
        clearInterval(timer);
        resolve(emitted);
      }
    }, 5);
    setTimeout(() => {
      clearInterval(timer);
      resolve(emitted);
    }, 300);
  });
}

test('the pipeline status wire sends the build data first, then the live reading', async () => {
  setSiteData({ reads: { 'GovernanceController.getPipelineStatus': { items: ['build'] } }, lazy: {}, build: {} });
  setRequestHandler(async () => ({ items: ['live'] }));
  const emitted = [];
  const adapter = new (apexMethod('GovernanceController.getPipelineStatus', 'build').adapter)((value) => emitted.push(value));
  adapter.connect();
  adapter.update({});
  await waitFor(emitted, 2);
  assert.deepEqual(emitted.map((entry) => entry.data.items[0]), ['build', 'live']);
  setRequestHandler(null);
});

test('a failed or switched off live reading keeps the build data and adds nothing', async () => {
  setSiteData({ reads: { 'GovernanceController.getPipelineStatus': { items: ['build'] } }, lazy: {}, build: {} });
  setRequestHandler(async () => Promise.reject({ body: { message: 'off' } }));
  const emitted = [];
  const adapter = new (apexMethod('GovernanceController.getPipelineStatus', 'build').adapter)((value) => emitted.push(value));
  adapter.connect();
  adapter.update({});
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].data.items[0], 'build');
  setRequestHandler(null);
});

test('a build time wire that has no live reading never calls the handler', async () => {
  setSiteData({ reads: { 'R.get': { ok: true } }, lazy: {}, build: {} });
  let called = false;
  setRequestHandler(async () => {
    called = true;
  });
  const emitted = [];
  const adapter = new (apexMethod('R.get', 'build').adapter)((value) => emitted.push(value));
  adapter.connect();
  adapter.update({});
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(called, false);
  setRequestHandler(null);
});

/** Just enough DOM for the mount swap. */
function fakeDocument() {
  const make = (tag) => ({
    tag,
    children: [],
    style: {},
    attrs: {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    appendChild(child) {
      this.children.push(child);
    },
    append(...kids) {
      this.children.push(...kids);
    },
    replaceWith(node) {
      const siblings = this.parent.children;
      siblings[siblings.indexOf(this)] = node;
    }
  });
  return { createElement: make };
}

test('a form whose switch reads recorded is replaced with the profile links, a live one is kept', () => {
  const doc = fakeDocument();
  const form = doc.createElement('c-contact-form');
  const testimonialForm = doc.createElement('c-testimonial-submit');
  const root = {
    children: [form, testimonialForm],
    querySelectorAll(tag) {
      return this.children.filter((child) => child.tag === tag);
    }
  };
  form.parent = root;
  testimonialForm.parent = root;
  const replaced = swapRecordedForms(root, { ...LIVE, contact: 'recorded' }, [{ label: 'GitHub', url: 'https://github.com/x' }, { label: 'Bad', url: 'javascript:alert(1)' }], doc);
  assert.equal(replaced, 1);
  assert.equal(root.children[0].tag, 'section');
  assert.equal(root.children[0].attrs['data-recorded'], 'contact');
  const list = root.children[0].children[2];
  assert.equal(list.children.length, 1, 'only an https link is kept');
  assert.equal(root.children[1].tag, 'c-testimonial-submit');
  assert.ok(FALLBACK_LINKS.length > 0);
});

test('a preview build sends noindex on every path and a production build does not', () => {
  const production = fs.readFileSync(path.join(WEB_DIR, 'public/_headers'), 'utf8');
  assert.ok(!/X-Robots-Tag/i.test(headersFor(production, false)), 'production sends no noindex');
  const preview = headersFor(production, true);
  assert.match(preview, /\n\/\*\n {2}X-Robots-Tag: noindex\n$/);
  assert.ok(preview.includes(NOINDEX_RULE));
  assert.ok(preview.startsWith(production.trimEnd()), 'the existing rules are kept');
  assert.equal(isPreviewBuild(new Set(['--preview']), {}), true);
  assert.equal(isPreviewBuild(new Set(), { SITE_PREVIEW: 'true' }), true);
  assert.equal(isPreviewBuild(new Set(), {}), false);
  assert.equal(isPreviewBuild(new Set(), { SITE_PREVIEW: 'false' }), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readKey, setSiteData, lookup } from '../src/shims/site-data.js';
import { apexMethod, refreshApex, NOT_IN_BUILD } from '../src/shims/apex.js';
import { gql, graphqlParams, normalizeQuery, graphql } from '../src/shims/graphql.js';
import { keyOf } from '../build/export.mjs';
import { currentPageReference } from '../src/shims/navigation.js';

test('a read key sorts parameters and drops undefined ones', () => {
  assert.equal(readKey('A.b', { z: 1, a: 2, gone: undefined }), 'A.b|{"a":2,"z":1}');
  assert.equal(readKey('A.b', {}), 'A.b');
  assert.equal(readKey('A.b', { list: ['y', 'x'] }), 'A.b|{"list":["y","x"]}', 'list order is kept');
});

test('lookup answers inline reads and reports missing ones', async () => {
  setSiteData({ reads: { 'A.b': [1] }, lazy: {}, build: {} });
  assert.deepEqual(await lookup('A.b', {}), { found: true, value: [1] });
  const missing = await lookup('A.c', {});
  assert.equal(missing.found, false);
});

function wire(method, config) {
  const emitted = [];
  const adapter = new method.adapter((value) => emitted.push(value));
  adapter.connect();
  adapter.update(config);
  return new Promise((resolve) => setTimeout(() => resolve(emitted), 10));
}

test('a build time wire sends the build data', async () => {
  setSiteData({ reads: { 'R.get|{"persona":"Admin"}': { ok: true } }, lazy: {}, build: {} });
  const emitted = await wire(apexMethod('R.get', 'build'), { persona: 'Admin' });
  assert.deepEqual(emitted, [{ data: { ok: true }, error: undefined }]);
});

test('a wire with an undefined parameter is not provisioned, as on the platform', async () => {
  setSiteData({ reads: {}, lazy: {}, build: {} });
  const emitted = await wire(apexMethod('R.get', 'build'), { persona: undefined });
  assert.deepEqual(emitted, []);
});

test('a read missing from the build comes back as an error, never as data', async () => {
  setSiteData({ reads: {}, lazy: {}, build: {} });
  const [only] = await wire(apexMethod('R.get', 'build'), {});
  assert.equal(only.data, undefined);
  assert.equal(only.error.body.message, NOT_IN_BUILD);
});

test('a request time call rejects until the site functions exist', async () => {
  await assert.rejects(apexMethod('C.submit', 'request')({ a: 1 }), (error) => error.body.message === NOT_IN_BUILD);
  assert.equal(await refreshApex(), undefined);
});

test('the gql tag and the export file a query under the same key', () => {
  const text = `
    query ProjectAssetGallery($pillar: Picklist) {
      uiapi { query { Project__c(where: { Pillar__c: { eq: $pillar } }) { edges { node { Id } } } } }
    }`;
  const tagged = gql([text]);
  const shimKey = readKey('graphql', graphqlParams({ query: tagged, variables: { pillar: 'A' } }));
  assert.equal(shimKey, keyOf({ call: 'graphql', query: text, variables: { pillar: 'A' } }));
  assert.equal(normalizeQuery('a  {\n b }'), 'a{b}');
});

test('the graphql wire sends data and errors in the platform shape', async () => {
  const query = gql(['query Q { uiapi { query { Skill__c { edges { node { Id } } } } } }']);
  setSiteData({
    reads: { [readKey('graphql', graphqlParams({ query }))]: { data: { uiapi: {} }, errors: [] } },
    lazy: {},
    build: {}
  });
  const emitted = await wire({ adapter: graphql }, { query });
  assert.deepEqual(emitted[0].data, { uiapi: {} });
  assert.deepEqual(emitted[0].errors, []);
});

test('the page reference names the route the page was built for', () => {
  setSiteData({ reads: {}, lazy: {}, build: { routeName: 'Docs__c' } });
  assert.equal(currentPageReference().attributes.name, 'Docs__c');
});

test('a failed section load is dropped when the page is being left and thrown otherwise', async () => {
  const { unlessLeaving, setLeaving } = await import('../src/shims/leaving.js');
  const failure = new TypeError('Importing a module script failed.');
  setLeaving(false);
  assert.throws(() => unlessLeaving(failure), /Importing a module script failed/);
  setLeaving(true);
  assert.equal(unlessLeaving(failure), null);
  setLeaving(false);
});

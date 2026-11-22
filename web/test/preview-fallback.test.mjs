import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReads, keyOf } from '../build/export.mjs';

// A preview of a pull request that adds a read reads production before that read is deployed
// there. The export then answers NOT_ALLOWED: Unknown call. These tests pin when the preview
// may use the read's sample data and when the build must still fail.

const CONNECTION = { instanceUrl: 'https://example.my.salesforce.com', token: 'token', targetOrg: 'test' };
const KNOWN = { call: 'ProjectCardController.getBuildCounts' };
const NEW_READ = { call: 'GovernanceController.getGovernanceEvidence' };

function mockExport(t, answers) {
  const reply = (body, status = 200) => ({ status, text: async () => JSON.stringify(body) });
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).endsWith('/limits')) return reply({});
    const call = new URL(String(url)).searchParams.get('call');
    const answer = answers[call];
    if (answer && answer.error) return reply({ call, error: answer.error, message: answer.message }, answer.status || 400);
    return reply({ call, result: answer });
  });
  t.mock.method(console, 'log', () => {});
}

test('a preview uses the sample data for a read the org does not serve yet, and says which', async (t) => {
  mockExport(t, {
    [KNOWN.call]: { apexPassed: 1 },
    [NEW_READ.call]: { error: 'NOT_ALLOWED', message: 'Unknown call.' }
  });
  const sample = { governedTotal: 7, runs: [] };
  const usedFallback = [];
  const results = await runReads(CONNECTION, [KNOWN, NEW_READ], {
    fallback: { [keyOf(NEW_READ)]: sample },
    usedFallback
  });
  assert.deepEqual(results[keyOf(KNOWN)], { apexPassed: 1 }, 'a served read still comes from the org');
  assert.deepEqual(results[keyOf(NEW_READ)], sample, 'the new read takes its sample data');
  assert.deepEqual(usedFallback, [keyOf(NEW_READ)]);
});

test('a production build has no fallback, so a read the org does not serve fails the build', async (t) => {
  mockExport(t, { [NEW_READ.call]: { error: 'NOT_ALLOWED', message: 'Unknown call.' } });
  await assert.rejects(runReads(CONNECTION, [NEW_READ]), /NOT_ALLOWED: Unknown call/);
});

test('any other export failure still fails a preview, even with sample data for that read', async (t) => {
  mockExport(t, { [NEW_READ.call]: { error: 'CALL_FAILED', message: 'Something broke.', status: 500 } });
  await assert.rejects(
    runReads(CONNECTION, [NEW_READ], { fallback: { [keyOf(NEW_READ)]: { governedTotal: 1 } } }),
    /CALL_FAILED/
  );
});

test('a read with no sample data still fails a preview when the org does not serve it', async (t) => {
  mockExport(t, { [NEW_READ.call]: { error: 'NOT_ALLOWED', message: 'Unknown call.' } });
  await assert.rejects(runReads(CONNECTION, [NEW_READ], { fallback: {} }), /NOT_ALLOWED: Unknown call/);
});

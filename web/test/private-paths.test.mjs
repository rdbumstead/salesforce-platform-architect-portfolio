// No private evaluation file is ever tracked. Real postings, gold selections, run results and a
// snapshot built from real data live only in paths git ignores. The commit hook refuses a staged
// one, and this test refuses a tracked one wherever the web tests run.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { privatePaths } = require('../../scripts/check-private-paths.js');

test('the private path rule names the private folders and nothing public', () => {
  const files = [
    'web/tailor-eval/private/postings/real.json',
    'web/tailor-eval/private/runs/2026-01-01-fake.json',
    'web/tailor-eval/gold/posting-1.json',
    'web/tailor-eval/gold/README.md',
    'web/functions/_generated/resume-snapshot.json',
    'web/functions/_generated/lab-paths.js',
    'web/tailor-eval/postings/posting-1-engineer.json',
    'web/tailor-eval/snapshot/resume-snapshot.json'
  ];
  assert.deepEqual(privatePaths(files), [
    'web/tailor-eval/private/postings/real.json',
    'web/tailor-eval/private/runs/2026-01-01-fake.json',
    'web/tailor-eval/gold/posting-1.json',
    'web/functions/_generated/resume-snapshot.json'
  ]);
});

test('no private evaluation file is tracked', () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 })
    .toString()
    .split('\0')
    .filter(Boolean);
  assert.deepEqual(privatePaths(tracked), []);
});

test('git ignores the private folders', () => {
  for (const path of ['web/tailor-eval/private/x.json', 'web/functions/_generated/resume-snapshot.json']) {
    const out = execFileSync('git', ['check-ignore', '--no-index', path], { cwd: root }).toString().trim();
    assert.equal(out, path);
  }
});

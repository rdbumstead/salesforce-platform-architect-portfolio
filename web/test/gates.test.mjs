import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scan } from '../build/leak-scan.mjs';
import { apexAllowlist, compare } from '../build/check-export-coverage.mjs';

function site(reads, extraHtml = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leak-'));
  const block = JSON.stringify({ build: {}, reads, lazy: {} });
  fs.writeFileSync(path.join(dir, 'index.html'), `<html><body>${extraHtml}<script type="application/json" id="site-data">${block}</script></body></html>`);
  return dir;
}

test('a clean build passes the leak scan', () => {
  const dir = site({ 'ResumeController.getHeader': { heroLine: 'Architect', valueSentence: 'x' } });
  assert.deepEqual(scan(dir, { denylist: 'zzzz' }).problems, []);
});

test('the leak scan catches a session id, an undeclared field, an email and a denylisted term', () => {
  const dir = site(
    { 'ResumeController.getHeader': { heroLine: 'Built for Acme Widgets', secretField__c: 'x', note: 'mail me@real-domain.com' } },
    '00DEm00000YjHNh!AQEAQabcdefghijklmnopqrstuvwxyz0123456789'
  );
  const { problems } = scan(dir, { denylist: 'acme widgets' });
  assert.ok(problems.some((problem) => problem.includes('session id')));
  assert.ok(problems.some((problem) => problem.includes('secretField__c')));
  assert.ok(problems.some((problem) => problem.includes('email address')));
  assert.ok(problems.some((problem) => problem.includes('denylisted term')));
  assert.ok(!problems.some((problem) => problem.toLowerCase().includes('acme')), 'a match is never printed');
});

test('example domains are allowed, and a fixture build may skip the denylist', () => {
  const dir = site({ 'ResumeController.getHeader': { heroLine: 'write to you@example.com' } });
  const result = scan(dir, { fixture: true });
  assert.deepEqual(result.problems, []);
  assert.equal(result.notices.length, 1);
});

test('a real data build with no denylist fails', () => {
  const dir = site({});
  assert.ok(scan(dir, {}).problems.some((problem) => problem.includes('SITE_DENYLIST')));
});

test('the coverage gate reads the allowlist from the Apex class', () => {
  const allowlist = apexAllowlist();
  assert.ok(allowlist.has('ResumeController.getHeader'));
  assert.ok(!allowlist.has('ContactFormController.submitContact'));
});

test('the coverage gate catches an uncovered import, an unused allowlist entry and a write on the allowlist', () => {
  const problems = compare({
    imported: new Set(['A.read', 'FooterController.getSystemSnapshot']),
    allowlist: new Set(['B.read', 'ContactFormController.submitContact']),
    queries: [{ name: 'NewQuery', file: 'x.js' }],
    planned: new Set()
  });
  assert.ok(problems.some((problem) => problem.startsWith('A.read is imported')));
  assert.ok(problems.some((problem) => problem.startsWith('B.read is on the export allowlist')));
  assert.ok(problems.some((problem) => problem.includes('submitContact must never be')));
  assert.ok(problems.some((problem) => problem.includes('NewQuery')));
  assert.ok(!problems.some((problem) => problem.includes('getSystemSnapshot is imported')), 'request time calls are not exported');
});

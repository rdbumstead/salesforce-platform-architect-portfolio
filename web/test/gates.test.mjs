import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scan, isExampleAddress } from '../build/leak-scan.mjs';
import { apexAllowlist, compare } from '../build/check-export-coverage.mjs';

test('only reserved example domains count as example addresses', () => {
  assert.ok(isExampleAddress('you@example.com'));
  assert.ok(isExampleAddress('jobs@acme.example'));
  assert.ok(isExampleAddress('a@mail.example.org'));
  assert.ok(!isExampleAddress('someone@examplexcom.net'), 'a dot is a dot, not any character');
  assert.ok(!isExampleAddress('me@real-domain.com'));
  assert.ok(!isExampleAddress('x@example.com.attacker.net'));
});

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

test('a denylist term matches whole words only', () => {
  const denylist = 'XYZ, acmewidgets, Acme Widgets';
  const clean = site({
    'ResumeController.getHeader': { heroLine: 'Quotes from Pat Xyzzy and Sam McXyz', valueSentence: 'glass acmewidgetsco' }
  });
  assert.deepEqual(scan(clean, { denylist }).problems, [], 'a term inside a longer word is not a match');
  ['XYZ', 'Built at (xyz).', 'line one\nXYZ', 'see https://www.acmewidgets.org/about', 'Acme\n  Widgets'].forEach((heroLine) => {
    const dir = site({ 'ResumeController.getHeader': { heroLine } });
    assert.ok(
      scan(dir, { denylist }).problems.some((problem) => problem.includes('denylisted term')),
      `a whole word is a match: ${JSON.stringify(heroLine)}`
    );
  });
});

test('a denylisted word in a page text outside the data block fails the scan', () => {
  const denylist = 'acme widgets';
  const clean = site({ 'ResumeController.getHeader': { heroLine: 'Architect' } }, '<p>Built for a university.</p>');
  assert.deepEqual(scan(clean, { denylist }).problems, []);
  [
    '<p>Built for Acme Widgets.</p>',
    '<p>Built for Acme&nbsp;Widgets.</p>',
    '<img alt="Acme Widgets" src="/x.png">',
    '<meta name="description" content="Acme &amp; Acme Widgets">'
  ].forEach((extra) => {
    const dir = site({ 'ResumeController.getHeader': { heroLine: 'Architect' } }, extra);
    const { problems } = scan(dir, { denylist });
    assert.ok(problems.some((problem) => problem.includes('page text')), `caught: ${extra}`);
    assert.ok(!problems.some((problem) => problem.toLowerCase().includes('acme')), 'a match is never printed');
  });
});

test('a denylisted word in a .txt file fails the scan, and a clean .txt file passes', () => {
  const dir = site({ 'ResumeController.getHeader': { heroLine: 'Architect' } });
  fs.writeFileSync(path.join(dir, 'llms.txt'), '# Ryan\n\n- [Resume](https://example.com/resume): a resume\n');
  assert.deepEqual(scan(dir, { denylist: 'acme widgets' }).problems, []);
  fs.writeFileSync(path.join(dir, 'llms.txt'), '# Ryan\n\nBuilt for Acme Widgets.\n');
  fs.mkdirSync(path.join(dir, 'sr'));
  fs.writeFileSync(path.join(dir, 'sr', 'notes.txt'), 'Acme Widgets');
  const { problems } = scan(dir, { denylist: 'acme widgets' });
  assert.ok(problems.includes('llms.txt contains a denylisted term'));
  assert.ok(problems.some((problem) => problem.endsWith('notes.txt contains a denylisted term')));
  assert.ok(!problems.some((problem) => problem.toLowerCase().includes('acme')));
});

test('a secret in a .txt file fails the scan', () => {
  const dir = site({ 'ResumeController.getHeader': { heroLine: 'Architect' } });
  fs.writeFileSync(path.join(dir, 'llms.txt'), '-----BEGIN PRIVATE KEY-----');
  assert.ok(scan(dir, { denylist: 'zzzz' }).problems.some((problem) => problem.includes('private key')));
});

test('an allowed entry that starts with @ allows that exact domain only', () => {
  const allowedEmails = '@owner.test, one@other.test';
  const ok = site({ 'ResumeController.getHeader': { heroLine: 'a@owner.test b@owner.test one@other.test' } });
  assert.deepEqual(scan(ok, { denylist: 'zzzz', allowedEmails }).problems, []);
  ['two@other.test', 'a@sub.owner.test', 'a@owner.test.evil.test', 'a@notowner.test'].forEach((address) => {
    const dir = site({ 'ResumeController.getHeader': { heroLine: `write to ${address}` } });
    assert.ok(
      scan(dir, { denylist: 'zzzz', allowedEmails }).problems.some((problem) => problem.includes('email address')),
      `${address} is not allowed`
    );
  });
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

test('the host check flags a run that ended on the Access login page', async () => {
  const { offTarget } = await import('../build/lighthouse-hosts.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhr-hosts-'));
  const write = (name, finalDisplayedUrl) =>
    fs.writeFileSync(path.join(dir, name), JSON.stringify({ finalDisplayedUrl }));
  write('lhr-1.json', 'https://7da5.ryanbumstead.pages.dev/resume');
  write('lhr-2.json', 'https://team.cloudflareaccess.com/cdn-cgi/access/login/7da5.ryanbumstead.pages.dev');
  fs.writeFileSync(path.join(dir, 'manifest.json'), '[]');
  const misses = offTarget(dir, 'https://7da5.ryanbumstead.pages.dev');
  assert.equal(misses.length, 1);
  assert.equal(misses[0].file, 'lhr-2.json');
  assert.deepEqual(offTarget(dir, 'https://team.cloudflareaccess.com').map((m) => m.file), ['lhr-1.json']);
});

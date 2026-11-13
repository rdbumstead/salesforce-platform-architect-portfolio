import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inject, resolveFile, serve, shareSheets } from '../build/prerender.mjs';

function tempDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prerender-'));
  fs.writeFileSync(path.join(dir, 'index.html'), 'home');
  fs.writeFileSync(path.join(dir, 'resume.html'), 'resume');
  fs.mkdirSync(path.join(dir, 'api-lab'));
  fs.writeFileSync(path.join(dir, 'api-lab', 'reference.html'), 'reference');
  fs.writeFileSync(path.join(dir, 'llms.txt'), 'text');
  return dir;
}

const PAGE = [
  '<body>',
  '<div id="site-root"><section id="static-summary">Summary</section><noscript><p>This site needs JavaScript to show its sections.</p></noscript></div>',
  '<script type="application/json" id="site-data">{}</script>',
  '</body>'
].join('\n');

test('a path resolves the way Cloudflare Pages resolves it', () => {
  const dir = tempDist();
  assert.equal(path.basename(resolveFile(dir, '/')), 'index.html');
  assert.equal(path.basename(resolveFile(dir, '/resume')), 'resume.html');
  assert.equal(path.basename(resolveFile(dir, '/resume?x=1')), 'resume.html');
  assert.equal(path.basename(resolveFile(dir, '/api-lab/reference')), 'reference.html');
  assert.equal(path.basename(resolveFile(dir, '/llms.txt')), 'llms.txt');
  assert.equal(resolveFile(dir, '/missing'), null);
});

test('a path cannot leave the build folder', () => {
  const dir = tempDist();
  assert.equal(resolveFile(dir, '/../index.html'), null);
  assert.equal(resolveFile(dir, '/%2e%2e/index.html'), null);
});

test('the rendered markup goes first, the summary stays hidden after it, and the root is marked', () => {
  const html = inject(PAGE, '<c-hero><template shadowrootmode="open">Hello</template></c-hero>');
  assert.ok(html.includes('<div id="site-root" data-prerendered="true"><c-hero>'));
  assert.ok(html.includes('<section hidden id="static-summary">Summary</section></div>'));
  assert.ok(!html.includes('needs JavaScript'));
  assert.ok(html.includes('<script type="application/json" id="site-data">{}</script>'), 'the data block stays');
});

test('a dollar sign in the markup is kept as written', () => {
  const html = inject(PAGE, '<p>$& costs $1 and $$</p>');
  assert.ok(html.includes('<p>$& costs $1 and $$</p>'));
});

test('a page with no site-root block fails the step', () => {
  assert.throws(() => inject('<body></body>', 'x'), /no site-root block/);
});

test('the local server answers every switch live and 404 for a missing file', async () => {
  const dir = tempDist();
  const { server, origin } = await serve(dir);
  try {
    const features = await (await fetch(`${origin}/api/features`)).json();
    assert.deepEqual(Object.values(features).filter((value) => value !== 'live'), []);
    assert.equal((await fetch(`${origin}/resume`)).status, 200);
    assert.equal((await fetch(`${origin}/nope`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('each distinct sheet is written once under assets and the markers point at it', () => {
  const dir = tempDist();
  const markup = '<link rel="stylesheet" href="#sheet-0"><link rel="stylesheet" href="#sheet-1"><link rel="stylesheet" href="#sheet-0">';
  const shared = shareSheets(dir, markup, ['a{color:red}', 'b{color:blue}']);
  assert.equal(shared.files.length, 2);
  const names = fs.readdirSync(path.join(dir, 'assets')).sort();
  assert.deepEqual(names, [...shared.files].sort());
  assert.ok(!shared.markup.includes('#sheet-'));
  assert.equal(shared.markup.split(`/assets/${shared.files[0]}`).length - 1, 2, 'the first sheet is linked twice and written once');
  assert.equal(fs.readFileSync(path.join(dir, 'assets', shared.files[1]), 'utf8'), 'b{color:blue}');
});

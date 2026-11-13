import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inject, resolveFile, serve } from '../build/prerender.mjs';

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

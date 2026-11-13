/**
 * Prerenders every public page after the build.
 *
 *   node build/prerender.mjs [dist]
 *
 * It serves the built site on a private local port, opens each public route in headless
 * Chrome, waits until the page has finished mounting, and writes the rendered markup into
 * that route's HTML inside site-root. Crawlers, link previews and AI assistants read the
 * first HTML response, so they now get the sections and not only the head and the summary.
 * The page still mounts the live components on load. src/shims/mount.js builds them out of
 * sight and swaps them in once all of them are in place.
 *
 * Shadow DOM: the components run in native shadow roots. The browser is asked to create
 * every root serializable, and the root is read with getHTML, which writes each one as a
 * declarative shadow root. Adopted style sheets are not serialized by the browser, so each
 * distinct sheet is written once to assets/pr-<hash>.css and every root links the sheets it
 * adopted, in order. Without that the markup would parse into roots with no styles. Set
 * PRERENDER_STYLES=inline to copy the text into each root instead, for comparison.
 *
 * Data: the page is served from dist, so it reads the same inlined and recorded data the
 * build wrote. Nothing reaches Salesforce, and every request to another host is refused.
 * The local /api/features answer says every switch is live, so the forms are drawn the way
 * the production host draws them. Without it they would be drawn as the recorded note.
 *
 * The browser driver is not a dependency of this repo. It resolves playwright or
 * playwright-core from PRERENDER_MODULES (a node_modules folder), then the usual places.
 * Set CHROME_PATH to use an installed Chrome.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SITE_ROOT_BLOCK = /<div id="site-root">([\s\S]*?)<noscript>[\s\S]*?<\/noscript><\/div>/;

const ALL_LIVE = { contact: 'live', testimonial: 'live', coverLetter: 'live', apiLab: 'live', liveReads: 'live' };

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

/** Where a request path lives inside dist, the way Cloudflare Pages resolves it. */
export function resolveFile(distDir, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const relative = clean.replace(/^\/+/, '');
  const base = path.resolve(distDir);
  const candidates = relative === '' ? ['index.html'] : [relative, `${relative}.html`, path.join(relative, 'index.html')];
  for (const candidate of candidates) {
    const file = path.resolve(base, candidate);
    if (!file.startsWith(base + path.sep)) continue;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

/** Serves dist on a free local port. Resolves with the server and its origin. */
export function serve(distDir) {
  const server = http.createServer((request, response) => {
    const url = request.url || '/';
    if (url.split('?')[0] === '/api/features') {
      response.writeHead(200, { 'content-type': TYPES['.json'] });
      response.end(JSON.stringify(ALL_LIVE));
      return;
    }
    const file = resolveFile(distDir, url);
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

/**
 * Puts the rendered markup in place of site-root's contents. The static summary stays after
 * it with the hidden attribute, so a reader that skips the shadow roots still finds the page
 * links and the profile links. The no script note goes, because the page now shows without
 * a script. Throws when the page has no site-root block.
 */
export function inject(html, markup) {
  if (!SITE_ROOT_BLOCK.test(html)) throw new Error('The page has no site-root block to prerender into.');
  // A function replacement, so a dollar sign in the markup is never read as a pattern.
  return html.replace(SITE_ROOT_BLOCK, (all, summary) => {
    const kept = summary.trim().replace(/^<([a-z][a-z0-9]*)/i, '<$1 hidden');
    return `<div id="site-root" data-prerendered="true">${markup}${kept}</div>`;
  });
}

function loadDriver() {
  const require = createRequire(import.meta.url);
  const paths = [process.env.PRERENDER_MODULES, process.cwd()].filter(Boolean);
  for (const name of ['playwright', 'playwright-core']) {
    try {
      return require(require.resolve(name, { paths }));
    } catch (error) {
      // try the next name
    }
  }
  throw new Error('No browser driver: install playwright-core and set PRERENDER_MODULES to its node_modules folder.');
}

/** Runs before any page script: every shadow root is created serializable. */
function makeRootsSerializable() {
  const attach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function attachSerializable(init) {
    return attach.call(this, { ...init, serializable: true });
  };
}

/**
 * Runs in the page: puts a link marker in each root for every adopted sheet, in order, then
 * reads site-root with its roots. Returns the markup and the distinct sheet texts, where
 * marker N in the markup stands for sheet N. With inline set, the text goes in a style
 * element in each root instead and no sheets come back.
 */
function readMarkup(inline) {
  const root = document.getElementById('site-root');
  const seen = new Set();
  const sheets = [];
  const stats = { roots: 0, copies: 0 };
  const visit = (node) => {
    if (seen.has(node)) return;
    seen.add(node);
    if (node.shadowRoot) {
      const shadow = node.shadowRoot;
      stats.roots += 1;
      const texts = [...shadow.adoptedStyleSheets].map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join('\n'));
      const parts = texts.map((text) => {
        stats.copies += text.length;
        if (inline) {
          const style = document.createElement('style');
          style.textContent = text;
          return style;
        }
        let index = sheets.indexOf(text);
        if (index === -1) index = sheets.push(text) - 1;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '#sheet-' + index;
        return link;
      });
      shadow.prepend(...parts);
      visit(shadow);
    }
    Array.from(node.children || []).forEach(visit);
  };
  visit(root);
  return { markup: root.getHTML({ serializableShadowRoots: true }), sheets, stats };
}

/** Writes each distinct sheet once under assets, named by its content, and points the markers at the files. */
export function shareSheets(distDir, markup, sheets) {
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
  let out = markup;
  const files = [];
  sheets.forEach((text, index) => {
    const name = `pr-${crypto.createHash('sha256').update(text).digest('hex').slice(0, 10)}.css`;
    fs.writeFileSync(path.join(distDir, 'assets', name), text);
    files.push(name);
    out = out.split(`href="#sheet-${index}"`).join(`href="/assets/${name}"`);
  });
  return { markup: out, files };
}

/** Waits until the page has mounted every component and its markup has stopped changing. */
async function settled(page) {
  await page.waitForSelector('#site-root[data-ready]', { state: 'attached', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  let last = -1;
  let steady = 0;
  for (let i = 0; i < 40 && steady < 3; i += 1) {
    const length = await page.evaluate(() => document.getElementById('site-root').getHTML({ serializableShadowRoots: true }).length);
    steady = length === last ? steady + 1 : 0;
    last = length;
    await page.waitForTimeout(200);
  }
  if (steady < 3) throw new Error('The page markup kept changing and never settled.');
}

export async function prerender({ distDir, routes, log = () => {} }) {
  const driver = loadDriver();
  const { server, origin } = await serve(distDir);
  const browser = await driver.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const results = [];
  const inline = process.env.PRERENDER_STYLES === 'inline';
  try {
    const context = await browser.newContext({
      viewport: { width: Number(process.env.PRERENDER_WIDTH) || 390, height: 844 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block'
    });
    await context.route('**/*', (route) => (route.request().url().startsWith(origin) ? route.continue() : route.abort()));
    await context.addInitScript(makeRootsSerializable);
    for (const route of routes.filter((entry) => entry.path)) {
      const page = await context.newPage();
      const problems = [];
      page.on('pageerror', (error) => problems.push(`script error: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push(`console error: ${message.text()}`);
      });
      try {
        await page.goto(`${origin}${route.path}`, { waitUntil: 'load' });
        await settled(page);
        const read = await page.evaluate(readMarkup, inline);
        const shared = inline ? { markup: read.markup, files: [] } : shareSheets(distDir, read.markup, read.sheets);
        const markup = shared.markup;
        if (problems.length) throw new Error(problems.join(' | '));
        const file = path.join(distDir, route.file);
        const withMarkup = inject(fs.readFileSync(file, 'utf8'), markup);
        fs.writeFileSync(file, withMarkup);
        results.push({ path: route.path, bytes: markup.length, roots: read.stats.roots, copiedCss: read.stats.copies, distinctSheets: read.sheets.length });
        log(`Prerendered ${route.path} (${markup.length} characters, ${read.stats.roots} roots, ${read.stats.copies} characters of sheet text, ${read.sheets.length} distinct sheets).`);
      } catch (error) {
        throw new Error(`Prerender of ${route.path} failed: ${error.message}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const distDir = path.resolve(process.argv[2] || fileURLToPath(new URL('../dist', import.meta.url)));
  const { readRoutes } = await import('./routes.mjs');
  const started = Date.now();
  prerender({ distDir, routes: readRoutes().routes, log: console.log })
    .then((results) => console.log(`Prerendered ${results.length} pages in ${Date.now() - started} ms.`))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

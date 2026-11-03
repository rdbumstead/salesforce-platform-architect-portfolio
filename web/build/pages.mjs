/**
 * Writes one HTML page per route, the shared stylesheet, the analytics script, the data
 * files, sitemap.xml and robots.txt.
 *
 * The global head tags (icons, link preview image, the Person block) and the GA4 bootstrap
 * come from the Salesforce site's own head markup, and each route's title, description and
 * link preview tags from its view, so both hosts read one source until cutover.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SITE_DIR, SITE_ORIGIN } from './routes.mjs';

/** Reads under this many characters are inlined in the page. Larger ones load on demand. */
export const INLINE_LIMIT = 12000;

const SALESFORCE_SITE = /https:\/\/[a-z0-9-]+\.develop\.my\.site\.com\/portfolio/g;

function hash(text, length = 10) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, length);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Characters that would end the script element or break it as a line. */
const UNSAFE_IN_SCRIPT = new RegExp('[<' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');

/** JSON that is safe inside a script element. */
export function scriptJson(value) {
  return JSON.stringify(value).replace(UNSAFE_IN_SCRIPT, (c) => String.fromCharCode(92) + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

function resourcePath(text, resourceUrls) {
  const swap = (origin) => (all, name, rest) => {
    const url = resourceUrls.get(name);
    return url ? `${origin}${url}${rest}` : all;
  };
  return text
    .replace(/\{ basePath \}\/sfsites\/c\/resource\/([A-Za-z0-9_]+)((?:\/[^"'\s?]*)?)/g, swap(''))
    .replace(
      /https:\/\/[a-z0-9-]+\.develop\.my\.site\.com\/portfolio\/sfsites\/c\/resource\/([A-Za-z0-9_]+)((?:\/[^"'\s?]*)?)/g,
      swap(SITE_ORIGIN)
    );
}

/**
 * Splits the site's head markup into the tags every static page keeps, the GA4 bootstrap,
 * and the GA4 loader address.
 */
export function readHeadMarkup(resourceUrls, siteDir = SITE_DIR) {
  const app = JSON.parse(
    fs.readFileSync(path.join(siteDir, 'sfdc_cms__appPage/mainAppPage/content.json'), 'utf8')
  );
  const markup = app.contentBody.headMarkup;
  const keep = [];
  const perRoute = /property="og:(title|description|url)"|name="twitter:(title|description)"|name="description"/;
  for (const match of markup.matchAll(/<(link|meta)\b[^>]*>/g)) {
    const tag = match[0];
    if (perRoute.test(tag)) continue;
    if (/\/assets\/styles\/|\{ styles\//.test(tag)) continue;
    if (/rel="preload"/.test(tag)) continue;
    keep.push(resourcePath(tag, resourceUrls).replace(SALESFORCE_SITE, SITE_ORIGIN));
  }
  const jsonLd = (markup.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/) || [])[0];
  if (jsonLd) keep.push(jsonLd);
  const inline = [...markup.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const hidden = [...markup.matchAll(/<x-oasis-script hidden="true"[^>]*>([\s\S]*?)<\/x-oasis-script>/g)].map((m) => m[1]);
  const loader = (markup.match(/<x-oasis-script async src="([^"]+)"/) || [])[1] || null;
  return { tags: keep, analytics: [...hidden, ...inline].join('\n'), analyticsLoader: loader };
}

/** The site's global stylesheet, with its font addresses moved to /sr. */
export function siteStylesheet(siteDir = SITE_DIR) {
  const css = fs.readFileSync(path.join(siteDir, 'sfdc_cms__styles/styles_css/styles.css'), 'utf8');
  return css.replace(/url\((["']?)(?:\.\.\/)+resource\/([A-Za-z0-9_]+)\//g, 'url($1/sr/$2/');
}

function writeHashed(distDir, name, extension, text) {
  const file = `assets/${name}-${hash(text)}.${extension}`;
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(distDir, file), text);
  return `/${file}`;
}

/** Splits a route's reads into those inlined in the page and those it fetches on demand. */
export function pageData(keys, reads, distDir, written) {
  const inline = {};
  const lazy = {};
  keys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(reads, key)) return;
    const text = JSON.stringify(reads[key]);
    if (text.length <= INLINE_LIMIT) {
      inline[key] = reads[key];
      return;
    }
    if (!written.has(key)) {
      const file = `data/${hash(text, 16)}.json`;
      fs.mkdirSync(path.join(distDir, 'data'), { recursive: true });
      fs.writeFileSync(path.join(distDir, file), text);
      written.set(key, `/${file}`);
    }
    lazy[key] = written.get(key);
  });
  return { inline, lazy };
}

function page({ route, head, styles, scripts, data, analytics, analyticsLoader, fontPreload }) {
  const lines = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(route.title)}</title>`
  ];
  if (route.description) lines.push(`<meta name="description" content="${escapeHtml(route.description)}">`);
  if (route.headTags) lines.push(route.headTags.trim());
  if (route.errorCode) lines.push('<meta name="robots" content="noindex">');
  lines.push(...head);
  if (fontPreload) lines.push(`<link rel="preload" href="${fontPreload}" as="font" type="font/woff2" crossorigin>`);
  lines.push(`<link rel="stylesheet" href="${styles}">`);
  scripts.slice(1).forEach((chunk) => lines.push(`<link rel="modulepreload" href="${chunk}">`));
  if (analytics) lines.push(`<script src="${analytics}"></script>`);
  if (analyticsLoader) lines.push(`<script async src="${escapeHtml(analyticsLoader)}"></script>`);
  if (route.autoRefresh) lines.push('<meta http-equiv="refresh" content="30">');
  lines.push(
    '</head>',
    '<body>',
    '<div id="site-root"><noscript><p>This site needs JavaScript to show its sections.</p></noscript></div>',
    `<script type="application/json" id="site-data">${scriptJson(data)}</script>`,
    `<script type="module" src="${scripts[0]}"></script>`,
    '</body>',
    '</html>',
    ''
  );
  return lines.join('\n');
}

/**
 * @param {object} input routes, scripts (route key to script URLs), readKeys (route key to
 *   read keys), reads (all results by key), manifest, resourceUrls, distDir
 */
export function writePages(input) {
  const { routes, scripts, readKeys, reads, manifest, resourceUrls, distDir } = input;
  const head = readHeadMarkup(resourceUrls);
  const styles = writeHashed(distDir, 'site', 'css', siteStylesheet());
  const analytics = head.analytics ? writeHashed(distDir, 'analytics', 'js', head.analytics) : null;
  const fonts = resourceUrls.get('Portfolio_Fonts');
  const fontPreload = fonts ? `${fonts}/inter-latin-400-normal.woff2` : null;
  const written = new Map();
  const build = {
    builtAt: manifest.builtAt,
    commit: manifest.commit || null,
    fixture: Boolean(manifest.fixture)
  };
  routes.forEach((route) => {
    const { inline, lazy } = pageData(readKeys.get(route.key) || [], reads, distDir, written);
    const html = page({
      route,
      head: head.tags,
      styles,
      scripts: scripts.get(route.key),
      data: { build: { ...build, routeName: route.routeName }, reads: inline, lazy },
      analytics,
      analyticsLoader: head.analyticsLoader,
      fontPreload
    });
    const file = path.join(distDir, route.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
  });

  const day = String(manifest.builtAt || '').slice(0, 10);
  const urls = routes
    .filter((route) => route.path)
    .map((route) => `  <url><loc>${SITE_ORIGIN}${route.path === '/' ? '/' : route.path}</loc>${day ? `<lastmod>${day}</lastmod>` : ''}</url>`);
  fs.writeFileSync(
    path.join(distDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
  );
  fs.writeFileSync(path.join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
  return { styles, analytics, lazyFiles: written.size };
}

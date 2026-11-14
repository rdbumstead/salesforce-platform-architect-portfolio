/**
 * Builds the static site into web/dist.
 *
 *   node build/build.mjs --export     read the data from Salesforce first (needs SF_TARGET_ORG)
 *   node build/build.mjs              use web/.data from an earlier export, else the fixtures
 *   node build/build.mjs --fixtures   use the committed sample data in web/fixtures
 *
 * Add --prerender to finish with the prerender step (build/prerender.mjs), which writes each
 * public page's rendered sections into its HTML. It needs a browser driver and Chrome.
 *
 * Add --write-fixtures to an --export run to refresh web/fixtures from that org.
 * A planned read with no data fails the build, so a page never ships a section that cannot load.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundle.mjs';
import { readRoutes } from './routes.mjs';
import { planRoute } from './plan.mjs';
import {
  connect,
  exportCall,
  exportSnapshot,
  fixtureRefusal,
  keyOf,
  readData,
  readFixtureSnapshot,
  runReads,
  snapshotCounts,
  writeData,
  writeSnapshot,
  DATA_DIR,
  FIXTURE_SNAPSHOT_FILE
} from './export.mjs';
import { copyResources, resourceIndex, resourcesNamedIn } from './resources.mjs';
import { writePages } from './pages.mjs';
import { readKey } from '../src/shims/site-data.js';
import { WEB_DIR } from './site-plugin.mjs';
import { writeLabPaths } from './lab-paths.mjs';
import { copyRecorded } from './recorded.mjs';
import { prerender } from './prerender.mjs';

export const DIST_DIR = path.join(WEB_DIR, 'dist');
export const FIXTURE_DIR = path.join(WEB_DIR, 'fixtures');
export const PUBLIC_DIR = path.join(WEB_DIR, 'public');

/** Resources the head and global stylesheet use, beside those the components import. */
const HEAD_RESOURCES = ['Portfolio_Favicon', 'Portfolio_Share_Image', 'Portfolio_Fonts', 'Mermaid_Diagrams'];

const DOCS_KEY = readKey('SourceController.getDocs', {});

/** Text longer than this is cut in the fixtures. Documents and source files are the long ones. */
export const FIXTURE_TEXT_LIMIT = 1500;

function isJsonText(text) {
  try {
    JSON.parse(text);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * The fixtures keep every read and its shape, with long text cut, so a build with no
 * Salesforce secrets still exercises every section without a copy of every document.
 * Text that is itself JSON (the API Lab catalog) stays whole, because the page parses it.
 */
export function fixtureReads(reads) {
  const cut = (value) => {
    if (typeof value === 'string') {
      if (value.length <= FIXTURE_TEXT_LIMIT || isJsonText(value)) return value;
      return `${value.slice(0, FIXTURE_TEXT_LIMIT)}\n\n(Sample text, cut short for the fixture build.)`;
    }
    if (Array.isArray(value)) return value.map(cut);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, cut(inner)]));
    }
    return value;
  };
  return cut(reads);
}

function docKeysFrom(reads) {
  const docs = reads[DOCS_KEY];
  return Array.isArray(docs) ? docs.filter((doc) => doc && doc.key).map((doc) => doc.key) : [];
}

function planAll(routes, reachable, org) {
  const plans = new Map();
  const problems = [];
  routes.forEach((route) => {
    const plan = planRoute(route, reachable.get(route.key) || new Set(), org);
    plans.set(route.key, plan);
    problems.push(...plan.problems);
  });
  return { plans, problems };
}

async function loadData(args, routes, reachable) {
  if (args.has('--export')) {
    const connection = connect(process.env.SF_TARGET_ORG);
    const docs = await exportCall(connection, 'SourceController.getDocs', {});
    const docKeys = docs.filter((doc) => doc && doc.key).map((doc) => doc.key);
    const { plans, problems } = planAll(routes, reachable, { docKeys });
    if (problems.length) throw new Error(`The read plan has problems:\n${problems.join('\n')}`);
    const reads = await runReads(connection, [...plans.values()].flatMap((plan) => plan.reads));
    const manifest = {
      builtAt: new Date().toISOString(),
      orgId: connection.orgId,
      commit: process.env.GITHUB_SHA || null,
      fixture: false,
      reads: Object.keys(reads).length
    };
    writeData(reads, manifest);
    // The resume snapshot is build only. It goes under functions/_generated, never into the
    // pages, and a snapshot that breaks its contract fails the build here.
    const snapshot = await exportSnapshot(connection);
    writeSnapshot(snapshot);
    console.log(`Resume snapshot: ${JSON.stringify(snapshotCounts(snapshot))}`);
    if (args.has('--write-fixtures')) {
      writeData(fixtureReads(reads), { ...manifest, orgId: null, commit: null, fixture: true }, FIXTURE_DIR);
      const refusal = fixtureRefusal(connection);
      if (refusal) throw new Error(refusal);
      writeSnapshot({ ...snapshot, generatedAt: '2026-01-01T00:00:00.000Z' }, FIXTURE_SNAPSHOT_FILE);
    }
    return { reads, manifest, plans };
  }
  const saved = !args.has('--fixtures') && readData(DATA_DIR);
  const data = saved || readData(FIXTURE_DIR);
  if (!data) throw new Error('No data: run with --export, or add web/fixtures.');
  if (!saved) {
    data.manifest = { ...data.manifest, fixture: true };
    writeSnapshot(readFixtureSnapshot());
    console.log('Fixture build: the pages show sample data, not data read from Salesforce.');
  }
  const { plans, problems } = planAll(routes, reachable, { docKeys: docKeysFrom(data.reads) });
  if (problems.length) throw new Error(`The read plan has problems:\n${problems.join('\n')}`);
  return { ...data, plans };
}

/** The header that keeps a preview build out of search results. Production never gets it. */
export const NOINDEX_HEADER = '  X-Robots-Tag: noindex';

/** True for a build that is not the production build: --preview, or SITE_PREVIEW=true. */
export function isPreviewBuild(args = new Set(), env = process.env) {
  return args.has('--preview') || String(env.SITE_PREVIEW || '').toLowerCase() === 'true';
}

/**
 * Adds noindex to a preview's headers inside the existing rule for every path. A second rule
 * for every path would work on Cloudflare, which joins the two, but `wrangler pages dev` keeps
 * only the later one and drops the CSP, and the pull request audit runs on wrangler.
 */
export function headersFor(text, preview) {
  if (!preview) return text;
  const lines = text.split('\n');
  const all = lines.findIndex((line) => line.trim() === '/*');
  if (all === -1) return `${text.trimEnd()}\n\n/*\n${NOINDEX_HEADER}\n`;
  lines.splice(all + 1, 0, `${NOINDEX_HEADER}${lines[all].endsWith('\r') ? '\r' : ''}`);
  return lines.join('\n');
}

function writeHostFiles(redirectLines, preview) {
  ['_headers', '_redirects'].forEach((name) => {
    const source = path.join(PUBLIC_DIR, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(DIST_DIR, name));
  });
  const headers = path.join(DIST_DIR, '_headers');
  if (preview && fs.existsSync(headers)) {
    fs.writeFileSync(headers, headersFor(fs.readFileSync(headers, 'utf8'), true));
  }
  const redirects = path.join(DIST_DIR, '_redirects');
  const existing = fs.existsSync(redirects) ? fs.readFileSync(redirects, 'utf8') : '';
  fs.writeFileSync(redirects, `${existing.trimEnd()}\n\n# Platform resource paths that records still use.\n${redirectLines.join('\n')}\n`);
}

export async function build(args = new Set()) {
  const started = Date.now();
  const { routes, skipped } = readRoutes();
  const resources = resourceIndex();
  const resourceUrls = new Map([...resources].map(([name, resource]) => [name, resource.url]));

  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const bundled = await bundle(routes, { outDir: DIST_DIR, resourceUrls, minify: !args.has('--no-minify') });
  const { reads, manifest, plans } = await loadData(args, routes, bundled.reachable);

  const missing = [];
  const readKeys = new Map();
  plans.forEach((plan, routeKey) => {
    const keys = plan.reads.map(keyOf);
    keys.filter((key) => !Object.prototype.hasOwnProperty.call(reads, key)).forEach((key) => missing.push(`${routeKey}: ${key}`));
    readKeys.set(routeKey, [...new Set(keys)]);
  });
  if (missing.length) throw new Error(`Planned reads with no data:\n${[...new Set(missing)].join('\n')}`);

  const wanted = new Set(HEAD_RESOURCES);
  plans.forEach((plan) => plan.resources.forEach((name) => wanted.add(name)));
  resourcesNamedIn(JSON.stringify(reads)).forEach((name) => wanted.add(name));
  const copied = copyResources(wanted, resources, DIST_DIR);
  if (copied.missing.length) console.log(`Records name resources that are not in the repo: ${copied.missing.join(', ')}`);
  const diagrams = path.join(DIST_DIR, 'sr/Mermaid_Diagrams/manifest.json');
  if (!fs.existsSync(diagrams)) {
    // scripts/render-mermaid.js writes the drawings and this list. Without them the docs page
    // shows each diagram as its source text, the way it does on Salesforce with none drawn.
    fs.mkdirSync(path.dirname(diagrams), { recursive: true });
    fs.writeFileSync(diagrams, '{"diagrams":{}}\n');
    console.log('No rendered Mermaid drawings: run scripts/render-mermaid.js first to include them.');
  }

  writePages({ routes, scripts: bundled.scripts, readKeys, reads, manifest, resourceUrls, distDir: DIST_DIR });
  writeLabPaths();
  copyRecorded(DIST_DIR, undefined, { fixture: Boolean(manifest.fixture) });
  writeHostFiles(copied.lines, isPreviewBuild(args));
  const prerendered = args.has('--prerender') ? await prerender({ distDir: DIST_DIR, routes, log: console.log }) : [];

  const report = {
    builtAt: manifest.builtAt,
    fixture: Boolean(manifest.fixture),
    prerendered: prerendered.map((entry) => entry.path),
    routes: routes.map((route) => route.path || route.file),
    skippedRoutes: skipped.map((route) => route.path),
    reads: Object.keys(reads).length,
    resources: [...wanted].sort(),
    apexCalls: [...bundled.apexCalls].sort(),
    ms: Date.now() - started
  };
  fs.mkdirSync(path.join(WEB_DIR, '.build'), { recursive: true });
  fs.writeFileSync(path.join(WEB_DIR, '.build/report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build(new Set(process.argv.slice(2)))
    .then((report) => {
      console.log(
        `Built ${report.routes.length} pages from ${report.reads} reads in ${report.ms} ms${report.fixture ? ' (fixture build)' : ''}.`
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

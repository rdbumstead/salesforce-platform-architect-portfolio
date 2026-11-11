/**
 * Leak scan of the built site. Reads every page's inlined data and every data file and fails on:
 *   - a Salesforce session id, an OAuth token or a private key anywhere in the output
 *   - a field name that no @AuraEnabled property and no GraphQL query in the repo declares,
 *     which would mean the export sent something the components never receive today
 *   - an email address other than those in SITE_ALLOWED_EMAILS, where an entry that starts
 *     with @ allows every address at exactly that domain
 *   - any term in SITE_DENYLIST (comma or newline separated, held as a secret, never in the repo),
 *     matched as a whole word in any text value, so a short term such as an acronym does not
 *     catch the middle of an ordinary word or a surname
 *   - the same denylist, matched against the text of every page (the head, the static summary and
 *     any other markup, with the data block left to the data checks above) and against every .txt
 *     file in the build, llms.txt included
 * A fixture build skips the denylist with a notice, because it holds sample data only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_DIR, LWC_DIR } from './site-plugin.mjs';
import { graphqlQueries } from './plan.mjs';

const SECRET_PATTERNS = [
  ['a Salesforce session id', /00D[A-Za-z0-9]{12,15}![A-Za-z0-9._]{20,}/],
  ['a bearer token', /Bearer\s+[A-Za-z0-9._~+/-]{20,}/],
  ['an OAuth token field', /"(access_token|refresh_token|client_secret)"\s*:/],
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/]
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * Keys whose children are data, not field names: option lists keyed by query parameter,
 * and the catalog's parameter and property names.
 */
const DYNAMIC_KEY_PARENTS = new Set(['options', 'properties', 'variables', 'ApiLabOptionsController.getOptions']);

/** Reserved example domains (RFC 2606), used in sample code and placeholders. */
const EXAMPLE_SECOND_LEVEL = new Set(['example.com', 'example.net', 'example.org']);

/** True for an address at a reserved example domain or any name under one. */
export function isExampleAddress(email) {
  const labels = String(email).toLowerCase().split('@').pop().split('.');
  if (labels[labels.length - 1] === 'example') return true;
  return EXAMPLE_SECOND_LEVEL.has(labels.slice(-2).join('.'));
}

function* files(dir, test) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full, test);
    else if (test(full)) yield full;
  }
}

/** Every property name an @AuraEnabled member or a GraphQL query in the repo declares. */
export function declaredNames() {
  const names = new Set();
  for (const file of files(path.join(REPO_DIR, 'packages'), (f) => f.endsWith('.cls'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/@AuraEnabled\b[^\n]*\n\s*(?:public|global)\s+(?:static\s+)?[\w<>,. ]+?\s+(\w+)\s*(?:;|=|\{)/g)) {
      names.add(match[1]);
    }
  }
  for (const file of files(LWC_DIR, (f) => f.endsWith('.js') && !f.includes('__tests__'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes('gql`')) continue;
    graphqlQueries(source).forEach((query) => {
      for (const match of query.text.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) names.add(match[0]);
    });
  }
  ['data', 'errors'].forEach((name) => names.add(name));
  return names;
}

function walkKeys(value, parent, found) {
  // A page's reads are keyed by read key, so each read's own keys sit under it.
  if (Array.isArray(value)) {
    value.forEach((item) => walkKeys(item, parent, found));
  } else if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      if (!DYNAMIC_KEY_PARENTS.has(parent)) found.add(key);
      walkKeys(value[key], key, found);
    });
  }
}

/** The data blocks of every page and every data file, as parsed JSON with their file names. */
export function builtData(distDir) {
  const blocks = [];
  for (const file of files(distDir, (f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(file, 'utf8');
    const match = html.match(/<script type="application\/json" id="site-data">([\s\S]*?)<\/script>/);
    if (match) blocks.push({ file, value: JSON.parse(match[1]).reads, text: html });
    else blocks.push({ file, value: null, text: html });
  }
  for (const file of files(path.join(distDir, 'data'), (f) => f.endsWith('.json'))) {
    const text = fs.readFileSync(file, 'utf8');
    blocks.push({ file, value: JSON.parse(text), text });
  }
  return blocks;
}

/** The built site's text files, with their names. */
export function builtTextFiles(distDir) {
  return [...files(distDir, (f) => f.endsWith('.txt'))].map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));
}

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Decodes the entities a page writer may have used, so an entity never hides a word edge. */
export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? all : named;
  });
}

/** A page's markup without its data block, which the data checks read as parsed JSON. */
export function pageMarkup(html) {
  return decodeEntities(String(html).replace(/<script type="application\/json" id="site-data">[\s\S]*?<\/script>/, ' '));
}

function terms(raw) {
  return String(raw || '')
    .split(/[\n,]/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length >= 3);
}

/**
 * A whole word matcher for one denylist term. No letter or digit may touch either end, so "abc"
 * matches "ABC", "(abc)" and "abc.org" but not "abcde" or "xabc". A space in a term matches any
 * run of whitespace.
 */
export function termMatcher(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
}

/** Every key and string value in parsed data, decoded, so a JSON escape never hides a word edge. */
function* texts(value) {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const item of value) yield* texts(item);
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      yield key;
      yield* texts(item);
    }
  }
}

export function scan(distDir, options = {}) {
  const problems = [];
  const notices = [];
  const allowedEmails = new Set(terms(options.allowedEmails));
  const denylist = terms(options.denylist).map(termMatcher);
  const names = declaredNames();
  const isFixture = Boolean(options.fixture);
  if (!denylist.length) {
    if (isFixture) notices.push('Fixture build: the denylist is skipped, the data is sample data.');
    else problems.push('SITE_DENYLIST is not set, so a real data build cannot be checked for client terms.');
  }
  builtData(distDir).forEach(({ file, value, text }) => {
    const relative = path.relative(distDir, file);
    SECRET_PATTERNS.forEach(([label, pattern]) => {
      if (pattern.test(text)) problems.push(`${relative} contains ${label}`);
    });
    if (value) {
      const keys = new Set();
      walkKeys(value, null, keys);
      const data = JSON.stringify(value);
      [...keys].filter((key) => !names.has(key) && !/[|.{]/.test(key)).forEach((key) => {
        problems.push(`${relative} carries a field the components never receive: ${key}`);
      });
      for (const match of data.matchAll(EMAIL)) {
        const email = match[0].toLowerCase();
        const domain = email.slice(email.lastIndexOf('@'));
        const allowed = allowedEmails.has(email) || allowedEmails.has(domain) || isExampleAddress(email);
        if (!allowed) problems.push(`${relative} contains an email address`);
      }
      const values = [...texts(value)];
      if (denylist.some((matcher) => values.some((text) => matcher.test(text)))) {
        problems.push(`${relative} contains a denylisted term`);
      }
    }
    if (file.endsWith('.html')) {
      const markup = pageMarkup(text);
      if (denylist.some((matcher) => matcher.test(markup))) problems.push(`${relative} contains a denylisted term in its page text`);
    }
  });
  builtTextFiles(distDir).forEach(({ file, text }) => {
    const relative = path.relative(distDir, file);
    SECRET_PATTERNS.forEach(([label, pattern]) => {
      if (pattern.test(text)) problems.push(`${relative} contains ${label}`);
    });
    if (denylist.some((matcher) => matcher.test(text))) problems.push(`${relative} contains a denylisted term`);
  });
  return { problems: [...new Set(problems)], notices };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const distDir = path.resolve(process.argv[2] || 'dist');
  const report = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.build/report.json');
  const fixture = fs.existsSync(report) && JSON.parse(fs.readFileSync(report, 'utf8')).fixture;
  const result = scan(distDir, {
    fixture,
    denylist: process.env.SITE_DENYLIST,
    allowedEmails: process.env.SITE_ALLOWED_EMAILS
  });
  result.notices.forEach((notice) => console.log(notice));
  if (result.problems.length) {
    // Never print the matched text: it may be a client name or a secret.
    console.error(`Leak scan: FAIL\n${result.problems.map((problem) => `- ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Leak scan: no secrets, no undeclared fields, no unexpected email addresses.');
}

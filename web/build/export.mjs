/**
 * Reads the site's data from Salesforce through the allowlisted export (/site/export) and
 * the UI API GraphQL endpoint, as the build user the Salesforce CLI is signed in as.
 *
 * The access token comes from `sf org display` and stays in memory. It is never printed,
 * written to a file or put in an error message. When the API refuses that token (some CLI
 * versions hand back one it rejects), each request goes through `sf api request rest`
 * instead, which signs itself in.
 */
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readKey } from '../src/shims/site-data.js';
import { graphqlParams } from '../src/shims/graphql.js';
import { WEB_DIR } from './site-plugin.mjs';

export const DATA_DIR = path.join(WEB_DIR, '.data');
export const API_VERSION = 'v62.0';
const PARALLEL = 4;
const IS_WINDOWS = process.platform === 'win32';

/**
 * How to run the sf CLI. On Windows sf is a .cmd file, which Node runs only through the
 * shell, so each argument is quoted for cmd. No argument comes from a visitor.
 */
export function sfCommand(args, options = {}) {
  if (IS_WINDOWS) {
    const quoted = args.map((arg) => `"${String(arg).replace(/"/g, '""')}"`).join(' ');
    return { file: `sf ${quoted}`, args: [], options: { ...options, shell: true } };
  }
  return { file: 'sf', args, options };
}

/** The org the CLI is signed in to, by alias or username. Never a default. */
export function connect(targetOrg) {
  if (!targetOrg) {
    throw new Error('Set SF_TARGET_ORG to the alias of the org the build user is signed in to.');
  }
  const command = sfCommand(['org', 'display', '--target-org', targetOrg, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  });
  let raw;
  try {
    raw = execFileSync(command.file, command.args, command.options);
  } catch (error) {
    raw = error.stdout || '';
  }
  const result = (JSON.parse(raw || '{}') || {}).result || {};
  if (!result.accessToken || !result.instanceUrl) {
    throw new Error(`The Salesforce CLI has no session for ${targetOrg}.`);
  }
  return {
    orgId: result.id,
    username: result.username,
    instanceUrl: result.instanceUrl.replace(/\/+$/, ''),
    token: result.accessToken,
    targetOrg,
    viaCli: undefined
  };
}

/** One request through `sf api request rest`, parsed into status and JSON body. */
function cliRequest(connection, url, init = {}) {
  const relative = url.slice(connection.instanceUrl.length);
  const args = ['api', 'request', 'rest', relative, '--target-org', connection.targetOrg, '--include'];
  let bodyFile;
  if (init.method && init.method !== 'GET') args.push('--method', init.method);
  if (init.body) {
    bodyFile = path.join(os.tmpdir(), `site-export-${process.pid}-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(bodyFile, init.body);
    args.push('--body', `@${bodyFile}`);
  }
  const command = sfCommand(args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return new Promise((resolve) => {
    execFile(command.file, command.args, command.options, (error, stdout) => {
      if (bodyFile) fs.rmSync(bodyFile, { force: true });
      const text = String(stdout || '');
      const status = Number((text.match(/^HTTP\/[0-9.]+ (\d{3})/m) || [])[1] || 0);
      // The CLI prints the status line and headers, then the body with no blank line between.
      const start = text.search(/^[{[]/m);
      let body;
      try {
        body = JSON.parse(start >= 0 ? text.slice(start).trim() : '');
      } catch (parseError) {
        body = undefined;
      }
      resolve({ status, body });
    });
  });
}

async function request(connection, url, init = {}) {
  if (connection.viaCli === undefined) {
    const probe = await fetch(`${connection.instanceUrl}/services/data/${API_VERSION}/limits`, {
      headers: { Authorization: `Bearer ${connection.token}` }
    }).catch(() => ({ status: 0 }));
    connection.viaCli = probe.status !== 200;
  }
  if (connection.viaCli) return cliRequest(connection, url, init);
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${connection.token}`, Accept: 'application/json', ...(init.headers || {}) }
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    body = undefined;
  }
  return { status: response.status, body };
}

/** One allowlisted Apex call through the export. */
export async function exportCall(connection, call, params) {
  const query = new URLSearchParams({ call });
  if (params && Object.keys(params).length) query.set('params', JSON.stringify(params));
  const { status, body } = await request(connection, `${connection.instanceUrl}/services/apexrest/site/export?${query}`);
  if (status !== 200 || !body || body.call !== call) {
    const reason = body && body.error ? `${body.error}: ${body.message}` : `HTTP ${status}`;
    throw new Error(`Export of ${call} ${JSON.stringify(params || {})} failed (${reason})`);
  }
  return body.result;
}

/** The export's own list of the calls it serves. */
export async function exportAllowlist(connection) {
  const { status, body } = await request(connection, `${connection.instanceUrl}/services/apexrest/site/export`);
  if (status !== 200 || !body || !body.calls) throw new Error(`Export allowlist failed (HTTP ${status})`);
  return body.calls;
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" };

/**
 * The recorded GraphQL response carries text HTML encoded, such as "AI &amp; Innovation". The
 * Lightning wire on the Salesforce site hands the component the plain text, and a component
 * escapes what it prints. So the build decodes each string once, in one pass, and a literal
 * "&amp;amp;" comes out as "&amp;".
 */
export function decodeEntities(value) {
  if (typeof value === 'string') return value.replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (match) => ENTITIES[match]);
  if (Array.isArray(value)) return value.map(decodeEntities);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeEntities(item)]));
  }
  return value;
}

/** One GraphQL query as the build user. */
export async function graphqlCall(connection, query, variables) {
  const { status, body } = await request(connection, `${connection.instanceUrl}/services/data/${API_VERSION}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(variables ? { query, variables } : { query })
  });
  if (status !== 200 || !body) throw new Error(`GraphQL query failed (HTTP ${status})`);
  if (body.errors && body.errors.length) {
    throw new Error(`GraphQL query failed: ${body.errors.map((error) => error.message).join('; ')}`);
  }
  return { data: decodeEntities(body.data), errors: [] };
}

/** The key a read is filed under, the same key the browser shims look up. */
export function keyOf(read) {
  if (read.call === 'graphql') {
    return readKey('graphql', graphqlParams({ query: read.query, variables: read.variables }));
  }
  return readKey(read.call, read.params);
}

/**
 * Runs every read once, a few at a time.
 * @returns {Promise<Record<string, any>>} results by read key
 */
export async function runReads(connection, reads) {
  const unique = new Map();
  reads.forEach((read) => unique.set(keyOf(read), read));
  const queue = [...unique.entries()];
  const results = {};
  async function worker() {
    while (queue.length) {
      const [key, read] = queue.shift();
      results[key] =
        read.call === 'graphql'
          ? await graphqlCall(connection, read.query, read.variables)
          : await exportCall(connection, read.call, read.params);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return results;
}

/** Writes the results and the manifest that says where and when they were read. */
export function writeData(results, manifest, dir = DATA_DIR) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'reads.json'), JSON.stringify(results));
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function readData(dir) {
  const manifestFile = path.join(dir, 'manifest.json');
  const readsFile = path.join(dir, 'reads.json');
  if (!fs.existsSync(manifestFile) || !fs.existsSync(readsFile)) return null;
  return {
    manifest: JSON.parse(fs.readFileSync(manifestFile, 'utf8')),
    reads: JSON.parse(fs.readFileSync(readsFile, 'utf8'))
  };
}

/** The resume snapshot: a build only read that no page shows. */
export const SNAPSHOT_CALL = 'ResumeSnapshotService.getSnapshot';
/**
 * Where the snapshot goes. Pages Functions code can import it, and Cloudflare never serves a
 * file under functions/ as a page or an asset. It holds unverified items, so it must never be
 * written under dist or public, and a real export of it must never be committed.
 */
export const SNAPSHOT_FILE = path.join(WEB_DIR, 'functions/_generated/resume-snapshot.json');
/** The snapshot a fixture build uses, exported from a seeded scratch org. */
export const FIXTURE_SNAPSHOT_FILE = path.join(WEB_DIR, 'fixtures/resume-snapshot.json');
const SERVED_DIRS = [path.join(WEB_DIR, 'dist'), path.join(WEB_DIR, 'public')];

export const SNAPSHOT_ITEM_TYPES = ['headline', 'summary', 'bullet', 'skill', 'project', 'certification'];
const TOP_KEYS = ['version', 'generatedAt', 'owner', 'roles', 'items'];
const ROLE_KEYS = ['id', 'employer', 'title', 'start', 'end', 'current'];
const ITEM_KEYS = ['id', 'type', 'roleId', 'text', 'tags', 'priority', 'verified', 'visibility'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ordered(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source[key] === undefined ? null : source[key]]));
}

/**
 * The export leaves out null fields, so a role with no end date and an item with no role come
 * back without the key. This puts each object in the contract's key order, with a missing
 * value as null and roleId kept on bullets only.
 */
export function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return {
    ...raw,
    owner: raw.owner && typeof raw.owner === 'object' ? ordered(raw.owner, ['name', 'currentEmployer']) : raw.owner,
    roles: Array.isArray(raw.roles) ? raw.roles.map((role) => ordered(role, ROLE_KEYS)) : raw.roles,
    items: Array.isArray(raw.items)
      ? raw.items.map((item) => ordered(item, item.type === 'bullet' ? ITEM_KEYS : ITEM_KEYS.filter((key) => key !== 'roleId')))
      : raw.items
  };
}

const isText = (value) => typeof value === 'string' && value.trim() !== '';

function checkRoles(roles, owner, problems) {
  const ids = new Set();
  roles.forEach((role, index) => {
    const where = `roles[${index}]`;
    if (!isText(role.id)) problems.push(`${where} has no id`);
    else if (ids.has(role.id)) problems.push(`${where} repeats the role id ${role.id}`);
    ids.add(role.id);
    if (!isText(role.title)) problems.push(`${where} has no title`);
    if (!(role.employer === null || typeof role.employer === 'string')) problems.push(`${where}.employer must be text or null`);
    if (!(role.start === null || ISO_DATE.test(role.start))) problems.push(`${where}.start must be a date or null`);
    if (!(role.end === null || ISO_DATE.test(role.end))) problems.push(`${where}.end must be a date or null`);
    if (typeof role.current !== 'boolean') problems.push(`${where}.current must be true or false`);
  });
  if (!roles.some((role) => role.current === true && role.employer === owner.currentEmployer)) {
    problems.push("No current role has the owner's current employer");
  }
  return ids;
}

function checkItems(items, roleIds, problems) {
  const ids = new Set();
  items.forEach((item, index) => {
    const where = `items[${index}]`;
    if (!isText(item.id)) problems.push(`${where} has no id`);
    else if (ids.has(item.id.toLowerCase())) problems.push(`${where} repeats the id ${item.id}`);
    else ids.add(item.id.toLowerCase());
    if (!SNAPSHOT_ITEM_TYPES.includes(item.type)) problems.push(`${where}.type must be one of ${SNAPSHOT_ITEM_TYPES.join(', ')}`);
    if (item.type === 'bullet' && !roleIds.has(item.roleId)) problems.push(`${where} is a bullet of a role the snapshot does not hold`);
    if (item.type !== 'bullet' && 'roleId' in item) problems.push(`${where} is not a bullet but names a role`);
    const extra = Object.keys(item).filter((key) => !ITEM_KEYS.includes(key));
    if (extra.length) problems.push(`${where} has keys the contract does not define: ${extra.join(', ')}`);
    if (!isText(item.text)) problems.push(`${where} has no text`);
    if (!Array.isArray(item.tags) || item.tags.some((tag) => !isText(tag))) problems.push(`${where}.tags must be a list of text`);
    if (![1, 2, 3].includes(item.priority)) problems.push(`${where}.priority must be 1, 2 or 3`);
    if (typeof item.verified !== 'boolean') problems.push(`${where}.verified must be true or false`);
    if (item.visibility !== 'public') problems.push(`${where}.visibility must be public, not ${JSON.stringify(item.visibility)}`);
  });
}

/**
 * Checks a snapshot against the contract and returns the problems, empty when it holds. The
 * check lives here on purpose, because the build must not import from the evaluation harness.
 */
export function checkSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return ['The snapshot is not an object'];
  const problems = [];
  const extra = Object.keys(snapshot).filter((key) => !TOP_KEYS.includes(key));
  if (extra.length) problems.push(`The snapshot has keys the contract does not define: ${extra.join(', ')}`);
  if (snapshot.version !== 1) problems.push(`version must be 1, not ${JSON.stringify(snapshot.version)}`);
  if (!isText(snapshot.generatedAt) || Number.isNaN(Date.parse(snapshot.generatedAt))) problems.push('generatedAt must be an ISO date');
  const owner = snapshot.owner;
  if (!owner || !isText(owner.name) || !isText(owner.currentEmployer)) problems.push('owner needs a name and a currentEmployer');
  if (!Array.isArray(snapshot.roles) || !snapshot.roles.length) problems.push('roles must be a list with at least one role');
  if (!Array.isArray(snapshot.items) || !snapshot.items.length) problems.push('items must be a list with at least one item');
  if (problems.length) return problems;
  const roleIds = checkRoles(snapshot.roles, owner, problems);
  checkItems(snapshot.items, roleIds, problems);
  return problems;
}

/** Throws with every problem when the snapshot breaks the contract. */
export function assertSnapshot(snapshot, source) {
  const problems = checkSnapshot(snapshot);
  if (problems.length) {
    throw new Error(`The resume snapshot from ${source} does not match the contract:\n${problems.join('\n')}`);
  }
  return snapshot;
}

/** Reads the snapshot through the export and checks it. Throws when the call or the check fails. */
export async function exportSnapshot(connection) {
  const raw = await exportCall(connection, SNAPSHOT_CALL, {});
  return assertSnapshot(normalizeSnapshot(raw), SNAPSHOT_CALL);
}

/** Writes the snapshot, and refuses any path the site serves to visitors. */
export function writeSnapshot(snapshot, file = SNAPSHOT_FILE) {
  const target = path.resolve(file);
  if (SERVED_DIRS.some((dir) => target === dir || target.startsWith(`${dir}${path.sep}`))) {
    throw new Error(`The resume snapshot holds unverified items and is never written where the site is served: ${target}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`);
  return target;
}

/** The fixture snapshot, checked, for a build with no Salesforce connection. */
export function readFixtureSnapshot(file = FIXTURE_SNAPSHOT_FILE) {
  return assertSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')), path.basename(file));
}

/** Counts by item type, for a log line that carries no item text. */
export function snapshotCounts(snapshot) {
  const byType = {};
  snapshot.items.forEach((item) => {
    byType[item.type] = (byType[item.type] || 0) + 1;
  });
  return {
    roles: snapshot.roles.length,
    items: snapshot.items.length,
    byType,
    unverified: snapshot.items.filter((item) => !item.verified).length
  };
}

/**
 *   node build/export.mjs --snapshot                   export the snapshot to functions/_generated
 *   node build/export.mjs --snapshot --write-fixture   and refresh web/fixtures/resume-snapshot.json
 * Both need SF_TARGET_ORG. Refresh the fixture only from a scratch org that holds the seed data.
 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  if (!args.has('--snapshot')) {
    console.error('Usage: node build/export.mjs --snapshot [--write-fixture]');
    process.exit(1);
  }
  exportSnapshot(connect(process.env.SF_TARGET_ORG))
    .then((snapshot) => {
      const written = [writeSnapshot(snapshot)];
      if (args.has('--write-fixture')) {
        written.push(writeSnapshot({ ...snapshot, generatedAt: '2026-01-01T00:00:00.000Z' }, FIXTURE_SNAPSHOT_FILE));
      }
      console.log(JSON.stringify({ ...snapshotCounts(snapshot), written: written.map((file) => path.relative(WEB_DIR, file)) }));
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

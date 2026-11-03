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
  return { data: body.data, errors: [] };
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

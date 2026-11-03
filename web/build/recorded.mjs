/**
 * Recorded mode files in dist/recorded.
 *
 *   copyRecorded(distDir)      the saved sample cover letter from web/fixtures/recorded
 *   node build/recorded.mjs    after a build: captures the API Lab's responses (see below)
 *
 * The capture calls lab-invoke as the edge user with X-Site-Recording: 1, which writes no
 * usage counter row, for every catalog path that takes no parameters. It runs only when
 * SF_INSTANCE_URL, SF_CLIENT_ID, SF_CLIENT_SECRET and IP_HASH_SALT are all set. Without
 * them nothing is written and recorded mode says no recorded responses are in this build.
 * These files live under /recorded, not /data, because /data is cached as immutable.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEB_DIR } from './site-plugin.mjs';
import { labPaths } from './lab-paths.mjs';
import { callAction } from '../functions/_lib/salesforce.js';
import { labKey } from '../src/shims/api-client.js';

export const RECORDED_SOURCE = path.join(WEB_DIR, 'fixtures/recorded');
export const SECRETS = ['SF_INSTANCE_URL', 'SF_CLIENT_ID', 'SF_CLIENT_SECRET', 'IP_HASH_SALT'];

export function copyRecorded(distDir, source = RECORDED_SOURCE) {
  if (!fs.existsSync(source)) return [];
  const target = path.join(distDir, 'recorded');
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  return fs.readdirSync(target);
}

export function hasSecrets(env = process.env) {
  return SECRETS.every((name) => Boolean(env[name]));
}

function buildHash(env) {
  return crypto.createHash('sha256').update(`${env.IP_HASH_SALT}|build`).digest('hex');
}

/** @returns {Promise<{recorded: number, skipped: string[]}|null>} null when the secrets are missing */
export async function captureLab(distDir, env = process.env, versions = ['v2']) {
  if (!hasSecrets(env)) return null;
  const calls = {};
  const skipped = [];
  const hash = buildHash(env);
  for (const version of versions) {
    for (const apiPath of labPaths()) {
      const params = { path: apiPath, params: {}, apiVersion: version };
      const outcome = await callAction(env, {
        action: 'lab-invoke',
        method: 'POST',
        body: params,
        ipHash: hash,
        recording: true,
        timeoutMs: 30000
      });
      if (outcome.ok) calls[labKey(params)] = outcome.result;
      else skipped.push(`${version} ${apiPath}: ${outcome.status} ${outcome.message}`);
    }
  }
  const dir = path.join(distDir, 'recorded/lab');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify({ recordedAt: new Date().toISOString(), calls })}\n`);
  return { recorded: Object.keys(calls).length, skipped };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  captureLab(path.join(WEB_DIR, 'dist'))
    .then((result) => {
      if (!result) console.log('No edge secrets, so no API Lab responses were recorded. Recorded mode says so.');
      else {
        console.log(`Recorded ${result.recorded} API Lab responses.`);
        result.skipped.forEach((line) => console.log(`Skipped ${line}`));
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

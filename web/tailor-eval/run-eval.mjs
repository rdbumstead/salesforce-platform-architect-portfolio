/**
 * Runs the tailoring evaluation: every posting through every provider, in each mode, a number
 * of times, then scores the runs.
 *
 *   node tailor-eval/run-eval.mjs --providers fake --repeats 5 --mode both --postings all
 *
 * Options:
 *   --providers  comma separated: fake, gemini, workers-ai, paid. Default fake.
 *   --postings   all, synthetic, injection, or comma separated posting ids. Default all.
 *   --repeats    runs per posting, provider and mode. Default 5.
 *   --mode       both, owner or visitor. Default both.
 *   --out        folder for results. Default tailor-eval/private/runs. A folder inside the
 *                repository must be ignored by git, or nothing is written.
 *   --timeout-ms the wait allowed for the selector plus the letter. Default 115000.
 *
 * Real providers read their keys from the environment (see lib/providers.mjs) and refuse to
 * start without them. The client blocklist comes from SITE_DENYLIST, never from a file.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODES, runOne, WAIT_LIMIT_MS } from './lib/pipeline.mjs';
import { createProvider, PROVIDER_NAMES } from './lib/providers.mjs';
import { loadValidators } from './lib/validators.mjs';
import { formatTable, scoreRuns } from './score.mjs';

export const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PRIVATE_DIR = path.join(EVAL_DIR, 'private');
export const DEFAULT_REPEATS = 5;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readFolder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readJson(path.join(dir, name)));
}

/** Snapshot, categories, prices, postings and gold files. Private ones only when asked. */
export async function loadInputs({ root = EVAL_DIR, includePrivate = true } = {}) {
  const privateDir = path.join(root, 'private');
  const postings = readFolder(path.join(root, 'postings'));
  if (includePrivate) postings.push(...readFolder(path.join(privateDir, 'postings')).map((posting) => ({ ...posting, private: true })));
  const gold = {};
  if (includePrivate) for (const file of readFolder(path.join(privateDir, 'gold'))) gold[file.postingId] = file;
  return {
    snapshot: readJson(path.join(root, 'snapshot', 'resume-snapshot.json')),
    categories: readJson(path.join(root, 'categories.json')).categories,
    prices: readJson(path.join(root, 'prices.json')),
    postings,
    gold
  };
}

/** The blocklist through the validators' parser, or a plain split when they cannot load. */
export async function parseBlocklistSafely(raw, validators) {
  if (!raw) return [];
  try {
    const parse = validators?.parseBlocklist || (await loadValidators()).parseBlocklist;
    return parse(raw);
  } catch {
    return String(raw)
      .split(/[,\n]/)
      .map((term) => term.trim())
      .filter(Boolean);
  }
}

export function parseArgs(argv) {
  const args = { providers: ['fake'], postings: 'all', repeats: DEFAULT_REPEATS, mode: 'both', out: path.join(PRIVATE_DIR, 'runs'), timeoutMs: WAIT_LIMIT_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=');
    const value = inline ?? argv[(i += 1)];
    if (value === undefined) throw new Error(`${flag} needs a value.`);
    if (flag === '--providers') args.providers = value.split(',').map((name) => name.trim()).filter(Boolean);
    else if (flag === '--postings') args.postings = value;
    else if (flag === '--repeats') args.repeats = Number(value);
    else if (flag === '--mode') args.mode = value;
    else if (flag === '--out') args.out = path.resolve(value);
    else if (flag === '--timeout-ms') args.timeoutMs = Number(value);
    else throw new Error(`Unknown option ${flag}.`);
  }
  if (!Number.isInteger(args.repeats) || args.repeats < 1) throw new Error('--repeats must be a whole number of 1 or more.');
  if (!['both', ...MODES].includes(args.mode)) throw new Error('--mode must be both, owner or visitor.');
  const unknown = args.providers.filter((name) => !PROVIDER_NAMES.includes(name));
  if (unknown.length) throw new Error(`Unknown provider ${unknown.join(', ')}.`);
  return args;
}

export function pickPostings(postings, which) {
  if (which === 'all') return postings;
  if (which === 'synthetic' || which === 'injection') return postings.filter((posting) => posting.kind === which);
  const ids = which.split(',').map((id) => id.trim());
  const missing = ids.filter((id) => !postings.some((posting) => posting.id === id));
  if (missing.length) throw new Error(`No posting with id ${missing.join(', ')}.`);
  return postings.filter((posting) => ids.includes(posting.id));
}

/**
 * Refuses a results folder inside the repository unless git ignores it, so a run can never
 * leave a posting or an answer where a commit would pick it up.
 */
export function assertPrivateFolder(dir, { git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } = {}) {
  let top;
  try {
    top = path.resolve(git(['rev-parse', '--show-toplevel'], EVAL_DIR));
  } catch {
    return;
  }
  const relative = path.relative(top, path.resolve(dir));
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  const probe = path.join(relative, 'probe.json').split(path.sep).join('/');
  try {
    git(['check-ignore', '-q', '--no-index', probe], top);
  } catch {
    throw new Error(`Refusing to write results to ${relative}, because git does not ignore it. Add web/tailor-eval/private/ to .gitignore first.`);
  }
}

/** Every run, in order: provider, mode, posting, repeat. */
export async function runEval({ providers, postings, snapshot, modes, repeats, validators, blocklist = [], categories, timeoutMs = WAIT_LIMIT_MS, now, onRun }) {
  const records = [];
  for (const provider of providers)
    for (const mode of modes)
      for (const posting of postings)
        for (let repeat = 1; repeat <= repeats; repeat += 1) {
          if (provider.reset) provider.reset();
          const record = await runOne({ provider, posting, snapshot, mode, validators, blocklist, categories, timeoutMs, now });
          record.repeat = repeat;
          records.push(record);
          if (onRun) onRun(record);
        }
  return records;
}

async function main(argv) {
  const args = parseArgs(argv);
  assertPrivateFolder(args.out);
  const inputs = await loadInputs();
  const postings = pickPostings(inputs.postings, args.postings);
  const providers = args.providers.map((name) => createProvider(name));
  const validators = await loadValidators();
  const blocklist = await parseBlocklistSafely(process.env.SITE_DENYLIST, validators);
  if (!blocklist.length) console.warn('SITE_DENYLIST is not set, so client names are not checked in this run.');
  const modes = args.mode === 'both' ? MODES : [args.mode];
  const startedAt = new Date().toISOString();
  const records = await runEval({
    providers,
    postings,
    snapshot: inputs.snapshot,
    modes,
    repeats: args.repeats,
    validators,
    blocklist,
    categories: inputs.categories,
    timeoutMs: args.timeoutMs,
    onRun: (record) => console.error(`${record.provider} ${record.mode} ${record.postingId} #${record.repeat} ${record.error ? record.error.code : 'done'} ${record.waitMs.total} ms`)
  });
  const scored = scoreRuns(records, { ...inputs, blocklist });
  fs.mkdirSync(args.out, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const file = path.join(args.out, `${stamp}-${args.providers.join('-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ startedAt, args: { ...args, out: undefined }, snapshotVersion: inputs.snapshot.version, records }, null, 2));
  fs.writeFileSync(file.replace(/\.json$/, '.summary.json'), JSON.stringify(scored, null, 2));
  console.log(formatTable(scored.groups));
  console.log(`Results written to ${file}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

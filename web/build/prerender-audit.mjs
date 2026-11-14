/**
 * Measures the prerender against the same build without it, on one machine.
 *
 *   node build/prerender-audit.mjs [dist] [--rounds 5] [--out <folder>]
 *
 * Lighthouse cannot reach a pages.dev preview, because Cloudflare Access gives a service
 * token no cookie. So this copies the built site, prerenders the copy (build/prerender.mjs),
 * serves the plain build on port 8788 and the prerendered copy on port 8789 with
 * `wrangler pages dev`, and audits the six main pages of each in turns. Each round runs every
 * page once on each side, and the side that goes first swaps every round, so both sides share
 * the machine and the moment. The difference between the two sides is the measurement. The
 * absolute numbers are this machine's, not Cloudflare's.
 *
 * It prints a Markdown table of medians per page with the difference, writes the same as
 * JSON to <out>/compare.json, and keeps every Lighthouse result under <out>/off and <out>/on.
 * It exits 1 when a run audited another host or when a side has no results.
 *
 * Needs: LHCI (the lhci binary, default `lhci` on the PATH), CHROME_PATH, and for the
 * prerender PRERENDER_MODULES (a node_modules folder with playwright-core).
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offTarget } from './lighthouse-hosts.mjs';

const WEB_DIR = fileURLToPath(new URL('..', import.meta.url));
const LH_CONFIG = fileURLToPath(new URL('../../config/lighthouserc.cjs', import.meta.url));
const SIDES = [
  { name: 'off', port: 8788, inspector: 9230 },
  { name: 'on', port: 8789, inspector: 9231 }
];

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The runs in one folder of Lighthouse results, grouped by page path. */
export function readRuns(dir) {
  const pages = new Map();
  if (!fs.existsSync(dir)) return pages;
  for (const name of fs.readdirSync(dir).filter((file) => /^lhr-.*\.json$/.test(file))) {
    const lhr = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    const page = new URL(lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl).pathname;
    const list = pages.get(page) || [];
    list.push({
      lcp: lhr.audits['largest-contentful-paint']?.numericValue,
      fcp: lhr.audits['first-contentful-paint']?.numericValue,
      cls: lhr.audits['cumulative-layout-shift']?.numericValue,
      accessibility: (lhr.categories.accessibility?.score ?? NaN) * 100
    });
    pages.set(page, list);
  }
  return pages;
}

/** Medians per page for both sides, with on minus off for LCP and FCP in milliseconds. */
export function compare(offRuns, onRuns) {
  const pages = [...new Set([...offRuns.keys(), ...onRuns.keys()])].sort();
  return pages.map((page) => {
    const off = offRuns.get(page) || [];
    const on = onRuns.get(page) || [];
    const side = (list) => ({
      runs: list.length,
      lcp: median(list.map((run) => run.lcp)),
      fcp: median(list.map((run) => run.fcp)),
      cls: median(list.map((run) => run.cls)),
      accessibility: Math.min(...list.map((run) => run.accessibility))
    });
    const a = side(off);
    const b = side(on);
    return { page, off: a, on: b, lcpChange: b.lcp - a.lcp, fcpChange: b.fcp - a.fcp };
  });
}

/** The comparison as a Markdown table. */
export function table(rows) {
  const ms = (value) => (Number.isFinite(value) ? `${Math.round(value)} ms` : 'none');
  const signed = (value) => (Number.isFinite(value) ? `${value > 0 ? '+' : ''}${Math.round(value)} ms` : 'none');
  const cls = (value) => (Number.isFinite(value) ? value.toFixed(3) : 'none');
  const lines = [
    '| Page | Runs off, on | LCP off | LCP on | LCP change | FCP change | CLS off, on | Accessibility off, on |',
    '|---|---|---|---|---|---|---|---|'
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.page} | ${row.off.runs}, ${row.on.runs} | ${ms(row.off.lcp)} | ${ms(row.on.lcp)} | ${signed(row.lcpChange)} | ${signed(row.fcpChange)} | ${cls(row.off.cls)}, ${cls(row.on.cls)} | ${row.off.accessibility}, ${row.on.accessibility} |`
    );
  }
  return lines.join('\n');
}

// Node runs with no shell, so a path with a space (C:\Program Files) stays one argument. The
// lhci and npx shims need a shell on Windows, and their arguments here hold no spaces.
function run(command, args, options = {}) {
  const shell = process.platform === 'win32' && command !== process.execPath;
  const result = spawnSync(command, args, { stdio: 'inherit', shell, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}.`);
}

function startServer(dir, side, logFile) {
  const log = fs.openSync(logFile, 'w');
  const child = spawn(
    'npx',
    ['wrangler', 'pages', 'dev', dir, '--ip', '127.0.0.1', '--port', String(side.port), '--inspector-port', String(side.inspector)],
    {
      cwd: WEB_DIR,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', log, log],
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32'
    }
  );
  return child;
}

function tail(file, lines = 20) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-lines).join('\n');
  } catch {
    return '(no log)';
  }
}

function stopServer(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
}

async function waitFor(url, seconds = 90) {
  for (let i = 0; i < seconds; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} did not answer within ${seconds} s.`);
}

async function main(argv) {
  const args = [...argv];
  const flag = (name, fallback) => {
    const at = args.indexOf(name);
    if (at < 0) return fallback;
    const [, value] = args.splice(at, 2);
    return value;
  };
  const rounds = Number(flag('--rounds', '5'));
  const out = path.resolve(flag('--out', path.join(os.tmpdir(), 'prerender-audit')));
  const distDir = path.resolve(args[0] || path.join(WEB_DIR, 'dist'));
  const lhci = process.env.LHCI || 'lhci';
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error('--rounds needs a whole number of 1 or more.');
  if (!fs.existsSync(path.join(distDir, 'index.html'))) throw new Error(`${distDir} has no built site.`);

  fs.rmSync(out, { recursive: true, force: true });
  const onDist = path.join(out, 'site-on');
  fs.cpSync(distDir, onDist, { recursive: true });
  run(process.execPath, [path.join(WEB_DIR, 'build', 'prerender.mjs'), onDist]);

  const dirs = { off: distDir, on: onDist };
  const logs = Object.fromEntries(SIDES.map((side) => [side.name, path.join(out, `wrangler-${side.name}.log`)]));
  const servers = SIDES.map((side) => startServer(dirs[side.name], side, logs[side.name]));
  try {
    for (const side of SIDES) {
      try {
        await waitFor(`http://127.0.0.1:${side.port}/`);
      } catch (error) {
        console.log(`The ${side.name} server log ends:\n${tail(logs[side.name])}`);
        throw error;
      }
    }
    for (let round = 1; round <= rounds; round += 1) {
      const order = round % 2 ? SIDES : [...SIDES].reverse();
      for (const side of order) {
        const work = fs.mkdtempSync(path.join(os.tmpdir(), `lh-${side.name}-`));
        run(lhci, ['collect', `--config=${LH_CONFIG}`, '--numberOfRuns=1'], {
          cwd: work,
          env: { ...process.env, TARGET_URL: `http://127.0.0.1:${side.port}` }
        });
        const results = path.join(out, side.name);
        fs.mkdirSync(results, { recursive: true });
        for (const name of fs.readdirSync(path.join(work, '.lighthouseci')).filter((file) => /^lhr-.*\.json$/.test(file))) {
          // Keep the lhr- prefix, which readRuns and the host check match on.
          fs.renameSync(path.join(work, '.lighthouseci', name), path.join(results, name.replace(/^lhr-/, `lhr-r${round}-`)));
        }
        fs.rmSync(work, { recursive: true, force: true });
      }
    }
  } finally {
    servers.forEach(stopServer);
  }

  let failed = false;
  for (const side of SIDES) {
    const misses = offTarget(path.join(out, side.name), `http://127.0.0.1:${side.port}`);
    for (const miss of misses) console.log(`::error::A ${side.name} run audited ${miss.finalUrl} (${miss.file}), not port ${side.port}.`);
    if (misses.length) failed = true;
  }
  const rows = compare(readRuns(path.join(out, 'off')), readRuns(path.join(out, 'on')));
  if (!rows.length || rows.some((row) => !row.off.runs || !row.on.runs)) {
    console.log('::error::A page has no results on one side, so the comparison is incomplete.');
    failed = true;
  }
  fs.writeFileSync(path.join(out, 'compare.json'), `${JSON.stringify({ rounds, rows }, null, 2)}\n`);
  console.log(table(rows));
  if (failed) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

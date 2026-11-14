import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compare, readRuns, table } from '../build/prerender-audit.mjs';

function lhr(url, { lcp, fcp, cls = 0, accessibility = 1 }) {
  return {
    finalDisplayedUrl: url,
    audits: {
      'largest-contentful-paint': { numericValue: lcp },
      'first-contentful-paint': { numericValue: fcp },
      'cumulative-layout-shift': { numericValue: cls }
    },
    categories: { accessibility: { score: accessibility } }
  };
}

function folder(runs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  runs.forEach((run, index) => fs.writeFileSync(path.join(dir, `lhr-${index}.json`), JSON.stringify(run)));
  return dir;
}

test('runs group by page path, whatever the port', () => {
  const dir = folder([
    lhr('http://127.0.0.1:8788/', { lcp: 1000, fcp: 500 }),
    lhr('http://127.0.0.1:8788/resume', { lcp: 900, fcp: 400 }),
    lhr('http://127.0.0.1:8788/', { lcp: 1200, fcp: 600 })
  ]);
  const runs = readRuns(dir);
  assert.deepEqual([...runs.keys()].sort(), ['/', '/resume']);
  assert.equal(runs.get('/').length, 2);
});

test('the comparison takes medians per side and reports on minus off', () => {
  const off = readRuns(folder([
    lhr('http://127.0.0.1:8788/', { lcp: 1000, fcp: 500 }),
    lhr('http://127.0.0.1:8788/', { lcp: 1400, fcp: 700 }),
    lhr('http://127.0.0.1:8788/', { lcp: 1200, fcp: 600 })
  ]));
  const on = readRuns(folder([
    lhr('http://127.0.0.1:8789/', { lcp: 700, fcp: 450, accessibility: 0.98 }),
    lhr('http://127.0.0.1:8789/', { lcp: 800, fcp: 500 }),
    lhr('http://127.0.0.1:8789/', { lcp: 900, fcp: 550 })
  ]));
  const [row] = compare(off, on);
  assert.equal(row.page, '/');
  assert.equal(row.off.lcp, 1200);
  assert.equal(row.on.lcp, 800);
  assert.equal(row.lcpChange, -400);
  assert.equal(row.fcpChange, -100);
  assert.equal(row.on.accessibility, 98);
});

test('a page missing on one side shows no runs, and the table says none', () => {
  const off = readRuns(folder([lhr('http://127.0.0.1:8788/skills', { lcp: 1000, fcp: 500 })]));
  const rows = compare(off, new Map());
  assert.equal(rows[0].on.runs, 0);
  const text = table(rows);
  assert.match(text, /\| \/skills \| 1, 0 \| 1000 ms \| none \| none \|/);
});

test('results renamed with their round number still read', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
  fs.writeFileSync(path.join(dir, 'lhr-r2-1794621382831.json'), JSON.stringify(lhr('http://127.0.0.1:8789/', { lcp: 900, fcp: 400 })));
  fs.writeFileSync(path.join(dir, 'r2-lhr-1794621382832.json'), JSON.stringify(lhr('http://127.0.0.1:8789/', { lcp: 100, fcp: 50 })));
  const runs = readRuns(dir);
  assert.equal(runs.get('/').length, 1);
  assert.equal(runs.get('/')[0].lcp, 900);
});

test('a missing folder reads as no runs', () => {
  assert.equal(readRuns(path.join(os.tmpdir(), 'no-such-audit-folder')).size, 0);
});

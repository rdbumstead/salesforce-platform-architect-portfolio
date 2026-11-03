/**
 * Median Lighthouse numbers per URL from an `lhci collect` run, as a Markdown table for the
 * job summary. Report only: it never fails a run.
 *   node build/lighthouse-summary.mjs <.lighthouseci folder>
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || '.lighthouseci');
const TARGET_LCP_MS = 2500;

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const runs = new Map();
if (fs.existsSync(dir)) {
  fs.readdirSync(dir)
    .filter((name) => /^lhr-.*\.json$/.test(name))
    .forEach((name) => {
      const lhr = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      const url = lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl;
      const list = runs.get(url) || [];
      list.push({
        lcp: lhr.audits['largest-contentful-paint']?.numericValue,
        performance: (lhr.categories.performance?.score ?? NaN) * 100
      });
      runs.set(url, list);
    });
}

const lines = ['| Page | Runs | Median LCP | Median performance | LCP target |', '|---|---|---|---|---|'];
[...runs.entries()].sort().forEach(([url, list]) => {
  const lcp = median(list.map((run) => run.lcp));
  const score = median(list.map((run) => run.performance));
  const met = Number.isFinite(lcp) && lcp <= TARGET_LCP_MS ? 'met' : 'missed';
  lines.push(`| ${new URL(url).pathname} | ${list.length} | ${(lcp / 1000).toFixed(2)} s | ${Math.round(score)} | ${met} |`);
});
if (!runs.size) lines.push('| none | 0 | no Lighthouse results found | | |');
console.log(lines.join('\n'));

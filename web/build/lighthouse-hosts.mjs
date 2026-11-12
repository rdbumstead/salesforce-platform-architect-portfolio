/**
 * Checks that every Lighthouse run audited the page it was sent to. A preview behind
 * Cloudflare Access redirects to the Access login page when the cookie does not get through,
 * and Lighthouse then scores that page instead. Prints one line per run that ended on another
 * host and exits 1 when there is any, so the gate never reports a score for the wrong page.
 *   node build/lighthouse-hosts.mjs <.lighthouseci folder> <target url>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Runs whose final page is not on the target host, as { file, finalUrl }. */
export function offTarget(dir, targetUrl) {
  const target = new URL(targetUrl).hostname;
  const misses = [];
  for (const name of fs.readdirSync(dir).filter((file) => /^lhr-.*\.json$/.test(file))) {
    const lhr = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    const finalUrl = lhr.finalDisplayedUrl || lhr.finalUrl || lhr.requestedUrl || '';
    let host = '';
    try {
      host = new URL(finalUrl).hostname;
    } catch {
      host = '';
    }
    if (host !== target) misses.push({ file: name, finalUrl });
  }
  return misses;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [dir, targetUrl] = process.argv.slice(2);
  const misses = offTarget(path.resolve(dir || '.lighthouseci'), targetUrl);
  for (const miss of misses) {
    const where = (() => {
      try {
        return new URL(miss.finalUrl).hostname;
      } catch {
        return 'an unknown page';
      }
    })();
    console.log(`::error::Lighthouse audited ${where}, not the preview (${miss.file}). The Access cookie did not get through, so these scores are not the site's.`);
  }
  if (misses.length) process.exit(1);
  console.log(`Every Lighthouse run audited ${new URL(targetUrl).hostname}.`);
}

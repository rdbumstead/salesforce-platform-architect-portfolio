/**
 * Export coverage gate. Fails when a component on a public page imports an Apex method or
 * runs a GraphQL query that neither the export nor the request time list covers, when the
 * Apex allowlist (SiteExportCalls) serves a call no component on a public page uses, or when
 * the read plan has a problem. Needs no Salesforce connection.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from './bundle.mjs';
import { readRoutes } from './routes.mjs';
import { planRoute, UNEXPORTED_QUERIES, graphqlQueries } from './plan.mjs';
import { REQUEST_TIME_CALLS, UNREACHABLE_CALLS } from './calls.mjs';
import { resourceIndex } from './resources.mjs';
import { REPO_DIR, WEB_DIR, LWC_DIR } from './site-plugin.mjs';

export const ALLOWLIST_FILE = path.join(REPO_DIR, 'packages/portfolio-site/main/default/classes/SiteExportCalls.cls');

/** The call names in SiteExportCalls.PARAMS_BY_CALL, read from the Apex source. */
export function apexAllowlist(source = fs.readFileSync(ALLOWLIST_FILE, 'utf8')) {
  const block = source.slice(source.indexOf('PARAMS_BY_CALL'), source.indexOf('};', source.indexOf('PARAMS_BY_CALL')));
  return new Set([...block.matchAll(/'([A-Za-z]+\.[A-Za-z]+)'\s*=>/g)].map((match) => match[1]));
}

export function compare({ imported, allowlist, queries, planned }) {
  const problems = [];
  [...imported].sort().forEach((call) => {
    if (REQUEST_TIME_CALLS.has(call) || UNREACHABLE_CALLS.has(call)) return;
    if (!allowlist.has(call)) problems.push(`${call} is imported by a public page but the export does not serve it`);
  });
  [...allowlist].sort().forEach((call) => {
    if (!imported.has(call)) problems.push(`${call} is on the export allowlist but no component on a public page imports it`);
  });
  queries.forEach((query) => {
    if (UNEXPORTED_QUERIES.has(query.name)) return;
    if (!planned.has(query.name)) problems.push(`GraphQL query ${query.name} in ${query.file} is not in the read plan`);
  });
  [...REQUEST_TIME_CALLS, ...UNREACHABLE_CALLS.keys()].forEach((call) => {
    if (allowlist.has(call)) problems.push(`${call} must never be on the export allowlist`);
  });
  return problems;
}

export async function checkCoverage() {
  const { routes } = readRoutes();
  const resourceUrls = new Map([...resourceIndex()].map(([name, resource]) => [name, resource.url]));
  const outDir = path.join(WEB_DIR, '.build/coverage');
  const bundled = await bundle(routes, { outDir, resourceUrls, minify: false, entryDir: path.join(WEB_DIR, '.build/coverage-entries') });
  const imported = new Set();
  const queries = [];
  const planned = new Set();
  const problems = [];
  routes.forEach((route) => {
    const modules = bundled.reachable.get(route.key) || new Set();
    modules.forEach((id) => {
      if (id.startsWith('\0site:apex:')) imported.add(id.slice('\0site:apex:'.length));
      if (id.startsWith(LWC_DIR) && id.endsWith('.js')) {
        const source = fs.readFileSync(id, 'utf8');
        if (source.includes('gql`')) graphqlQueries(source).forEach((query) => queries.push({ ...query, file: path.relative(LWC_DIR, id) }));
      }
    });
    const plan = planRoute(route, modules, { docKeys: ['sample'] });
    problems.push(...plan.problems);
    plan.reads.filter((read) => read.call === 'graphql').forEach((read) => {
      const name = (read.query.match(/query\s+([A-Za-z0-9_]+)/) || [])[1];
      if (name) planned.add(name);
    });
  });
  fs.rmSync(outDir, { recursive: true, force: true });
  const unique = [...new Map(queries.map((query) => [query.name, query])).values()];
  return [...new Set([...problems, ...compare({ imported, allowlist: apexAllowlist(), queries: unique, planned })])];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkCoverage()
    .then((problems) => {
      if (problems.length) {
        console.error("Export coverage: FAIL");
        problems.forEach((problem) => console.error(`- ${problem}`));
        process.exit(1);
      }
      console.log("Export coverage: every Apex call and GraphQL query on a public page is covered, and nothing extra is served.");
    })
    .catch((error) => {
      console.error(`Export coverage: the pages did not compile. ${error.message}`);
      process.exit(1);
    });
}

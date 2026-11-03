/**
 * Works out every read a route makes, from the modules the bundler says the route can load.
 *
 * Parameter values come from the component files and the route's own properties
 * (View source keys, live data marker names, the gallery's pillar) or from the org
 * (document keys), never from free text. A call the plan cannot fill fails the build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REQUEST_TIME_CALLS, UNREACHABLE_CALLS } from './calls.mjs';
import { LWC_DIR } from './site-plugin.mjs';

const APEX_PREFIX = '\0site:apex:';
const RESOURCE_PREFIX = '\0site:resource:';

export const PERSONAS = ['Architect', 'Developer', 'Admin'];
export const SCHEMA_SCOPES = ['portfolio', 'employerHub'];

/**
 * GraphQL queries left out of the export, by operation name, with the reason.
 * The footer's probe times a live round trip, so a build time answer would be a false reading.
 */
export const UNEXPORTED_QUERIES = new Map([
  ['FooterGraphqlProbe', 'It times a live GraphQL round trip, so a build time answer would report a false latency.']
]);

/** dataSource's own list parsing: split on commas, trim, drop blanks and case blind repeats. */
export function splitList(text) {
  const seen = new Set();
  const list = [];
  String(text || '')
    .split(',')
    .forEach((part) => {
      const item = part.trim();
      if (item && !seen.has(item.toLowerCase())) {
        seen.add(item.toLowerCase());
        list.push(item);
      }
    });
  return list;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|\\{([^}]*)\\})`));
  if (!match) return { present: false };
  if (match[3] !== undefined) return { present: true, bound: match[3] };
  return { present: true, value: match[2] };
}

/**
 * The View source keys and live data marker names a template asks for.
 * A bound value ({expr}) cannot be read from the file, so it is reported as a problem.
 */
export function templateReads(html, file = 'template') {
  const reads = { sourceKeys: [], names: [], objects: [], problems: [] };
  for (const match of html.matchAll(/<c-view-source\b([^>]*)>/g)) {
    const key = attribute(match[1], 'source-key');
    if (key.bound) reads.problems.push(`${file}: c-view-source source-key is bound to {${key.bound}}`);
    else if (key.value) reads.sourceKeys.push(key.value);
  }
  for (const match of html.matchAll(/<c-data-source\b([^>]*)>/g)) {
    const keys = attribute(match[1], 'source-keys');
    const objects = attribute(match[1], 'objects');
    if (keys.bound) reads.problems.push(`${file}: c-data-source source-keys is bound to {${keys.bound}}`);
    else if (keys.present) reads.names.push(splitList(keys.value));
    if (objects.bound) reads.problems.push(`${file}: c-data-source objects is bound to {${objects.bound}}`);
    else if (objects.present) reads.objects.push(splitList(objects.value));
  }
  return reads;
}

/** Every gql`...` query in a component file, as written. */
export function graphqlQueries(source) {
  const found = [];
  for (const match of source.matchAll(/gql`([^`]*)`/g)) {
    const name = (match[1].match(/query\s+([A-Za-z0-9_]+)/) || [])[1] || null;
    found.push({ name, text: match[1] });
  }
  return found;
}

function isComponentFile(id, extension) {
  return id.startsWith(LWC_DIR) && id.endsWith(extension);
}

/**
 * The reads one route makes.
 * @param {object} route from routes.mjs
 * @param {Set<string>} modules every module id the route can load
 * @param {object} org lists read from the org first: { docKeys: string[] }
 * @returns {{reads: {call: string, params: object}[], resources: string[], problems: string[]}}
 */
export function planRoute(route, modules, org = {}) {
  const calls = new Set();
  const resources = new Set();
  const sourceKeys = new Set();
  const names = new Map();
  const objects = new Map();
  const queries = [];
  const problems = [];
  modules.forEach((id) => {
    if (id.startsWith(APEX_PREFIX)) calls.add(id.slice(APEX_PREFIX.length));
    else if (id.startsWith(RESOURCE_PREFIX)) resources.add(id.slice(RESOURCE_PREFIX.length));
    else if (isComponentFile(id, '.html')) {
      const found = templateReads(fs.readFileSync(id, 'utf8'), path.relative(LWC_DIR, id));
      found.sourceKeys.forEach((key) => sourceKeys.add(key));
      found.names.forEach((list) => names.set(JSON.stringify(list), list));
      found.objects.forEach((list) => objects.set(JSON.stringify(list), list));
      problems.push(...found.problems);
    } else if (isComponentFile(id, '.js')) {
      const source = fs.readFileSync(id, 'utf8');
      if (source.includes('gql`')) {
        graphqlQueries(source).forEach((query) => queries.push({ ...query, file: path.relative(LWC_DIR, id) }));
      }
    }
  });

  const reads = [];
  const add = (call, params) => reads.push({ call, params: params || {} });
  [...calls].sort().forEach((call) => {
    if (REQUEST_TIME_CALLS.has(call) || UNREACHABLE_CALLS.has(call)) return;
    switch (call) {
      case 'ResumeController.getResume':
        PERSONAS.forEach((persona) => add(call, { persona }));
        break;
      case 'DeliveryController.getRecentCommits':
      case 'DeliveryController.getRoadmap':
        [false, true].forEach((simulate) => add(call, { simulate }));
        break;
      case 'SchemaService.getSchemaGraph':
        SCHEMA_SCOPES.forEach((scope) => add(call, { scope }));
        break;
      case 'SourceController.getDoc':
        if (!org.docKeys) problems.push('SourceController.getDoc needs the document list from the org');
        (org.docKeys || []).forEach((docKey) => add(call, { docKey }));
        break;
      case 'SourceController.getSourceFiles':
        if (!sourceKeys.size) problems.push(`${route.key}: getSourceFiles is imported but no View source key was found`);
        [...sourceKeys].sort().forEach((sourceKey) => add(call, { sourceKey }));
        break;
      case 'DataSourceController.getSources':
        names.forEach((list) => add(call, { names: list }));
        break;
      case 'DataSourceController.getObjectSources':
        objects.forEach((list) => add(call, { objectNames: list }));
        break;
      default:
        add(call);
    }
  });

  queries.forEach((query) => {
    if (UNEXPORTED_QUERIES.has(query.name)) return;
    if (query.name === 'ProjectAssetGallery') {
      route.components
        .filter((component) => component.name === 'projectAssetGallery')
        .forEach((component) => {
          const pillar = (component.props && component.props.pillar) || 'A';
          if (/^[A-E]$/.test(pillar)) reads.push({ call: 'graphql', query: query.text, variables: { pillar } });
        });
      return;
    }
    if (/\$[A-Za-z]/.test(query.text)) {
      problems.push(`${query.file}: query ${query.name} takes variables the plan does not know how to fill`);
      return;
    }
    reads.push({ call: 'graphql', query: query.text });
  });

  return { reads, resources: [...resources].sort(), problems };
}

/**
 * Reads the Salesforce site's routes and views, so the static pages place the same
 * components, with the same properties, in the same order, and carry the same head tags.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_DIR } from './site-plugin.mjs';

export const SITE_DIR = path.join(
  REPO_DIR,
  'packages/portfolio-site/main/default/digitalExperiences/site/Portfolio1'
);

/** The canonical public address. */
export const SITE_ORIGIN = 'https://ryanbumstead.com';

/** Views that become static error pages, by the file name they are served as. */
export const ERROR_PAGES = {
  error: '404',
  tooManyRequests: '429',
  serviceNotAvailable: '503'
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function layoutsByType(siteDir) {
  const theme = readJson(path.join(siteDir, 'sfdc_cms__theme/Build_Your_Own_LWR/content.json'));
  const map = {};
  theme.contentBody.layouts.forEach((layout) => {
    map[layout.layoutType] = layout.layoutId;
  });
  return map;
}

function layoutName(layoutId) {
  if (layoutId === 'portfolioThemeLayout') return 'portfolio';
  if (layoutId === 'snaThemeLayout') return 'sna';
  return 'inner';
}

/** Root relative links in rich text, so they point where they do under the site's base. */
export function rootRelative(html) {
  return String(html || '').replace(/href="(?![a-z][a-z0-9+.-]*:|\/|#)([^"]*)"/gi, 'href="/$1"');
}

/** Walks a view's component tree and returns the placed components in order. */
export function placedComponents(node) {
  const found = [];
  const seo = {};
  const unknown = [];
  let autoRefresh = false;
  (function walk(current, region) {
    if (!current || typeof current !== 'object') return;
    if (current.type === 'component' && typeof current.definition === 'string') {
      const definition = current.definition;
      if (definition.startsWith('c:')) {
        found.push({ name: definition.slice(2), props: { ...(current.attributes || {}) }, region });
      } else if (definition === 'community_builder:richTextEditor') {
        found.push({ html: rootRelative(current.attributes && current.attributes.richTextValue), region });
      } else if (definition === 'experience_availability:autoRefresh') {
        autoRefresh = true;
      } else if (definition === 'community_builder:seoAssistant') {
        Object.assign(seo, current.attributes || {});
      } else if (!definition.startsWith('community_layout:')) {
        unknown.push(definition);
      }
    }
    const nextRegion = current.type === 'region' ? current.name : region;
    (current.children || []).forEach((child) => walk(child, nextRegion));
  })(node, null);
  return {
    components: found.filter((entry) => entry.region !== 'sfdcHiddenRegion'),
    seo,
    unknown,
    autoRefresh
  };
}

function keyFor(urlPrefix) {
  return urlPrefix ? urlPrefix.replace(/\//g, '__') : 'index';
}

/**
 * Every public route and error page.
 * @returns {{routes: object[], skipped: object[]}}
 */
export function readRoutes(siteDir = SITE_DIR) {
  const layouts = layoutsByType(siteDir);
  const routeDir = path.join(siteDir, 'sfdc_cms__route');
  const routes = [];
  const skipped = [];
  fs.readdirSync(routeDir)
    .sort()
    .forEach((folder) => {
      const route = readJson(path.join(routeDir, folder, 'content.json'));
      const body = route.contentBody;
      const view = readJson(path.join(siteDir, 'sfdc_cms__view', body.activeViewId, 'content.json'));
      const placed = placedComponents(view.contentBody.component);
      const layout = layoutName(layouts[view.contentBody.themeLayoutType]);
      const urlPrefix = body.urlPrefix || '';
      const errorCode = ERROR_PAGES[body.activeViewId];
      const isPublic = body.routeType === 'home' || String(body.routeType).startsWith('custom-');
      // Sign in, registration and news detail views are not carried over.
      if (!errorCode && !isPublic) {
        skipped.push({ folder, routeType: body.routeType, path: `/${urlPrefix}` });
        return;
      }
      if (placed.unknown.length) {
        throw new Error(`Route ${folder} places components the static site cannot render: ${placed.unknown.join(', ')}`);
      }
      routes.push({
        key: errorCode || keyFor(urlPrefix),
        routeName: folder,
        path: errorCode ? null : `/${urlPrefix}`,
        file: errorCode ? `${errorCode}.html` : urlPrefix ? `${urlPrefix}.html` : 'index.html',
        errorCode: errorCode || null,
        layout,
        title: placed.seo.pageTitle || view.title,
        description: placed.seo.description || '',
        headTags: placed.seo.customHeadTags || '',
        autoRefresh: placed.autoRefresh,
        components: placed.components.map(({ name, props, html }) => (html !== undefined ? { html } : { name, props }))
      });
    });
  return { routes, skipped };
}

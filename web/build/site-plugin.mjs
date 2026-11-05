/**
 * Rollup plugin that lets the Salesforce site's own components build with LWC OSS.
 *
 * c/<name> resolves to the component folder in packages/portfolio-site, so the static site
 * and the Salesforce site compile the same files. Platform imports resolve to the small
 * shims in web/src/shims, and lightning-card, lightning-spinner and lightning-icon to the
 * native stand ins in web/src/modules/lightning.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modeOf } from './calls.mjs';
import { adoptedCss } from './layout.mjs';
import { codeString } from './code-string.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const WEB_DIR = path.resolve(here, '..');
export const REPO_DIR = path.resolve(WEB_DIR, '..');
export const LWC_DIR = path.join(REPO_DIR, 'packages/portfolio-site/main/default/lwc');
export const SHIM_DIR = path.join(WEB_DIR, 'src/shims');
export const LIGHTNING_DIR = path.join(WEB_DIR, 'src/modules/lightning');

const VIRTUAL = '\0site:';

const SHIMS = {
  'lightning/navigation': 'navigation.js',
  'lightning/platformResourceLoader': 'resource-loader.js',
  'lightning/uiGraphQLApi': 'graphql.js',
  '@salesforce/community/basePath': 'base-path.js',
  '@salesforce/client/formFactor': 'form-factor.js',
  'c/siteHost': 'site-host.js'
};

/** The import name for the sheet that is adopted into every component's shadow root. */
export const ADOPTED_STYLES = 'site:adopted-styles';

const LIGHTNING_COMPONENTS = new Set(['card', 'spinner', 'icon']);

function slash(file) {
  return file.split(path.sep).join('/');
}

/** The file a c/<name> import names: the bundle's JS, or its CSS for a CSS only module. */
export function componentFile(name) {
  const js = path.join(LWC_DIR, name, `${name}.js`);
  if (fs.existsSync(js)) return js;
  const css = path.join(LWC_DIR, name, `${name}.css`);
  if (fs.existsSync(css)) return css;
  return null;
}

export function sitePlugin(options = {}) {
  const apexCalls = options.apexCalls || new Set();
  const resources = options.resources || new Set();
  const resourceUrls = options.resourceUrls || new Map();
  return {
    name: 'portfolio-site',
    resolveId(source) {
      // One engine for every file. The components live outside web/, and resolving lwc from
      // there would find a second copy in the repo's own node_modules.
      if (source === 'lwc' || source.startsWith('@lwc/')) {
        return this.resolve(source, path.join(WEB_DIR, 'package.json'), { skipSelf: true });
      }
      if (SHIMS[source]) return path.join(SHIM_DIR, SHIMS[source]);
      if (source === ADOPTED_STYLES) return `${VIRTUAL}adopted-styles`;
      if (source === '@salesforce/apex') return `${VIRTUAL}apex-core`;
      if (source.startsWith('@salesforce/apex/')) return `${VIRTUAL}apex:${source.slice(17)}`;
      if (source.startsWith('@salesforce/resourceUrl/')) {
        return `${VIRTUAL}resource:${source.slice(24)}`;
      }
      if (source.startsWith('@salesforce/')) {
        this.error(`No static site shim for ${source}`);
      }
      if (source.startsWith('lightning/')) {
        const name = source.slice(10);
        if (LIGHTNING_COMPONENTS.has(name)) return path.join(LIGHTNING_DIR, name, `${name}.js`);
        this.error(`No static site stand in for ${source}`);
      }
      if (/^c\/[A-Za-z0-9_]+$/.test(source)) {
        const file = componentFile(source.slice(2));
        if (!file) this.error(`No component folder for ${source}`);
        return file;
      }
      return null;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL)) return null;
      const spec = id.slice(VIRTUAL.length);
      if (spec === 'adopted-styles') return `export default ${codeString(adoptedCss())};`;
      const apexShim = JSON.stringify(slash(path.join(SHIM_DIR, 'apex.js')));
      if (spec === 'apex-core') {
        return `export { refreshApex, getSObjectValue } from ${apexShim};`;
      }
      if (spec.startsWith('apex:')) {
        const call = spec.slice(5);
        apexCalls.add(call);
        return `import { apexMethod } from ${apexShim};\nexport default apexMethod(${JSON.stringify(call)}, ${JSON.stringify(modeOf(call))});`;
      }
      if (spec.startsWith('resource:')) {
        const name = spec.slice(9);
        resources.add(name);
        const url = resourceUrls.get(name);
        if (!url) this.error(`No static resource named ${name}`);
        return `export default ${JSON.stringify(url)};`;
      }
      return null;
    },
    transform(code) {
      // The LWC engine reads process.env.NODE_ENV, which a browser does not have.
      if (!code.includes('process.env.NODE_ENV')) return null;
      return { code: code.replace(/process\.env\.NODE_ENV/g, '"production"'), map: null };
    }
  };
}

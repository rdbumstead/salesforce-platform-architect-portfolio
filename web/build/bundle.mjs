/**
 * Compiles one entry per route with LWC OSS. Shared code lands in hashed chunks, so a
 * route loads only its own components plus what it shares with the others.
 */
import fs from 'node:fs';
import path from 'node:path';
import { rollup } from 'rollup';
import lwc from '@lwc/rollup-plugin';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import { sitePlugin, LWC_DIR, SHIM_DIR, WEB_DIR } from './site-plugin.mjs';

function slash(file) {
  return file.split(path.sep).join('/');
}

function tagOf(name) {
  return `c-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

/** The source of one route's entry module. */
export function entrySource(route) {
  const lines = [
    `import { mount } from ${JSON.stringify(slash(path.join(SHIM_DIR, 'mount.js')))};`,
    `import Layout from 'c/portfolioThemeLayout';`,
    `import Footer from 'c/footer';`
  ];
  const names = [...new Set(route.components.filter((c) => c.name).map((c) => c.name))];
  names.forEach((name, index) => lines.push(`import C${index} from 'c/${name}';`));
  const entries = route.components.map((component) => {
    if (component.html !== undefined) return `{ html: ${JSON.stringify(component.html)} }`;
    const index = names.indexOf(component.name);
    return `{ tag: ${JSON.stringify(tagOf(component.name))}, ctor: C${index}, props: ${JSON.stringify(component.props || {})} }`;
  });
  lines.push(`mount({ Layout, Footer: ${route.layout === 'portfolio' ? 'Footer' : 'null'}, components: [${entries.join(', ')}] });`);
  return `${lines.join('\n')}\n`;
}

/**
 * @param {object[]} routes from routes.mjs
 * @param {object} options outDir (dist), minify, entryDir, resourceUrls (name to served URL)
 * @returns {Promise<{scripts: Map<string, string[]>, apexCalls: Set<string>, resources: Set<string>, reachable: Map<string, Set<string>>}>}
 * reachable holds, per route, every module id the route can load, dynamic imports included.
 */
export async function bundle(routes, options = {}) {
  const outDir = options.outDir || path.join(WEB_DIR, 'dist');
  const entryDir = options.entryDir || path.join(WEB_DIR, '.build/entries');
  fs.rmSync(entryDir, { recursive: true, force: true });
  fs.mkdirSync(entryDir, { recursive: true });
  const input = {};
  routes.forEach((route) => {
    const file = path.join(entryDir, `${route.key}.js`);
    fs.writeFileSync(file, entrySource(route));
    input[route.key] = file;
  });

  const apexCalls = new Set();
  const resources = new Set();
  const reachable = new Map();
  const graphPlugin = {
    name: 'route-graph',
    buildEnd() {
      Object.entries(input).forEach(([key, file]) => {
        const seen = new Set();
        const queue = [path.resolve(file)];
        while (queue.length) {
          const id = queue.shift();
          if (seen.has(id)) continue;
          seen.add(id);
          const info = this.getModuleInfo(id);
          if (!info) continue;
          queue.push(...info.importedIds, ...info.dynamicallyImportedIds);
        }
        reachable.set(key, seen);
      });
    }
  };
  const build = await rollup({
    input,
    plugins: [
      sitePlugin({ apexCalls, resources, resourceUrls: options.resourceUrls }),
      graphPlugin,
      lwc({
        rootDir: LWC_DIR,
        enableDynamicComponents: true,
        disableSyntheticShadowSupport: true
      }),
      nodeResolve({ rootDir: WEB_DIR, modulePaths: [path.join(WEB_DIR, 'node_modules')] })
    ],
    onwarn(warning, warn) {
      if (warning.code === 'CIRCULAR_DEPENDENCY') return;
      warn(warning);
    }
  });
  const { output } = await build.write({
    dir: path.join(outDir, 'assets'),
    format: 'es',
    entryFileNames: '[name]-[hash].js',
    chunkFileNames: 'chunk-[hash].js',
    plugins: options.minify === false ? [] : [terser()]
  });
  await build.close();

  const scripts = new Map();
  output.forEach((item) => {
    if (item.type === 'chunk' && item.isEntry) {
      scripts.set(item.name, [`/assets/${item.fileName}`, ...item.imports.map((name) => `/assets/${name}`)]);
    }
  });
  return { scripts, apexCalls, resources, reachable };
}

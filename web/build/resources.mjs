/**
 * Static resources for the static site. Each resource the pages use is copied to /sr/<Name>,
 * a folder resource as a folder and a file resource with its extension, so the host sends the
 * right content type. Records that point at /sfsites/c/resource/<Name> keep working through
 * rewrites in _redirects.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_DIR } from './site-plugin.mjs';

const EXTENSIONS = {
  'application/javascript': 'js',
  'text/javascript': 'js',
  'application/json': 'json',
  'text/css': 'css',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'text/yaml': 'yaml',
  'application/x-yaml': 'yaml',
  'application/yaml': 'yaml',
  'text/plain': 'txt'
};

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/**
 * Every static resource in the repo, by name.
 * @returns {Map<string, {name: string, folder: boolean, source: string, url: string, contentType: string}>}
 */
export function resourceIndex(packagesDir = path.join(REPO_DIR, 'packages')) {
  const index = new Map();
  for (const file of walk(packagesDir)) {
    if (!file.endsWith('.resource-meta.xml') || path.basename(path.dirname(file)) !== 'staticresources') continue;
    const dir = path.dirname(file);
    const name = path.basename(file, '.resource-meta.xml');
    const meta = fs.readFileSync(file, 'utf8');
    const contentType = ((meta.match(/<contentType>([^<]+)<\/contentType>/) || [])[1] || '').trim();
    const folder = path.join(dir, name);
    if (fs.existsSync(folder) && fs.statSync(folder).isDirectory()) {
      index.set(name, { name, folder: true, source: folder, url: `/sr/${name}`, contentType });
      continue;
    }
    const sibling = fs
      .readdirSync(dir)
      .find((candidate) => candidate.startsWith(`${name}.`) && !candidate.endsWith('.resource-meta.xml'));
    if (!sibling) continue;
    const extension = EXTENSIONS[contentType] || path.extname(sibling).slice(1) || 'bin';
    index.set(name, {
      name,
      folder: false,
      source: path.join(dir, sibling),
      url: `/sr/${name}.${extension}`,
      contentType
    });
  }
  return index;
}

/** Resource names a JSON text points at, through resource: values or platform paths. */
export function resourcesNamedIn(text) {
  const names = new Set();
  for (const match of String(text).matchAll(/(?:resource:|\/sfsites\/c\/resource\/)([A-Za-z][A-Za-z0-9_]*)/gi)) {
    names.add(match[1]);
  }
  return names;
}

/** Copies the named resources into dist/sr and returns the rewrite lines for _redirects. */
export function copyResources(names, index, distDir) {
  const lines = [];
  const missing = [];
  [...names].sort().forEach((name) => {
    const resource = index.get(name);
    if (!resource) {
      missing.push(name);
      return;
    }
    const target = path.join(distDir, resource.url.slice(1));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (resource.folder) {
      fs.cpSync(resource.source, target, { recursive: true });
      lines.push(`/sfsites/c/resource/${name}/* /sr/${name}/:splat 200`);
    } else {
      fs.copyFileSync(resource.source, target);
      lines.push(`/sfsites/c/resource/${name} ${resource.url} 200`);
    }
  });
  return { lines, missing };
}

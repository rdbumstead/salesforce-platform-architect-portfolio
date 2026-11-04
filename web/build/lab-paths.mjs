/**
 * The API Lab's allowed paths, taken from the API_Lab_Catalog static resource, written to
 * functions/_generated/lab-paths.js so the lab/invoke function can refuse any other path
 * before it reaches Salesforce. build.mjs writes it on every build, and a unit test checks
 * the committed copy matches the catalog.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LWC_DIR, WEB_DIR } from './site-plugin.mjs';

export const CATALOG_FILE = path.resolve(LWC_DIR, '../staticresources/API_Lab_Catalog.json');
export const PATHS_FILE = path.join(WEB_DIR, 'functions/_generated/lab-paths.js');

export function labPaths(catalogFile = CATALOG_FILE) {
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
  return catalog.paths.map((entry) => entry.path).sort();
}

export function labPathsText(catalogFile = CATALOG_FILE) {
  const list = JSON.stringify(labPaths(catalogFile), null, 2);
  return `// Written by build/lab-paths.mjs from the API_Lab_Catalog resource. Do not edit.\nexport const LAB_PATHS = ${list};\n`;
}

export function writeLabPaths() {
  fs.mkdirSync(path.dirname(PATHS_FILE), { recursive: true });
  fs.writeFileSync(PATHS_FILE, labPathsText());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeLabPaths();
  console.log(`Wrote ${PATHS_FILE}`);
}

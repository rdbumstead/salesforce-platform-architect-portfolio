/**
 * The data this page was built with, and the key every read is filed under.
 *
 * pages.mjs writes one JSON block per page with the results of the Apex and
 * GraphQL reads that page's components make. The Apex and GraphQL shims look
 * results up here instead of calling Salesforce.
 */

let cached;

function readBlock(id) {
  if (typeof document === "undefined") return undefined;
  const node = document.getElementById(id);
  if (!node) return undefined;
  try {
    return JSON.parse(node.textContent);
  } catch (e) {
    return undefined;
  }
}

export function siteData() {
  if (cached === undefined) {
    cached = readBlock("site-data") || { reads: {}, lazy: {}, build: {} };
    if (!cached.reads) cached.reads = {};
    if (!cached.lazy) cached.lazy = {};
    if (!cached.build) cached.build = {};
  }
  return cached;
}

/** Test seam: replace the page's data. */
export function setSiteData(data) {
  cached = data;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .forEach((key) => {
        out[key] = sortValue(value[key]);
      });
    return out;
  }
  return value;
}

/**
 * One stable key for a call and its parameters. Keys are sorted and undefined
 * values dropped, so {a:1,b:undefined} and {a:1} file under the same key.
 */
export function readKey(call, params) {
  const sorted = sortValue(params || {});
  return Object.keys(sorted).length
    ? `${call}|${JSON.stringify(sorted)}`
    : call;
}

const fetched = new Map();

/**
 * The result of one read. Small reads are inlined in the page. Large ones (documents,
 * source files) are separate JSON files the page lists, fetched the first time they are
 * asked for.
 * @returns {Promise<{found: boolean, value: any}>}
 */
export function lookup(call, params) {
  const data = siteData();
  const key = readKey(call, params);
  if (Object.prototype.hasOwnProperty.call(data.reads, key)) {
    return Promise.resolve({ found: true, value: data.reads[key] });
  }
  const url = data.lazy && data.lazy[key];
  if (!url) {
    if (typeof console !== "undefined")
      console.warn(`[static-site] no build data for ${key}`);
    return Promise.resolve({ found: false, value: undefined });
  }
  if (!fetched.has(url)) {
    fetched.set(
      url,
      fetch(url)
        .then((response) =>
          response.ok
            ? response.json()
            : Promise.reject(new Error(String(response.status)))
        )
        .then((value) => ({ found: true, value }))
        .catch(() => {
          fetched.delete(url);
          return { found: false, value: undefined };
        })
    );
  }
  return fetched.get(url);
}

export function buildInfo() {
  return siteData().build || {};
}

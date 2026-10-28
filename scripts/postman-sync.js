/**
 * Sends the generated Postman collection to the public Postman workspace, or checks that it
 * would get through. Both modes build the same request body, so a PR that passes the probe
 * sends the deploy the same bytes.
 *
 *   node scripts/postman-sync.js probe   no key needed, run on every PR
 *   node scripts/postman-sync.js push    needs POSTMAN_API_KEY and POSTMAN_COLLECTION_UID
 *
 * Postman's API sits behind Cloudflare, which refuses some request bodies before Postman sees
 * them, with an HTML 403 page. Spec text such as an inline code span that opens with a backtick
 * and then a shell command reads to it as command substitution. The probe sends the body with a
 * key that cannot be valid, to a collection uid that cannot exist. Postman answers that with a
 * JSON 401, which proves the body got past Cloudflare. An HTML 403 means it did not, and the
 * probe then sends each request on its own to name the ones that trip it.
 */
const path = require("path");

const COLLECTION_FILE = path.resolve(
  __dirname,
  "../packages/portfolio-site/main/default/staticresources/PAPI_Postman_Collection.json"
);
const API = "https://api.getpostman.com/collections/";
const PROBE_UID = "00000000-00000000-0000-0000-0000-000000000000";
const PROBE_KEY = "PMAK-probe-not-a-key";

// The generator's ids are hashes for a stable file. Postman assigns its own on a PUT, and
// sending ours would collide with the ids it already holds for this collection.
function buildCollection() {
  const collection = require(COLLECTION_FILE);
  delete collection.info._postman_id;
  const strip = (items) =>
    items.forEach((item) => {
      delete item.id;
      if (item.item) strip(item.item);
      (item.response || []).forEach((response) => delete response.id);
    });
  strip(collection.item);
  return collection;
}

// One retry on a 5xx, because Cloudflare sometimes answers a passing body with a passing 502.
async function put(uid, key, collection, retried) {
  const response = await fetch(API + uid, {
    method: "PUT",
    headers: { "X-Api-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ collection })
  });
  if (response.status >= 500 && !retried) {
    return put(uid, key, collection, true);
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (parseError) {
    json = null;
  }
  return { status: response.status, json, text };
}

function describe(result) {
  if (result.json) {
    const error = result.json.error || {};
    return error.message || error.name || "no message";
  }
  const title = /<title>([^<]*)<\/title>/i.exec(result.text);
  return "not JSON, " + (title ? title[1].trim() : result.text.slice(0, 120));
}

function leaves(items, trail, out) {
  items.forEach((item) => {
    if (item.item) leaves(item.item, trail.concat(item.name), out);
    else out.push({ name: trail.concat(item.name).join(" > "), item });
  });
  return out;
}

async function probe() {
  const collection = buildCollection();
  const result = await put(PROBE_UID, PROBE_KEY, collection);
  if (result.status === 401 && result.json) {
    console.log("The collection gets past Postman's firewall.");
    return 0;
  }
  console.log(
    `Postman's firewall refused the collection: ${result.status}, ${describe(result)}`
  );
  let named = 0;
  for (const leaf of leaves(collection.item, [], [])) {
    const single = await put(PROBE_UID, PROBE_KEY, {
      info: { name: "probe" },
      item: [leaf.item]
    });
    if (!(single.status === 401 && single.json)) {
      console.log(`  refused on its own: ${leaf.name}`);
      named++;
    }
  }
  if (!named) {
    console.log(
      "  No single request is refused on its own, so the cause is the collection level scripts, variables or the whole size."
    );
  }
  return 1;
}

async function push() {
  const { POSTMAN_API_KEY: key, POSTMAN_COLLECTION_UID: uid } = process.env;
  if (!key || !uid) {
    console.log("POSTMAN_API_KEY and POSTMAN_COLLECTION_UID are both needed.");
    return 1;
  }
  const result = await put(uid, key, buildCollection());
  console.log(`Postman answered ${result.status}`);
  if (result.status !== 200) {
    console.log(describe(result));
    return 1;
  }
  return 0;
}

const mode = process.argv[2];
const run = { probe, push }[mode];
if (!run) {
  console.log("Usage: node scripts/postman-sync.js probe|push");
  process.exit(1);
}
run().then(
  (code) => process.exit(code),
  (error) => {
    console.log(error.message);
    process.exit(1);
  }
);

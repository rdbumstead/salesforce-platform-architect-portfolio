/**
 * Clears this site's cache in the visitor's browser. Before the cutover on 2026-11-09 a
 * Cloudflare Page Rule answered ryanbumstead.com with a 301 to the Salesforce site, and a
 * browser keeps a 301 until its cache is cleared. Such a browser follows the old 301 without
 * asking the server, so Home sends the visitor back to the Salesforce site, and the Salesforce
 * site sends them here again with from=sf. The layout calls this once on that arrival, and the
 * Clear-Site-Data header removes the old 301 for every path. POST only, so no link, prefetch
 * or crawler clears a cache by accident.
 */
export const CLEAR_HEADER = '"cache"';

export const onRequest = ({ request }) => {
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" }
    });
  }
  return new Response(null, {
    status: 204,
    headers: { "Clear-Site-Data": CLEAR_HEADER, "Cache-Control": "no-store" }
  });
};

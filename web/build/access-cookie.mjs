/**
 * Trades a Cloudflare Access service token for the CF_Authorization cookie of a preview, in
 * one request, and prints only the cookie's value. The workflow masks it and hands it to
 * lhci-access.cjs, which sets it for the preview's own host. Prints nothing when the token
 * or the cookie is missing.
 *   node build/access-cookie.mjs <preview url>
 */
const url = process.argv[2];
const id = process.env.CF_ACCESS_CLIENT_ID;
const secret = process.env.CF_ACCESS_CLIENT_SECRET;

export function cookieFrom(setCookies) {
  for (const line of setCookies || []) {
    const match = /^CF_Authorization=([^;]+)/.exec(line);
    if (match) return match[1];
  }
  return '';
}

if (url && id && secret && new URL(url).hostname.endsWith('.pages.dev')) {
  const response = await fetch(url, {
    redirect: 'manual',
    headers: { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret }
  });
  const value = cookieFrom(response.headers.getSetCookie());
  if (value) process.stdout.write(value);
}

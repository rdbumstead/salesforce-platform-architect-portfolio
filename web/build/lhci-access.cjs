/**
 * Lighthouse CI setup script for a preview behind Cloudflare Access. The workflow trades the
 * Access service token for a CF_Authorization cookie in one request, then this script sets
 * that cookie for the preview's own host only, so no other host ever receives it. With no
 * cookie in the environment it does nothing.
 */
module.exports = async (browser, context) => {
  const value = process.env.CF_ACCESS_COOKIE;
  if (!value) return;
  const host = new URL(context.url).hostname;
  if (!host.endsWith('.pages.dev')) return;
  const page = await browser.newPage();
  await page.setCookie({ name: 'CF_Authorization', value, domain: host, path: '/', secure: true, httpOnly: true });
  await page.close();
};

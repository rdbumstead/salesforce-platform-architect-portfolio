/**
 * Lighthouse CI setup script for a preview behind Cloudflare Access. The workflow trades the
 * Access service token for a CF_Authorization cookie in one request, then this script sets
 * that cookie for the preview's own host only, so no other host ever receives it. It sets the
 * cookie on the browser when Puppeteer offers that, and through a page otherwise. With no
 * cookie in the environment it says so, because the audit then reaches the Access login page.
 */
module.exports = async (browser, context, log = console.log) => {
  const value = process.env.CF_ACCESS_COOKIE;
  const host = new URL(context.url).hostname;
  if (!host.endsWith('.pages.dev')) return;
  if (!value) {
    log(`lhci-access: no Access cookie for ${host}, so this audit reaches the Access login page`);
    return;
  }
  const cookie = { name: 'CF_Authorization', value, domain: host, path: '/', secure: true, httpOnly: true };
  if (typeof browser.setCookie === 'function') {
    await browser.setCookie(cookie);
  } else {
    const page = await browser.newPage();
    await page.setCookie(cookie);
    await page.close();
  }
  log(`lhci-access: Access cookie set for ${host}`);
};

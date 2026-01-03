export default {
  async scheduled(event, env, ctx) {
    const url = env.TARGET_URL;
    if (!url) {
      console.error(
        "[CacheWarmer] TARGET_URL not set in environment variables"
      );
      return;
    }
    console.log(
      `[CacheWarmer] Triggered at ${new Date().toISOString()} for ${url}`
    );

    try {
      // 1. Fetch the homepage
      // 'no-cache' ensures we hit the origin (Salesforce) to wake it up
      const response = await fetch(url, {
        headers: {
          "User-Agent": "SalesforcePortfolio-Warmer/1.0",
          "Cache-Control": "no-cache",
          Pragma: "no-cache"
        }
      });

      console.log(`[CacheWarmer] Status: ${response.status}`);

      // Optional: Add a metric or log if it fails
      if (!response.ok) {
        console.error(`[CacheWarmer] Failed to warm: ${response.statusText}`);
      }
    } catch (err) {
      console.error(`[CacheWarmer] Error: ${err.message}`);
    }
  }
};

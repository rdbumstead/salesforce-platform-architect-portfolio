/** Turnstile server side check. A token works once and for 300 seconds. */
export const VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * @returns {Promise<'ok'|'failed'|'unconfigured'|'unavailable'>}
 * With no TURNSTILE_SECRET the answer is `unconfigured`, and the caller refuses: a form
 * never goes through unchecked. TURNSTILE_VERIFY_URL exists so tests can point at a fake.
 */
export async function verifyTurnstile(env, token, remoteIp) {
  if (!env || !env.TURNSTILE_SECRET) return "unconfigured";
  if (typeof token !== "string" || !token || token.length > 2048)
    return "failed";
  try {
    const form = new URLSearchParams({
      secret: env.TURNSTILE_SECRET,
      response: token
    });
    if (remoteIp) form.set("remoteip", remoteIp);
    const response = await fetch(env.TURNSTILE_VERIFY_URL || VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    if (!response.ok) return "unavailable";
    const body = await response.json();
    return body && body.success === true ? "ok" : "failed";
  } catch (error) {
    return "unavailable";
  }
}

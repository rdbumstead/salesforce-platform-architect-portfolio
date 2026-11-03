/**
 * An invisible Turnstile widget, rendered only when a form is sent. Each send gets a fresh
 * token, because a token is valid once. The widget is removed afterwards.
 *
 * The site key comes from the page's build info (TURNSTILE_SITE_KEY at build time). With no
 * key the token is null and the form says the check could not run.
 */
import { buildInfo } from "./site-data.js";

export const API_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TIMEOUT_MS = 20000;

let loading = null;

function loadScript(doc) {
  if (doc.defaultView && doc.defaultView.turnstile)
    return Promise.resolve(doc.defaultView.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = doc.createElement("script");
      script.src = API_URL;
      script.async = true;
      script.onload = () => resolve(doc.defaultView.turnstile);
      script.onerror = () => {
        loading = null;
        reject(new Error("Turnstile did not load"));
      };
      doc.head.appendChild(script);
    });
  }
  return loading;
}

export function turnstileToken(
  doc = document,
  siteKey = buildInfo().turnstileSiteKey
) {
  if (!siteKey) return Promise.resolve(null);
  return loadScript(doc).then(
    (turnstile) =>
      new Promise((resolve) => {
        const holder = doc.createElement("div");
        holder.setAttribute("aria-hidden", "true");
        doc.body.appendChild(holder);
        let widget;
        const finish = (token) => {
          clearTimeout(timer);
          try {
            if (widget !== undefined) turnstile.remove(widget);
          } catch (error) {
            // A widget that is already gone needs nothing more.
          }
          holder.remove();
          resolve(token);
        };
        const timer = setTimeout(() => finish(null), TIMEOUT_MS);
        widget = turnstile.render(holder, {
          sitekey: siteKey,
          execution: "execute",
          appearance: "interaction-only",
          callback: (token) => finish(token),
          "error-callback": () => finish(null),
          "expired-callback": () => finish(null)
        });
        turnstile.execute(widget);
      })
  );
}

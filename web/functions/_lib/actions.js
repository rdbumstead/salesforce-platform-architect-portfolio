/**
 * The shared shape of a function: the switch, the body, optional Turnstile, the forward to
 * Salesforce, the answer.
 */
import {
  failure,
  json,
  methodNotAllowed,
  readObject,
  MESSAGES
} from "./http.js";
import { isLive } from "./features.js";
import { callAction, ipHash } from "./salesforce.js";
import { verifyTurnstile } from "./turnstile.js";

export function sendResult(outcome) {
  if (outcome.ok)
    return json({ result: outcome.result }, 200, {
      "X-Request-Id": outcome.requestId
    });
  return failure(
    outcome.error,
    outcome.message,
    outcome.status === 429 ? { "Retry-After": "60" } : {}
  );
}

/**
 * @param {object} context Pages Functions context
 * @param {object} options feature (switch name), action, turnstile (bool), build(fields) returning
 *   the body to forward or an error string, timeoutMs
 */
export async function handlePost(context, options) {
  const { request, env } = context;
  if (request.method !== "POST") return methodNotAllowed("POST");
  if (!isLive(request, env, options.feature))
    return failure("UNAVAILABLE", MESSAGES.SWITCHED_OFF);
  if (!env.IP_HASH_SALT)
    return failure("UNAVAILABLE", "This feature is not set up on this deploy.");
  const body = await readObject(request);
  if (!body)
    return failure("BAD_REQUEST", "The request body must be a JSON object.");
  const { turnstileToken, ...fields } = body;
  if (options.turnstile) {
    const verdict = await verifyTurnstile(
      env,
      turnstileToken,
      request.headers.get("CF-Connecting-IP")
    );
    if (verdict === "failed")
      return failure(
        "BAD_REQUEST",
        "The check that you are a person did not pass. Try again."
      );
    if (verdict !== "ok")
      return failure(
        "UNAVAILABLE",
        "The check that you are a person could not be run. Try again later."
      );
  }
  const forward = options.build ? options.build(fields) : fields;
  if (typeof forward === "string") return failure("BAD_REQUEST", forward);
  return sendResult(
    await callAction(env, {
      action: options.action,
      method: "POST",
      body: forward,
      requestId: request.headers.get("X-Request-Id") || undefined,
      ipHash: await ipHash(request, env),
      timeoutMs: options.timeoutMs
    })
  );
}

/** A GET function cached at the edge for `seconds`. */
export async function handleCachedGet(context, { feature, action, seconds }) {
  const { request, env } = context;
  if (request.method !== "GET") return methodNotAllowed("GET");
  if (!isLive(request, env, feature))
    return failure("UNAVAILABLE", MESSAGES.SWITCHED_OFF);
  const store = typeof caches !== "undefined" ? caches.default : null;
  const url = new URL(request.url);
  const key = new Request(url.origin + url.pathname, { method: "GET" });
  if (store) {
    const hit = await store.match(key).catch(() => undefined);
    if (hit) return hit;
  }
  const outcome = await callAction(env, {
    action,
    method: "GET",
    requestId: request.headers.get("X-Request-Id") || undefined
  });
  const response = sendResult(outcome);
  if (!outcome.ok) return response;
  const cacheable = new Response(response.body, response);
  cacheable.headers.set("Cache-Control", `public, max-age=${seconds}`);
  if (store) {
    const put = store.put(key, cacheable.clone()).catch(() => undefined);
    if (typeof context.waitUntil === "function") context.waitUntil(put);
  }
  return cacheable;
}

/**
 * Calls the Salesforce site actions (/services/apexrest/site/actions/<action>) as the edge
 * user with a client credentials token.
 *
 * The token is cached for the life of the isolate and fetched again on a 401. A client
 * credentials response carries no lifetime, so the cache holds it for TOKEN_TTL_MS.
 * Salesforce errors become the site's own answers: 429 stays 429, a network error, a
 * refused token, a 5xx or a 403 (the edge user is missing its permission, which is ours
 * to fix, not the visitor's) become 503, and 400 and 500 keep Salesforce's message.
 * The secrets and tokens never appear in a message.
 */
import { MESSAGES } from "./http.js";

export const TOKEN_TTL_MS = 10 * 60 * 1000;
export const ACTION_PATH = "/services/apexrest/site/actions/";

let cached = null;
let inflight = null;

/** Test seam. */
export function resetTokenCache() {
  cached = null;
  inflight = null;
}

function configured(env) {
  return Boolean(
    env && env.SF_INSTANCE_URL && env.SF_CLIENT_ID && env.SF_CLIENT_SECRET
  );
}

function instance(env) {
  return String(env.SF_INSTANCE_URL).replace(/\/+$/, "");
}

async function fetchToken(env, now) {
  const response = await fetch(`${instance(env)}/services/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.SF_CLIENT_ID,
      client_secret: env.SF_CLIENT_SECRET
    }).toString()
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token)
    throw new Error(`token request refused (${response.status})`);
  return {
    token: body.access_token,
    base: String(body.instance_url || instance(env)).replace(/\/+$/, ""),
    at: now
  };
}

export async function getToken(env, { force = false, now = Date.now() } = {}) {
  if (!force && cached && now - cached.at < TOKEN_TTL_MS) return cached;
  if (!inflight) {
    inflight = fetchToken(env, now)
      .then((value) => {
        cached = value;
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** 64 lowercase hex: SHA-256 of the salt and the visitor IP. The raw IP never leaves the edge. */
export async function ipHash(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const data = new TextEncoder().encode(`${env.IP_HASH_SALT}|${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function unavailable(status) {
  return {
    ok: false,
    status: 503,
    error: "UNAVAILABLE",
    message: MESSAGES.UNAVAILABLE,
    upstream: status
  };
}

function mapFailure(status, body) {
  const message =
    body && typeof body.message === "string" ? body.message : undefined;
  if (status === 429)
    return {
      ok: false,
      status: 429,
      error: "RATE_LIMITED",
      message: message || MESSAGES.RATE_LIMITED
    };
  if (status === 400)
    return {
      ok: false,
      status: 400,
      error: "BAD_REQUEST",
      message: message || MESSAGES.BAD_REQUEST
    };
  if (status === 500)
    return {
      ok: false,
      status: 500,
      error: "CALL_FAILED",
      message: message || MESSAGES.CALL_FAILED
    };
  return unavailable(status);
}

/**
 * One action call.
 * @param {object} env the function environment
 * @param {object} call action, method, body (object), requestId, ipHash (POST), recording, timeoutMs
 * @returns {Promise<{ok: true, result: any, requestId: string} | {ok: false, status: number, error: string, message: string}>}
 */
export async function callAction(env, call) {
  if (!configured(env))
    return {
      ...unavailable(0),
      message: "This feature is not set up on this deploy."
    };
  const method = call.method || "GET";
  const requestId = call.requestId || crypto.randomUUID();
  const send = async (session) => {
    const headers = {
      Authorization: `Bearer ${session.token}`,
      Accept: "application/json",
      "X-Request-Id": requestId
    };
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
      headers["X-Client-Ip-Hash"] = call.ipHash;
    }
    if (call.recording) headers["X-Site-Recording"] = "1";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), call.timeoutMs || 30000);
    try {
      return await fetch(`${session.base}${ACTION_PATH}${call.action}`, {
        method,
        headers,
        body: method === "POST" ? JSON.stringify(call.body || {}) : undefined,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    let response = await send(await getToken(env));
    if (response.status === 401)
      response = await send(await getToken(env, { force: true }));
    const body = await response.json().catch(() => null);
    if (
      response.ok &&
      body &&
      Object.prototype.hasOwnProperty.call(body, "result")
    ) {
      return { ok: true, result: body.result, requestId };
    }
    if (response.ok)
      return {
        ok: false,
        status: 500,
        error: "CALL_FAILED",
        message: MESSAGES.CALL_FAILED
      };
    return mapFailure(response.status, body);
  } catch (error) {
    return unavailable(0);
  }
}

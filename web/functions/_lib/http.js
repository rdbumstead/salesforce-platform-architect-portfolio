/**
 * Small response helpers shared by every function. Errors always leave as
 * { error: CODE, message } with the same codes the Salesforce side uses, so the browser
 * handles one shape.
 */

export const MESSAGES = {
  BAD_REQUEST: "The request could not be read.",
  FORBIDDEN: "This is not allowed.",
  RATE_LIMITED: "Too many requests. Try again in a minute.",
  CALL_FAILED: "The request could not be completed. Try again later.",
  UNAVAILABLE: "Salesforce could not be reached right now. Try again later.",
  SWITCHED_OFF: "This feature is switched off right now."
};

const STATUS = {
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  CALL_FAILED: 500,
  UNAVAILABLE: 503
};

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, ...headers }
  });
}

export function failure(code, message, headers = {}) {
  return json(
    { error: code, message: message || MESSAGES[code] },
    STATUS[code] || 500,
    headers
  );
}

/** Reads a JSON object body. Returns null when it is missing, not JSON or not an object. */
export async function readObject(request) {
  try {
    const text = await request.text();
    if (text.length > 100000) return null;
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : null;
  } catch (error) {
    return null;
  }
}

export function methodNotAllowed(allow) {
  return json({ error: "BAD_REQUEST", message: "Method not allowed." }, 405, {
    Allow: allow
  });
}

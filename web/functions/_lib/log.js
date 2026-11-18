/**
 * One JSON line per failure at the edge, written with console so Cloudflare's log stream
 * (wrangler pages deployment tail) shows it. It records where a failure happened and nothing
 * about who caused it: the route, a code, the status the visitor got and the request id.
 * There is no IP, no hashed IP, no user agent, no email, no body field, no token and no query
 * string, and no way to pass any in, because only the four named keys are ever read.
 */

/** The request id is a header the visitor can set, so it is kept only when it looks like an id. */
const ID_SHAPE = /^[A-Za-z0-9-]{8,64}$/;
const CODE_SHAPE = /^[A-Z0-9_]{1,40}$/;
const ROUTE_SHAPE = /^[a-z0-9-]{1,40}$/;

/**
 * @param {{route: string, error: string, status: number, requestId?: string}} failure
 * @returns {object|null} the line that was written, or null when the route or code was not a
 *   plain label and nothing was written
 */
export function logFailure({ route, error, status, requestId } = {}) {
  if (!ROUTE_SHAPE.test(String(route)) || !CODE_SHAPE.test(String(error)))
    return null;
  const line = {
    route,
    error,
    status: Number.isInteger(status) ? status : 0
  };
  if (typeof requestId === "string" && ID_SHAPE.test(requestId))
    line.requestId = requestId;
  try {
    console.error(JSON.stringify(line));
  } catch (cause) {
    // Logging must never fail a request.
  }
  return line;
}

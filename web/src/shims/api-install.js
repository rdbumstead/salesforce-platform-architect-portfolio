/** Registers the /api client as the request handler. Safe to call on every mount. */
import { setRequestHandler } from "./apex.js";
import { createRequestHandler } from "./api-client.js";
import { turnstileToken } from "./turnstile-client.js";

let handler = null;

export function installApi() {
  if (!handler) {
    handler = createRequestHandler({ turnstileToken: () => turnstileToken() });
    setRequestHandler(handler);
  }
  return handler;
}

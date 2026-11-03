/**
 * Stand in for @salesforce/apex/Class.method on the static site.
 *
 * Each import is a function that returns a promise, with a wire adapter
 * attached the way the LWC engine looks for one (fn.adapter). A build time
 * read answers from the data inlined in the page. A request time call answers
 * through the site's own /api functions once they exist, and until then
 * rejects with a plain message the component already knows how to show.
 */
import { lookup } from "./site-data.js";

export const NOT_IN_BUILD =
  "This section is not available on the static site yet.";

function apexError(message, status) {
  return {
    status: status || 503,
    body: { message },
    ok: false,
    statusText: "Unavailable"
  };
}

function hasUndefined(config) {
  return Object.keys(config || {}).some((key) => config[key] === undefined);
}

function buildAdapter(call) {
  return class ApexBuildAdapter {
    constructor(dataCallback) {
      this.dataCallback = dataCallback;
      this.connected = false;
      this.config = undefined;
    }

    connect() {
      this.connected = true;
      this.emit();
    }

    disconnect() {
      this.connected = false;
    }

    update(config) {
      this.config = config || {};
      this.emit();
    }

    emit() {
      if (!this.connected || this.config === undefined) return;
      // Salesforce does not provision a wire while a reactive parameter is undefined.
      if (hasUndefined(this.config)) return;
      const config = this.config;
      lookup(call, config).then(({ found, value }) => {
        if (!this.connected || this.config !== config) return;
        this.dataCallback(
          found
            ? { data: value, error: undefined }
            : { data: undefined, error: apexError(NOT_IN_BUILD, 404) }
        );
        // The build data paints first. A call that also has a live reading then swaps it
        // in when it arrives, and keeps the build data if the live reading fails or is off.
        if (LIVE_CALLS.has(call) && requestHandler) {
          requestHandler(call, config).then(
            (live) => {
              if (!this.connected || this.config !== config) return;
              this.dataCallback({ data: live, error: undefined });
            },
            () => undefined
          );
        }
      });
    }
  };
}

let requestHandler = null;

/** Wired calls that have a live reading after the build time one. */
export const LIVE_CALLS = new Set(["GovernanceController.getPipelineStatus"]);

/** The /api client registers here. With none, request time calls reject. */
export function setRequestHandler(handler) {
  requestHandler = handler;
}

export function apexMethod(call, mode) {
  let fn;
  if (mode === "request") {
    fn = (params) =>
      requestHandler
        ? requestHandler(call, params || {})
        : Promise.reject(apexError(NOT_IN_BUILD, 503));
  } else {
    fn = (params) =>
      lookup(call, params || {}).then(({ found, value }) =>
        found ? value : Promise.reject(apexError(NOT_IN_BUILD, 404))
      );
  }
  const adapter = buildAdapter(call);
  Object.defineProperty(fn, "adapter", { value: adapter });
  return fn;
}

/** refreshApex from @salesforce/apex: the data cannot change after the build. */
export function refreshApex() {
  return Promise.resolve();
}

export function getSObjectValue(record, field) {
  if (!record || !field) return undefined;
  const name = typeof field === "string" ? field : field.fieldApiName;
  return name
    .split(".")
    .reduce((value, part) => (value == null ? undefined : value[part]), record);
}

/**
 * Stand in for lightning/navigation. Every route is its own page on the static site, so a
 * page reference is read from the address and the route name the page was built with.
 */
import { buildInfo } from "./site-data.js";

export function currentPageReference() {
  const state = {};
  if (typeof window !== "undefined") {
    new URLSearchParams(window.location.search).forEach((value, key) => {
      state[key] = value;
    });
  }
  return {
    type: "comm__namedPage",
    attributes: { name: buildInfo().routeName || "Home" },
    state
  };
}

export class CurrentPageReference {
  constructor(dataCallback) {
    this.dataCallback = dataCallback;
    this.onPopState = () => this.emit();
  }

  connect() {
    window.addEventListener("popstate", this.onPopState);
    this.emit();
  }

  disconnect() {
    window.removeEventListener("popstate", this.onPopState);
  }

  update() {}

  emit() {
    this.dataCallback(currentPageReference());
  }
}

function urlFor(pageReference) {
  if (!pageReference) return "/";
  if (pageReference.type === "standard__webPage")
    return pageReference.attributes.url;
  const path =
    (pageReference.attributes && pageReference.attributes.url) || "/";
  const query = new URLSearchParams(pageReference.state || {}).toString();
  return query ? `${path}?${query}` : path;
}

const Navigate = Symbol("Navigate");
const GenerateUrl = Symbol("GenerateUrl");

export const NavigationMixin = (Base) =>
  class extends Base {
    [Navigate](pageReference, replace) {
      const url = urlFor(pageReference);
      if (replace) window.location.replace(url);
      else window.location.assign(url);
    }

    [GenerateUrl](pageReference) {
      return Promise.resolve(urlFor(pageReference));
    }
  };
NavigationMixin.Navigate = Navigate;
NavigationMixin.GenerateUrl = GenerateUrl;

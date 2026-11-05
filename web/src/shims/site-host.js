/**
 * The static site's c/siteHost: the page's data was read when the site was built, and
 * builtAt says when. The wording helpers are the Salesforce module's own.
 */
import { buildInfo } from "./site-data.js";

export {
  utcLabel,
  localLabel,
  buildWording
} from "../../../packages/portfolio-site/main/default/lwc/siteHost/siteHost.js";

export const IS_STATIC = true;

/**
 * The Salesforce site that serves the token endpoint and the API. The static host serves
 * neither, so the API Lab shows this origin in its examples. The build can set
 * build.salesforceOrigin to name another host, for example a custom domain after cutover.
 */
export const SALESFORCE_ORIGIN =
  "https://ryan-bumstead-dev-ed.develop.my.site.com";

export function siteOrigin() {
  return buildInfo().salesforceOrigin || SALESFORCE_ORIGIN;
}

export function builtAt() {
  return buildInfo().builtAt || null;
}

/** True when the page was built from the sample fixtures, not from Salesforce. */
export function isFixtureBuild() {
  return Boolean(buildInfo().fixture);
}

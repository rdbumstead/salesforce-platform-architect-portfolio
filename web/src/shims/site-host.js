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

export function builtAt() {
  return buildInfo().builtAt || null;
}

/** True when the page was built from the sample fixtures, not from Salesforce. */
export function isFixtureBuild() {
  return Boolean(buildInfo().fixture);
}

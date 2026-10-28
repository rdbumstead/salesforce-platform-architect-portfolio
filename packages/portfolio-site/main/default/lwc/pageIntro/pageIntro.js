/**
 * @description       : The opening block of a pillar page: an eyebrow naming the pillar, the page's
 *                      one h1, a lead paragraph in a larger size, up to a few short bullet points and
 *                      an optional "Read the design" link. The points property holds the bullets
 *                      separated by a vertical bar, since a builder property is one line.
 *                      Every value is a builder property, so the copy lives in the page's view. The h1
 *                      is drawn larger than any section heading the page's components draw below it,
 *                      so the outline and the type scale agree. A design link is shown only when it is
 *                      an https address, a site path (starting with "/", put under the site's base path)
 *                      or an in page anchor. Any other value shows no link.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/24/2026
 **/
import { LightningElement, api } from "lwc";
import basePath from "@salesforce/community/basePath";

const DEFAULT_DESIGN_LABEL = "Read the design";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Turns a design URL into an href, or "" when it is not one the intro may link to.
 * @param {string} value the designUrl property
 * @returns {string} href
 */
export function toDesignHref(value) {
  const url = clean(value);
  if (!url) {
    return "";
  }
  if (/^https:\/\/[^\s"'<>]+$/i.test(url)) {
    return url;
  }
  if (/^#[\w-]+$/.test(url)) {
    return url;
  }
  // A site path, but never a protocol relative "//host" address.
  if (/^\/(?!\/)[^\s"'<>]*$/.test(url)) {
    return `${basePath || ""}${url}`;
  }
  return "";
}

/**
 * Splits the points property into its bullets: trimmed, with empty ones dropped.
 * @param {string} value the points property, bullets separated by a vertical bar
 * @returns {string[]} the bullets in order
 */
export function toPoints(value) {
  return clean(value)
    .split("|")
    .map((point) => point.trim())
    .filter(Boolean);
}

export default class PageIntro extends LightningElement {
  @api eyebrow;
  @api heading;
  @api lead;
  @api points;
  @api designLabel;
  @api designUrl;

  get eyebrowText() {
    return clean(this.eyebrow);
  }

  get headingText() {
    return clean(this.heading);
  }

  get leadText() {
    return clean(this.lead);
  }

  get pointItems() {
    return toPoints(this.points).map((text, index) => ({
      key: `point-${index}`,
      text
    }));
  }

  get hasPoints() {
    return this.pointItems.length > 0;
  }

  get designHref() {
    return toDesignHref(this.designUrl);
  }

  get designText() {
    return clean(this.designLabel) || DEFAULT_DESIGN_LABEL;
  }

  get isExternal() {
    return this.designHref.startsWith("https://");
  }

  get designTarget() {
    return this.isExternal ? "_blank" : undefined;
  }

  get designRel() {
    return this.isExternal ? "noopener noreferrer" : undefined;
  }
}

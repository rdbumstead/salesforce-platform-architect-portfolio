/**
 * @description       : A short full width message for a page the site cannot show as it is: a page that
 *                      does not exist, a busy site or an unavailable one. It draws an eyebrow, the page's
 *                      one h1, a plain sentence and, when asked, a link back to the home page. Every value
 *                      is a builder property, so the words live in the page's view. The home link is put
 *                      under the site's base path.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/27/2026
 **/
import { LightningElement, api } from "lwc";
import basePath from "@salesforce/community/basePath";

const DEFAULT_HOME_LABEL = "Go to the home page";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

export default class MessagePage extends LightningElement {
  @api eyebrow;
  @api heading;
  @api body;
  @api homeLabel;
  @api showHome = false;

  get eyebrowText() {
    return clean(this.eyebrow);
  }

  get headingText() {
    return clean(this.heading);
  }

  get bodyText() {
    return clean(this.body);
  }

  get homeText() {
    return clean(this.homeLabel) || DEFAULT_HOME_LABEL;
  }

  get homeHref() {
    return `${basePath || ""}/`;
  }

  get hasHome() {
    return this.showHome === true || this.showHome === "true";
  }
}

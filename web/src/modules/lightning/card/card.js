import { LightningElement, api } from "lwc";

/**
 * Native stand in for lightning-card. It follows the platform layout measured on the live
 * site: a bordered, lightly shadowed card with an icon, a title and an actions slot on one
 * header row, then the body, then an optional footer. The actions sit at the right end of the
 * row and drop under the title only when the row has no room for both.
 */
export default class Card extends LightningElement {
  @api title;
  @api iconName;
  @api variant;

  hasFooter = false;

  get footerClass() {
    return this.hasFooter ? "footer" : "footer footer-empty";
  }

  handleFooterChange(event) {
    this.hasFooter = event.target.assignedNodes().length > 0;
  }
}

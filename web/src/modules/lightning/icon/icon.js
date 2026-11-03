import { LightningElement, api } from "lwc";

/**
 * Native stand in for lightning-icon. The site uses one icon (a book, beside the API
 * reference heading), so this draws a plain inline book for any name. With no
 * alternative text the icon is decorative and hidden from assistive technology.
 */
export default class Icon extends LightningElement {
  @api iconName;
  @api size = "small";
  @api alternativeText;
  @api variant;

  get hidden() {
    return this.alternativeText ? null : "true";
  }

  get label() {
    return this.alternativeText || null;
  }

  get role() {
    return this.alternativeText ? "img" : null;
  }

  get sizeClass() {
    return `icon icon-${this.size || "small"}`;
  }
}

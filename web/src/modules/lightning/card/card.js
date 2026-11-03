import { LightningElement, api } from "lwc";

/**
 * Native stand in for lightning-card on the static site: a titled section with an
 * actions slot, a body and an optional footer, in the site's own tokens.
 */
export default class Card extends LightningElement {
  @api title;
  @api iconName;
  @api variant;
}

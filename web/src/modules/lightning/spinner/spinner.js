import { LightningElement, api } from "lwc";

/**
 * Native stand in for lightning-spinner: a small rotating ring with its text read out
 * to assistive technology. It stops moving under reduced motion.
 */
export default class Spinner extends LightningElement {
  @api alternativeText = "Loading";
  @api size = "medium";
  @api variant;

  get ringClass() {
    return `ring ring-${this.size || "medium"}`;
  }
}

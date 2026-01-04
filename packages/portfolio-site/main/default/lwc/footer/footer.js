/**
 * @description       : Global footer component with health indicators.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { LightningElement } from "lwc";

export default class Footer extends LightningElement {
  get currentYear() {
    return new Date().getFullYear();
  }

  handleBadgeError(event) {
    // Fallback if badge fails to load (e.g. private repo or network error)
    event.target.style.display = "none";
  }
}

/**
 * @description       : Hero banner with navigation guide.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/19/2025
 **/
import { LightningElement } from "lwc";

export default class HeroBanner extends LightningElement {
  // Future: Fetch from Custom Metadata or Content Asset
  heroImageUrl = "";

  handleConnect() {
    // eslint-disable-next-line no-console
    console.log("Hero Banner Loaded");
  }
}

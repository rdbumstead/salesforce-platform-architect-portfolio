/**
 * @description       : The home page's "Get in touch" line, the last section before the
 *                      footer. A heading, one sentence, an optional short note under it
 *                      ("References available on request." by default, blank hides it) and a
 *                      link styled as a button that opens the /contact page, where the contact
 *                      form lives.
 *                      Older links pointed at the form on the home page with #contact, so when
 *                      the address ends in #contact, on load or later, this sends the visitor
 *                      on to /contact. The redirect replaces the history entry, so Back does
 *                      not return to an address that redirects again.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/23/2026
 **/
import { LightningElement, api } from "lwc";
import basePath from "@salesforce/community/basePath";

export const OLD_CONTACT_HASH = "#contact";
export const CONTACT_PATH = "contact";

/**
 * The /contact href under the site's base path.
 * @returns {string} For example /portfolio/contact.
 */
export function contactHref() {
  return `${basePath || ""}/${CONTACT_PATH}`;
}

export default class ContactCall extends LightningElement {
  @api heading = "Get in touch";
  @api text = "Questions about a project, a role or this site?";
  @api linkLabel = "Contact Ryan";
  @api note = "References available on request.";

  get hasNote() {
    return typeof this.note === "string" && this.note.trim().length > 0;
  }

  boundHashChange = () => this.redirectIfOldLink();

  get href() {
    return contactHref();
  }

  connectedCallback() {
    window.addEventListener("hashchange", this.boundHashChange);
    this.redirectIfOldLink();
  }

  disconnectedCallback() {
    window.removeEventListener("hashchange", this.boundHashChange);
  }

  redirectIfOldLink() {
    try {
      if (window.location.hash === OLD_CONTACT_HASH) {
        window.location.replace(contactHref());
      }
    } catch {
      // A blocked location call leaves the visitor on the home page with the link in view.
    }
  }
}

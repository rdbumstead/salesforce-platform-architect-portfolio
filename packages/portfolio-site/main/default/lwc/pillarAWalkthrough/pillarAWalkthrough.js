/**
 * @description       : The Pillar A walkthrough: how one partner inquiry moves through the
 *                      Employer Hub, as eight numbered steps under a heading drawn like the
 *                      other section headings on the page. The steps live in this file so the
 *                      page needs no rich text block, whose heading could not be styled from the
 *                      view.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/26/2026
 **/
import { LightningElement } from "lwc";

export const WALKTHROUGH_STEPS = [
  "An employer fills in the Employer Form on the education provider's website, or emails a staff member and the email is logged on the account automatically.",
  "The form finds or creates the employer's account and the contact, and links them.",
  "It creates one case for each kind of help the employer asked for.",
  "Each case is routed to the queue for the account's academic focus area, and the queue's members are notified.",
  "A queue member reviews the case. A service request, such as a job posting or a career event, is fulfilled from the case with a guided flow, and the case closes.",
  "A monetary request, such as a sponsorship or corporate training, is converted to an opportunity, and the case closes.",
  "When the opportunity is won, a task reminds its owner to create the contract, which is created from the opportunity with the signed file.",
  "Every email, call, meeting, case, opportunity and contract sits on the partner's account, and dashboards report new inquiries by queue and the pipeline by stage."
];

export default class PillarAWalkthrough extends LightningElement {
  get steps() {
    return WALKTHROUGH_STEPS.map((text, index) => ({
      key: `step-${index + 1}`,
      text
    }));
  }
}

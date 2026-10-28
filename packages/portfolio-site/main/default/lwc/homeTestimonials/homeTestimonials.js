/**
 * @description       : Approved testimonials on the home page. Reads
 *                      TestimonialController.getHomeTestimonials, which returns nothing while
 *                      fewer than the Home_Testimonials_Min setting are approved, and up to three
 *                      quotes once there are enough: the professional ones first, by the wall's
 *                      rule. So the quotes ship hidden and turn on by themselves. Each quote
 *                      keeps its tone, as on the wall, and a link leads to every testimonial on
 *                      /testimonials.
 *                      While there are no quotes to show (before the read, when it is empty or
 *                      when it fails) nothing renders. The certifications and their verify link
 *                      live on the career timeline, and "References available on request" in
 *                      the contact call.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/24/2026
 **/
import { LightningElement, wire } from "lwc";
import basePath from "@salesforce/community/basePath";
import getHomeTestimonials from "@salesforce/apex/TestimonialController.getHomeTestimonials";

// The server sends at most three. This keeps the section to three if that ever changes.
const MAX_SHOWN = 3;

const RELATIONSHIP_LABELS = {
  Manager: "Manager",
  Peer: "Peer",
  Client: "Client",
  Recruiter: "Recruiter",
  Fan: "Fan or visitor"
};

export default class HomeTestimonials extends LightningElement {
  items = [];

  @wire(getHomeTestimonials)
  wiredTestimonials({ data, error }) {
    if (Array.isArray(data)) {
      this.items = data.filter(
        (item) =>
          item && typeof item.sentence === "string" && item.sentence.trim()
      );
    } else if (error || data === null) {
      // On an error the quotes stay hidden.
      this.items = [];
    }
  }

  get hasItems() {
    return this.items.length > 0;
  }

  get quotes() {
    return this.items.slice(0, MAX_SHOWN).map((item, index) => {
      const casual = item.vibe === "Casual";
      const byline = [
        item.authorTitle,
        RELATIONSHIP_LABELS[item.relationship] || null
      ].filter(Boolean);
      return {
        key: item.key || `quote-${index}`,
        sentence: item.sentence.trim(),
        authorName: item.authorName,
        byline: byline.join(", "),
        cardClass: casual ? "card card-casual" : "card card-professional",
        toneLabel: casual ? "Casual" : "Professional"
      };
    });
  }

  get wallHref() {
    return `${basePath || ""}/testimonials`;
  }
}

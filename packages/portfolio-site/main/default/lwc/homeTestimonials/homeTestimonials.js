/**
 * @description       : Approved testimonials on the home page. Reads
 *                      TestimonialController.getHomeTestimonials, which returns nothing while
 *                      fewer than the Home_Testimonials_Min setting are approved, and up to three
 *                      quotes once there are enough: the professional ones first, by the wall's
 *                      rule. So the quotes ship hidden and turn on by themselves. Each quote
 *                      keeps its tone, as on the wall, and a link leads to every testimonial on
 *                      /testimonials.
 *                      While there are no quotes to show (the read is empty or fails), a small
 *                      credentials strip answers "who vouches for him" instead: the count of
 *                      active certifications (the same constant as the hero's proof strip), a
 *                      link to verify them on Trailhead when the owner Contact has a safe
 *                      Trailhead URL (ResumeController.getHeader), and "References available on
 *                      request". Nothing renders before the testimonial read returns.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/24/2026
 **/
import { LightningElement, wire } from "lwc";
import basePath from "@salesforce/community/basePath";
import getHomeTestimonials from "@salesforce/apex/TestimonialController.getHomeTestimonials";
import getHeader from "@salesforce/apex/ResumeController.getHeader";
import { ACTIVE_CERTIFICATIONS } from "c/pillarData";
import { toExternalUrl } from "c/externalUrl";

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
  loaded = false;
  header;
  certificationsText = ACTIVE_CERTIFICATIONS;

  @wire(getHomeTestimonials)
  wiredTestimonials({ data, error }) {
    if (Array.isArray(data)) {
      this.items = data.filter(
        (item) =>
          item && typeof item.sentence === "string" && item.sentence.trim()
      );
      this.loaded = true;
    } else if (error || data === null) {
      // On an error the quotes stay hidden and the credentials strip shows instead.
      this.items = [];
      this.loaded = true;
    }
  }

  @wire(getHeader)
  wiredHeader({ data }) {
    // No header or a failed read only drops the Trailhead link.
    this.header = data || undefined;
  }

  get hasItems() {
    return this.items.length > 0;
  }

  get showCredentials() {
    return this.loaded && !this.hasItems;
  }

  get trailheadHref() {
    return toExternalUrl(this.header && this.header.trailheadUrl);
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

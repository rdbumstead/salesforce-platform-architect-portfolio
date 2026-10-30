/**
 * @description       : The credentials band on the home page: Education on the left and
 *                      Certifications on the right, one section with a thin divider between,
 *                      from ResumeController.getTimeline.
 *                      Education shows one tile for the first school the read sends, a plain
 *                      circle with a graduation cap (no logo), the text "<credential>,
 *                      <field of study>" (just the credential when the field is blank) and the
 *                      caption "<school> · <year>".
 *                      Certifications show exactly what the read sends, newest first by earned
 *                      date with ties broken by name. The server already leaves retired ones
 *                      out. Each tile has the badge image from the Certification_Badges static
 *                      resource at "<resource>/<badgeFile>", the name without the issuer's own
 *                      "<issuer> Certified " prefix and the caption "<issuer> · <year>". A
 *                      certification with no badge file, or whose image fails to load, shows
 *                      the same plain circle tile as the degree, with its initials.
 *                      One primary "Verify on Trailhead" button sits beside the Certifications
 *                      heading when the read sends a verification link starting http or https.
 *                      Renders nothing when the read fails or sends neither.
 *                      Below 768 px the two sides stack into one column.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/30/2026
 **/
import { LightningElement, wire } from "lwc";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";
import CERTIFICATION_BADGES from "@salesforce/resourceUrl/Certification_Badges";

const HTTP_URL = /^https?:\/\//i;
const DOT = " · ";

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function yearOf(value) {
  const match = /^(\d{4})/.exec(clean(value));
  return match ? match[1] : "";
}

/**
 * The certification name without the issuer's own "<issuer> Certified " prefix.
 * @param {string} name the full name
 * @param {string} issuer the issuer
 * @returns {string} the shorter name
 */
export function shortCertificationName(name, issuer) {
  const full = clean(name);
  const owner = clean(issuer);
  if (!owner) {
    return full;
  }
  const prefix = `${owner} Certified `.toLowerCase();
  if (full.toLowerCase().startsWith(prefix) && full.length > prefix.length) {
    return full.slice(prefix.length).trim();
  }
  return full;
}

/**
 * Up to two capital letters from a name, for a tile with no badge image.
 * @param {string} name the short name
 * @returns {string} the initials
 */
export function initialsOf(name) {
  return clean(name)
    .split(/\s+/)
    .filter((word) => /^[A-Za-z0-9]/.test(word))
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");
}

/**
 * The text and caption of the degree tile.
 * @param {object} school a TimelineEducation
 * @returns {object} the tile
 */
export function buildDegree(school) {
  const credential = clean(school.credential);
  const field = clean(school.fieldOfStudy);
  const name = clean(school.school);
  const year = yearOf(school.completedDate);
  return {
    key: clean(school.key) || "education-0",
    text: field ? `${credential}, ${field}` : credential,
    caption: [name, year].filter(Boolean).join(DOT)
  };
}

/**
 * The certification tiles in the order shown: newest first by earned date, ties by name.
 * @param {object[]} certifications the TimelineCertifications
 * @param {string[]} failed keys whose image did not load
 * @param {string} baseUrl the static resource url
 * @returns {object[]} the tiles
 */
export function buildCertifications(certifications, failed, baseUrl) {
  return certifications
    .filter((item) => item && clean(item.name))
    .map((item, index) => {
      const full = clean(item.name);
      const issuer = clean(item.issuer);
      const short = shortCertificationName(full, issuer);
      const file = clean(item.badgeFile);
      const key = clean(item.id) || `certification-${index}`;
      const src = file && !failed.includes(key) ? `${baseUrl}/${file}` : null;
      return {
        key,
        full,
        text: short,
        initials: initialsOf(short),
        caption: [issuer, yearOf(item.earnedDate)].filter(Boolean).join(DOT),
        when: clean(item.earnedDate),
        src,
        hasImage: !!src
      };
    })
    .sort((a, b) => {
      if (a.when !== b.when) {
        return a.when < b.when ? 1 : -1;
      }
      return a.text.localeCompare(b.text);
    });
}

export default class CredentialsBand extends LightningElement {
  degrees = [];
  certifications = [];
  verificationUrl = null;
  failed = [];

  @wire(getTimeline)
  wiredTimeline({ data, error }) {
    if (data) {
      this.degrees = (Array.isArray(data.education) ? data.education : [])
        .slice(0, 1)
        .map(buildDegree);
      this.certifications = Array.isArray(data.certifications)
        ? data.certifications
        : [];
      this.failed = [];
      const link =
        typeof data.verificationUrl === "string"
          ? data.verificationUrl.trim()
          : "";
      this.verificationUrl = HTTP_URL.test(link) ? link : null;
    } else if (error) {
      this.degrees = [];
      this.certifications = [];
      this.verificationUrl = null;
    }
  }

  get certTiles() {
    return buildCertifications(
      this.certifications,
      this.failed,
      CERTIFICATION_BADGES
    );
  }

  get hasEducation() {
    return this.degrees.length > 0;
  }

  get hasContent() {
    return this.hasEducation || this.certTiles.length > 0;
  }

  get hasVerify() {
    return !!this.verificationUrl;
  }

  handleImageError(event) {
    const key = event.target.dataset.key;
    if (key && !this.failed.includes(key)) {
      this.failed = [...this.failed, key];
    }
  }
}

/**
 * @description       : The one layout spec for the resume. The PDF writer reads it in points, and
 *                      the preview reads the same values as CSS custom properties at 1.6 px per
 *                      point (previewStyle), so a change here changes both. It holds the fonts,
 *                      sizes, spacing, colours, rules, labels and the section order.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/

/** Preview pixels per PDF point. 10 pt body text shows at 16 px. */
export const PREVIEW_PX_PER_PT = 1.6;

export const RESUME_LAYOUT = Object.freeze({
  page: Object.freeze({ format: "letter", unit: "pt", margin: 54 }),
  lineHeight: 1.4,
  colors: Object.freeze({
    paper: "#ffffff",
    ink: "#101828",
    link: "#1d4ed8",
    rule: "#101828",
    muted: "#475467",
    error: "#b42318"
  }),
  font: Object.freeze({
    family: "Inter",
    fallback: "helvetica",
    files: Object.freeze({
      normal: "inter-latin-400-normal.ttf",
      bold: "inter-latin-700-normal.ttf"
    })
  }),
  type: Object.freeze({
    name: Object.freeze({ size: 17.5, bold: true }),
    title: Object.freeze({ size: 10, bold: false }),
    links: Object.freeze({ size: 10, bold: false }),
    summary: Object.freeze({ size: 10, bold: false }),
    sectionTitle: Object.freeze({ size: 9, bold: true, upper: true }),
    roleHeading: Object.freeze({ size: 10, bold: true }),
    roleDates: Object.freeze({ size: 10, bold: false }),
    bullet: Object.freeze({ size: 10, bold: false }),
    label: Object.freeze({ size: 10, bold: true }),
    text: Object.freeze({ size: 10, bold: false }),
    subheading: Object.freeze({ size: 8, bold: true, upper: true })
  }),
  space: Object.freeze({
    headerGap: 2,
    summaryBefore: 6,
    headerAfter: 15,
    sectionBefore: 10,
    sectionTitleAfter: 5,
    ruleWidth: 1.25,
    ruleGap: 2,
    roleAfter: 10,
    bulletIndent: 15,
    bulletMarker: 5,
    itemGap: 2,
    subheadingBefore: 6,
    linkGap: 8
  }),
  marks: Object.freeze({ bullet: "•", linkSeparator: "•" }),
  sections: Object.freeze([
    "experience",
    "skills",
    "certifications",
    "education"
  ]),
  labels: Object.freeze({
    experience: "Experience",
    skills: "Skills",
    certifications: "Certifications",
    education: "Education",
    earlierRoles: "Earlier roles",
    retired: "Retired",
    verify: "Verify on Trailhead",
    remote: "Remote"
  })
});

const px = (points) =>
  `${Math.round(points * PREVIEW_PX_PER_PT * 100) / 100}px`;

/**
 * The spec as CSS custom properties for the preview paper, in a style attribute string.
 * @param {object} layout the layout spec, RESUME_LAYOUT by default
 * @returns {string} "--resume-name-size: 28px; ..." for the preview's style attribute
 */
export function previewStyle(layout = RESUME_LAYOUT) {
  const { type, space, colors, lineHeight } = layout;
  const vars = {
    "--resume-paper": colors.paper,
    "--resume-ink": colors.ink,
    "--resume-link": colors.link,
    "--resume-rule": colors.rule,
    "--resume-muted": colors.muted,
    "--resume-error": colors.error,
    "--resume-line-height": String(lineHeight),
    "--resume-rule-width": px(space.ruleWidth),
    "--resume-rule-gap": px(space.ruleGap),
    "--resume-header-gap": px(space.headerGap),
    "--resume-summary-before": px(space.summaryBefore),
    "--resume-header-after": px(space.headerAfter),
    "--resume-section-before": px(space.sectionBefore),
    "--resume-section-title-after": px(space.sectionTitleAfter),
    "--resume-role-after": px(space.roleAfter),
    "--resume-bullet-indent": px(space.bulletIndent),
    "--resume-item-gap": px(space.itemGap),
    "--resume-subheading-before": px(space.subheadingBefore),
    "--resume-link-gap": px(space.linkGap)
  };
  Object.keys(type).forEach((key) => {
    const name = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    vars[`--resume-${name}-size`] = px(type[key].size);
    vars[`--resume-${name}-weight`] = type[key].bold ? "700" : "400";
  });
  return Object.keys(vars)
    .map((key) => `${key}: ${vars[key]}`)
    .join("; ");
}

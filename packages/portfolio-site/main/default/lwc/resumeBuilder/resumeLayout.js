/**
 * @description       : The layout spec for the resume. The page, fonts, sizes, spacing and
 *                      colours come from c/documentPdf, shared with the cover letter, and this
 *                      file adds the resume's section order and labels. The PDF writer reads it
 *                      in points, and the preview reads the same values as CSS custom properties
 *                      at 1.6 px per point (previewStyle), so a change there changes both.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/

import {
  DOCUMENT_LAYOUT,
  PREVIEW_PX_PER_PT,
  previewStyle as documentPreviewStyle
} from "c/documentPdf";

export { PREVIEW_PX_PER_PT };

/** The shared document spec plus the resume's own section order and labels. */
export const RESUME_LAYOUT = Object.freeze({
  ...DOCUMENT_LAYOUT,
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

/**
 * The spec as CSS custom properties for the preview paper, in a style attribute string.
 * @param {object} layout the layout spec, RESUME_LAYOUT by default
 * @returns {string} "--resume-name-size: 28px; ..." for the preview's style attribute
 */
export function previewStyle(layout = RESUME_LAYOUT) {
  return documentPreviewStyle(layout);
}

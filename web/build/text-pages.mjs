/**
 * The text version of the resume: one plain HTML page per public focus, written at build time
 * from the same getResume reads the resume page uses, through the same view model as the PDF
 * and the ATS text. It carries no script. Each page is kept out of search (noindex), left out
 * of the sitemap and points its canonical address at the resume page, so the resume page stays
 * the one the search engines list. The resume page links to it as the accessible copy.
 */
import fs from "node:fs";
import path from "node:path";
import { SITE_ORIGIN } from "./routes.mjs";
import {
  loadShipped,
  PAGE_OPTIONS,
  PUBLIC_FOCUSES
} from "./resume-pdf-check.mjs";

/** The visitor label of each focus. A test keeps these equal to the resume page's options. */
export const FOCUS_LABELS = Object.freeze({
  Engineer: "Salesforce Engineer",
  Architect: "Platform Architect",
  Consultant: "Solution Consultant"
});

export const TEXT_ROOT = "/resume/text";

/** The route list of the text pages, one per public focus, in the focus order. */
export function textRoutes() {
  return PUBLIC_FOCUSES.map((focus) => ({
    focus,
    label: FOCUS_LABELS[focus],
    path: `${TEXT_ROOT}/${focus.toLowerCase()}`,
    file: `resume/text/${focus.toLowerCase()}.html`
  }));
}

const readKey = (focus) => `ResumeController.getResume|{"persona":"${focus}"}`;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const list = (items, className) =>
  `<ul${className ? ` class="${className}"` : ""}>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;

/**
 * The page's own rules, on top of the site stylesheet. The site stylesheet resets every heading
 * to the body size and weight, so the headings are sized again here. Colours come from the
 * site's tokens, which follow the system colour scheme with no script, so there is no toggle.
 */
const TEXT_PAGE_CSS = [
  "body{margin:0;height:auto;line-height:1.5;color:var(--pf-body)}",
  ".text-page{max-width:46rem;margin:0 auto;padding:1rem 1rem 2rem}",
  ".text-page a{color:var(--pf-accent);text-decoration:underline;text-underline-offset:.15em}",
  ".text-page a:focus-visible{outline:2px solid var(--pf-focus);outline-offset:2px}",
  ".text-page .skip{position:absolute;left:-999px;top:0}",
  ".text-page .skip:focus{position:static;display:inline-block;margin-bottom:.5rem}",
  ".text-page ul{margin:0;padding-left:1.25rem}",
  ".text-page .plain{list-style:none;padding-left:0}",
  ".text-page .bar{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem;font-size:.9375rem}",
  ".text-page header{border-bottom:1px solid var(--pf-border);padding-bottom:.75rem}",
  ".text-page h1{font-size:2rem;font-weight:700;line-height:1.15;margin:1.5rem 0 .25rem;color:var(--pf-text)}",
  ".text-page h2{font-size:1.375rem;font-weight:700;line-height:1.25;margin:2rem 0 .75rem;padding-bottom:.25rem;border-bottom:1px solid var(--pf-border);color:var(--pf-text)}",
  ".text-page h3{font-size:1.0625rem;font-weight:700;margin:1rem 0 .5rem;color:var(--pf-text)}",
  ".text-page .headline{margin:0 0 .5rem;font-size:1.125rem;color:var(--pf-text)}",
  ".text-page .note{margin:0 0 .75rem;font-size:.875rem;color:var(--pf-muted)}",
  ".text-page .contact{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem}",
  ".text-page .role{margin:0 0 1.25rem}",
  ".text-page .role p{margin:0}",
  ".text-page .role-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0 1rem}",
  ".text-page .role-title{color:var(--pf-text)}",
  ".text-page .role-employer{margin-bottom:.5rem;color:var(--pf-muted)}",
  ".text-page .role ul{list-style:disc;padding-left:1.25rem}",
  ".text-page .role li{margin:0 0 .35rem;padding-left:.25rem}",
  ".text-page .lines li{margin:0 0 .35rem}",
  ".text-page .label{color:var(--pf-text);font-weight:700}",
  ".text-page .earlier{margin:0}",
  ".text-page footer{margin-top:2.5rem;border-top:1px solid var(--pf-border);padding-top:1rem;font-size:.875rem;color:var(--pf-muted)}",
  ".text-page footer p{margin:0 0 .25rem}"
].join("");

/**
 * The earlier roles line. Each separator stays with the entry after it, joined by a no break
 * space, so a wrapped line never ends on the dot.
 */
function earlierRolesHtml(earlier) {
  const entries = String(earlier.text).split(" · ");
  const body = entries
    .map((entry, index) => (index > 0 ? "·&nbsp;" : "") + escapeHtml(entry))
    .join(" ");
  return `<p class="earlier"><span class="label">${escapeHtml(earlier.label)}:</span> ${body}</p>`;
}

/** The body sections of one resume, in the order the view model gives them. */
function sectionsHtml(model) {
  const parts = [];
  if (model.header && model.header.careerObjective) {
    parts.push(
      `<h2>Summary</h2><p>${escapeHtml(model.header.careerObjective)}</p>`
    );
  }
  model.sections.forEach((entry) => {
    parts.push(`<h2>${escapeHtml(entry.title)}</h2>`);
    if (entry.isExperience) {
      const roles = model.employers.flatMap((group) => group.roles);
      roles.forEach((role) => {
        const bullets = role.highlights.length
          ? list(role.highlights.map((highlight) => escapeHtml(highlight.text)))
          : "";
        const employer = role.employerText
          ? `<p class="role-employer">${escapeHtml(role.employerText)}</p>`
          : "";
        parts.push(
          `<div class="role"><p class="role-head"><strong class="role-title">${escapeHtml(role.title)}</strong>` +
            `<span class="role-dates">${escapeHtml(role.datesText)}</span></p>${employer}${bullets}</div>`
        );
      });
      if (model.earlierRoles) parts.push(earlierRolesHtml(model.earlierRoles));
    } else if (entry.isSkills) {
      parts.push(
        list(
          model.skillGroups.map((group) =>
            group.category
              ? `<span class="label">${escapeHtml(group.category)}:</span> ${escapeHtml(group.skillsText)}`
              : escapeHtml(group.skillsText)
          ),
          "plain lines"
        )
      );
    } else if (entry.isCertifications) {
      parts.push(
        list(
          model.certificationGroups.map((group) => {
            const names = group.certifications
              .map((cert) => escapeHtml(cert.text))
              .join(", ");
            return group.hasIssuer
              ? `<span class="label">${escapeHtml(group.issuer)}:</span> ${names}`
              : names;
          }),
          "plain lines"
        )
      );
      if (model.hasVerificationLink) {
        parts.push(
          `<p><a href="${escapeHtml(model.verificationUrl)}">${escapeHtml(model.verifyLabel)}</a></p>`
        );
      }
      if (model.hasRetiredCertifications) {
        parts.push(`<h3>${escapeHtml(model.retiredLabel)}</h3>`);
        parts.push(
          list(
            model.retiredCertifications.map((cert) => escapeHtml(cert.text)),
            "plain lines"
          )
        );
      }
    } else if (entry.isEducation) {
      parts.push(
        list(
          model.education.map((credential) => escapeHtml(credential.text)),
          "plain lines"
        )
      );
    }
  });
  return parts.join("\n");
}

/**
 * One text page.
 * @param {object} input route (from textRoutes), model (the view model), head (the shared head
 *   tags), styles (the stylesheet address). The site's own routes are not listed: the header
 *   carries Home, Resume and the other focuses only.
 */
export function textPageHtml({ route, model, head = [], styles }) {
  const name = (model.header && model.header.name) || "Resume";
  const title = `${name} resume, ${route.label}, text version`;
  const description = `The text version of the resume for the ${route.label} focus, as plain HTML for screen readers and text readers.`;
  const others = textRoutes()
    .filter((entry) => entry.focus !== route.focus)
    .map(
      (entry) =>
        `<li><a href="${entry.path}">${escapeHtml(entry.label)}</a></li>`
    )
    .join("");
  const contact =
    model.header && model.header.links.length
      ? list(
          model.header.links.map(
            (link) =>
              `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`
          ),
          "plain contact"
        )
      : "";
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    '<meta name="robots" content="noindex">',
    `<link rel="canonical" href="${SITE_ORIGIN}/resume">`,
    ...head,
    `<link rel="stylesheet" href="${styles}">`,
    `<style>${TEXT_PAGE_CSS}</style>`,
    "</head>",
    "<body>",
    '<div class="text-page">',
    '<a class="skip" href="#resume-text">Skip to the resume</a>',
    `<header><nav aria-label="Pages"><ul class="plain bar"><li><a href="/">Home</a></li><li><a href="/resume">Resume</a></li>${others}</ul></nav></header>`,
    '<main id="resume-text">',
    `<h1>${escapeHtml(name)}</h1>`,
    model.header && model.header.title
      ? `<p class="headline">${escapeHtml(model.header.title)}</p>`
      : "",
    `<p class="note">Text version of the resume, ${escapeHtml(route.label)} focus.</p>`,
    contact,
    sectionsHtml(model),
    "</main>",
    `<footer><p>${escapeHtml(name)}</p><p><a href="/resume">Back to the resume page</a> · <a href="/">Home</a></p></footer>`,
    "</div>",
    "</body>",
    "</html>",
    ""
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Writes the three pages under distDir. A focus whose read is missing is a build failure, since
 * the resume page links to every one of them.
 * @returns {Promise<string[]>} the files written, relative to distDir
 */
export async function writeTextPages({ distDir, reads, head, styles }) {
  const { format } = await loadShipped();
  const written = [];
  textRoutes().forEach((route) => {
    const resume = reads[readKey(route.focus)];
    if (!resume)
      throw new Error(
        `The reads have no getResume for ${route.focus}, so its text page cannot be built.`
      );
    const model = format.buildViewModel(resume, PAGE_OPTIONS);
    const html = textPageHtml({ route, model, head, styles });
    const file = path.join(distDir, route.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    written.push(route.file);
  });
  return written;
}

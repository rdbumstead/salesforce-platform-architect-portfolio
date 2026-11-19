/**
 * The text version of the resume: one plain HTML page per public focus, written at build time
 * from the same getResume reads the resume page uses, through the same view model as the PDF
 * and the ATS text. It carries no script. Each page is kept out of search (noindex), left out
 * of the sitemap and points its canonical address at the resume page, so the resume page stays
 * the one the search engines list. The resume page links to it as the accessible copy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SITE_ORIGIN } from './routes.mjs';
import { orderedRoutes, linkLabel } from './static-summary.mjs';
import { loadShipped, PAGE_OPTIONS, PUBLIC_FOCUSES } from './resume-pdf-check.mjs';

/** The visitor label of each focus. A test keeps these equal to the resume page's options. */
export const FOCUS_LABELS = Object.freeze({
  Engineer: 'Salesforce Engineer',
  Architect: 'Platform Architect',
  Consultant: 'Solution Consultant'
});

export const TEXT_ROOT = '/resume/text';

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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const list = (items, className) =>
  `<ul${className ? ` class="${className}"` : ''}>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;

/** The page's own rules, on top of the site stylesheet. Nothing here needs a script. */
const TEXT_PAGE_CSS =
  'body{margin:0}.text-page{max-width:48rem;margin:0 auto;padding:1rem}' +
  '.text-page ul{padding-left:1.25rem}.text-page .plain{list-style:none;padding-left:0}' +
  '.text-page .role{margin-bottom:1rem}.text-page .role p{margin:0}' +
  '.text-page .skip{position:absolute;left:-999px}.text-page .skip:focus{position:static}';

/** The body sections of one resume, in the order of the PDF. Experience roles are two lines. */
function sectionsHtml(model) {
  const parts = [];
  if (model.header && model.header.careerObjective) {
    parts.push(`<h2>Summary</h2><p>${escapeHtml(model.header.careerObjective)}</p>`);
  }
  model.sections.forEach((entry) => {
    parts.push(`<h2>${escapeHtml(entry.title)}</h2>`);
    if (entry.isExperience) {
      const roles = model.employers.flatMap((group) => group.roles);
      parts.push(
        list(
          roles.map((role) => {
            const bullets = role.highlights.length
              ? list(role.highlights.map((highlight) => escapeHtml(highlight.text)))
              : '';
            const employer = role.employerText ? `<p>${escapeHtml(role.employerText)}</p>` : '';
            return (
              `<div class="role"><p><strong>${escapeHtml(role.title)}</strong>` +
              `, <span>${escapeHtml(role.datesText)}</span></p>${employer}${bullets}</div>`
            );
          }),
          'plain'
        )
      );
      if (model.earlierRoles) {
        parts.push(`<p><strong>${escapeHtml(model.earlierRoles.label)}:</strong> ${escapeHtml(model.earlierRoles.text)}</p>`);
      }
    } else if (entry.isSkills) {
      parts.push(
        list(
          model.skillGroups.map((group) =>
            group.category
              ? `<strong>${escapeHtml(group.category)}:</strong> ${escapeHtml(group.skillsText)}`
              : escapeHtml(group.skillsText)
          ),
          'plain'
        )
      );
    } else if (entry.isCertifications) {
      parts.push(list(model.currentCertifications.map((cert) => escapeHtml(cert.text)), 'plain'));
      if (model.hasVerificationLink) {
        parts.push(`<p><a href="${escapeHtml(model.verificationUrl)}">${escapeHtml(model.verifyLabel)}</a></p>`);
      }
      if (model.hasRetiredCertifications) {
        parts.push(`<h3>${escapeHtml(model.retiredLabel)}</h3>`);
        parts.push(list(model.retiredCertifications.map((cert) => escapeHtml(cert.text)), 'plain'));
      }
    } else if (entry.isEducation) {
      parts.push(list(model.education.map((credential) => escapeHtml(credential.text)), 'plain'));
    }
  });
  return parts.join('\n');
}

/**
 * One text page.
 * @param {object} input route (from textRoutes), model (the view model), routes (the site's
 *   routes, for the page links), head (the shared head tags), styles (the stylesheet address)
 */
export function textPageHtml({ route, model, routes, head = [], styles }) {
  const name = (model.header && model.header.name) || 'Resume';
  const title = `${name} resume, ${route.label}, text version`;
  const description = `The text version of the resume for the ${route.label} focus, as plain HTML for screen readers and text readers.`;
  const links = orderedRoutes(routes)
    .map((entry) => `<li><a href="${escapeHtml(entry.path)}">${escapeHtml(linkLabel(entry))}</a></li>`)
    .join('');
  const others = textRoutes()
    .filter((entry) => entry.focus !== route.focus)
    .map((entry) => `<li><a href="${entry.path}">${escapeHtml(entry.label)}</a></li>`)
    .join('');
  const contact =
    model.header && model.header.links.length
      ? list(
          model.header.links.map(
            (link) => `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`
          ),
          'plain'
        )
      : '';
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    '<meta name="robots" content="noindex">',
    `<link rel="canonical" href="${SITE_ORIGIN}/resume">`,
    ...head,
    `<style>${TEXT_PAGE_CSS}</style>`,
    `<link rel="stylesheet" href="${styles}">`,
    '</head>',
    '<body>',
    '<div class="text-page">',
    '<a class="skip" href="#resume-text">Skip to the resume</a>',
    `<header><nav aria-label="Pages"><ul class="plain">${links}</ul></nav></header>`,
    '<main id="resume-text">',
    `<h1>${escapeHtml(name)}</h1>`,
    `<p>Text version of the resume, ${escapeHtml(route.label)} focus.</p>`,
    model.header && model.header.title ? `<p>${escapeHtml(model.header.title)}</p>` : '',
    contact,
    sectionsHtml(model),
    '</main>',
    `<nav aria-label="Other focuses"><p>Other focuses</p><ul class="plain">${others}</ul><p><a href="/resume">Back to the resume page</a></p></nav>`,
    `<footer><p>${escapeHtml(name)}</p></footer>`,
    '</div>',
    '</body>',
    '</html>',
    ''
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Writes the three pages under distDir. A focus whose read is missing is a build failure, since
 * the resume page links to every one of them.
 * @returns {Promise<string[]>} the files written, relative to distDir
 */
export async function writeTextPages({ distDir, reads, routes, head, styles }) {
  const { format } = await loadShipped();
  const written = [];
  textRoutes().forEach((route) => {
    const resume = reads[readKey(route.focus)];
    if (!resume) throw new Error(`The reads have no getResume for ${route.focus}, so its text page cannot be built.`);
    const model = format.buildViewModel(resume, PAGE_OPTIONS);
    const html = textPageHtml({ route, model, routes, head, styles });
    const file = path.join(distDir, route.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    written.push(route.file);
  });
  return written;
}

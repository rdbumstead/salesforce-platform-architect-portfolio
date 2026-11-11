/**
 * The text a page holds before any script runs, for readers that do not run JavaScript:
 * search crawlers, answer engines and text extractors. It is one block inside `site-root`,
 * and `mount()` replaces everything in `site-root`, so a browser that runs scripts never
 * keeps it. A stylesheet rule hides it for those browsers, so it is never painted.
 *
 * The block carries only what the site already says in public: the name and headline from
 * the Person block, the route's own title and description, plain links to every route, and
 * the profile links. It never names an institution.
 */
/**
 * The two line summary on the home page. This is visitor copy and it is a DRAFT until the
 * owner approves the exact text. Swap the approved text in here, in this one place. The
 * summary block and llms.txt both read it.
 */
export const HOME_SUMMARY = [
  'Ryan Bumstead is a Salesforce Platform Architect who designs and delivers Education Cloud for universities and nonprofits.',
  'This site is the working proof, with case studies, a resume, live API and AI labs and the architecture documents, all running on Salesforce.'
];

export const SUMMARY_ID = 'static-summary';

/**
 * Hides the block for browsers that run scripts. A text extractor ignores the rule and reads
 * the block. A browser too old to know the feature shows the block until the page mounts.
 */
export function summaryCss() {
  return `#${SUMMARY_ID}{max-width:48rem;margin:0 auto;padding:1rem}@media (scripting: enabled){#${SUMMARY_ID}{display:none}}`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Public routes that must carry a description. The error pages have none and need none. */
export function publicRoutes(routes) {
  return routes.filter((route) => route.path);
}

/** Fails the build when a public route has no description, instead of printing an empty line. */
export function assertDescriptions(routes) {
  const missing = publicRoutes(routes).filter((route) => !String(route.description || '').trim());
  if (missing.length) {
    throw new Error(`These routes have no description, so the static summary and llms.txt cannot be built: ${missing.map((route) => route.path).join(', ')}`);
  }
}

/** A short name for a route in a link: the title without the site suffix. */
export function linkLabel(route) {
  if (route.path === '/') return 'Home';
  return String(route.title || route.path).split(' | ')[0].trim();
}

/** The routes in link order: the home page, the resume and the contact page, then the rest. */
export function orderedRoutes(routes) {
  const first = ['/', '/resume', '/contact'];
  const pages = publicRoutes(routes);
  const lead = first.map((path) => pages.find((route) => route.path === path)).filter(Boolean);
  return [...lead, ...pages.filter((route) => !first.includes(route.path))];
}

/** A readable name for a profile link. */
export function profileLabel(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host.endsWith('linkedin.com')) return 'LinkedIn';
  if (host.endsWith('github.com')) return 'GitHub';
  if (host.endsWith('salesforce.com') || host.endsWith('trailhead.com')) return 'Trailhead';
  return host;
}

/**
 * The summary block for one route.
 * @param {object} input route, routes (all of them), person (the Person object the page carries)
 */
export function summaryBlock({ route, routes, person }) {
  const links = orderedRoutes(routes)
    .map((entry) => `<li><a href="${escapeHtml(entry.path)}">${escapeHtml(linkLabel(entry))}</a></li>`)
    .join('');
  const profiles = (person.sameAs || [])
    .map((url) => `<li><a href="${escapeHtml(url)}">${escapeHtml(profileLabel(url))}</a></li>`)
    .join('');
  const parts = [
    `<div id="${SUMMARY_ID}">`,
    `<p><strong>${escapeHtml(person.name)}</strong></p>`,
    `<p>${escapeHtml(person.description)}</p>`,
    `<h1>${escapeHtml(route.title)}</h1>`,
    `<p>${escapeHtml(route.description)}</p>`
  ];
  if (route.path === '/') HOME_SUMMARY.forEach((line) => parts.push(`<p>${escapeHtml(line)}</p>`));
  parts.push(`<nav aria-label="Pages"><ul>${links}</ul></nav>`);
  if (profiles) parts.push(`<nav aria-label="Profiles"><ul>${profiles}</ul></nav>`);
  parts.push('</div>');
  return parts.join('\n');
}

/** Topics the site shows evidence for. Nothing else goes in knowsAbout. */
export const KNOWS_ABOUT = [
  'Salesforce Education Cloud',
  'Experience Cloud',
  'Salesforce architecture',
  'Integration and API design',
  'Agentforce'
];

const HTTP_URL = /^https?:\/\//i;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The Person block the static pages carry, built from the Salesforce site's own block and the
 * exported data, so it stays current as certifications change. It adds knowsAbout, the Trailhead
 * profile, one credential per current certification (the read sends current ones only) and the
 * school the education record names. The job title is the Salesforce block's, unchanged. The
 * Salesforce site's head markup is never touched, only this copy.
 * @param {object} base the Person object from the site's head markup
 * @param {object} reads every exported read, by key
 * @returns {object} the Person object
 */
export function buildPerson(base, reads = {}) {
  const timeline = reads['ResumeController.getTimeline'] || {};
  const header = reads['ResumeController.getHeader'] || {};
  const person = { ...base, knowsAbout: [...KNOWS_ABOUT] };
  const profile = text(header.trailheadUrl);
  const sameAs = [...(base.sameAs || [])];
  if (HTTP_URL.test(profile) && !sameAs.includes(profile)) sameAs.push(profile);
  person.sameAs = sameAs;
  const credentials = (Array.isArray(timeline.certifications) ? timeline.certifications : [])
    .filter((item) => item && text(item.name))
    .map((item) => {
      const credential = { '@type': 'EducationalOccupationalCredential', name: text(item.name), credentialCategory: 'certification' };
      if (text(item.issuer)) credential.recognizedBy = { '@type': 'Organization', name: text(item.issuer) };
      if (/^\d{4}-\d{2}-\d{2}/.test(text(item.earnedDate))) credential.dateCreated = text(item.earnedDate).slice(0, 10);
      return credential;
    });
  if (credentials.length) person.hasCredential = credentials;
  const school = text(Array.isArray(timeline.education) && timeline.education[0] ? timeline.education[0].school : '');
  if (school) person.alumniOf = { '@type': 'EducationalOrganization', name: school };
  return person;
}

/**
 * The llms.txt file: the name, the home summary and a link with its description for every
 * route, the resume first. It is built from the same route list as the sitemap, so it never
 * goes stale, and it names no institution.
 * @param {object} input routes, person (the Person object the pages carry), origin
 */
export function llmsTxt({ routes, person, origin }) {
  const pages = orderedRoutes(routes);
  const ordered = [...pages.filter((route) => route.path === '/resume'), ...pages.filter((route) => route.path !== '/resume')];
  const url = (route) => `${origin}${route.path === '/' ? '/' : route.path}`;
  const clean = (value) => String(value).replace(/\s+/g, ' ').trim();
  const lines = [
    `# ${clean(person.name)}`,
    '',
    `> ${clean(person.description)}. ${HOME_SUMMARY.map(clean).join(' ')}`,
    '',
    '## Pages',
    '',
    ...ordered.map((route) => `- [${clean(linkLabel(route))}](${url(route)}): ${clean(route.description)}`)
  ];
  const profiles = person.sameAs || [];
  if (profiles.length) {
    lines.push('', '## Profiles', '', ...profiles.map((profile) => `- [${profileLabel(profile)}](${profile})`));
  }
  return `${lines.join('\n')}\n`;
}

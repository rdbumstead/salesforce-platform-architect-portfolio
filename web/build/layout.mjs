/**
 * The page layout the Salesforce site gets from its section components and its branding
 * set, written as CSS for the static pages.
 *
 * On Salesforce each view sits in a community_layout section. The section adds the page
 * gutter, the column caps the content width, and every component gets a gap under it. The
 * static build drops those components and builds the same boxes itself in mount.js, so this
 * file holds the CSS those boxes need. Values the repo keeps in the branding set are read
 * from it. The section padding is not in the repo, so it is written down here from the
 * served branding style of the live site.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(here, '..');
const SITE_DIR = path.join(
  WEB_DIR,
  '../packages/portfolio-site/main/default/digitalExperiences/site/Portfolio1'
);

/** The one hand written sheet of SLDS and element rules the components rely on. */
export const SLDS_TRIM_FILE = path.join(WEB_DIR, 'src/styles/slds-trim.css');

/** Branding set keys and the dxp hook each one sets on the live site. */
export const BRANDING_HOOKS = {
  ComponentSpacerSizeDesktop: '--dxp-s-component-wrapper-spacer-size',
  ComponentSpacerSizeMobile: '--dxp-s-component-wrapper-spacer-size-mobile',
  MaxContentWidthDesktop: '--dxp-s-section-columns-max-width',
  MaxContentWidthMobile: '--dxp-s-section-columns-max-width-mobile',
  ColumnSpacerSizeDesktop: '--dxp-s-column-spacer-size',
  ColumnSpacerSizeMobile: '--dxp-s-column-spacer-size-mobile',
  BaseFontSize: '--dxp-s-html-font-size',
  BodyFontSize: '--dxp-s-body-font-size',
  BodyLineHeight: '--dxp-s-body-line-height',
  LinkTextDecoration: '--dxp-s-link-text-decoration',
  LinkTextDecorationHover: '--dxp-s-link-text-decoration-hover',
  LinkTextDecorationFocus: '--dxp-s-link-text-decoration-focus'
};

/**
 * Section padding. The live site's served branding style sets 1rem for a section on a wide
 * screen. At 64em and below the sides stay at 1rem, so page content, the brand and the footer
 * share one 16 px line, and the top and bottom drop to 0.75rem. The branding set holds the side
 * value as HorizontalRowPaddingMobile, so change the two together.
 */
export const SECTION_SPACING = {
  '--dxp-s-section-content-spacing-block-start': '1rem',
  '--dxp-s-section-content-spacing-inline-end': '1rem',
  '--dxp-s-section-content-spacing-block-end': '1rem',
  '--dxp-s-section-content-spacing-inline-start': '1rem',
  '--dxp-s-section-content-spacing-block-start-mobile': '0.75rem',
  '--dxp-s-section-content-spacing-inline-end-mobile': '1rem',
  '--dxp-s-section-content-spacing-block-end-mobile': '0.75rem',
  '--dxp-s-section-content-spacing-inline-start-mobile': '1rem'
};

/** The branding set's values. */
export function readBranding(siteDir = SITE_DIR) {
  const folder = path.join(siteDir, 'sfdc_cms__brandingSet');
  const [name] = fs.readdirSync(folder).filter((entry) => fs.statSync(path.join(folder, entry)).isDirectory());
  const file = path.join(folder, name, 'content.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')).contentBody.values;
}

/** :root rules that set the hooks the layout and the adopted sheet read. */
export function rootHooksCss(values = readBranding()) {
  const lines = Object.entries(BRANDING_HOOKS).map(([key, hook]) => {
    if (typeof values[key] !== 'string') {
      throw new Error(`The branding set has no ${key}, and the layout needs it`);
    }
    return `  ${hook}: ${values[key]};`;
  });
  Object.entries(SECTION_SPACING).forEach(([hook, value]) => lines.push(`  ${hook}: ${value};`));
  return `:root {\n${lines.join('\n')}\n}\n`;
}

/**
 * The boxes mount.js builds around each view: a section, its columns, and the gap under
 * each placed component except the last in a column. Class names match the live site's.
 */
export function sectionCss() {
  return `
.comm-section-container {
  display: block;
  padding: var(--dxp-s-section-content-spacing-block-start) var(--dxp-s-section-content-spacing-inline-end)
    var(--dxp-s-section-content-spacing-block-end) var(--dxp-s-section-content-spacing-inline-start);
}

.columns-content {
  display: flex;
  position: relative;
  margin-left: auto;
  margin-right: auto;
  flex-direction: row;
  max-width: var(--dxp-s-section-columns-max-width);
  column-gap: var(--dxp-s-column-spacer-size);
}

.comm-column {
  display: flex;
  min-width: 0;
}

.column-content {
  display: flex;
  flex-direction: column;
  flex: 1 1 0%;
  min-width: 0;
}

.component-wrapper-spacer {
  margin-bottom: var(--dxp-s-component-wrapper-spacer-size);
}

@media (max-width: 64em) {
  .comm-section-container {
    padding: var(--dxp-s-section-content-spacing-block-start-mobile) var(--dxp-s-section-content-spacing-inline-end-mobile)
      var(--dxp-s-section-content-spacing-block-end-mobile) var(--dxp-s-section-content-spacing-inline-start-mobile);
  }

  .columns-content {
    flex-direction: column;
    max-width: var(--dxp-s-section-columns-max-width-mobile);
    row-gap: var(--dxp-s-column-spacer-size-mobile);
  }

  .comm-column {
    width: 100%;
  }

  .component-wrapper-spacer {
    margin-bottom: var(--dxp-s-component-wrapper-spacer-size-mobile);
  }
}
`;
}

/** Page level type, which the live site's body rule sets from the branding set. */
export function globalCss() {
  return `
html {
  font-size: var(--dxp-s-html-font-size);
  line-height: 1.5;
}

body {
  font-size: var(--dxp-s-body-font-size);
  line-height: var(--dxp-s-body-line-height);
}
`;
}

/** The SLDS and element rules, as one string. */
export function adoptedCss(file = SLDS_TRIM_FILE) {
  return fs.readFileSync(file, 'utf8');
}

/**
 * Everything the page stylesheet gets ahead of the site's own styles.css, which comes after
 * so that it wins where both set the same thing, as it does on the live site.
 */
export function pageLayoutCss(values = readBranding()) {
  return [rootHooksCss(values), adoptedCss(), sectionCss(), globalCss()].join('\n');
}

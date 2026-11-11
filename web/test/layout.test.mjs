import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readRoutes, sectionOf } from '../build/routes.mjs';
import { entrySource } from '../build/bundle.mjs';
import { pageStylesheet } from '../build/pages.mjs';
import { LWC_DIR, SHIM_DIR } from '../build/site-plugin.mjs';
import {
  adoptedCss,
  BRANDING_HOOKS,
  pageLayoutCss,
  readBranding,
  rootHooksCss,
  sectionCss,
  SECTION_SPACING
} from '../build/layout.mjs';
import { buildSections, lastInColumn } from '../src/shims/sections.js';
import { installShadowStyles, isComponentHost } from '../src/shims/shadow-styles.js';

test('every public view is one section with one full width column, and every component sits in it', () => {
  const { routes } = readRoutes();
  routes.forEach((route) => {
    assert.equal(route.sections.length, 1, `${route.routeName} has one section`);
    assert.deepEqual(route.sections[0].columns, [{ key: 'col1', size: 12 }], `${route.routeName} column`);
    assert.ok(route.components.length > 0, `${route.routeName} places components`);
    route.components.forEach((component) => {
      assert.equal(component.section, 0);
      assert.equal(component.column, 'col1');
    });
    if (route.path) assert.equal(route.trailingSpacer, true, `${route.routeName} keeps the hidden region wrapper`);
  });
});

test('a section reads its columns from its config and survives a config it cannot read', () => {
  const config = JSON.stringify({
    columns: [
      { columnKey: 'left', columnWidth: '4' },
      { columnKey: 'right', columnWidth: '8' }
    ]
  });
  assert.deepEqual(sectionOf({ sectionConfig: config, sectionVerticalAlign: 'center' }).columns, [
    { key: 'left', size: 4 },
    { key: 'right', size: 8 }
  ]);
  assert.equal(sectionOf({ sectionConfig: config, sectionVerticalAlign: 'center' }).verticalAlign, 'center');
  assert.deepEqual(sectionOf({ sectionConfig: '{not json' }).columns, []);
  assert.deepEqual(sectionOf().columns, []);
});

test('the entry loads the shadow style adoption before anything else and hands the sections to mount', () => {
  const source = entrySource({
    key: 'x',
    layout: 'portfolio',
    sections: [{ columns: [{ key: 'col1', size: 12 }] }],
    trailingSpacer: true,
    components: [
      { name: 'pageIntro', props: {}, section: 0, column: 'col1' },
      { html: '<p>r</p>', section: 0, column: 'col1' },
      { name: 'resumeBuilder', props: {}, section: 0, column: 'col1' }
    ]
  });
  const imports = source.split('\n').filter((line) => line.startsWith('import'));
  assert.ok(imports[0].includes('shadow-styles-boot.js'), 'adoption is the first import');
  assert.ok(imports[1].includes('mount.js'));
  assert.ok(source.includes('section: 0, column: "col1"'));
  assert.ok(source.includes('trailingSpacer: true'));
  assert.ok(source.includes('sections: JSON.parse('));
});

test('the section boxes nest as section, row, column, column body and keep the body by key', () => {
  const made = [];
  const doc = {
    createElement(tag) {
      const element = {
        tag,
        children: [],
        style: {},
        appendChild(child) {
          this.children.push(child);
        }
      };
      made.push(element);
      return element;
    }
  };
  const { nodes, bodies } = buildSections(
    [{ columns: [{ key: 'a', size: 3 }, { key: 'b', size: 9 }] }, { columns: [{ key: 'col1', size: 12 }] }],
    doc
  );
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].className, 'comm-section-container');
  const row = nodes[0].children[0];
  assert.equal(row.className, 'columns-content');
  assert.deepEqual(row.children.map((column) => column.className), ['comm-column', 'comm-column']);
  assert.equal(row.children[0].style.flex, '0 0 25%');
  assert.equal(row.children[1].style.flex, '0 0 75%');
  assert.equal(bodies.get('0:b'), row.children[1].children[0]);
  assert.equal(bodies.get('0:b').className, 'column-content');
  assert.ok(bodies.has('1:col1'));
  assert.equal(bodies.get('0:zzz'), undefined);
  assert.deepEqual(buildSections(undefined, doc).nodes, []);
});

test('the layout hooks come from the branding set and a missing key stops the build', () => {
  const values = readBranding();
  const css = rootHooksCss(values);
  assert.match(css, /--dxp-s-component-wrapper-spacer-size: 1\.5rem;/);
  assert.match(css, /--dxp-s-section-columns-max-width: 1280px;/);
  assert.match(css, /--dxp-s-section-columns-max-width-mobile: none;/);
  assert.match(css, /--dxp-s-body-line-height: 1\.65;/);
  assert.match(css, /--dxp-s-link-text-decoration: none;/);
  assert.match(css, /--dxp-s-section-content-spacing-inline-start: 1rem;/);
  assert.match(css, /--dxp-s-section-content-spacing-inline-start-mobile: 1rem;/);
  assert.equal(Object.keys(SECTION_SPACING).length, 8);
  const missing = { ...values };
  delete missing.ComponentSpacerSizeDesktop;
  assert.throws(() => rootHooksCss(missing), /ComponentSpacerSizeDesktop/);
  assert.ok(Object.keys(BRANDING_HOOKS).every((key) => typeof values[key] === 'string'));
});

test('the section css gives the gutter, the width cap and the gap, and changes at 64em', () => {
  const css = sectionCss();
  assert.match(css, /\.comm-section-container \{[^}]*padding: var\(--dxp-s-section-content-spacing-block-start\)/);
  assert.match(css, /\.component-wrapper-spacer \{\s*margin-bottom: var\(--dxp-s-component-wrapper-spacer-size\);/);
  assert.ok(!css.includes('.column-content > *'), 'the gap is a class, so the last component can go without');
  assert.match(css, /@media \(max-width: 64em\)/);
  assert.match(css, /max-width: var\(--dxp-s-section-columns-max-width-mobile\)/);
});

test('every slds class the component templates use is defined in the adopted sheet', () => {
  const sheet = adoptedCss();
  const used = new Set();
  fs.readdirSync(LWC_DIR).forEach((name) => {
    const dir = path.join(LWC_DIR, name);
    if (!fs.statSync(dir).isDirectory()) return;
    fs.readdirSync(dir).forEach((file) => {
      if (!/\.(html|js)$/.test(file)) return;
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const match of text.matchAll(/\bslds-[a-z0-9_-]+/g)) used.add(match[0]);
    });
  });
  assert.ok(used.size > 20, 'the search found the classes');
  const missing = [...used].filter((name) => !new RegExp('\\.' + name + '(?![\\w-])').test(sheet));
  assert.deepEqual(missing, []);
});

test('the page stylesheet puts the layout and slds rules ahead of the site stylesheet', () => {
  const css = pageStylesheet();
  const layoutAt = css.indexOf('.comm-section-container');
  const sldsAt = css.indexOf('.slds-assistive-text');
  const siteAt = css.indexOf('--pf-bg');
  assert.ok(layoutAt > -1 && sldsAt > -1 && siteAt > -1);
  assert.ok(layoutAt < siteAt && sldsAt < siteAt);
  assert.ok(css.startsWith(pageLayoutCss().slice(0, 40)));
  assert.match(css, /box-sizing: border-box/);
});

/** A prototype and a sheet class just real enough for the install. */
function fakeShadowParts() {
  const attached = [];
  class FakeSheet {
    replaceSync(text) {
      this.text = text;
    }
  }
  const prototype = {
    attachShadow() {
      const root = { adoptedStyleSheets: ['engine'] };
      attached.push({ host: this, root });
      return root;
    }
  };
  return { prototype, FakeSheet, attached };
}

test('a component root gets the sheet first, ahead of what the engine adds', () => {
  const { prototype, FakeSheet, attached } = fakeShadowParts();
  assert.equal(installShadowStyles(prototype, '.x{}', FakeSheet), true);
  const host = Object.create(prototype);
  host.localName = 'c-footer';
  const root = host.attachShadow({ mode: 'open' });
  assert.equal(root.adoptedStyleSheets.length, 2);
  assert.equal(root.adoptedStyleSheets[0].text, '.x{}');
  assert.equal(root.adoptedStyleSheets[1], 'engine');
  assert.equal(attached.length, 1);
  const base = Object.create(prototype);
  base.localName = 'lightning-card';
  assert.equal(base.attachShadow({ mode: 'open' }).adoptedStyleSheets.length, 2);
});

test('a root made by anything else is left alone, and the install happens once', () => {
  const { prototype, FakeSheet } = fakeShadowParts();
  installShadowStyles(prototype, '.x{}', FakeSheet);
  assert.equal(installShadowStyles(prototype, '.x{}', FakeSheet), false, 'second call does nothing');
  const widget = Object.create(prototype);
  widget.localName = 'cf-turnstile-widget';
  assert.deepEqual(widget.attachShadow({ mode: 'open' }).adoptedStyleSheets, ['engine']);
  assert.equal(isComponentHost({ localName: 'c-hero-banner' }), true);
  assert.equal(isComponentHost({ localName: 'lwc-graphql-probe' }), true);
  assert.equal(isComponentHost({ localName: 'div' }), false);
  assert.equal(isComponentHost(null), false);
});

test('a browser without constructable sheets keeps its own attachShadow', () => {
  const { prototype } = fakeShadowParts();
  const original = prototype.attachShadow;
  assert.equal(installShadowStyles(prototype, '.x{}', class {}), false);
  assert.equal(prototype.attachShadow, original);
  assert.equal(installShadowStyles(null, '.x{}'), false);
});

test('the boot module imports nothing from the engine so it runs before it', () => {
  const boot = fs.readFileSync(path.join(SHIM_DIR, 'shadow-styles-boot.js'), 'utf8');
  const imports = [...boot.matchAll(/^import .* from "([^"]+)"/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ['site:adopted-styles', './shadow-styles.js']);
});

test('every component but the last in its column gets the gap class', () => {
  const a = { section: 0, column: 'a' };
  const b = { section: 0, column: 'a' };
  const c = { section: 0, column: 'b' };
  const d = { section: 1, column: 'a' };
  const loose = { section: null, column: '' };
  const last = lastInColumn([a, b, c, d, loose]);
  assert.deepEqual([...last], [b, c, d]);
  assert.equal(last.has(a), false);
  assert.equal(last.has(loose), false);
  assert.equal(lastInColumn([]).size, 0);
});

test('the side gutter below 64em is 16 px on both hosts and the footer sits straight in its region', () => {
  const values = readBranding();
  assert.equal(values.HorizontalRowPaddingMobile, '1rem');
  assert.equal(SECTION_SPACING['--dxp-s-section-content-spacing-inline-start-mobile'], values.HorizontalRowPaddingMobile);
  assert.equal(SECTION_SPACING['--dxp-s-section-content-spacing-inline-end-mobile'], values.HorizontalRowPaddingMobile);
  const layoutFile = path.join(
    LWC_DIR,
    '../digitalExperiences/site/Portfolio1/sfdc_cms__themeLayout/portfolioThemeLayout/content.json'
  );
  const layout = JSON.parse(fs.readFileSync(layoutFile, 'utf8')).contentBody.component;
  const footerRegion = layout.children.find((child) => child.name === 'footer');
  assert.deepEqual(
    footerRegion.children.map((child) => [child.type, child.definition]),
    [['component', 'c:footer']],
    'no section wraps the footer, so its rule is full bleed'
  );
});

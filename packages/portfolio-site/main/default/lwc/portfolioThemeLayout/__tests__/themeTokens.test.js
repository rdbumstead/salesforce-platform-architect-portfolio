/**
 * @description       : Guards the type, radius and control height tokens. The site stylesheet
 *                      and the theme layout's mirror set the same names to the same values,
 *                      and both carry the house type scale the layout audit measured.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/15/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT = join(__dirname, "..", "..", "..");
const read = (rel) =>
  readFileSync(join(DEFAULT, rel), "utf8").replace(/\r\n/g, "\n");
const SITE = read(
  "digitalExperiences/site/Portfolio1/sfdc_cms__styles/styles_css/styles.css"
);
const LAYOUT = read("lwc/portfolioThemeLayout/portfolioThemeLayout.css");

// The light block of each file: the site's :root and the layout's :host.
function lightBlock(css, selector) {
  const start = css.indexOf(`\n${selector} {`);
  return css.slice(start, css.indexOf("\n}", start + 1));
}

function tokens(block, pattern) {
  const out = {};
  for (const [, name, value] of block.matchAll(
    /(--pf-[a-z0-9-]+):\s*([^;]+);/g
  )) {
    if (pattern.test(name)) out[name] = value.trim();
  }
  return out;
}

const SHARED =
  /^--pf-(font-(page|section|panel|card|body|lead|caption|meta)|weight-|line-|control-height|radius)/;

const HOUSE = {
  "--pf-radius-sm": "8px",
  "--pf-radius": "12px",
  "--pf-radius-lg": "16px",
  "--pf-radius-pill": "999px",
  "--pf-font-page": "40px",
  "--pf-font-page-sm": "32px",
  "--pf-weight-page": "600",
  "--pf-line-page": "1.15",
  "--pf-font-section": "32px",
  "--pf-font-section-sm": "26px",
  "--pf-weight-section": "700",
  "--pf-line-section": "1.2",
  "--pf-font-panel": "20px",
  "--pf-weight-panel": "700",
  "--pf-line-panel": "1.3",
  "--pf-font-card": "17px",
  "--pf-weight-card": "600",
  "--pf-line-card": "1.3",
  "--pf-font-body": "16px",
  "--pf-line-body": "1.6",
  "--pf-font-lead": "18px",
  "--pf-line-lead": "1.65",
  "--pf-font-caption": "14px",
  "--pf-font-meta": "12px",
  "--pf-control-height": "44px"
};

describe("type, radius and control height tokens", () => {
  const site = tokens(lightBlock(SITE, ":root"), SHARED);
  const layout = tokens(lightBlock(LAYOUT, ":host"), SHARED);

  it("sets the house values in the site stylesheet", () => {
    expect(site).toEqual(HOUSE);
  });

  it("mirrors the same names and values in the theme layout", () => {
    expect(layout).toEqual(site);
  });

  it("leaves them out of the dark blocks, because they do not change with the theme", () => {
    for (const css of [SITE, LAYOUT]) {
      const dark = css.slice(
        css.indexOf("@media (prefers-color-scheme: dark)")
      );
      expect(Object.keys(tokens(dark, SHARED))).toEqual([]);
    }
  });
});

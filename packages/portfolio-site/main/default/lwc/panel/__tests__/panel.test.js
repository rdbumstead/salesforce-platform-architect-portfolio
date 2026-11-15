/**
 * @description       : Guards the shared panel style. A panel fills with the surface colour,
 *                      has a 1 px border edge, the 12 px corner, 16 px of padding and no shadow.
 *                      The subtle fill is the one kept exception.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/15/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";

const CSS = readFileSync(join(__dirname, "..", "panel.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

describe("c/panel", () => {
  it("draws the panel box from the tokens with no shadow", () => {
    const panel = CSS.match(/\.pf-panel\s*\{([^}]*)\}/)[1];
    expect(panel).toMatch(/background-color: var\(--pf-surface\)/);
    expect(panel).toMatch(/border: 1px solid var\(--pf-border\)/);
    expect(panel).toMatch(/border-radius: var\(--pf-radius\)/);
    expect(panel).toMatch(/padding: var\(--pf-space-4\)/);
    expect(panel).toMatch(/box-shadow: none/);
  });

  it("has one modifier, the subtle fill", () => {
    const modifiers = [...CSS.matchAll(/\.pf-panel_([a-z-]+)/g)].map(
      (m) => m[1]
    );
    expect([...new Set(modifiers)]).toEqual(["subtle"]);
    expect(CSS).toMatch(
      /\.pf-panel\.pf-panel_subtle\s*\{[^}]*background-color: var\(--pf-subtle\)/
    );
  });

  it("uses a prefixed class, because several components have a panel class of their own", () => {
    expect(CSS).not.toMatch(/(^|[\s,}])\.panel\b/);
  });
});

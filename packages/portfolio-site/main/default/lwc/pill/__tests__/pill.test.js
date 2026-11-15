/**
 * @description       : Guards the shared pill style. c/pill is the one pill on the site, with
 *                      fully round ends so a tag never shares the 8 px corner of a control.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/15/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";

const LWC = join(__dirname, "..", "..");
const css = (name) => readFileSync(join(LWC, name, `${name}.css`), "utf8");

describe("c/pill", () => {
  it("has round ends, the chip colours and the 12 px meta size", () => {
    const pill = css("pill").match(/\.pill\s*\{([^}]*)\}/)[1];
    expect(pill).toMatch(/border-radius: var\(--pf-radius-pill, 999px\)/);
    expect(pill).toMatch(/background-color: var\(--pf-chip\)/);
    expect(pill).toMatch(/color: var\(--pf-chip-text\)/);
    expect(pill).toMatch(/font-size: var\(--pf-font-meta, 12px\)/);
    expect(pill).toMatch(/line-height: 1;/);
  });

  it.each(["changelog", "smartChecklist"])("%s imports it", (name) => {
    expect(css(name)).toContain('@import "c/pill";');
  });
});

/**
 * @description       : Guards the shared section heading style. Every home section that shows a
 *                      heading imports c/sectionHeading and keeps no rule of its own for the
 *                      heading or its row, so the headings cannot drift apart again.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/30/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";

const LWC = join(__dirname, "..", "..");
const USERS = [
  "caseStudyGrid",
  "careerLine",
  "credentialsBand",
  "siteBuildSection",
  "homeTestimonials"
];

function css(name) {
  return readFileSync(join(LWC, name, `${name}.css`), "utf8");
}

describe("c/sectionHeading", () => {
  it("sets the heading at 32px, 26px under 768px, with the focus styles and the heading row", () => {
    const shared = css("sectionHeading");
    expect(shared).toMatch(
      /\.section-heading \{[^}]*font-size: var\(--pf-font-section, 32px\)/
    );
    expect(shared).toMatch(
      /max-width: 767\.98px\) \{\s*\.section-heading \{\s*font-size: var\(--pf-font-section-sm, 26px\)/
    );
    expect(shared).toContain(".section-heading:focus-visible");
    expect(shared).toMatch(/\.heading-row \{[^}]*display: flex/);
  });

  it("has a panel size, 20px at every width, for a heading inside a panel", () => {
    const shared = css("sectionHeading");
    const panel = shared.match(
      /\.section-heading\.section-heading-panel \{([^}]*)\}/
    )[1];
    expect(panel).toMatch(/font-size: var\(--pf-font-panel, 20px\)/);
    expect(panel).toMatch(/font-weight: var\(--pf-weight-panel, 700\)/);
    // After the phone media query, so a later phone rule cannot win on order.
    expect(shared.indexOf(".section-heading-panel {")).toBeGreaterThan(
      shared.indexOf("max-width: 767.98px")
    );
  });

  it.each(USERS)(
    "%s imports it and keeps no heading rule of its own",
    (name) => {
      const own = css(name);
      expect(own).toContain('@import "c/sectionHeading";');
      expect(own).not.toMatch(/\.section-heading\s*\{/);
      expect(own).not.toMatch(/\.heading-row\s*\{[^}]*display:\s*flex/);
    }
  );
});

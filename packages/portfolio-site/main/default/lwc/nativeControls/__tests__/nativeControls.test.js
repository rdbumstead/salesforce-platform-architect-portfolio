/**
 * @description       : Guards the shared control styles in c/nativeControls. The field and
 *                      button rules keep the look they had before the toggles, tabs and the
 *                      quiet button joined them, and every new control meets 44 px, rings on
 *                      --pf-focus on keyboard focus only and has a disabled look.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 11/15/2026
 **/
import { readFileSync } from "fs";
import { join } from "path";

const CSS = readFileSync(join(__dirname, "..", "nativeControls.css"), "utf8")
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "");

// The body of the first rule whose selector list is exactly the one given.
function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = CSS.match(
    new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`)
  );
  if (!match) throw new Error(`no rule for ${selector}`);
  return match[1];
}

describe("c/nativeControls", () => {
  it("keeps nc-control, nc-button and nc-button_secondary as they were", () => {
    expect(rule(".nc-control")).toMatch(/min-height: 44px/);
    expect(rule(".nc-control")).toMatch(/border: 1px solid var\(--pf-muted\)/);
    expect(rule(".nc-control")).toMatch(/border-radius: var\(--pf-radius-sm\)/);
    expect(rule(".nc-button")).toMatch(/background-color: var\(--pf-btn\)/);
    expect(rule(".nc-button")).toMatch(/min-height: 44px/);
    expect(rule(".nc-button")).toMatch(/font-weight: 700/);
    expect(rule(".nc-button_secondary")).toMatch(
      /background-color: var\(--pf-surface\)/
    );
    expect(rule(".nc-button_secondary")).toMatch(
      /border-color: var\(--pf-muted\)/
    );
    expect(rule(".nc-button:hover:not(:disabled)")).toMatch(
      /var\(--pf-btn-hover\)/
    );
  });

  it("draws an unpressed toggle like a secondary button and a pressed one with the primary fill", () => {
    const toggle = rule(".nc-toggle");
    expect(toggle).toMatch(/background-color: var\(--pf-surface\)/);
    expect(toggle).toMatch(/border: 1px solid var\(--pf-muted\)/);
    expect(toggle).toMatch(/border-radius: var\(--pf-radius-sm\)/);
    expect(toggle).toMatch(/font-weight: 700/);
    const pressed = rule('.nc-toggle[aria-pressed="true"]');
    expect(pressed).toMatch(/background-color: var\(--pf-btn\)/);
    expect(pressed).toMatch(/color: var\(--pf-btn-text\)/);
  });

  it("keys the pressed look on aria-pressed and the selected tab on aria-selected, never a class", () => {
    expect(CSS).not.toMatch(/\.nc-toggle\.(is-on|on|active|selected)/);
    expect(CSS).not.toMatch(/\.nc-tab\.(is-on|on|active|selected)/);
    const selected = rule(
      '.nc-tab[aria-selected="true"],\n.nc-tab[aria-selected="true"]:hover:not(:disabled)'
    );
    expect(selected).toMatch(/background-color: var\(--pf-chip\)/);
    expect(selected).toMatch(/inset 0 -3px 0 var\(--pf-accent\)/);
  });

  it("draws the tray toggle group as the skills view switch does", () => {
    const tray = rule(".nc-toggle-group_tray");
    expect(tray).toMatch(/background-color: var\(--pf-subtle\)/);
    expect(tray).toMatch(/border: 1px solid var\(--pf-border\)/);
    expect(tray).toMatch(/border-radius: var\(--pf-radius\)/);
    expect(tray).toMatch(/padding: var\(--pf-space-1\)/);
    expect(rule(".nc-toggle-group_tray .nc-toggle")).toMatch(
      /border-color: transparent/
    );
    expect(
      rule('.nc-toggle-group_tray .nc-toggle[aria-pressed="true"]')
    ).toMatch(/background-color: var\(--pf-btn\)/);
  });

  it("gives the quiet button no fill, a hairline edge and an accent edge on hover", () => {
    const ghost = rule(
      ".nc-button_ghost,\na.nc-button_ghost,\na.nc-button_ghost:link,\na.nc-button_ghost:visited"
    );
    expect(ghost).toMatch(/background-color: transparent/);
    expect(ghost).toMatch(/border-color: var\(--pf-border\)/);
    expect(ghost).toMatch(/font-weight: 400/);
    expect(CSS).toMatch(
      /\.nc-button_ghost:hover:not\(:disabled\)[^{]*\{[^}]*border-color: var\(--pf-accent\)/
    );
  });

  it.each([".nc-toggle", ".nc-tab"])(
    "%s is at least 44 px both ways",
    (selector) => {
      const body = rule(selector);
      expect(body).toMatch(/min-height: var\(--pf-control-height, 44px\)/);
      expect(body).toMatch(/min-width: var\(--pf-control-height, 44px\)/);
    }
  );

  it("rings every control on --pf-focus, on keyboard focus only", () => {
    const outlines = [
      ...CSS.matchAll(/([^{}]+)\{[^}]*outline:\s*2px solid ([^;]+);/g)
    ];
    expect(outlines.length).toBeGreaterThan(0);
    for (const [, selector, colour] of outlines) {
      expect(selector).toMatch(/:focus-visible/);
      expect(colour.trim()).toBe("var(--pf-focus)");
    }
    expect(CSS).not.toMatch(/:focus\s*[,{]/);
    expect(rule(".nc-toggle:focus-visible,\n.nc-tab:focus-visible")).toMatch(
      /outline-offset: 2px/
    );
  });

  it("gives the toggles and tabs a disabled look", () => {
    const disabled = rule(
      ".nc-toggle:disabled,\n.nc-toggle-group_tray .nc-toggle:disabled,\n.nc-tab:disabled"
    );
    expect(disabled).toMatch(/background-color: var\(--pf-chip\)/);
    expect(disabled).toMatch(/cursor: not-allowed/);
  });

  it("puts each pressed or selected rule after the hover rule it must beat", () => {
    const at = (s) => CSS.indexOf(s);
    expect(at('.nc-toggle[aria-pressed="true"]:hover')).toBeGreaterThan(
      at(".nc-toggle:hover:not(:disabled)")
    );
    expect(
      at('.nc-toggle-group_tray .nc-toggle[aria-pressed="true"]:hover')
    ).toBeGreaterThan(at(".nc-toggle-group_tray .nc-toggle:hover"));
    expect(at(".nc-tab:disabled")).toBeGreaterThan(
      at('.nc-tab[aria-selected="true"]')
    );
  });
  it("gives toggles and tabs a held down look while they are clicked or tapped", () => {
    expect(CSS).toMatch(
      /\.nc-toggle:active:not\(:disabled\),\s*\.nc-toggle-group_tray \.nc-toggle:active:not\(:disabled\),\s*\.nc-tab:active:not\(:disabled\)\s*\{[^}]*box-shadow: inset/
    );
    expect(CSS).toMatch(
      /\.nc-toggle\[aria-pressed="true"\]:active:not\(:disabled\)[^{]*\{[^}]*background-color: var\(--pf-btn-hover\)/
    );
  });

  it("keeps a chosen toggle or tab looking chosen, faded, on a paused form", () => {
    const toggle = CSS.match(
      /\.nc-toggle\[aria-pressed="true"\]:disabled,[^{]*\{([^}]*)\}/
    );
    expect(toggle).not.toBeNull();
    expect(toggle[1]).toMatch(/background-color: var\(--pf-btn\)/);
    expect(toggle[1]).toMatch(/opacity: 0\.55/);
    const tab = CSS.match(
      /\.nc-tab\[aria-selected="true"\]:disabled\s*\{([^}]*)\}/
    );
    expect(tab).not.toBeNull();
    expect(tab[1]).toMatch(/inset 0 -3px 0 var\(--pf-accent\)/);
    expect(tab[1]).toMatch(/opacity: 0\.55/);
    // The chosen look comes after the plain disabled look, so it wins on a paused form.
    expect(
      CSS.indexOf('.nc-toggle[aria-pressed="true"]:disabled')
    ).toBeGreaterThan(CSS.indexOf(".nc-toggle:disabled"));
  });
});

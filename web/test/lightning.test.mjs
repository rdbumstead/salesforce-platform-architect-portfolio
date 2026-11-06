import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ICONS,
  SIZES,
  iconFor,
  sizeFor
} from "../src/modules/lightning/icon/icons.js";
import { LWC_DIR, LIGHTNING_DIR } from "../build/site-plugin.mjs";

// utility:code is not in the platform utility sprite, so the platform draws no icon for it.
const NOT_IN_PLATFORM = new Set(["utility:code"]);

function siteIconNames() {
  const names = new Set();
  for (const dir of fs.readdirSync(LWC_DIR)) {
    const html = path.join(LWC_DIR, dir, `${dir}.html`);
    if (!fs.existsSync(html)) continue;
    const source = fs.readFileSync(html, "utf8");
    for (const match of source.matchAll(
      /<lightning-(?:card|icon)[^>]*?icon-name="([^"]+)"/gs
    )) {
      names.add(match[1]);
    }
  }
  return names;
}

test("every icon name the site passes to a card or an icon has a drawing, or is one the platform lacks", () => {
  const names = siteIconNames();
  assert.ok(names.size >= 6, `found ${names.size} icon names`);
  for (const name of names) {
    if (NOT_IN_PLATFORM.has(name)) {
      assert.equal(
        iconFor(name),
        null,
        `${name} draws nothing, as on the platform`
      );
    } else {
      assert.ok(iconFor(name), `${name} has a drawing`);
    }
  }
});

test("each drawing has a view box, at least one path, and a fill from the icon or its paths", () => {
  for (const [name, icon] of Object.entries(ICONS)) {
    assert.match(icon.viewBox, /^0 0 \d+ \d+$/, name);
    assert.ok(icon.paths.length > 0, name);
    for (const p of icon.paths) {
      assert.ok(p.d.length > 10, name);
      assert.ok(icon.fill || p.fill, `${name} has a colour`);
    }
  }
});

test("standard and custom icons carry the branded tile colour, utility icons do not", () => {
  assert.equal(ICONS["standard:invocable_action"].background, "#107cad");
  assert.equal(ICONS["custom:custom15"].background, "#f77e75");
  assert.equal(ICONS["utility:apex"].background, undefined);
  assert.equal(ICONS["doctype:pdf"].background, undefined);
});

test("icon sizes follow the platform and an unknown size is medium", () => {
  assert.equal(SIZES.small, 1.5);
  assert.equal(SIZES["x-small"], 1);
  assert.equal(SIZES.medium, 2);
  assert.equal(sizeFor("small"), "small");
  assert.equal(sizeFor(undefined), "medium");
  assert.equal(sizeFor("huge"), "medium");
  assert.equal(iconFor(undefined), null);
  assert.equal(iconFor("utility:nope"), null);
});

test("the icon template keeps the drawing hidden and reads alternative text out as text", () => {
  const html = fs.readFileSync(
    path.join(LIGHTNING_DIR, "icon/icon.html"),
    "utf8"
  );
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /lwc:if=\{alternativeText\}/);
  assert.doesNotMatch(html, /role=/);
});

test("the card template has an icon, a title, actions and a footer slot in one header row", () => {
  const html = fs.readFileSync(
    path.join(LIGHTNING_DIR, "card/card.html"),
    "utf8"
  );
  assert.match(html, /<lightning-icon icon-name=\{iconName\} size="small">/);
  assert.match(html, /<slot name="title">/);
  assert.match(html, /<slot name="actions">/);
  assert.match(html, /<slot name="footer"/);
  const header = html.indexOf('class="header"');
  assert.ok(header > 0 && html.indexOf('class="actions"') > header);
});

test("the card header keeps the actions on the row and wraps only when they do not fit", () => {
  const css = fs.readFileSync(
    path.join(LIGHTNING_DIR, "card/card.css"),
    "utf8"
  );
  assert.match(css, /\.header\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.actions\s*\{[^}]*margin-left:\s*auto/);
  assert.match(css, /border-radius:\s*0\.25rem/);
  assert.match(css, /box-shadow:\s*0 2px 2px 0 rgba\(0, 0, 0, 0\.1\)/);
  assert.match(css, /\.header\s*\{[^}]*padding:\s*0\.75rem 1rem 0/);
});

test("the card does not add an outer margin, the page section owns the gutter", () => {
  const css = fs.readFileSync(
    path.join(LIGHTNING_DIR, "card/card.css"),
    "utf8"
  );
  assert.doesNotMatch(css, /:host\s*\{[^}]*margin/);
});

test("the card follows the site theme through the variables the platform card reads", () => {
  const css = fs.readFileSync(
    path.join(LIGHTNING_DIR, "card/card.css"),
    "utf8"
  );
  const card = css.match(/\.card\s*\{([^}]*)\}/)[1];
  assert.match(card, /background:\s*var\(--dxp-g-root,/);
  assert.match(card, /border:\s*1px solid var\(--dxp-g-neutral-1,/);
  assert.match(card, /color:\s*var\(--dxp-g-root-contrast,/);
});

test("no stand in sets a background, border or text colour without a theme variable", () => {
  // A literal colour in a shadow root never changes with the theme, which is how the card's
  // header went white on white in dark mode. A literal is fine only as a var() fallback.
  const offenders = [];
  for (const name of fs.readdirSync(LIGHTNING_DIR)) {
    const file = path.join(LIGHTNING_DIR, name, `${name}.css`);
    if (!fs.existsSync(file)) continue;
    const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const match of css.matchAll(
      /(?:^|[;{\s])((?:background(?:-color)?|border(?:-[a-z]+)*|color|fill|stroke)\s*:\s*([^;}]*))/g
    )) {
      const value = match[2].replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "");
      if (/#[0-9a-f]{3,8}\b|rgba?\(|\b(white|black)\b/i.test(value)) {
        offenders.push(`${name}.css: ${match[1].trim()}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

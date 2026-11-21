import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LWC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../packages/portfolio-site/main/default/lwc"
);

// Each label that can wrap carries text-wrap: balance in its own component's css, so no line
// is left with one word alone. The rule is never global. Live labels (a skill or object name
// of any length) are covered here because the fixtures hold only short ones.
const SELECTORS = [
  ["careerLine", ".row-head"],
  ["projectAssetGallery", ".gallery-title"],
  ["schemaVisualizer", ".object-button"],
  ["byTheNumbers", ".covers-heading"],
  ["skillNetwork", ".chip"],
  ["skillNetwork", ".chip-name"]
];

function ruleBody(css, selector) {
  const start = css.search(
    new RegExp(`(^|\\n)${selector.replace(".", "\\.")}\\s*\\{`)
  );
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

for (const [folder, selector] of SELECTORS) {
  test(`${folder} balances ${selector}`, () => {
    const css = fs.readFileSync(
      path.join(LWC, folder, `${folder}.css`),
      "utf8"
    );
    assert.match(ruleBody(css, selector), /text-wrap:\s*balance/);
  });
}
